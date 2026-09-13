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
import os
import feedparser
import requests
from datetime import datetime, timezone

# Muitos servidores do governo bloqueiam requisições que não se identificam
# como navegador (User-Agent padrão do Python é frequentemente recusado).
CABECALHOS_NAVEGADOR = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}

# Algumas fontes (STJ, PJe/DJEN) bloqueiam por geolocalização de quem faz a
# requisição - o servidor de produção roda fora do Brasil. Configurando a
# variável de ambiente PROXY_BR_URL (formato: http://usuario:senha@host:porta,
# de um provedor de proxy com IP brasileiro) essas fontes voltam a funcionar
# sem precisar mudar mais nada no código.
PROXY_BR_URL = os.environ.get("PROXY_BR_URL", "").strip()
PROXIES_BR = {"http": PROXY_BR_URL, "https": PROXY_BR_URL} if PROXY_BR_URL else None

_avisos_proxy_ja_mostrados = set()


def avisar_proxy_ausente_uma_vez(fonte: str) -> None:
    """Mostra, no máximo uma vez por fonte por execução, que PROXY_BR_URL
    falta ser configurada para essa fonte funcionar."""
    if fonte not in _avisos_proxy_ja_mostrados:
        _avisos_proxy_ja_mostrados.add(fonte)
        print(f"[AVISO] '{fonte}': bloqueia requisições de fora do Brasil e a variável "
              f"PROXY_BR_URL não está configurada - tentando direto mesmo assim (deve falhar).")


def buscar_rss(url: str, fonte: str, limite: int = 30, via_proxy_br: bool = False) -> list[dict]:
    """
    Busca um feed RSS/Atom e devolve entradas normalizadas.
    Se o feed estiver indisponível, quebrado ou bloqueado, devolve
    lista vazia e imprime aviso — nunca derruba o programa inteiro
    por causa de UMA fonte fora do ar.

    via_proxy_br: quando True, a fonte é conhecida por bloquear requisições
    de fora do Brasil - busca através do proxy definido em PROXY_BR_URL
    (se configurado) em vez de direto.
    """
    resultados = []
    try:
        if via_proxy_br and PROXIES_BR:
            resposta = requests.get(url, headers=CABECALHOS_NAVEGADOR, proxies=PROXIES_BR, timeout=20)
            feed = feedparser.parse(resposta.content)
        else:
            if via_proxy_br:
                avisar_proxy_ausente_uma_vez(fonte)
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
