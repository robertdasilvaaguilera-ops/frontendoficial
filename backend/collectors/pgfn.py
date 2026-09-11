"""
Coletor: PGFN (Procuradoria-Geral da Fazenda Nacional)

MUDANCA DE ABORDAGEM: depois de 3 tentativas de RSS (todas com 404),
confirmamos que a PGFN nao publica RSS para as noticias - mas a pagina
de listagem anual (ex: /noticias/2026) existe e tem conteudo real.

Este coletor le o HTML dessa pagina diretamente e extrai titulos/links
via expressao regular (nao usa BeautifulSoup para nao adicionar mais
uma dependencia - se a extracao vier fragil/incompleta, e o primeiro
lugar a ajustar).
"""
import re
from datetime import datetime, timezone
import requests
from .base import CABECALHOS_NAVEGADOR

ano_atual = datetime.now().year
URL_NOTICIAS = f"https://www.gov.br/pgfn/pt-br/assuntos/noticias/{ano_atual}"

# Captura links que apontam para noticias individuais da PGFN, com o
# texto do link (titulo) - padrao tipico de listagem Plone.
PADRAO_LINK = re.compile(
    r'<a[^>]+href="(https://www\.gov\.br/pgfn/pt-br/assuntos/noticias/\d{4}/[^"]+)"[^>]*>(.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)


def _limpar_html(texto: str) -> str:
    """Remove tags HTML residuais que sobrarem dentro do texto do link."""
    return re.sub(r"<[^>]+>", "", texto).strip()


def coletar() -> list[dict]:
    resultados = []

    try:
        resposta = requests.get(URL_NOTICIAS, headers=CABECALHOS_NAVEGADOR, timeout=20)

        if resposta.status_code != 200:
            print(f"[AVISO] PGFN: HTTP {resposta.status_code} ao buscar {URL_NOTICIAS}")
            return resultados

        encontrados = PADRAO_LINK.findall(resposta.text)

        vistos_na_pagina = set()
        for link, titulo_bruto in encontrados:
            titulo = _limpar_html(titulo_bruto)
            if not titulo or link in vistos_na_pagina:
                continue
            vistos_na_pagina.add(link)

            resultados.append({
                "fonte": "PGFN",
                "titulo": titulo,
                "resumo": "",
                "link": link,
                "data_publicacao": "",
                "coletado_em": datetime.now(timezone.utc).isoformat(),
            })

        if not resultados:
            print(
                f"[AVISO] PGFN: página carregada (HTTP 200) mas nenhum link de "
                f"notícia foi extraído — o padrão HTML pode ser diferente do "
                f"esperado. URL: {URL_NOTICIAS}"
            )
        else:
            print(f"[INFO] PGFN: {len(resultados)} notícia(s) extraída(s) da página.")

    except requests.exceptions.RequestException as erro:
        print(f"[AVISO] PGFN: erro de conexão - {erro}")

    return resultados
