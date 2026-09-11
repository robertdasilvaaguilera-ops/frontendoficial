"""
Coletor: Receita Federal
Fonte: RSS oficial de notícias (portal gov.br, padrão Plone).

IMPORTANTE: esta URL foi localizada via busca, não testada em ambiente
com acesso à internet (o sandbox onde este projeto foi gerado não tem
rede liberada). Rode `python main.py` e, se der [AVISO] de feed vazio,
confirme a URL atual em:
https://www.gov.br/receitafederal/pt-br/assuntos/noticias/ultimas-noticias
(procure o ícone/link de RSS no rodapé da página)
"""
from .base import buscar_rss

URL_RSS = "https://www.gov.br/receitafederal/pt-br/assuntos/noticias/ultimas-noticias/RSS"


def coletar() -> list[dict]:
    return buscar_rss(URL_RSS, fonte="Receita Federal")
