"""
Coletor: CARF - Acordaos (busca ao vivo via Projeto VER/Solr)

SUBSTITUI a limitacao do carf_julgamentos.py (que so tinha 1 semestre
disponivel no arquivo estatico). Esta fonte e um motor de busca Solr
com 580 MIL acordaos, historico completo, atualizado ate o presente -
descoberto em pesquisa em 19/07/2026.

Endpoint: https://acordaos.economia.gov.br/solr/acordaos2/browse
Parametro q= faz busca textual na ementa/decisao; wt=json para saida
maquina; sort= para ordenar por data de publicacao (mais recentes primeiro).

STATUS: confirmado via busca (o retorno real da pesquisa mostrou o
formato JSON e os nomes de campo reais). Projeto e descrito pelo
proprio CARF como "piloto" - pode mudar de formato sem aviso, mas e
hoje a melhor fonte disponivel.
"""
import requests
from datetime import datetime, timezone
from .base import CABECALHOS_NAVEGADOR

URL_BASE = "https://acordaos.economia.gov.br/solr/acordaos2/browse"

TERMOS_BUSCA = ["ICMS", "PIS", "COFINS", "IRPJ", "CSLL", "Simples Nacional", "compensação tributária"]
LINHAS_POR_TERMO = 30


def _montar_link_pdf(numero_processo: str, conteudo_id: str) -> str:
    if not numero_processo or not conteudo_id:
        return ""
    processo_limpo = "".join(c for c in numero_processo if c.isdigit())
    return f"http://acordaos.economia.gov.br/acordaos2/pdfs/processados/{processo_limpo}_{conteudo_id}.pdf"


def coletar() -> list[dict]:
    resultados = []
    vistos_processo = set()

    for termo in TERMOS_BUSCA:
        try:
            resposta = requests.get(
                URL_BASE,
                headers=CABECALHOS_NAVEGADOR,
                params={
                    "q": termo,
                    "wt": "json",
                    "rows": LINHAS_POR_TERMO,
                    "sort": "dt_publicacao_tdt desc",
                },
                timeout=30,
            )

            if resposta.status_code != 200:
                print(f"[AVISO] CARF-Acórdãos: HTTP {resposta.status_code} para termo '{termo}'")
                continue

            dados = resposta.json()
            docs = dados.get("response", {}).get("docs", [])

            for doc in docs:
                numero_processo = doc.get("numero_processo_s", "")
                if numero_processo in vistos_processo:
                    continue
                vistos_processo.add(numero_processo)

                ementa = doc.get("ementa_s", "") or ""
                materia = doc.get("materia_s", "") or ""
                turma = doc.get("turma_s", "") or ""
                decisao_texto = doc.get("decisao_txt", "") or ""
                if isinstance(decisao_texto, list):
                    decisao_texto = " ".join(decisao_texto)
                relator = doc.get("nome_relator_s", "") or ""
                data_publicacao = doc.get("dt_publicacao_tdt", "") or ""
                conteudo_id = doc.get("conteudo_id_s", "") or str(doc.get("id", ""))

                link_pdf = _montar_link_pdf(numero_processo, conteudo_id)

                resultados.append({
                    "fonte": "CARF (acórdãos - VER)",
                    "titulo": f"{materia or turma} - Processo {numero_processo}",
                    "resumo": f"{ementa[:1200]} | Decisão: {decisao_texto[:300]} | Relator: {relator}",
                    "link": link_pdf or URL_BASE,
                    "data_publicacao": data_publicacao,
                    "coletado_em": datetime.now(timezone.utc).isoformat(),
                })

        except (requests.exceptions.RequestException, ValueError) as erro:
            print(f"[AVISO] CARF-Acórdãos: falha na busca por '{termo}' - {erro}")
            continue

    print(f"[INFO] CARF-Acórdãos (VER): {len(resultados)} acórdão(s) único(s) coletado(s).")
    return resultados
