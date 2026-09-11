"""
Envia oportunidades para o Notion (banco "Base de conhecimento ATLAS").

So envia itens que ja tem parecer gerado (score >= 80) - o Notion e a
vitrine curada, nao o despejo bruto (isso fica no Excel).

Configuracao necessaria:
    setx NOTION_API_KEY "sua-chave-aqui"
"""
import os
import requests

API_KEY = os.getenv("NOTION_API_KEY")
DATABASE_ID = "394246db-5fae-8084-b7a4-d3ce5ef7ec30"
NOTION_VERSION = "2022-06-28"

URL = "https://api.notion.com/v1/pages"

# Normaliza os varios nomes de "fonte" que os coletores usam para as
# opcoes fixas cadastradas na coluna Select do Notion.
MAPA_FONTE = {
    "Receita Federal": "Receita Federal",
    "PGFN": "PGFN",
    "TRF4": "TRF4",
    "CARF (julgamentos)": "CARF",
    "CARF (estoque)": "CARF",
}


def _normalizar_fonte(fonte_bruta: str) -> str:
    for chave, valor in MAPA_FONTE.items():
        if chave in fonte_bruta:
            return valor
    if "STJ" in fonte_bruta:
        return "STJ"
    if "STF" in fonte_bruta:
        return "STF"
    return fonte_bruta  # deixa como veio, se nao reconhecer


def _primeiro_setor(setores_str: str) -> str | None:
    """Notion Select so aceita 1 valor - pega o primeiro da lista."""
    if not setores_str:
        return None
    primeiro = setores_str.split(",")[0].strip()
    return primeiro or None


def enviar_para_notion(entrada: dict) -> bool:
    if not API_KEY:
        print("[AVISO] NOTION_API_KEY nao configurada - pulando envio ao Notion.")
        return False

    propriedades = {
        "Nome": {
            "title": [{"text": {"content": (entrada.get("titulo") or "Sem título")[:2000]}}]
        },
        "SCORE": {"select": {"name": str(entrada.get("score", 0))}},
        "URL": {"url": entrada.get("link") or None},
        "PARECER": {
            "rich_text": [{"text": {"content": (entrada.get("parecer") or "")[:2000]}}]
        },
        "STATUS PROCESSUAL": {
            "select": {"name": (entrada.get("resultado_bruto") or "Não informado")[:100]}
        },
    }

    fonte_normalizada = _normalizar_fonte(entrada.get("fonte", ""))
    if fonte_normalizada:
        propriedades["FONTE"] = {"select": {"name": fonte_normalizada}}

    area = entrada.get("area")
    if area:
        propriedades["ÁREA"] = {"multi_select": [{"name": area}]}

    setores_todos = [s.strip() for s in (entrada.get("setores") or "").split(",") if s.strip()]
    if setores_todos:
        propriedades["SETOR EMPRESARIAL"] = {"multi_select": [{"name": s} for s in setores_todos]}

    corpo = {
        "parent": {"database_id": DATABASE_ID},
        "properties": propriedades,
    }

    resposta = requests.post(
        URL,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        json=corpo,
        timeout=30,
    )

    if resposta.status_code != 200:
        print(f"[ERRO] Notion respondeu {resposta.status_code}: {resposta.text[:500]}")
        return False

    return True
