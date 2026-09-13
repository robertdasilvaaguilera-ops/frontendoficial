"""
Coletor: STJ (Superior Tribunal de Justiça)
Fonte: feeds RSS oficiais, confirmados na página de Comunicação do STJ.

Duas fontes úteis:
1. Notícias gerais
2. Informativo de Jurisprudência (mais relevante para oportunidades —
   é onde saem os "temas repetitivos" que geram teses aproveitáveis)
"""
from .base import buscar_rss

URL_NOTICIAS = "https://res.stj.jus.br/hrestp-c-portalp/RSS.xml"
URL_INFORMATIVO = "https://processo.stj.jus.br/jurisprudencia/externo/InformativoFeed"


def coletar() -> list[dict]:
    # Ambas as URLs bloqueiam requisições de fora do Brasil (timeout na RSS,
    # desafio anti-robô da Cloudflare no Informativo) - precisam do proxy
    # configurado em PROXY_BR_URL (ver collectors/base.py).
    resultados = buscar_rss(URL_NOTICIAS, fonte="STJ - Notícias", via_proxy_br=True)
    resultados += buscar_rss(URL_INFORMATIVO, fonte="STJ - Informativo de Jurisprudência", via_proxy_br=True)
    return resultados
