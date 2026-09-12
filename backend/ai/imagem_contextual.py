"""
Selecao de imagem de fundo contextual para a arte de Instagram, a partir do
conteudo real da decisao - substitui o fundo generico (degrade na cor da
marca) por uma foto de banco de imagens coerente com o tema.

Fluxo: DECISAO -> TEMA (mecanismo/tributo/ementa) -> SETOR (setor_identificado,
ja calculado pelo pipeline de coleta) -> CONTEXTO VISUAL (termo de busca em
ingles) -> IMAGEM (busca na API da Pexels, banco de fotos gratuito de uso
comercial, https://www.pexels.com/api/).

- Setor conhecido (ex: "Agronegócio", "Clínicas médicas"): mapeamento direto
  e deterministico pra um termo de busca (rapido, gratis, sempre no tema
  certo - ver SETOR_PARA_BUSCA).
- Sem setor identificado (questao juridica sem economico especifico): pede
  pra Claude um termo de busca institucional coerente com o tema da decisao
  (mecanismo/tributo/ementa), em vez de um fallback unico fixo.

Em qualquer falha (sem PEXELS_API_KEY configurada, sem internet, sem
resultado na busca) devolve None - o estudio de imagem simplesmente segue
sem foto de fundo (degrade da cor da marca), igual ao comportamento antes
desta funcionalidade existir. Nunca trava a geracao do post por causa disso.

Como conseguir a chave (gratis):
  1. Acesse https://www.pexels.com/api/ e crie uma conta
  2. Copie a "API Key" do painel
  3. Configure no backend/.env: PEXELS_API_KEY=sua-chave-aqui
"""
import base64
import os
import random
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from ai.claude_chat import chamar

PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")
PEXELS_URL = "https://api.pexels.com/v1/search"

# Setor (mesma taxonomia usada pelo pipeline em setor_identificado, ver
# database/setores.py) -> termo de busca em ingles que representa
# visualmente aquele setor. Isto e um mapeamento setor->TERMO DE BUSCA, nao
# uma lista fixa de imagens: a foto de verdade vem de uma busca ao vivo na
# Pexels a cada geracao, variando entre os resultados relevantes.
SETOR_PARA_BUSCA = {
    "Agronegócio": "agriculture farm field aerial",
    "Escritórios de serviços": "modern office business meeting",
    "Cooperativas": "farmers cooperative agriculture",
    "Indústria de alimentos": "food factory industrial production line",
    "Distribuidoras": "warehouse logistics distribution center",
    "Construção civil": "construction site building architecture",
    "Hospitais": "hospital healthcare corridor modern",
    "Incorporação imobiliária": "modern building architecture real estate",
    "Revenda de veículos": "car dealership showroom",
    "Transportadoras": "truck logistics highway transport",
    "Atacado": "warehouse wholesale pallets",
    "Supermercados": "supermarket grocery store aisle",
    "Software / TI": "technology office software team",
    "Clínicas odontológicas": "dental clinic office professional",
    "Varejo em geral": "retail store shopping interior",
    "Farmácias": "pharmacy drugstore shelves",
    "Clínicas médicas": "medical clinic doctor office",
    "Postos de combustíveis": "gas station fuel pump",
    "Autopeças": "auto parts mechanic garage",
    "Indústria metalúrgica": "steel factory metal industry",
}

_SYSTEM_PROMPT_CONTEXTO = """Você identifica o contexto visual mais adequado para a foto de \
fundo de uma arte institucional de Instagram sobre uma decisão jurídica tributária/\
empresarial brasileira.

Responda SOMENTE com um termo de busca em INGLÊS de 3 a 6 palavras, para buscar num banco \
de imagens (Pexels) - sem aspas, sem pontuação, sem explicação, só o termo. PRIORIDADE \
MÁXIMA: se o tema mencionar (mesmo implicitamente) uma atividade econômica ou setor - \
produtor rural, transportador, clínica, indústria, comércio, agropecuária etc. - o termo \
deve retratar CENA REAL dessa atividade (ex: produtor rural pessoa física -> "farmer rural \
field crop harvest"; transportadora -> "truck highway logistics driver"; clínica \
odontológica -> "dental clinic office professional"). Só use uma cena institucional genérica \
(escritório de advocacia, tribunal, documentos, prédio corporativo) quando a decisão for \
puramente jurídica/processual, sem nenhuma atividade econômica identificável (ex: decisão \
sobre comércio exterior/importação -> "shipping port containers customs"; recuperação \
judicial -> "corporate finance meeting boardroom"; processo administrativo fiscal sem setor \
-> "tax documents office desk"). Nunca um termo genérico demais tipo só "law" ou "business".

Nunca inclua nomes de marcas, pessoas reais ou empresas específicas."""


def _normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", sem_acento.lower()).strip()


_SETOR_PARA_BUSCA_NORMALIZADO = {_normalizar(k): v for k, v in SETOR_PARA_BUSCA.items()}


def _buscar_termo_por_setor(setor: str) -> str | None:
    """Match exato primeiro; se não achar, tenta por normalização (sem
    acento/caixa) e por substring nos dois sentidos - cobre variações como
    "Produtor Rural (Agronegócio)" ou "agronegocio" sem bater 100% com a
    chave cadastrada em SETOR_PARA_BUSCA."""
    bruto = str(setor).strip()
    if bruto in SETOR_PARA_BUSCA:
        return SETOR_PARA_BUSCA[bruto]
    norm = _normalizar(bruto)
    if not norm:
        return None
    if norm in _SETOR_PARA_BUSCA_NORMALIZADO:
        return _SETOR_PARA_BUSCA_NORMALIZADO[norm]
    for chave_norm, termo in _SETOR_PARA_BUSCA_NORMALIZADO.items():
        if chave_norm in norm or norm in chave_norm:
            return termo
    return None


def _contexto_visual(decisao: dict) -> str:
    """Decide o termo de busca: setor já classificado pelo pipeline quando
    existe (com tolerância a variações de grafia), senão pede um termo
    coerente com a atividade econômica real pra Claude."""
    for setor in decisao.get("setores") or []:
        termo = _buscar_termo_por_setor(setor)
        if termo:
            return termo

    tema = (
        f"Setor(es) identificado(s): {', '.join(decisao.get('setores') or []) or 'nenhum'}\n"
        f"Justificativa do setor: {decisao.get('justificativaSetor') or ''}\n"
        f"Tribunal: {decisao.get('tribunal', '')}\n"
        f"Mecanismo: {decisao.get('mecanismo') or ''}\n"
        f"Tributos: {', '.join(decisao.get('tributos') or [])}\n"
        f"Título/ementa: {decisao.get('titulo') or ''} "
        f"{str(decisao.get('ementa') or '')[:600]}"
    )
    try:
        # effort="low": só escolhe 2-4 palavras-chave em inglês pra busca de
        # imagem - tarefa mecânica, não precisa de raciocínio profundo.
        termo = chamar(
            _SYSTEM_PROMPT_CONTEXTO, [{"role": "user", "content": tema}], max_tokens=30, effort="low"
        )
        termo = re.sub(r"[\"'.]", "", termo).strip()
        return termo or "law office justice professional"
    except (RuntimeError, requests.RequestException):
        return "law office justice professional"


def _buscar_no_pexels(query: str) -> str | None:
    if not PEXELS_API_KEY:
        return None
    try:
        resposta = requests.get(
            PEXELS_URL,
            headers={"Authorization": PEXELS_API_KEY},
            params={"query": query, "orientation": "portrait", "per_page": 5},
            timeout=10,
        )
        resposta.raise_for_status()
        fotos = resposta.json().get("photos") or []
        if not fotos:
            return None
        # sorteia entre os resultados relevantes (nao sempre o primeiro) -
        # pra 1000+ usuarios gerando posts do mesmo setor nao caírem sempre
        # na mesma foto exata.
        foto = random.choice(fotos)
        src = foto.get("src", {})
        return src.get("large2x") or src.get("large") or src.get("original")
    except requests.RequestException:
        return None


def _baixar_como_data_url(url: str) -> str | None:
    """Baixa a foto e devolve como data URL (base64 embutido) - assim o
    front trata exatamente igual a uma foto que o advogado tivesse subido
    na mão, sem precisar lidar com CORS de domínio externo no canvas."""
    try:
        resposta = requests.get(url, timeout=10)
        resposta.raise_for_status()
        tipo = resposta.headers.get("Content-Type", "image/jpeg").split(";")[0]
        b64 = base64.b64encode(resposta.content).decode("ascii")
        return f"data:{tipo};base64,{b64}"
    except requests.RequestException:
        return None


def buscar_imagem_por_id(photo_id: int, contexto: str = "") -> dict | None:
    """Baixa e embute (base64) uma foto específica da Pexels pelo id - usada
    quando o profissional já escolheu a foto numa galeria (ver
    buscar_imagens_candidatas), em vez de deixar a ATLAS sortear uma."""
    if not PEXELS_API_KEY:
        return None
    try:
        resposta = requests.get(
            f"https://api.pexels.com/v1/photos/{photo_id}",
            headers={"Authorization": PEXELS_API_KEY},
            timeout=10,
        )
        resposta.raise_for_status()
        foto = resposta.json()
    except requests.RequestException:
        return None
    src = foto.get("src", {})
    url_imagem = src.get("large2x") or src.get("large") or src.get("original")
    if not url_imagem:
        return None
    data_url = _baixar_como_data_url(url_imagem)
    if not data_url:
        return None
    return {"dataUrl": data_url, "contexto": contexto}


def buscar_imagens_candidatas(decisao: dict, quantidade: int = 9) -> dict:
    """Pra galeria de escolha: devolve o termo de busca usado e até
    `quantidade` fotos candidatas coerentes com o assunto real da decisão.
    Cada preview já vem baixado e embutido em base64 (igual à foto final,
    ver _baixar_como_data_url) - nunca aponta pro CDN da Pexels direto do
    navegador, pelo mesmo motivo de sempre: sem depender de CORS/hotlink/
    rede do lado do cliente pra uma imagem aparecer. Devolve lista vazia
    (nunca erro) se faltar PEXELS_API_KEY ou não houver resultado."""
    termo = _contexto_visual(decisao)
    if not PEXELS_API_KEY:
        return {"contexto": termo, "imagens": []}
    try:
        resposta = requests.get(
            PEXELS_URL,
            headers={"Authorization": PEXELS_API_KEY},
            params={"query": termo, "orientation": "portrait", "per_page": quantidade},
            timeout=10,
        )
        resposta.raise_for_status()
        fotos = resposta.json().get("photos") or []
    except requests.RequestException:
        return {"contexto": termo, "imagens": []}
    candidatos = []
    for foto in fotos:
        src = foto.get("src", {})
        preview_url = src.get("small") or src.get("tiny") or src.get("medium")
        photo_id = foto.get("id")
        if photo_id and preview_url:
            candidatos.append((photo_id, preview_url))

    # Baixa os previews em paralelo - em série (9 fotos x ~300-500ms cada)
    # deixaria a galeria visivelmente lenta pra abrir.
    imagens = []
    with ThreadPoolExecutor(max_workers=min(9, len(candidatos) or 1)) as executor:
        futuros = {
            executor.submit(_baixar_como_data_url, url): photo_id for photo_id, url in candidatos
        }
        resultados = {}
        for futuro in as_completed(futuros):
            photo_id = futuros[futuro]
            resultados[photo_id] = futuro.result()
    for photo_id, _ in candidatos:
        preview = resultados.get(photo_id)
        if preview:
            imagens.append({"id": photo_id, "preview": preview})
    return {"contexto": termo, "imagens": imagens}


def selecionar_imagem_fundo(decisao: dict, imagem_id: int | None = None) -> dict | None:
    """
    Ponto de entrada. decisao: mesmo shape usado em gerar_textos_post
    (titulo/tribunal/mecanismo/tributos/setores/ementa).

    imagem_id: quando o profissional já escolheu uma foto específica numa
    galeria (buscar_imagens_candidatas), busca exatamente essa em vez de
    sortear uma nova - mantém o resto do fluxo idêntico.

    Devolve {"dataUrl": "data:image/...;base64,...", "contexto": termo_usado}
    ou None se não foi possível (sem PEXELS_API_KEY, sem internet, sem
    resultado) - nesse caso o chamador simplesmente não define foto de
    fundo, e a arte segue com o degradê da cor da marca (comportamento
    anterior a esta funcionalidade).
    """
    termo = _contexto_visual(decisao)
    if imagem_id is not None:
        return buscar_imagem_por_id(imagem_id, contexto=termo)
    url_imagem = _buscar_no_pexels(termo)
    if not url_imagem:
        return None
    data_url = _baixar_como_data_url(url_imagem)
    if not data_url:
        return None
    return {"dataUrl": data_url, "contexto": termo}
