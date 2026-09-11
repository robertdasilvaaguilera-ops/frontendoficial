"""
Funções compartilhadas por todos os coletores.
Cada coletor devolve uma lista de dicionários no formato:

{
    "fonte": "Receita Federal",
    "titulo": "...",
    "resumo": "...",
    "link": "https://...",
    "data_publicacao": "2026-07-01",
    "coletado_em": "2026-07-05T10:00:00",
}
"""
import feedparser
from datetime import datetime, timezone

# Muitos servidores do governo bloqueiam requisições que não se identificam
# como navegador (User-Agent padrão do Python é frequentemente recusado).
CABECALHOS_NAVEGADOR = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}


def buscar_rss(url: str, fonte: str, limite: int = 30) -> list[dict]:
    """
    Busca um feed RSS/Atom e devolve entradas normalizadas.
    Se o feed estiver indisponível, quebrado ou bloqueado, devolve
    lista vazia e imprime aviso — nunca derruba o programa inteiro
    por causa de UMA fonte fora do ar.
    """
    resultados = []
    try:
        feed = feedparser.parse(url, request_headers=CABECALHOS_NAVEGADOR)

        if feed.bozo and not feed.entries:
            status = getattr(feed, "status", "desconhecido")
            motivo = getattr(feed, "bozo_exception", "sem detalhe")
            print(f"[AVISO] '{fonte}': feed não retornou entradas válidas. "
                  f"HTTP status: {status} | Motivo: {motivo} | URL: {url}")
            return resultados

        for entrada in feed.entries[:limite]:
            resultados.append({
                "fonte": fonte,
                "titulo": entrada.get("title", "").strip(),
                "resumo": entrada.get("summary", "").strip(),
                "link": entrada.get("link", ""),
                "data_publicacao": entrada.get("published", entrada.get("updated", "")),
                "coletado_em": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as erro:
        print(f"[ERRO] Falha ao coletar '{fonte}': {erro}")

    return resultados
