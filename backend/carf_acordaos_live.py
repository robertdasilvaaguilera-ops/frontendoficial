"""
Coletor: CARF - Acordaos (busca ao vivo via Projeto VER/Solr)

CORRECAO: a versao anterior buscava por termo (ICMS, PIS, etc) ordenado
por "mais recente" - isso preenchia as poucas vagas so com decisoes
recentissimas, nunca alcancando anos anteriores (mesmo termo comum
como "ICMS" sozinho ja tem resultado recente suficiente para lotar o
limite de linhas). Agora busca POR ANO (2023 ate o ano atual), com uma
unica query combinando todos os termos por ano - garante cobertura
historica real, nao so os ultimos dias.

Rodar isso todo dia (via main.py + Agendador de Tarefas) cobre tanto o
historico (2023+) quanto decisoes novas - o ano atual e sempre
reconsultado, entao decisao nova aparece sozinha; o vistos.json evita
duplicar o que ja foi visto.
"""
import requests
from datetime import datetime, timezone
from .base import CABECALHOS_NAVEGADOR

URL_BASE = "https://acordaos.economia.gov.br/solr/acordaos2/browse"

TERMOS_BUSCA = ["ICMS", "PIS", "COFINS", "IRPJ", "CSLL", "Simples Nacional", "compensação tributária"]
QUERY_COMBINADA = " OR ".join(f'"{t}"' if " " in t else t for t in TERMOS_BUSCA)

ANO_INICIAL = 2023
LINHAS_POR_ANO = 100


def _montar_link_pdf(numero_processo: str, conteudo_id: str) -> str:
    if not numero_processo or not conteudo_id:
        return ""
    processo_limpo = "".join(c for c in numero_processo if c.isdigit())
    return f"http://acordaos.economia.gov.br/acordaos2/pdfs/processados/{processo_limpo}_{conteudo_id}.pdf"


def _buscar_ano(ano: int) -> list[dict]:
    resultados = []
    filtro_data = f"dt_publicacao_tdt:[{ano}-01-01T00:00:00Z TO {ano}-12-31T23:59:59Z]"

    try:
        resposta = requests.get(
            URL_BASE,
            headers=CABECALHOS_NAVEGADOR,
            params={
                "q": QUERY_COMBINADA,
                "fq": filtro_data,
                "wt": "json",
                "rows": LINHAS_POR_ANO,
                "sort": "dt_publicacao_tdt desc",
            },
            timeout=30,
        )

        if resposta.status_code != 200:
            print(f"[AVISO] CARF-Acórdãos: HTTP {resposta.status_code} para o ano {ano}")
            return resultados

        dados = resposta.json()
        docs = dados.get("response", {}).get("docs", [])
        total_disponivel = dados.get("response", {}).get("numFound", 0)

        for doc in docs:
            numero_processo = doc.get("numero_processo_s", "")
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

        print(f"[INFO] CARF-Acórdãos {ano}: {len(resultados)} coletado(s) de {total_disponivel:,} disponíveis "
              f"no ano (limitado a {LINHAS_POR_ANO}/ano).")

    except (requests.exceptions.RequestException, ValueError) as erro:
        print(f"[AVISO] CARF-Acórdãos: falha na busca do ano {ano} - {erro}")

    return resultados


def coletar() -> list[dict]:
    resultados = []
    vistos_processo = set()
    ano_atual = datetime.now().year

    for ano in range(ANO_INICIAL, ano_atual + 1):
        resultados_ano = _buscar_ano(ano)
        for item in resultados_ano:
            chave = item["link"]
            if chave in vistos_processo:
                continue
            vistos_processo.add(chave)
            resultados.append(item)

    print(f"[INFO] CARF-Acórdãos (VER): {len(resultados)} acórdão(s) único(s) coletado(s) "
          f"de {ANO_INICIAL} a {ano_atual}.")
    return resultados
