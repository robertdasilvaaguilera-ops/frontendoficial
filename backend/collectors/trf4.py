"""
Coletor: TRF4 (Tribunal Regional Federal da 4a Regiao - RS/SC/PR)

Especialmente relevante para a ATLAS: e o tribunal federal que cobre
exatamente a regiao de atuacao definida na Etapa 1 (Sul do Brasil).

Fonte: RSS oficial de noticias do TRF4.
"""
from .base import buscar_rss

URL_RSS = "https://www.trf4.jus.br/trf4/noticias.xml"


def coletar() -> list[dict]:
    return buscar_rss(URL_RSS, fonte="TRF4")
