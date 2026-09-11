"""
Coletor: CARF - Noticias institucionais

Diferente do carf_julgamentos.py (que le o arquivo de dados abertos com
os acordaos/decisoes), este coletor le a pagina de NOTICIAS do CARF -
comunicados institucionais (sumulas aprovadas, calendario de sessoes,
balancos, etc) que tambem podem conter sinal relevante (ex: aprovacao
de sumula vinculante e uma noticia importante para classificar como
tributario).

Mesmo padrao de site (gov.br/Plone) da PGFN - reaproveita a mesma
logica de extracao via regex.
"""
import re
from datetime import datetime, timezone
import requests
from .base import CABECALHOS_NAVEGADOR

ano_atual = datetime.now().year
URL_NOTICIAS = f"https://www.gov.br/carf/pt-br/assuntos/noticias/{ano_atual}"

PADRAO_LINK = re.compile(
    r'<a[^>]+href="(https://www\.gov\.br/carf/pt-br/assuntos/noticias/\d{4}/[^"]+)"[^>]*>(.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)


def _limpar_html(texto: str) -> str:
    return re.sub(r"<[^>]+>", "", texto).strip()


def coletar() -> list[dict]:
    resultados = []

    try:
        resposta = requests.get(URL_NOTICIAS, headers=CABECALHOS_NAVEGADOR, timeout=20)

        if resposta.status_code != 200:
            print(f"[AVISO] CARF-Notícias: HTTP {resposta.status_code} ao buscar {URL_NOTICIAS}")
            return resultados

        encontrados = PADRAO_LINK.findall(resposta.text)
        vistos_na_pagina = set()

        for link, titulo_bruto in encontrados:
            titulo = _limpar_html(titulo_bruto)
            if not titulo or link in vistos_na_pagina:
                continue
            vistos_na_pagina.add(link)

            resultados.append({
                "fonte": "CARF (notícias)",
                "titulo": titulo,
                "resumo": "",
                "link": link,
                "data_publicacao": "",
                "coletado_em": datetime.now(timezone.utc).isoformat(),
            })

        if resultados:
            print(f"[INFO] CARF-Notícias: {len(resultados)} notícia(s) extraída(s).")
        else:
            print(f"[AVISO] CARF-Notícias: página carregada mas nenhum link extraído - "
                  f"padrão HTML pode ter mudado. URL: {URL_NOTICIAS}")

    except requests.exceptions.RequestException as erro:
        print(f"[AVISO] CARF-Notícias: erro de conexão - {erro}")

    return resultados
