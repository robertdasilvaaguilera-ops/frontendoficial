"""
API REST da ATLAS - a peca que faltava para conectar o frontend React
(Lovable, repositorio "gogogo") aos dados reais do pipeline Python.

O frontend ja espera exatamente este formato (ver src/lib/atlas-types.ts
e src/lib/atlas-api.ts do projeto React) - ele tenta chamar
VITE_ATLAS_API_URL + "/opportunities" etc, e cai para dado mockado se
nao achar. Essa API elimina a necessidade do mock.

Como rodar:
    pip install fastapi uvicorn --break-system-packages
    uvicorn api_server:app --reload --port 8000

No projeto React, criar um .env com:
    VITE_ATLAS_API_URL=http://localhost:8000

ATENCAO - "clientes" (carteira) ainda nao existe no Python - essa API
devolve lista vazia ate construirmos esse modulo. parecerTecnico
estruturado (fatos/arguido/defendido/contestado/fundamentacao/
dispositivo/aplicacaoPratica) e gerado sob demanda via POST
/opportunities/{id}/parecer (Claude - ver ai/parecer.py), nao vem
pre-computado no Excel.
"""
import io
import json
import os
import re
import hashlib
import pickle
import unicodedata
import uuid
import pandas as pd
import requests
from datetime import datetime
from dotenv import load_dotenv
from PIL import Image
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# Lê o arquivo .env (nesta mesma pasta) ANTES de importar ai.claude_chat,
# que le ANTHROPIC_API_KEY do ambiente assim que o modulo e importado.
# override=True: o .env sempre vence, mesmo se ja existir uma variavel
# ANTHROPIC_API_KEY antiga gravada no Windows (setx) ou no sistema -
# sem isso, load_dotenv() ignora o .env quando a variavel ja existe.
load_dotenv(override=True)

from ai import (
    claude_chat,
    social_post,
    parecer as parecer_ai,
    post_com_modelo,
    carrossel,
    imagem_contextual,
)
import app_db
import auth
import coleta_scheduler
import main as atlas_engine
from social import content as social_content
from social import pipeline as social_pipeline
from social import render as social_render
from social import scheduler as social_scheduler
from social.instagram import ErroGraphAPI, testar_conexao as testar_conexao_instagram

import paths

CAMINHO_EXCEL = paths.caminho("reports", "oportunidades.xlsx")
# pd.read_excel (via openpyxl, parser XML puro-Python) leva vários segundos
# nesse arquivo (milhares de linhas) - inaceitável pagar esse custo em toda
# reinicialização do backend. Este cache local guarda o DataFrame já
# processado; só é invalidado quando o .xlsx muda de verdade (mtime
# diferente do gravado junto com o cache), então reinicializações "normais"
# (sem coleta nova de dados) carregam quase instantaneamente.
CAMINHO_CACHE_DADOS = paths.caminho("reports", ".oportunidades_cache.pkl")

app = FastAPI(title="ATLAS API")
app_db.iniciar()

# Rotas que não exigem login - o próprio fluxo de autenticação (login,
# checar status, sair - sair não pode dar 401 achando "sessão inválida" pra
# quem já está deslogado), e a raiz (só devolve a lista de endpoints, sem
# dado nenhum do usuário).
_ROTAS_PUBLICAS = {"/", "/auth/status", "/auth/setup", "/auth/login", "/auth/logout"}
# Cookie de sessão entre origens diferentes (front e backend em subdomínios
# distintos do Railway) só é enviado pelo navegador em fetch/XHR com
# SameSite=None + Secure - "Lax" (o padrão de dev, front e back em
# localhost) bloqueia isso silenciosamente (login "funciona" na chamada,
# mas o cookie nunca volta na requisição seguinte). ATLAS_COOKIE_SECURE=true
# liga esse modo em produção; local (http://) continua em Lax sem Secure,
# já que Secure exige HTTPS.
_COOKIE_SECURE = os.getenv("ATLAS_COOKIE_SECURE", "").strip().lower() in ("1", "true", "yes")
_COOKIE_SAMESITE = "none" if _COOKIE_SECURE else "lax"
# Prefixo servido sem login: as imagens do post automático de Instagram
# precisam ser buscáveis publicamente pelos servidores da Meta (Graph API),
# que não têm cookie de sessão nenhum - mesmo princípio de antes (ver
# histórico do endpoint /automacao/imagem/{nome}), agora dentro do produto.
_PREFIXOS_PUBLICOS = ("/social/imagem/",)
NOME_COOKIE_SESSAO = "atlas_sessao"


@app.middleware("http")
async def exigir_login(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in _ROTAS_PUBLICAS:
        return await call_next(request)
    if any(request.url.path.startswith(p) for p in _PREFIXOS_PUBLICOS):
        return await call_next(request)
    token = request.cookies.get(NOME_COOKIE_SESSAO)
    if not auth.sessao_valida(token):
        return JSONResponse(status_code=401, content={"detail": "Sessão inválida ou expirada"})
    return await call_next(request)


# Origens de produção do frontend (ex: https://atlas-frontend-production-
# b12b.up.railway.app) - lista separada por vírgula em ATLAS_CORS_ORIGINS,
# configurada no Railway. Sem isso, só localhost funcionava (ver regex
# abaixo) - o frontend implantado não conseguia nem fazer login.
_ORIGENS_PRODUCAO = [o.strip() for o in os.getenv("ATLAS_CORS_ORIGINS", "").split(",") if o.strip()]

# CORSMiddleware precisa ser adicionada DEPOIS de exigir_login (ordem
# textual = ordem de "quem embrulha quem": o último add_middleware fica
# por fora) - senão uma resposta 401 do exigir_login sai sem cabeçalho
# CORS nenhum, e o navegador trata como falha de rede genérica em vez de
# deixar o front ler o 401 de verdade (ex: pra mandar de volta pra tela de
# login quando a sessão expira).
app.add_middleware(
    CORSMiddleware,
    # allow_origins=["*"] não é permitido pelo navegador junto de
    # allow_credentials=True (precisa do cookie de sessão do login) - origens
    # de produção vêm de ATLAS_CORS_ORIGINS (lista exata); regex cobre
    # qualquer porta em localhost/127.0.0.1, já que o front roda em dev numa
    # porta que pode variar. CORSMiddleware libera se QUALQUER um dos dois
    # bater com a origem da requisição.
    allow_origins=_ORIGENS_PRODUCAO,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SetupRequest(BaseModel):
    usuario: str
    senha: str


class LoginRequest(BaseModel):
    usuario: str
    senha: str


class NovoUsuarioRequest(BaseModel):
    usuario: str
    senha: str
    nivel: str


def _validar_usuario_senha(usuario: str, senha: str) -> str:
    usuario = usuario.strip()
    if len(usuario) < 3:
        raise HTTPException(status_code=400, detail="Usuário precisa ter pelo menos 3 caracteres")
    if len(senha) < 8:
        raise HTTPException(status_code=400, detail="Senha precisa ter pelo menos 8 caracteres")
    return usuario


def _sessao_atual(request: Request) -> dict | None:
    return auth.sessao_info(request.cookies.get(NOME_COOKIE_SESSAO))


def _exigir_admin(request: Request) -> str:
    """Só o dono (nível admin) gerencia usuários - os demais níveis nem
    veem a tela Usuários no front, mas o backend não confia só nisso."""
    info = _sessao_atual(request)
    if not info or info["nivel"] != "admin":
        raise HTTPException(status_code=403, detail="Só o administrador pode gerenciar usuários")
    return info["usuario"]


def _exigir_sessao(request: Request) -> str:
    """Qualquer nível de usuário logado - usado pela Mídia Social, que é
    uma ferramenta de toda a equipe, não só do dono (diferente de
    /auth/users, que continua exclusivo do admin)."""
    info = _sessao_atual(request)
    if not info:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada")
    return info["usuario"]


def _exigir_cota_geracao(request: Request) -> str:
    """Chamado no início de todo endpoint que gera parecer/post/carrossel
    via Claude - bloqueia ANTES de gastar a chamada se a cota semanal do
    nível já estourou, e devolve o usuário pra registrar o uso depois do
    sucesso (ver registrar_geracao)."""
    info = _sessao_atual(request)
    if not info:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada")
    permitido, limite = auth.verificar_cota_geracao(info["usuario"], info["nivel"])
    if not permitido:
        raise HTTPException(
            status_code=429,
            detail=f"Limite semanal de {limite} pareceres/posts do seu nível foi atingido.",
        )
    return info["usuario"]


def _exigir_chat_permitido(request: Request) -> str:
    info = _sessao_atual(request)
    if not info:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada")
    permitido, motivo = auth.verificar_chat_permitido(info["usuario"], info["nivel"])
    if not permitido:
        raise HTTPException(status_code=403, detail=motivo)
    return info["usuario"]


@app.get("/auth/status")
def auth_status(request: Request):
    info = _sessao_atual(request)
    if not info:
        return {"configurado": auth.esta_configurado(), "autenticado": False, "usuario": None}
    cota = auth.status_cota(info["usuario"], info["nivel"])
    return {
        "configurado": True,
        "autenticado": True,
        "usuario": info["usuario"],
        "nivel": info["nivel"],
        **cota,
    }


@app.post("/auth/setup")
def auth_setup(req: SetupRequest):
    """Cria o primeiro login do ATLAS (o dono, nível admin) - só funciona
    uma vez, antes de existir qualquer usuário. Depois disso, novos logins
    só são criados pelo dono, na tela Usuários (ver /auth/users)."""
    if auth.esta_configurado():
        raise HTTPException(status_code=409, detail="Já existe um usuário configurado")
    usuario = _validar_usuario_senha(req.usuario, req.senha)
    auth.criar_primeiro_usuario(usuario, req.senha)
    token = auth.criar_sessao(usuario)
    resposta = JSONResponse({"ok": True})
    _definir_cookie_sessao(resposta, token)
    return resposta


@app.post("/auth/login")
def auth_login(req: LoginRequest):
    usuario = req.usuario.strip()
    minutos_bloqueado = auth.verificar_bloqueio_login(usuario)
    if minutos_bloqueado is not None:
        raise HTTPException(
            status_code=429,
            detail=f"Muitas tentativas incorretas. Tente novamente em {minutos_bloqueado} min.",
        )
    if not auth.verificar_login(usuario, req.senha):
        auth.registrar_tentativa_login(usuario, sucesso=False)
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")
    auth.registrar_tentativa_login(usuario, sucesso=True)
    token = auth.criar_sessao(usuario)
    resposta = JSONResponse({"ok": True})
    _definir_cookie_sessao(resposta, token)
    return resposta


@app.post("/auth/logout")
def auth_logout(request: Request):
    auth.encerrar_sessao(request.cookies.get(NOME_COOKIE_SESSAO))
    resposta = JSONResponse({"ok": True})
    resposta.delete_cookie(NOME_COOKIE_SESSAO, samesite=_COOKIE_SAMESITE, secure=_COOKIE_SECURE)
    return resposta


def _definir_cookie_sessao(resposta: JSONResponse, token: str) -> None:
    resposta.set_cookie(
        NOME_COOKIE_SESSAO, token, httponly=True,
        samesite=_COOKIE_SAMESITE, secure=_COOKIE_SECURE,
        max_age=60 * 60 * 24 * auth.DURACAO_SESSAO_DIAS,
    )


@app.get("/auth/users")
def auth_listar_usuarios(request: Request):
    _exigir_admin(request)
    return auth.listar_usuarios()


@app.post("/auth/users")
def auth_criar_usuario(req: NovoUsuarioRequest, request: Request):
    _exigir_admin(request)
    usuario = _validar_usuario_senha(req.usuario, req.senha)
    if req.nivel not in auth.NIVEIS_CRIAVEIS:
        raise HTTPException(
            status_code=400, detail=f"Nível inválido - use um de {auth.NIVEIS_CRIAVEIS}"
        )
    if any(u["usuario"] == usuario for u in auth.listar_usuarios()):
        raise HTTPException(status_code=409, detail="Já existe um login com esse usuário")
    auth.criar_usuario(usuario, req.senha, req.nivel)
    return {"ok": True}


@app.delete("/auth/users/{usuario}")
def auth_remover_usuario(usuario: str, request: Request):
    usuario_logado = _exigir_admin(request)
    if usuario == usuario_logado:
        raise HTTPException(status_code=400, detail="Você não pode remover o próprio login enquanto está logado nele")
    if not any(u["usuario"] == usuario for u in auth.listar_usuarios()):
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    auth.remover_usuario(usuario)
    # Login removido pode ter automação de Mídia Social ativa - recarrega
    # o agendador agora, não só na próxima alteração de config de alguém,
    # senão o job continuaria rodando até o próximo redeploy.
    social_scheduler.recarregar()
    return {"ok": True}


def _classificar_conteudo(fonte: str) -> str:
    """
    Cada linha coletada vira um de três baldes - esse é o problema que
    estava misturando tudo (ver histórico): sem isso, notícia e ruído de
    andamento processual eram tratados como se fossem decisão.

    - "decisao": acórdão/decisão com fundamentação real (CARF julgamentos e
      acórdãos, Informativo de Jurisprudência do STJ). É só isso que entra
      no Radar de Oportunidades e que o Copiloto usa para responder.
    - "noticia": notícias de tribunais/órgãos (STJ, CARF, Receita, PGFN) -
      sem ementa própria. Vai para a aba Notícias, disponível para post de
      Instagram, mas nunca citada pelo Copiloto como fundamento jurídico.
    - "ruido": metadado bruto de andamento processual (consulta genérica ao
      DataJud/CNJ por palavra-chave em vários TJs/TRFs) - sem ementa, sem
      fundamentação, só "existe um processo com esse assunto". Fica fora do
      Radar, das Notícias e do Copiloto até virar um módulo de monitoramento
      dedicado (hoje não é nem decisão nem notícia de verdade).
    """
    f = str(fonte).lower()
    if "carf (julgamentos)" in f or "carf (acórdãos" in f or "carf (acordaos" in f:
        return "decisao"
    if "informativo de jurisprudência" in f or "informativo de jurisprudencia" in f:
        return "decisao"
    if "notícias" in f or "noticias" in f:
        return "noticia"
    if f.startswith("djen ("):
        return "ruido"
    return "noticia"


_CACHE: dict = {"mtime": None, "df": None}


def _carregar_dados() -> pd.DataFrame:
    if not os.path.exists(CAMINHO_EXCEL):
        return pd.DataFrame()

    mtime = os.path.getmtime(CAMINHO_EXCEL)
    if _CACHE["df"] is not None and _CACHE["mtime"] == mtime:
        return _CACHE["df"]

    df = _ler_do_cache_em_disco(mtime)
    if df is None:
        df = pd.read_excel(CAMINHO_EXCEL)
        colunas_numericas = [
            "score", "risco", "economia_estimada", "empresas_afetadas", "indice_atlas",
        ]
        for col in colunas_numericas:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
        df = df.fillna("")
        df["tipo_conteudo"] = (
            df["fonte"].map(_classificar_conteudo) if "fonte" in df.columns else "noticia"
        )
        _gravar_cache_em_disco(df, mtime)

    _CACHE["df"] = df
    _CACHE["mtime"] = mtime
    # indice pra achar uma linha por id em O(1) sem re-varrer tudo a cada
    # /opportunities/{id} e /opportunities/{id}/post-instagram.
    _CACHE["por_id"] = {_gerar_id(row): idx for idx, row in df.iterrows()}
    return df


def _ler_do_cache_em_disco(mtime: float) -> pd.DataFrame | None:
    """Cache persistido em disco (sobrevive a reinicializações do processo,
    diferente de _CACHE que é só em memória) - só usa se o .xlsx não mudou
    desde que o cache foi gravado (mesmo mtime)."""
    try:
        with open(CAMINHO_CACHE_DADOS, "rb") as f:
            cache = pickle.load(f)
        if cache.get("mtime") == mtime:
            return cache["df"]
    except (FileNotFoundError, EOFError, pickle.UnpicklingError, KeyError, ValueError):
        pass
    return None


def _gravar_cache_em_disco(df: pd.DataFrame, mtime: float) -> None:
    try:
        with open(CAMINHO_CACHE_DADOS, "wb") as f:
            pickle.dump({"mtime": mtime, "df": df}, f, protocol=pickle.HIGHEST_PROTOCOL)
    except OSError:
        pass  # cache em disco é otimização, nunca motivo pra API falhar


@app.on_event("startup")
def _aquecer_cache_no_boot():
    """Carrega o Excel (ou o cache em disco) durante a subida do processo,
    não na primeira requisição do navegador - sem isso, a primeira tela que
    o usuário abre depois de iniciar o backend é que pagava os vários
    segundos de leitura do arquivo, parecendo o sistema inteiro travado."""
    _carregar_dados()
    # Religa o agendador de posts automáticos de Instagram nos horários já
    # salvos em social_config - ver social/scheduler.py. Passa esta função
    # (não o módulo social) porque é ela quem sabe montar a lista de
    # decisões candidatas a partir do DataFrame carregado acima.
    social_scheduler.iniciar(lambda: _decisoes_candidatas_social(25))
    # Coleta diária de decisões (CARF/STJ/STF/PGFN/Receita/TRF4/DJEN),
    # 3x/dia, dentro do próprio serviço - ver coleta_scheduler.py.
    coleta_scheduler.iniciar()


def _decisoes_candidatas_social(limit: int = 25) -> list[dict]:
    """Mesma seleção/formato usado pela extinta automação externa
    (`/automacao/decisoes-recentes`) - decisões mais recentes, mais novas
    primeiro, no shape que `social/content.py` espera."""
    df = _carregar_dados()
    if df.empty:
        return []
    df_decisoes = df[df["tipo_conteudo"] == "decisao"]
    if "data_publicacao" in df_decisoes.columns:
        df_decisoes = df_decisoes.sort_values("data_publicacao", ascending=False)
    df_pagina = df_decisoes.head(max(1, min(limit, 100)))
    resultado = []
    for _, row in df_pagina.iterrows():
        opp = _linha_para_opportunity(row)
        resultado.append({
            "id": opp["id"],
            "titulo": opp["titulo"],
            "tribunal": opp["tribunal"],
            "data_julgamento": opp["decisao"]["data"],
            "setor_economico": ", ".join(opp["setores"]) if opp["setores"] else "",
            "mecanismo": opp["mecanismo"],
            "tributos": opp["tributos"],
            "resumo": opp["decisao"]["ementa"] or opp["resumoExecutivo"],
            "impacto_estimado": opp["impactoFinanceiro"],
            "link_fonte": opp["decisao"]["urlOficial"],
        })
    return resultado


def _gerar_id(row) -> str:
    base = f"{row.get('titulo','')}{row.get('link','')}"
    return hashlib.md5(base.encode("utf-8")).hexdigest()[:12]


def _mapear_prioridade(indice_atlas: float) -> str:
    if indice_atlas >= 80: return "maxima"
    if indice_atlas >= 60: return "alta"
    if indice_atlas >= 40: return "media"
    return "baixa"


def _mapear_impacto(economia: float) -> str:
    if economia >= 1_000_000: return "muito_alto"
    if economia >= 100_000: return "alto"
    if economia >= 10_000: return "medio"
    return "baixo"


def _mapear_novidade(row) -> str:
    if str(row.get("inov_nova_interpretacao", "")).lower() == "true": return "inedito"
    if str(row.get("inov_diverge", "")).lower() == "true": return "reforco"
    return "consolidado"


def _extrair_tribunal(fonte: str) -> str:
    fonte = str(fonte)
    for sigla in ["STF", "STJ", "CARF", "TRF1", "TRF2", "TRF3", "TRF4", "TRF5", "TRF6", "PGFN", "DOU", "Congresso"]:
        if sigla in fonte:
            return sigla
    return "CARF"  # fallback razoavel dado o volume de fonte


_TAG_RE = re.compile(r"<[^>]+>")


def _limpar_html(texto: str) -> str:
    """Remove tags HTML soltas que alguns coletores (ex: TRF4) trazem no
    resumo bruto - o mesmo tipo de "formatacao crua vazando na tela" que o
    markdown do Gemini causava, so que com <p> em vez de **."""
    if not texto:
        return texto
    sem_tags = _TAG_RE.sub(" ", texto)
    return re.sub(r"\s+", " ", sem_tags).strip()


def _linha_para_opportunity(row) -> dict:
    economia = float(row.get("economia_estimada", 0) or 0)
    # indice_atlas nao e mais exposto no payload (era um score composto opaco
    # e generico) - continua usado so internamente pra ordenar por prioridade.
    indice_atlas = float(row.get("indice_atlas", 0) or row.get("score", 0) or 0)
    risco = float(row.get("risco", 0) or 0)
    tributos = [t.strip() for t in str(row.get("tributos", "")).split(",") if t.strip()]

    setores = [s.strip() for s in str(row.get("setores", "")).split(",") if s.strip()]
    setor_identificado = str(row.get("setor_identificado", "")).strip()
    if setor_identificado and setor_identificado not in setores:
        setores.append(setor_identificado)

    justificativa_setor = str(row.get("justificativa", "")).strip()
    if not justificativa_setor:
        justificativa_setor = (
            "Setor específico não identificado automaticamente para esta decisão "
            "- avalie a aplicabilidade caso a caso."
        )

    regime = row.get("regime_tributario_detectado", "")
    ementa_bruta = _limpar_html(str(row.get("resumo", "")).strip())
    # resumoExecutivo/fundamentacao nao usam mais a coluna "parecer" (era
    # texto solto do Gemini, com markdown e sem estrutura - descontinuado).
    # O parecer tecnico de verdade agora e gerado sob demanda via Claude
    # (POST /opportunities/{id}/parecer, ver ai/parecer.py).
    resumo_executivo = justificativa_setor or ementa_bruta[:400]

    return {
        "id": _gerar_id(row),
        "titulo": str(row.get("titulo", "")),
        "tipo": "risco" if risco >= 50 else "oportunidade",
        "prioridade": _mapear_prioridade(indice_atlas),
        "novidade": _mapear_novidade(row),
        "estabilidade": "majoritaria",  # TODO: mapear de analise_estrutural quando disponivel
        "mecanismo": str(row.get("mecanismo_economico", "") or "Não classificado"),
        "tributos": tributos,
        "regimes": [regime] if regime else [],
        "setores": setores,
        "justificativaSetor": justificativa_setor,
        "cnaes": [],  # TODO: nao rastreado por decisao ainda
        "ufs": [row.get("_uf", "")] if row.get("_uf", "") else [],
        "impactoFinanceiro": _mapear_impacto(economia),
        "complexidade": "media" if row.get("mecanismo_economico") else "alta",
        "tempoEstimadoDias": 45,  # TODO: sem dado real ainda, valor padrao
        "probabilidadeExito": "alta" if risco < 30 else ("media" if risco < 60 else "baixa"),
        "tribunal": _extrair_tribunal(row.get("fonte", "")),
        "decisao": {
            "numero": str(row.get("resultado_bruto", "") or ""),
            "orgao": str(row.get("fonte", "")),
            "relator": "",
            "data": str(row.get("data_publicacao", "") or datetime.now().date().isoformat()),
            "ementa": ementa_bruta[:2000],
            "urlOficial": str(row.get("link", "")),
        },
        "resumoExecutivo": resumo_executivo[:500],
    }


def _classificar_fonte_noticia(fonte_bruta: str) -> str:
    fonte_bruta = str(fonte_bruta or "")
    if re.search(r"DOU", fonte_bruta, re.IGNORECASE):
        return "DOU"
    if re.search(r"Congresso|Câmara|Senado", fonte_bruta, re.IGNORECASE):
        return "Congresso"
    if re.search(r"\bMP\b", fonte_bruta, re.IGNORECASE):
        return "MP"
    return "Tribunal"


def _linha_para_news(row) -> dict:
    eh_tributario = str(row.get("area", "")).strip().lower() in ("tributário", "empresarial")
    item = {
        "id": _gerar_id(row),
        "titulo": str(row.get("titulo", "")),
        "fonte": _classificar_fonte_noticia(row.get("fonte", "")),
        "tribunal": _extrair_tribunal(row.get("fonte", "")),
        "publicadoEm": str(row.get("data_publicacao", "") or datetime.now().date().isoformat()),
        "tributario": bool(eh_tributario),
        "resumo": _limpar_html(str(row.get("resumo", "")))[:500],
        "urlOficial": str(row.get("link", "")),
    }
    if eh_tributario:
        item["tipo"] = "risco" if float(row.get("risco", 0) or 0) >= 50 else "oportunidade"
        item["prioridade"] = _mapear_prioridade(float(row.get("indice_atlas", 0) or 0))
        item["mecanismo"] = str(row.get("mecanismo_economico", ""))
    return item


# Tamanho de pagina padrao pra /opportunities e /news - sem isso, cada
# requisicao serializava as 7 mil e tantas linhas inteiras (o site "pesado,
# lento, trava" que o usuario reportou). limit=0 (ou "todas") devolve tudo,
# pra quem realmente precisar.
LIMITE_PADRAO = 60
LIMITE_MAXIMO = 500


def _paginar(df: pd.DataFrame, limit: int | None, offset: int) -> pd.DataFrame:
    if limit is not None and limit > 0:
        limit = min(limit, LIMITE_MAXIMO)
        return df.iloc[offset: offset + limit]
    return df.iloc[offset:]


@app.get("/opportunities")
def listar_oportunidades(limit: int = LIMITE_PADRAO, offset: int = 0, tipo: str | None = None):
    """
    tipo: filtro opcional "risco" ou "oportunidade" - usado pela tela "ver
    todos" (o KPI do Radar mostra o total real da base, ex: 226 riscos, mas
    a lista da home só traz os top N por relevância geral; clicar no KPI
    precisa do total filtrado, não só o que sobrou no recorte top N).
    """
    df = _carregar_dados()
    if df.empty:
        return []
    df_decisoes = df[df["tipo_conteudo"] == "decisao"]
    if tipo in ("risco", "oportunidade"):
        risco_num = pd.to_numeric(df_decisoes.get("risco", 0), errors="coerce").fillna(0)
        mascara = risco_num >= 50 if tipo == "risco" else risco_num < 50
        df_decisoes = df_decisoes[mascara]
    if "indice_atlas" in df_decisoes.columns:
        df_decisoes = df_decisoes.sort_values("indice_atlas", ascending=False)
    df_pagina = _paginar(df_decisoes, limit, offset)
    return [_linha_para_opportunity(row) for _, row in df_pagina.iterrows()]


def _buscar_linha_por_id(id: str):
    df = _carregar_dados()
    idx = _CACHE.get("por_id", {}).get(id)
    if idx is None:
        return None
    return df.loc[idx]


@app.get("/opportunities/{id}")
def obter_oportunidade(id: str):
    row = _buscar_linha_por_id(id)
    if row is None:
        raise HTTPException(status_code=404, detail="Oportunidade não encontrada")
    return _linha_para_opportunity(row)


@app.get("/news")
def listar_noticias(limit: int = LIMITE_PADRAO, offset: int = 0, categoria: str | None = None):
    """
    categoria="legislativa": filtra só o que veio de fonte legislativa/DOU
    (mesmo criterio usado em /summary -> alteracoesLegislativas). Hoje a
    coleta ainda não tem um coletor de DOU/Congresso rodando de verdade,
    então isso tende a devolver lista vazia - é esperado, não é bug.
    """
    df = _carregar_dados()
    if df.empty:
        return []
    df_noticias = df[df["tipo_conteudo"] == "noticia"]
    if categoria == "legislativa":
        bate = df_noticias.get("fonte", pd.Series(dtype=str)).apply(
            lambda f: _classificar_fonte_noticia(f) != "Tribunal"
        )
        df_noticias = df_noticias[bate]
    if "data_publicacao" in df_noticias.columns:
        df_noticias = df_noticias.sort_values("data_publicacao", ascending=False)
    df_pagina = _paginar(df_noticias, limit, offset)
    return [_linha_para_news(row) for _, row in df_pagina.iterrows()]


class ClientRequest(BaseModel):
    nome: str
    cnpj: str = ""
    regime: str = ""
    setor: str = ""
    cnae: str = ""
    uf: str = ""
    cidade: str = ""
    tributosRelevantes: list[str] = []
    faturamentoAnual: str = ""
    grupoEconomico: bool = False
    comercioExterior: bool = False
    folhaRelevante: bool = False
    ufsAtuacao: list[str] = []
    contenciosoAtivo: bool = False
    contenciosoDescricao: str = ""
    teseInteresse: str = ""
    prioridade: str = ""
    observacoes: str = ""


@app.get("/clients")
def listar_clientes(request: Request):
    usuario = _exigir_sessao(request)
    return app_db.listar_clientes(usuario)


@app.post("/clients")
def criar_cliente(req: ClientRequest, request: Request):
    usuario = _exigir_sessao(request)
    if not req.nome.strip():
        raise HTTPException(status_code=400, detail="Nome do cliente é obrigatório")
    return app_db.inserir_cliente(req.model_dump(), usuario)


@app.delete("/clients/{id}")
def deletar_cliente(id: str, request: Request):
    usuario = _exigir_sessao(request)
    if not app_db.remover_cliente(id, usuario):
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return {"ok": True}


@app.get("/summary")
def obter_resumo(request: Request):
    usuario = _exigir_sessao(request)
    df = _carregar_dados()
    if df.empty:
        return {
            "totalClientes": 0, "oportunidadesHoje": 0, "riscosHoje": 0,
            "alteracoesLegislativas": 0, "decisoesRelevantes": 0,
        }
    df_decisoes = df[df["tipo_conteudo"] == "decisao"]
    legislativas = df.get("fonte", pd.Series(dtype=str)).apply(
        lambda f: _classificar_fonte_noticia(f) != "Tribunal"
    )
    return {
        "totalClientes": app_db.contar_clientes(usuario),
        "oportunidadesHoje": int((df_decisoes.get("risco", 0) < 50).sum()),
        "riscosHoje": int((df_decisoes.get("risco", 0) >= 50).sum()),
        "alteracoesLegislativas": int(legislativas.sum()),
        "decisoesRelevantes": len(df_decisoes),
    }


_STOPWORDS_PT = {
    "a", "o", "as", "os", "de", "da", "do", "das", "dos", "em", "um", "uma", "uns", "umas",
    "para", "por", "com", "que", "e", "ou", "no", "na", "nos", "nas", "se", "sua", "seu",
    "suas", "seus", "como", "sobre", "ao", "aos", "the", "is", "of", "to", "foi", "ser",
    "tem", "têm", "pode", "podem", "qual", "quais", "quando", "onde", "isso", "esse",
    "essa", "este", "esta", "meu", "minha", "nosso", "nossa", "há", "mais", "menos",
}


def _tokenizar(texto: str) -> list[str]:
    """Normaliza acentos e quebra em palavras de 3+ letras, sem stopwords."""
    sem_acento = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode("ascii")
    palavras = re.findall(r"[a-zA-Z]{3,}", sem_acento.lower())
    return [p for p in palavras if p not in _STOPWORDS_PT]


# Palavras que sinalizam o "lado" que o advogado quer ver - usadas so como
# desempate/reforco entre candidatos ja relevantes (nunca pra incluir algo
# fora do tema), pra "decisoes que prejudicam o contribuinte" priorizar as
# marcadas como risco (>=50) e nao qualquer decisao generica do setor.
_SINAIS_DESFAVORAVEL = {
    "prejudicam", "prejudica", "prejudicial", "prejudiciais", "desfavoravel",
    "desfavoraveis", "contra", "perde", "perdeu", "perigo", "risco", "riscos",
    "adverso", "adversa", "negativa", "negativo", "ruim", "pior", "piora",
}
_SINAIS_FAVORAVEL = {
    "favorece", "favoravel", "favoraveis", "beneficia", "beneficio",
    "beneficios", "oportunidade", "oportunidades", "ganho", "ganha",
    "positiva", "positivo", "melhor", "vantagem", "vantagens",
}


def _pontuar_linha(termos_pergunta: set[str], row) -> int:
    """
    Ranking simples por sobreposição de palavras-chave entre a pergunta do
    advogado e título/resumo/mecanismo/tributos/setores/setor_identificado
    de cada decisão ou notícia coletada. Sem embeddings/ML - mesma filosofia
    do resto do pipeline (ver filters/keywords.py): direto, explicável, fácil
    de ajustar.

    setor_identificado (a classificação de setor feita pelo pipeline, ex:
    "Agronegócio") entra com peso bem mais alto que o resto: é o dado mais
    confiável que temos sobre o setor de uma decisão, e muitas vezes a
    palavra do setor nem aparece no título/ementa (ex: uma decisão de ITR
    tratando de "produtor rural" não tem a palavra "agronegócio" em lugar
    nenhum do texto, só na classificação).
    """
    texto_geral = " ".join(
        str(row.get(c, ""))
        for c in [
            "titulo", "resumo", "mecanismo_economico", "tributos", "setores",
            "area", "setor_identificado",
        ]
    )
    termos_linha = set(_tokenizar(texto_geral))
    if not termos_linha:
        return 0

    pontos = len(termos_pergunta & termos_linha)
    pontos += len(termos_pergunta & set(_tokenizar(str(row.get("titulo", ""))))) * 2
    pontos += len(termos_pergunta & set(_tokenizar(str(row.get("setor_identificado", ""))))) * 5

    if pontos > 0:
        risco = float(row.get("risco", 0) or 0)
        if termos_pergunta & _SINAIS_DESFAVORAVEL and risco >= 50:
            pontos += 3
        elif termos_pergunta & _SINAIS_FAVORAVEL and risco < 50:
            pontos += 3

    return pontos


def _buscar_decisoes_relevantes(termos_pergunta: set[str], limite: int = 8) -> list[dict]:
    df = _carregar_dados()
    if df.empty or not termos_pergunta:
        return []
    df_decisoes = df[df["tipo_conteudo"] == "decisao"]

    candidatos = []
    for _, row in df_decisoes.iterrows():
        pontos = _pontuar_linha(termos_pergunta, row)
        if pontos > 0:
            candidatos.append((pontos, row))

    candidatos.sort(key=lambda par: par[0], reverse=True)

    resultado = []
    for _, row in candidatos[:limite]:
        opp = _linha_para_opportunity(row)
        resultado.append({
            "id": opp["id"],
            "tipo": opp["tipo"],  # "risco" (desfavoravel) ou "oportunidade" (favoravel)
            "titulo": opp["titulo"],
            "tribunal": opp["tribunal"],
            "data": opp["decisao"]["data"],
            "mecanismo": opp["mecanismo"],
            "tributos": opp["tributos"],
            "ementa": opp["decisao"]["ementa"] or opp["resumoExecutivo"],
            "url": opp["decisao"]["urlOficial"],
        })
    return resultado


def _buscar_noticias_relevantes(termos_pergunta: set[str], limite: int = 4) -> list[dict]:
    df = _carregar_dados()
    if df.empty or not termos_pergunta:
        return []
    df_noticias = df[df["tipo_conteudo"] == "noticia"]

    candidatos = []
    for _, row in df_noticias.iterrows():
        pontos = _pontuar_linha(termos_pergunta, row)
        if pontos > 0:
            candidatos.append((pontos, row))

    candidatos.sort(key=lambda par: par[0], reverse=True)

    resultado = []
    for _, row in candidatos[:limite]:
        n = _linha_para_news(row)
        resultado.append({
            "id": n["id"],
            "titulo": n["titulo"],
            "tribunal": n.get("tribunal") or n.get("fonte"),
            "data": n["publicadoEm"],
            "resumo": n["resumo"],
            "url": n["urlOficial"],
        })
    return resultado


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    pergunta: str
    historico: list[ChatMessage] = []
    conversaId: str | None = None


def _exigir_acesso_chat(request: Request) -> str:
    """Checagem "só o nível, sem olhar orçamento" - usada nos endpoints de
    histórico (listar/ler/apagar conversa), que não custam nada de Claude
    então não fazem sentido cortar por orçamento diário, só por nível."""
    info = _sessao_atual(request)
    nivel = info["nivel"] if info else "basico"
    if not auth.LIMITES_NIVEL.get(nivel, auth.LIMITES_NIVEL["basico"])["chat"]:
        raise HTTPException(status_code=403, detail="Seu nível de acesso não inclui o Copiloto ATLAS.")
    return info["usuario"]


@app.get("/copilot/conversas")
def listar_conversas(request: Request):
    usuario = _exigir_acesso_chat(request)
    return app_db.listar_conversas(usuario)


@app.get("/copilot/conversas/{id}")
def obter_conversa(id: str, request: Request):
    usuario = _exigir_acesso_chat(request)
    conversa = app_db.obter_conversa(id, usuario)
    if conversa is None:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    return conversa


@app.delete("/copilot/conversas/{id}")
def deletar_conversa(id: str, request: Request):
    usuario = _exigir_acesso_chat(request)
    if not app_db.remover_conversa(id, usuario):
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    return {"ok": True}


@app.post("/copilot/chat")
def copiloto_chat(req: ChatRequest, request: Request):
    """
    Chat do Copiloto ATLAS: cruza a pergunta do advogado com as decisões E
    notícias coletadas pela ATLAS (busca por palavra-chave + setor sobre a
    base inteira, não uma amostra fixa) e devolve uma resposta fundamentada
    + as fontes usadas, para o front linkar de volta (decisão -> dossiê
    interno, notícia -> fonte oficial externa).

    A conversa inteira (perguntas, respostas e fontes) é salva a cada troca
    de mensagem em app_db (SQLite) - conversaId identifica a conversa entre
    chamadas; None na primeira pergunta cria uma nova.

    Nível básico não tem acesso a este endpoint; intermediário/plus têm um
    orçamento diário em USD (ver auth.verificar_chat_permitido) - o custo
    real de cada chamada (pelos tokens que a Claude API devolve) é somado
    ao gasto do dia logo depois da resposta, então só entra na conta quem
    de fato gerou uma resposta (uma pergunta bloqueada por 403 não gasta).
    """
    usuario = _exigir_chat_permitido(request)

    if not req.pergunta.strip():
        raise HTTPException(status_code=400, detail="Pergunta vazia")

    termos_pergunta = set(_tokenizar(req.pergunta))
    decisoes = _buscar_decisoes_relevantes(termos_pergunta)
    noticias = _buscar_noticias_relevantes(termos_pergunta)
    historico = [{"role": m.role, "content": m.content} for m in req.historico]

    try:
        resposta, uso = claude_chat.perguntar(
            req.pergunta, decisoes, noticias, historico, retornar_uso=True
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Falha ao consultar Claude: {e}")
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Erro de rede ao consultar Claude: {e}")

    auth.registrar_gasto_chat(usuario, uso["tokensEntrada"], uso["tokensSaida"])

    fontes = [
        {
            "id": d["id"], "tipo": "decisao", "titulo": d["titulo"],
            "tribunal": d["tribunal"], "data": d["data"], "url": d["url"],
        }
        for d in decisoes
    ] + [
        {
            "id": n["id"], "tipo": "noticia", "titulo": n["titulo"],
            "tribunal": n["tribunal"], "data": n["data"], "url": n["url"],
        }
        for n in noticias
    ]

    mensagens_salvas = historico + [
        {"role": "user", "content": req.pergunta},
        {"role": "assistant", "content": resposta, "fontes": fontes},
    ]
    titulo = req.pergunta.strip()[:80]
    conversa = app_db.salvar_conversa(req.conversaId, titulo, mensagens_salvas, usuario)

    return {
        "resposta": resposta,
        "fontes": fontes,
        "conversaId": conversa["id"],
    }


def _opp_para_decisao_dict(opp: dict) -> dict:
    return {
        "titulo": opp["titulo"],
        "tribunal": opp["tribunal"],
        "data": opp["decisao"]["data"],
        "mecanismo": opp["mecanismo"],
        "tributos": opp["tributos"],
        "setores": opp["setores"],
        "ementa": opp["decisao"]["ementa"] or opp["resumoExecutivo"],
    }


def _opp_para_decisao_rica(opp: dict) -> dict:
    """Mesma base de _opp_para_decisao_dict, mas com os campos extras que
    o carrossel Intelligence Brief usa pra fundamentar melhor cada slide
    (resultado pro contribuinte, impacto, êxito, justificativa de setor) -
    endpoints existentes continuam usando a versão enxuta acima."""
    base = _opp_para_decisao_dict(opp)
    base.update({
        "tipo": opp.get("tipo"),
        "impactoFinanceiro": opp.get("impactoFinanceiro"),
        "probabilidadeExito": opp.get("probabilidadeExito"),
        "justificativaSetor": opp.get("justificativaSetor"),
    })
    return base


class PostInstagramRequest(BaseModel):
    mensagem: str | None = None
    historico: list[dict] = []
    imagemBase64: str | None = None
    imagemTipo: str | None = None


def _gerar_post_instagram_impl(id: str, req: PostInstagramRequest):
    """
    Gera headline/corpo/legenda para a arte de Instagram desta decisão ou
    notícia (usado pelo estúdio de imagem). A imagem em si é montada no
    navegador (canvas) - aqui só volta o texto.

    O advogado conversa livremente: manda uma mensagem (pode incluir um
    link, buscado automaticamente), anexa uma imagem de referência
    (imagemBase64 + imagemTipo), ou só pede um ajuste. Primeira chamada:
    historico=[] -> texto novo a partir da decisão/notícia (mensagem
    opcional, dá uma orientação inicial). Chamadas seguintes: reenviar o
    "historico" desta resposta + a nova "mensagem".
    """
    row = _buscar_linha_por_id(id)
    if row is None:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    if req.historico and not req.mensagem:
        raise HTTPException(status_code=400, detail="Escreva uma mensagem")

    decisao = _opp_para_decisao_dict(_linha_para_opportunity(row))

    try:
        resultado = social_post.gerar_textos_post(
            decisao, req.mensagem, req.historico, req.imagemBase64, req.imagemTipo
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Falha ao consultar Claude: {e}")
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Erro de rede ao consultar Claude: {e}")

    return resultado


@app.post("/opportunities/{id}/post-instagram")
def gerar_post_instagram(id: str, req: PostInstagramRequest, request: Request):
    usuario = _exigir_cota_geracao(request)
    resultado = _gerar_post_instagram_impl(id, req)
    auth.registrar_geracao(usuario)
    return resultado


@app.post("/news/{id}/post-instagram")
def gerar_post_instagram_noticia(id: str, req: PostInstagramRequest, request: Request):
    usuario = _exigir_cota_geracao(request)
    resultado = _gerar_post_instagram_impl(id, req)
    auth.registrar_geracao(usuario)
    return resultado


class ReferenciaVisual(BaseModel):
    base64: str
    mediaType: str = "image/jpeg"


class PostComModeloRequest(BaseModel):
    referencias: list[ReferenciaVisual]
    mensagem: str | None = None


def _gerar_post_com_modelo_impl(id: str, req: PostComModeloRequest):
    """
    Estúdio Visual: gera um post novo preservando o padrão visual de posts
    que o cliente já usa (req.referencias), contextualizado pela decisão/
    notícia real. Ver ai/post_com_modelo.py para a orquestração completa.
    """
    if not req.referencias:
        raise HTTPException(
            status_code=400, detail="Envie ao menos uma imagem de referência do modelo visual"
        )

    row = _buscar_linha_por_id(id)
    if row is None:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    decisao = _opp_para_decisao_dict(_linha_para_opportunity(row))

    try:
        resultado = post_com_modelo.gerar_post_com_modelo(
            decisao,
            [r.model_dump() for r in req.referencias],
            req.mensagem,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Falha ao consultar Claude: {e}")
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Erro de rede ao consultar Claude: {e}")

    return resultado


@app.post("/opportunities/{id}/post-com-modelo")
def gerar_post_com_modelo_endpoint(id: str, req: PostComModeloRequest, request: Request):
    usuario = _exigir_cota_geracao(request)
    resultado = _gerar_post_com_modelo_impl(id, req)
    auth.registrar_geracao(usuario)
    return resultado


@app.post("/news/{id}/post-com-modelo")
def gerar_post_com_modelo_noticia_endpoint(id: str, req: PostComModeloRequest, request: Request):
    usuario = _exigir_cota_geracao(request)
    resultado = _gerar_post_com_modelo_impl(id, req)
    auth.registrar_geracao(usuario)
    return resultado


class CarrosselRequest(BaseModel):
    identidade: str = "atlas"  # "atlas" ou "propria"
    referencias: list[ReferenciaVisual] = []
    tom: str | None = None
    mensagem: str | None = None
    historico: list[dict] = []
    imagemId: int | None = None  # foto da Pexels escolhida numa galeria (opcional)


def _gerar_carrossel_impl(id: str, req: CarrosselRequest):
    """
    Intelligence Brief: carrossel de 5 slides + legenda pensada pra
    prospecção, a partir de uma decisão/notícia real. Ver ai/carrossel.py.
    """
    if req.identidade == "propria" and not req.referencias:
        raise HTTPException(
            status_code=400,
            detail="Envie ao menos uma imagem de referência pra usar sua identidade visual",
        )

    row = _buscar_linha_por_id(id)
    if row is None:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    decisao = _opp_para_decisao_rica(_linha_para_opportunity(row))

    try:
        resultado = carrossel.gerar_carrossel(
            decisao,
            identidade=req.identidade,
            referencias=[r.model_dump() for r in req.referencias] or None,
            tom=req.tom,
            mensagem=req.mensagem,
            historico=req.historico,
            imagem_id=req.imagemId,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Falha ao consultar Claude: {e}")
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Erro de rede ao consultar Claude: {e}")

    return resultado


@app.post("/opportunities/{id}/carrossel-instagram")
def gerar_carrossel_endpoint(id: str, req: CarrosselRequest, request: Request):
    usuario = _exigir_cota_geracao(request)
    resultado = _gerar_carrossel_impl(id, req)
    auth.registrar_geracao(usuario)
    return resultado


@app.post("/news/{id}/carrossel-instagram")
def gerar_carrossel_noticia_endpoint(id: str, req: CarrosselRequest, request: Request):
    usuario = _exigir_cota_geracao(request)
    resultado = _gerar_carrossel_impl(id, req)
    auth.registrar_geracao(usuario)
    return resultado


def _imagens_sugeridas_impl(id: str):
    """Galeria de fotos candidatas pro assunto real da decisão (ex: setor
    supermercados -> várias fotos de supermercado) - o profissional escolhe
    uma em vez da ATLAS sortear sozinha. Ver ai/imagem_contextual.py."""
    row = _buscar_linha_por_id(id)
    if row is None:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    decisao = _opp_para_decisao_rica(_linha_para_opportunity(row))
    return imagem_contextual.buscar_imagens_candidatas(decisao)


@app.get("/opportunities/{id}/imagens-sugeridas")
def imagens_sugeridas_endpoint(id: str):
    return _imagens_sugeridas_impl(id)


@app.get("/news/{id}/imagens-sugeridas")
def imagens_sugeridas_noticia_endpoint(id: str):
    return _imagens_sugeridas_impl(id)


class ParecerRequest(BaseModel):
    ajuste: str | None = None
    historico: list[dict] = []


@app.post("/opportunities/{id}/parecer")
def gerar_parecer_endpoint(id: str, req: ParecerRequest, request: Request):
    """
    Gera o parecer técnico estruturado (fatos/arguido/defendido/contestado/
    fundamentação/dispositivo/aplicação prática) sob demanda via Claude,
    quando o advogado clica "Gerar parecer" na página da decisão.

    Mesmo padrão do /post-instagram: primeira chamada sem historico, ajustes
    seguintes reenviam o "historico" devolvido + o novo "ajuste".
    """
    usuario = _exigir_cota_geracao(request)

    row = _buscar_linha_por_id(id)
    if row is None:
        raise HTTPException(status_code=404, detail="Oportunidade não encontrada")

    if req.historico and not req.ajuste:
        raise HTTPException(status_code=400, detail="Informe o texto do ajuste desejado")

    decisao = _opp_para_decisao_dict(_linha_para_opportunity(row))

    try:
        resultado = parecer_ai.gerar_parecer(decisao, req.ajuste, req.historico)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Falha ao consultar Claude: {e}")
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Erro de rede ao consultar Claude: {e}")

    auth.registrar_geracao(usuario)
    return resultado


# --- Coleta de decisões (CARF/STJ/STF/PGFN/Receita/TRF4/DJEN) --------------
# Roda sozinha 3x/dia (ver coleta_scheduler.py); este endpoint só existe pra
# forçar uma rodada na hora (ex: logo após configurar o sistema, sem
# precisar esperar o próximo horário agendado), igual ao "Publicar agora"
# da Mídia Social. Só admin - pode demorar bastante (a coleta varre várias
# fontes externas antes de responder).
@app.post("/admin/coletar-decisoes-agora")
def admin_coletar_decisoes_agora(request: Request):
    _exigir_admin(request)
    try:
        atlas_engine.main()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha na coleta: {e}")
    # _carregar_dados() já detecta sozinha que o Excel mudou (mtime) e relê -
    # não precisa invalidar nada aqui manualmente.
    return {"ok": True}


# Restauração pontual do Excel de decisões perdido nos redeploys anteriores
# ao ATLAS_DATA_DIR entrar em vigor (dados recuperados de um backup local
# pré-migração) - endpoint de uso único, remover depois de restaurar.
@app.post("/admin/restaurar-decisoes-backup")
async def admin_restaurar_decisoes_backup(
    request: Request,
    arquivo: UploadFile = File(...),
):
    _exigir_admin(request)

    conteudo = await arquivo.read()
    df = pd.read_excel(io.BytesIO(conteudo))
    df.to_excel(paths.caminho("reports", "oportunidades.xlsx"), index=False)

    vistos = set(df["link"].dropna().astype(str)) if "link" in df.columns else set()
    with open(paths.caminho("logs", "vistos.json"), "w", encoding="utf-8") as f:
        json.dump(list(vistos), f, ensure_ascii=False)

    return {"ok": True, "linhas_restauradas": len(df), "links_marcados_vistos": len(vistos)}


# --- Mídia Social (automação de posts de Instagram) -----------------------
# Aba "Mídia Social": o usuário configura temas/objetivos/tom, horários e as
# credenciais do Instagram; o backend gera e publica os posts sozinho, nos
# horários configurados (ver social/scheduler.py) - substitui a automação
# externa que rodava fora do produto. Restrito a admin (guarda o token de
# acesso da conta do Instagram, equivalente em sensibilidade ao login).

_HEX_COR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

# Contraste mínimo (razão WCAG) pra evitar salvar uma identidade ilegível -
# o texto marcado é sempre escuro (social_render.COR_TEXTO_SOBRE_DESTAQUE),
# então a cor de destaque precisa ser clara/vibrante o bastante contra ele
# e contra o fundo escuro (senão o grifo "desaparece").
_CONTRASTE_MIN_DESTAQUE_TEXTO = 2.2
_CONTRASTE_MIN_DESTAQUE_FUNDO = 1.4


def _validar_contraste_destaque(cor_destaque_hex: str, cor_fundo_escuro_hex: str) -> None:
    cor_destaque = social_render.hex_para_rgb(cor_destaque_hex, social_render.MARCA_PADRAO.cor_destaque)
    cor_fundo = social_render.hex_para_rgb(cor_fundo_escuro_hex, social_render.MARCA_PADRAO.cor_fundo_escuro)
    contraste_texto = social_render.razao_contraste(cor_destaque, social_render.COR_TEXTO_SOBRE_DESTAQUE)
    contraste_fundo = social_render.razao_contraste(cor_destaque, cor_fundo)
    if contraste_texto < _CONTRASTE_MIN_DESTAQUE_TEXTO:
        raise HTTPException(
            status_code=400,
            detail="Cor de destaque muito escura - o texto grifado (sempre escuro) ficaria "
                   "difícil de ler. Escolha uma cor mais clara ou vibrante.",
        )
    if contraste_fundo < _CONTRASTE_MIN_DESTAQUE_FUNDO:
        raise HTTPException(
            status_code=400,
            detail="Cor de destaque muito parecida com o fundo escuro - o grifo ficaria quase "
                   "invisível. Escolha uma cor com mais contraste.",
        )


class SocialConfigRequest(BaseModel):
    ativo: bool | None = None
    temas: list[str] | None = None
    objetivos: str | None = None
    tom: str | None = None
    horarios: list[str] | None = None
    igAccessToken: str | None = None
    igBusinessAccountId: str | None = None
    marcaNome: str | None = None
    marcaHandle: str | None = None
    corFundoClaro: str | None = None
    corFundoEscuro: str | None = None
    corDestaque: str | None = None
    estilo: str | None = None
    textoClaro: bool | None = None
    posicaoVertical: str | None = None
    alinhamento: str | None = None


_HORARIO_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _mascarar_token(token: str) -> str:
    if not token:
        return ""
    if len(token) <= 8:
        return "•" * len(token)
    return f"{token[:4]}{'•' * (len(token) - 8)}{token[-4:]}"


@app.get("/social/config")
def social_obter_config(request: Request):
    usuario = _exigir_sessao(request)
    config = app_db.obter_social_config(usuario)
    return {
        **config,
        "igAccessToken": _mascarar_token(config["igAccessToken"]),
        "temToken": bool(config["igAccessToken"]),
    }


@app.put("/social/config")
def social_salvar_config(req: SocialConfigRequest, request: Request):
    usuario = _exigir_sessao(request)
    if req.horarios is not None:
        invalidos = [h for h in req.horarios if not _HORARIO_RE.match(h)]
        if invalidos:
            raise HTTPException(
                status_code=400,
                detail=f"Horário inválido (use HH:MM): {', '.join(invalidos)}",
            )
    for campo in ("corFundoClaro", "corFundoEscuro", "corDestaque"):
        valor = getattr(req, campo)
        if valor is not None and not _HEX_COR_RE.match(valor):
            raise HTTPException(status_code=400, detail=f"Cor inválida em {campo} (use #RRGGBB)")
    if req.estilo is not None and req.estilo not in social_render.FONTES_ESTILOS:
        raise HTTPException(status_code=400, detail=f"Estilo inválido: {req.estilo}")
    if req.posicaoVertical is not None and req.posicaoVertical not in social_render.POSICOES_VERTICAIS:
        raise HTTPException(status_code=400, detail=f"Posição vertical inválida: {req.posicaoVertical}")
    if req.alinhamento is not None and req.alinhamento not in social_render.ALINHAMENTOS_HORIZONTAIS:
        raise HTTPException(status_code=400, detail=f"Alinhamento inválido: {req.alinhamento}")
    if req.corDestaque is not None or req.corFundoEscuro is not None:
        atual = app_db.obter_social_config(usuario)
        _validar_contraste_destaque(
            req.corDestaque if req.corDestaque is not None else atual["corDestaque"],
            req.corFundoEscuro if req.corFundoEscuro is not None else atual["corFundoEscuro"],
        )
    dados = req.model_dump(exclude_unset=True)
    # campo vazio no form de token não deve apagar o token já salvo -
    # só atualiza se o usuário realmente digitou um novo.
    if "igAccessToken" in dados and not dados["igAccessToken"]:
        dados.pop("igAccessToken")
    config = app_db.salvar_social_config(usuario, dados)
    social_scheduler.recarregar()
    return {
        **config,
        "igAccessToken": _mascarar_token(config["igAccessToken"]),
        "temToken": bool(config["igAccessToken"]),
    }


class TestarConexaoRequest(BaseModel):
    igAccessToken: str | None = None
    igBusinessAccountId: str | None = None


@app.post("/social/test-connection")
def social_testar_conexao(req: TestarConexaoRequest, request: Request):
    """Valida token + ID da conta - usa os valores enviados no corpo (tela
    de configuração, antes de salvar) ou, se omitidos, os já salvos."""
    usuario = _exigir_sessao(request)
    config = app_db.obter_social_config(usuario)
    token = req.igAccessToken or config["igAccessToken"]
    conta_id = req.igBusinessAccountId or config["igBusinessAccountId"]
    if not token or not conta_id:
        raise HTTPException(status_code=400, detail="Informe o token e o ID da conta do Instagram")
    try:
        info = testar_conexao_instagram(token, conta_id)
    except ErroGraphAPI as e:
        raise HTTPException(
            status_code=502,
            detail=f"A Meta recusou a credencial (HTTP {e.status_code}): {e.resposta}",
        )
    return {"ok": True, "username": info.get("username"), "nome": info.get("name")}


_EXTENSOES_IMAGEM = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
_TAMANHO_MAX_IMAGEM = 5 * 1024 * 1024


async def _salvar_imagem_upload(
    arquivo: UploadFile, prefixo: str, resolucao_minima: tuple[int, int] | None = None
) -> str:
    """Valida tipo/tamanho/resolução e grava no volume persistente
    (PASTA_IMAGENS, servido publicamente por /social/imagem/{nome}) - usado
    tanto pelo logo quanto pelos fundos customizados. Devolve o nome do
    arquivo salvo.

    resolucao_minima: (largura, altura) mínima aceita - protege contra uma
    imagem pequena demais ficar borrada quando esticada pro post (o fundo
    cobre 1080x1350 inteiro; o logo é menos sensível, por isso só o fundo
    passa esse parâmetro)."""
    extensao = _EXTENSOES_IMAGEM.get(arquivo.content_type)
    if not extensao:
        raise HTTPException(status_code=400, detail="Envie um PNG, JPEG ou WEBP")
    conteudo = await arquivo.read()
    if len(conteudo) > _TAMANHO_MAX_IMAGEM:
        raise HTTPException(status_code=400, detail="Imagem muito grande (máximo 5MB)")
    # O content-type acima vem do navegador (o cliente escolhe o valor, não
    # é confiável sozinho) - decodificar de verdade confirma que os bytes
    # são mesmo uma imagem válida antes de gravar no volume e servir
    # publicamente em /social/imagem/{nome}.
    try:
        with Image.open(io.BytesIO(conteudo)) as img:
            img.verify()
        with Image.open(io.BytesIO(conteudo)) as img:
            largura, altura = img.size
    except Exception:
        raise HTTPException(status_code=400, detail="Não consegui ler essa imagem - arquivo corrompido?")
    if resolucao_minima:
        min_largura, min_altura = resolucao_minima
        if largura < min_largura or altura < min_altura:
            raise HTTPException(
                status_code=400,
                detail=f"Imagem muito pequena ({largura}x{altura}px) - envie pelo menos "
                       f"{min_largura}x{min_altura}px pra não ficar borrada no post.",
            )
    nome_arquivo = f"{prefixo}_{uuid.uuid4().hex}{extensao}"
    with open(os.path.join(social_pipeline.PASTA_IMAGENS, nome_arquivo), "wb") as f:
        f.write(conteudo)
    return nome_arquivo


@app.post("/social/logo")
async def social_subir_logo(request: Request, arquivo: UploadFile = File(...)):
    """Logo do escritório/perfil pro rodapé de marca dos posts (ver
    social/render.py) - guardado no mesmo volume persistente das imagens
    geradas (PASTA_IMAGENS), servido pela rota pública /social/imagem/{nome}
    que já existe (a Graph API também precisa alcançar essas URLs)."""
    usuario = _exigir_sessao(request)
    nome_arquivo = await _salvar_imagem_upload(arquivo, "logo")
    config = app_db.salvar_social_config(usuario, {"logoPath": nome_arquivo})
    return {"logoPath": config["logoPath"]}


@app.delete("/social/logo")
def social_remover_logo(request: Request):
    usuario = _exigir_sessao(request)
    config = app_db.salvar_social_config(usuario, {"logoPath": ""})
    return {"logoPath": config["logoPath"]}


@app.post("/social/fundo")
async def social_subir_fundo(request: Request, slide: int, arquivo: UploadFile = File(...)):
    """Fundo próprio do escritório (arte já pronta) pro slide 1 ou 2 - o
    sistema escreve o texto gerado por cima, na mesma área/fonte/cor já
    configuradas (ver render._fundo_slide). Substitui o degradê da
    identidade de marca só pra esse slide."""
    usuario = _exigir_sessao(request)
    if slide not in (1, 2):
        raise HTTPException(status_code=400, detail="slide precisa ser 1 ou 2")
    # o fundo cobre a imagem 1080x1350 inteira (ver render._fundo_slide) -
    # abaixo de ~2/3 disso ele fica visivelmente esticado/borrado.
    nome_arquivo = await _salvar_imagem_upload(arquivo, f"fundo{slide}", resolucao_minima=(720, 900))
    config = app_db.salvar_social_config(usuario, {f"fundo{slide}Path": nome_arquivo})
    return {f"fundo{slide}Path": config[f"fundo{slide}Path"]}


@app.delete("/social/fundo")
def social_remover_fundo(request: Request, slide: int):
    usuario = _exigir_sessao(request)
    if slide not in (1, 2):
        raise HTTPException(status_code=400, detail="slide precisa ser 1 ou 2")
    config = app_db.salvar_social_config(usuario, {f"fundo{slide}Path": ""})
    return {f"fundo{slide}Path": config[f"fundo{slide}Path"]}


class SocialIdentidadeIARequest(BaseModel):
    descricao: str


@app.post("/social/gerar-identidade")
def social_gerar_identidade(req: SocialIdentidadeIARequest, request: Request):
    """Traduz uma descrição em texto livre (ex: "quero algo elegante, vinho
    e dourado") em cores + estilo tipográfico sugeridos - preenche o
    formulário, mas não salva nem publica nada sozinho (o usuário revisa,
    gera prévia e só então clica em Salvar)."""
    _exigir_sessao(request)
    descricao = req.descricao.strip()
    if not descricao:
        raise HTTPException(status_code=400, detail="Descreva a identidade visual que você imagina")
    try:
        return social_content.gerar_identidade_visual(descricao)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Falha ao gerar identidade com IA: {e}")


class SocialPreviewRequest(BaseModel):
    marcaNome: str | None = None
    marcaHandle: str | None = None
    corFundoClaro: str | None = None
    corFundoEscuro: str | None = None
    corDestaque: str | None = None
    estilo: str | None = None
    textoClaro: bool | None = None
    posicaoVertical: str | None = None
    alinhamento: str | None = None


_PARAGRAFO_PREVIEW = (
    "STF decide que o benefício fiscal vale mesmo sem homologação expressa da Receita, "
    "§§independentemente de ato declaratório posterior§§."
)
_SUB2_PREVIEW = "Análise §§gerada automaticamente pela {marca}§§ a partir da decisão real de hoje."


@app.post("/social/preview")
def social_preview(req: SocialPreviewRequest, request: Request):
    """Gera as duas imagens de exemplo com a identidade visual atual (salva
    + overrides não salvos ainda, pra pré-visualizar cor/logo antes de
    clicar em Salvar) - usa um texto fixo de exemplo, nunca uma decisão
    real, então pode ser chamado quantas vezes quiser sem gastar Claude."""
    usuario = _exigir_sessao(request)
    for campo in ("corFundoClaro", "corFundoEscuro", "corDestaque"):
        valor = getattr(req, campo)
        if valor is not None and not _HEX_COR_RE.match(valor):
            raise HTTPException(status_code=400, detail=f"Cor inválida em {campo} (use #RRGGBB)")
    if req.estilo is not None and req.estilo not in social_render.FONTES_ESTILOS:
        raise HTTPException(status_code=400, detail=f"Estilo inválido: {req.estilo}")
    if req.posicaoVertical is not None and req.posicaoVertical not in social_render.POSICOES_VERTICAIS:
        raise HTTPException(status_code=400, detail=f"Posição vertical inválida: {req.posicaoVertical}")
    if req.alinhamento is not None and req.alinhamento not in social_render.ALINHAMENTOS_HORIZONTAIS:
        raise HTTPException(status_code=400, detail=f"Alinhamento inválido: {req.alinhamento}")
    config = {**app_db.obter_social_config(usuario), **req.model_dump(exclude_unset=True)}
    marca = social_pipeline.marca_da_config(config)
    nome1, nome2 = "preview_1.png", "preview_2.png"
    social_render.render_slide1(
        _PARAGRAFO_PREVIEW, os.path.join(social_pipeline.PASTA_IMAGENS, nome1), marca=marca
    )
    social_render.render_slide2(
        "Inteligência tributária, todos os dias.",
        _SUB2_PREVIEW.format(marca=marca.nome),
        os.path.join(social_pipeline.PASTA_IMAGENS, nome2),
        marca=marca,
    )
    return {"imagem1Path": nome1, "imagem2Path": nome2}


@app.get("/social/posts")
def social_listar_posts(request: Request, limit: int = 30):
    usuario = _exigir_sessao(request)
    return app_db.listar_social_posts(usuario, limit)


@app.post("/social/run-now")
def social_publicar_agora(request: Request):
    """Botão "Publicar agora" - roda o ciclo completo na hora (ignora o
    toggle "ativo" e o agendamento), pra testar a configuração de ponta a
    ponta sem esperar o próximo horário. Publica de verdade se as
    credenciais estiverem corretas - não é um modo de simulação."""
    usuario = _exigir_cota_geracao(request)
    resultado = social_pipeline.executar_ciclo(usuario, _decisoes_candidatas_social(25), forcar=True)
    auth.registrar_geracao(usuario)
    return resultado


@app.get("/social/imagem/{nome}")
def social_obter_imagem(nome: str):
    """Serve as imagens geradas pro post automático - precisa ser público
    (sem cookie de sessão) pra Graph API da Meta conseguir buscar a URL ao
    publicar o carrossel. Ver _PREFIXOS_PUBLICOS acima."""
    caminho = os.path.join(social_pipeline.PASTA_IMAGENS, nome)
    if "/" in nome or ".." in nome or not os.path.isfile(caminho):
        raise HTTPException(status_code=404, detail="Imagem não encontrada")
    return FileResponse(caminho, media_type="image/png")


@app.get("/")
def raiz():
    return {
        "status": "ATLAS API rodando",
        "endpoints": [
            "/opportunities", "/news", "/clients", "/summary",
            "/copilot/chat", "/opportunities/{id}/post-instagram",
            "/news/{id}/post-instagram", "/opportunities/{id}/parecer",
            "/opportunities/{id}/post-com-modelo", "/news/{id}/post-com-modelo",
            "/opportunities/{id}/carrossel-instagram", "/news/{id}/carrossel-instagram",
            "/opportunities/{id}/imagens-sugeridas", "/news/{id}/imagens-sugeridas",
            "/auth/status", "/auth/setup", "/auth/login", "/auth/logout",
            "/auth/users",
            "/social/config", "/social/test-connection", "/social/posts", "/social/run-now",
            "/social/logo", "/social/fundo", "/social/preview", "/social/gerar-identidade",
            "/admin/coletar-decisoes-agora",
        ],
    }
