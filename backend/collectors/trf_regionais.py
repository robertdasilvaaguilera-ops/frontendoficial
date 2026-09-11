"""
Coletor: TRFs (Tribunais Regionais Federais) - todas as regioes

O TRF4 (RS/SC/PR) ja tem coletor proprio e testado (trf4.py).

Este coletor cobre os outros 5 TRFs (1, 2, 3, 5 e 6). Cada um usa uma
plataforma de site diferente, entao tenta varios formatos de RSS
conhecidos, na ordem mais provavel primeiro.

CORRECAO IMPORTANTE: a versao anterior deixava o feedparser buscar a URL
diretamente, sem timeout - se um site nao respondesse, o programa
travava indefinidamente. Agora cada tentativa usa requests com timeout
de 10 segundos, entao no PIOR caso (todas as URLs de todos os tribunais
falhando) o coletor termina em no maximo ~5 minutos (6 tribunais x 3
URLs x 10s), nunca trava para sempre.
"""
import feedparser
import requests
from .base import CABECALHOS_NAVEGADOR, buscar_rss

TIMEOUT_SEGUNDOS = 10

TRIBUNAIS = [
    ("TRF1", [
        "https://www.trf1.jus.br/trf1/noticias.xml",
        "https://www.trf1.jus.br/trf1/noticias/rss.xml",
        "https://www.trf1.jus.br/rss/noticias",
    ]),
    ("TRF2", [
        "https://www.trf2.jus.br/trf2/noticias.xml",
        "https://www.trf2.jus.br/rss/noticias",
        "https://www.trf2.jus.br/noticias/rss.xml",
    ]),
    ("TRF3", [
        "https://web.trf3.jus.br/noticias.xml",
        "https://www.trf3.jus.br/noticias.xml",
        "https://web.trf3.jus.br/rss/noticias",
    ]),
    ("TRF5", [
        "https://www.trf5.jus.br/index.php/noticias?format=feed&type=rss",
        "https://www.trf5.jus.br/?format=feed&type=rss",
        "https://www.trf5.jus.br/rss/noticias",
    ]),
    ("TRF6", [
        "https://portal.trf6.jus.br/noticias/feed/",
        "https://portal.trf6.jus.br/feed/",
        "https://portal.trf6.jus.br/rss/noticias",
    ]),
]


def _tentar_url(url: str) -> tuple[bool, str]:
    """Busca a URL com timeout curto. Devolve (sucesso, diagnostico)."""
    try:
        resposta = requests.get(url, headers=CABECALHOS_NAVEGADOR, timeout=TIMEOUT_SEGUNDOS)
        feed = feedparser.parse(resposta.content)
        diagnostico = f"{url} -> HTTP {resposta.status_code}, {len(feed.entries)} entradas"
        return (len(feed.entries) > 0, diagnostico)
    except requests.exceptions.Timeout:
        return (False, f"{url} -> TIMEOUT (sem resposta em {TIMEOUT_SEGUNDOS}s)")
    except requests.exceptions.RequestException as erro:
        return (False, f"{url} -> erro de conexão: {erro}")


def coletar() -> list[dict]:
    todos_resultados = []

    for nome_tribunal, urls_candidatas in TRIBUNAIS:
        print(f"  Verificando {nome_tribunal}...")
        encontrado = False
        diagnostico = []

        for url in urls_candidatas:
            sucesso, msg = _tentar_url(url)
            diagnostico.append(msg)

            if sucesso:
                resultado = buscar_rss(url, fonte=nome_tribunal)
                todos_resultados.extend(resultado)
                encontrado = True
                break

        if not encontrado:
            print(
                f"[AVISO] {nome_tribunal}: nenhuma URL candidata funcionou. Diagnostico:\n  "
                + "\n  ".join(diagnostico)
            )

    return todos_resultados