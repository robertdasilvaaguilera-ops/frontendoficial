"""
Orquestra um ciclo completo do post automático de Instagram: escolhe+escreve
o conteúdo (Claude), renderiza as 2 imagens (Pillow), publica no Instagram
(Graph API) e grava o resultado no histórico (SQLite) - tudo dentro do
próprio backend, substituindo a automação externa que rodava via tarefa
agendada fora do produto.
"""
from __future__ import annotations

import os
import re
import uuid

import app_db
import paths
from social import content, render
from social.instagram import ErroGraphAPI, publicar_carrossel

# Fica no mesmo volume persistente que o banco/Excel (ver paths.py) - sem
# isso, o histórico da Mídia Social continuava certo no banco, mas as
# miniaturas das imagens sumiam (404) depois do primeiro redeploy seguinte.
# paths.caminho() só garante o diretório PAI (é pensado pra caminho de
# arquivo) - aqui o próprio "social_output" é o diretório, então precisa
# do makedirs explícito.
PASTA_IMAGENS = os.path.join(paths.DIR_DADOS, "social_output")
os.makedirs(PASTA_IMAGENS, exist_ok=True)

URL_BASE_PUBLICA = os.getenv(
    "ATLAS_BACKEND_PUBLIC_URL", "https://atlas-backend-production-2804.up.railway.app"
)

_GANCHO_RE = re.compile(
    r"(Entenda o risco|Entenda a oportunidade|Entenda os riscos|Avalie o impacto|"
    r"Confira se te atinge|Reveja o seu caso|Vale a pena checar)\.?\s*$"
)


def _extrair_gancho(paragrafo: str) -> str:
    m = _GANCHO_RE.search(paragrafo.strip())
    return m.group(1) + "." if m else ""


def _url_publica_imagem(nome_arquivo: str) -> str:
    return f"{URL_BASE_PUBLICA}/social/imagem/{nome_arquivo}"


def marca_da_config(config: dict) -> render.Marca:
    """Monta a identidade visual (`render.Marca`) a partir da configuração
    salva pelo usuário na aba Mídia Social - cada perfil tem seu próprio
    nome, @handle, cores e logo (ver /social/config e /social/logo)."""
    logo_path = None
    if config.get("logoPath"):
        caminho = os.path.join(PASTA_IMAGENS, config["logoPath"])
        if os.path.isfile(caminho):
            logo_path = caminho
    return render.Marca(
        nome=config.get("marcaNome") or "ATLAS",
        handle=config.get("marcaHandle") or "@atlas.tributos",
        cor_destaque=render.hex_para_rgb(config.get("corDestaque"), render.MARCA_PADRAO.cor_destaque),
        cor_fundo_claro=render.hex_para_rgb(config.get("corFundoClaro"), render.MARCA_PADRAO.cor_fundo_claro),
        cor_fundo_escuro=render.hex_para_rgb(config.get("corFundoEscuro"), render.MARCA_PADRAO.cor_fundo_escuro),
        logo_path=logo_path,
    )


def executar_ciclo(decisoes_candidatas: list[dict], forcar: bool = False) -> dict:
    """
    decisoes_candidatas: mesmo formato usado pelo antigo
    /automacao/decisoes-recentes (id, titulo, tribunal, data_julgamento,
    setor_economico, mecanismo, tributos, resumo, impacto_estimado,
    link_fonte), já buscado pelo chamador (api_server, que tem acesso ao
    DataFrame de decisões).
    forcar: ignora o toggle "ativo" da configuração - usado pelo botão
        "Publicar agora" (teste manual), nunca pelo agendador.
    """
    config = app_db.obter_social_config()

    if not forcar and not config["ativo"]:
        return app_db.inserir_social_post({"status": "inativo", "erroDetalhe": "Automação desativada"})

    if not config["igAccessToken"] or not config["igBusinessAccountId"]:
        return app_db.inserir_social_post({
            "status": "erro",
            "erroDetalhe": "Credenciais do Instagram não configuradas (token ou ID da conta ausente).",
        })

    usadas = app_db.listar_social_decisoes_usadas()
    candidatas = [d for d in decisoes_candidatas if d.get("id") not in usadas]
    if not candidatas:
        return app_db.inserir_social_post({
            "status": "sem_decisao",
            "erroDetalhe": "Nenhuma decisão nova disponível (todas as candidatas já foram usadas).",
        })

    ganchos_recentes = app_db.ultimos_ganchos_social(5)

    try:
        escolha = content.escolher_e_escrever(
            candidatas,
            usadas,
            temas=config["temas"],
            objetivos=config["objetivos"],
            tom=config["tom"],
            ganchos_recentes=ganchos_recentes,
            marca_nome=config["marcaNome"],
        )
    except Exception as e:  # erro de rede/parsing na chamada à Claude
        return app_db.inserir_social_post({
            "status": "erro", "erroDetalhe": f"Falha ao gerar conteúdo: {e}",
        })

    if not escolha:
        return app_db.inserir_social_post({
            "status": "sem_decisao",
            "erroDetalhe": "Nenhuma decisão candidata foi considerada qualificada para post.",
        })

    decisao = next((d for d in candidatas if d.get("id") == escolha["decisaoId"]), None)
    titulo = decisao.get("titulo", "") if decisao else ""
    gancho = _extrair_gancho(escolha["paragrafoDestaque"])

    marca = marca_da_config(config)
    nome1, nome2 = f"{uuid.uuid4().hex}.png", f"{uuid.uuid4().hex}.png"
    caminho1, caminho2 = os.path.join(PASTA_IMAGENS, nome1), os.path.join(PASTA_IMAGENS, nome2)
    try:
        render.render_slide1(escolha["paragrafoDestaque"], caminho1, marca=marca)
        render.render_slide2(escolha["headline2"], escolha["sub2"], caminho2, marca=marca)
    except Exception as e:
        return app_db.inserir_social_post({
            "status": "erro", "decisaoId": escolha["decisaoId"], "titulo": titulo,
            "paragrafoDestaque": escolha["paragrafoDestaque"], "headline2": escolha["headline2"],
            "sub2": escolha["sub2"], "legenda": escolha["legenda"], "gancho": gancho,
            "erroDetalhe": f"Falha ao renderizar as imagens: {e}",
        })

    try:
        resultado = publicar_carrossel(
            config["igAccessToken"],
            config["igBusinessAccountId"],
            _url_publica_imagem(nome1),
            _url_publica_imagem(nome2),
            escolha["legenda"],
        )
    except ErroGraphAPI as e:
        return app_db.inserir_social_post({
            "status": "erro", "decisaoId": escolha["decisaoId"], "titulo": titulo,
            "paragrafoDestaque": escolha["paragrafoDestaque"], "headline2": escolha["headline2"],
            "sub2": escolha["sub2"], "legenda": escolha["legenda"], "gancho": gancho,
            "imagem1Path": nome1, "imagem2Path": nome2,
            "erroDetalhe": f"Etapa '{e.etapa}': HTTP {e.status_code} - {e.resposta}",
        })

    app_db.marcar_social_decisao_usada(escolha["decisaoId"])
    return app_db.inserir_social_post({
        "status": "publicado", "decisaoId": escolha["decisaoId"], "titulo": titulo,
        "paragrafoDestaque": escolha["paragrafoDestaque"], "headline2": escolha["headline2"],
        "sub2": escolha["sub2"], "legenda": escolha["legenda"], "gancho": gancho,
        "imagem1Path": nome1, "imagem2Path": nome2,
        "postId": resultado.get("post_id"), "permalink": resultado.get("permalink"),
    })
