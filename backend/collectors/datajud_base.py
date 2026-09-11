"""
Logica compartilhada para consultar a API DataJud do CNJ - usada tanto
pelos Tribunais de Justica (tribunais_justica.py) quanto pelos TRFs
(tribunais_federais.py). Ver docstring de tribunais_justica.py para
contexto completo sobre o DataJud.
"""
import requests
from datetime import datetime, timezone

API_KEY = "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
URL_BASE = "https://api-publica.datajud.cnj.jus.br"

TERMOS_ASSUNTO = [
    "ICMS", "ISS", "IPTU", "Tributário", "Societário", "Falência",
    "Recuperação Judicial", "Execução Fiscal",
]

TAMANHO_RESULTADO = 20


def _montar_query() -> dict:
    return {
        "size": TAMANHO_RESULTADO,
        "query": {
            "bool": {
                "should": [
                    {"match": {"assuntos.nome": termo}} for termo in TERMOS_ASSUNTO
                ],
                "minimum_should_match": 1,
            }
        },
        "sort": [{"dataHoraUltimaAtualizacao": {"order": "desc"}}],
    }


def consultar_tribunal(alias: str, nome_exibicao: str, prefixo_fonte: str) -> list[dict]:
    """
    alias: identificador do tribunal no DataJud (ex: 'tjrs', 'trf4')
    nome_exibicao: nome legivel (ex: 'Rio Grande do Sul', 'TRF4')
    prefixo_fonte: como aparece na coluna 'fonte' (ex: 'TJ', 'TRF')
    """
    resultados = []
    url = f"{URL_BASE}/api_publica_{alias.lower()}/_search"

    try:
        resposta = requests.post(
            url,
            headers={"Authorization": API_KEY, "Content-Type": "application/json"},
            json=_montar_query(),
            timeout=20,
        )

        if resposta.status_code != 200:
            print(f"[AVISO] {alias.upper()}: HTTP {resposta.status_code} - {resposta.text[:200]}")
            return resultados

        dados = resposta.json()
        hits = dados.get("hits", {}).get("hits", [])

        for hit in hits:
            fonte = hit.get("_source", {})
            numero_processo = fonte.get("numeroProcesso", "")
            classe = (fonte.get("classe") or {}).get("nome", "")
            orgao = (fonte.get("orgaoJulgador") or {}).get("nome", "")
            assuntos_lista = [a.get("nome", "") for a in fonte.get("assuntos", [])]
            assuntos_texto = ", ".join(a for a in assuntos_lista if a)
            data_atualizacao = fonte.get("dataHoraUltimaAtualizacao", "")

            titulo = f"{alias.upper()} - {classe}" if classe else f"{alias.upper()} - Processo"
            resumo = f"Órgão: {orgao} | Assuntos: {assuntos_texto}" if (orgao or assuntos_texto) else ""

            resultados.append({
                "fonte": f"{prefixo_fonte} ({nome_exibicao})",
                "titulo": titulo,
                "resumo": resumo,
                "link": f"{url}#{numero_processo}" if numero_processo else url,
                "data_publicacao": data_atualizacao,
                "coletado_em": datetime.now(timezone.utc).isoformat(),
            })

    except requests.exceptions.RequestException as erro:
        print(f"[AVISO] {alias.upper()}: erro de conexão - {erro}")

    return resultados
