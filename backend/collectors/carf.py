"""
Coletor: CARF (Conselho Administrativo de Recursos Fiscais)

ATUALIZACAO (confirmada pelo usuario): o CARF migrou de site
(carf.economia.gov.br -> www.gov.br/carf) E mudou o formato do arquivo
de MENSAL para SEMESTRAL. Exemplo real confirmado:

  https://www.gov.br/carf/pt-br/acesso-a-informacao/dados-abertos/dispe/carf_estoque_2026_1semestreparcial.zip

Padrao identificado: carf_estoque_{ano}_{semestre}semestre{sufixo}.zip
  - semestre: 1 (jan-jun) ou 2 (jul-dez)
  - sufixo: "parcial" quando o semestre ainda esta em andamento/atualizacao,
    provavelmente vazio ("") quando o semestre ja fechou - isso NAO foi
    confirmado ainda, e uma hipotese razoavel dado o nome do arquivo atual.

Este coletor tenta varias combinacoes (semestre atual e anterior, com e
sem "parcial") ate encontrar uma que baixe com sucesso.
"""
import csv
import io
import zipfile
import requests
from datetime import datetime, timezone

URL_BASE = (
    "https://www.gov.br/carf/pt-br/acesso-a-informacao/dados-abertos/dispe/"
    "carf_estoque_{ano}_{semestre}semestre{sufixo}.zip"
)

CABECALHOS_NAVEGADOR = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}

COLUNAS_TITULO_CANDIDATAS = [
    "assunto", "materia", "descricao", "objeto", "ementa", "tipo_recurso",
    "concentracao_tematica",
]
COLUNAS_DATA_CANDIDATAS = [
    "data_sessao", "data_julgamento", "data", "dt_sessao",
    "data_entrada_carf", "data_protocolo",
]


def _gerar_candidatos() -> list[str]:
    """Gera combinacoes plausiveis de URL, da mais provavel a mais antiga."""
    hoje = datetime.now()
    ano = hoje.year
    semestre_atual = 1 if hoje.month <= 6 else 2

    combinacoes = []
    periodos = [
        (ano, semestre_atual),
        (ano, semestre_atual - 1) if semestre_atual == 2 else (ano - 1, 2),
        (ano - 1, 2),
        (ano - 1, 1),
    ]
    for ano_p, sem_p in periodos:
        for sufixo in ("parcial", ""):
            combinacoes.append(URL_BASE.format(ano=ano_p, semestre=sem_p, sufixo=sufixo))

    return combinacoes


def _achar_coluna(cabecalho: list[str], candidatas: list[str]) -> str | None:
    cabecalho_lower = [c.lower().strip() for c in cabecalho]
    for candidata in candidatas:
        if candidata in cabecalho_lower:
            return cabecalho[cabecalho_lower.index(candidata)]
    return None


def coletar() -> list[dict]:
    resultados = []
    conteudo_zip = None
    url_usada = None
    diagnostico = []

    for url in _gerar_candidatos():
        try:
            resposta = requests.get(url, headers=CABECALHOS_NAVEGADOR, timeout=20)
            diagnostico.append(f"{url} -> HTTP {resposta.status_code}, "
                                f"{len(resposta.content)} bytes, "
                                f"content-type: {resposta.headers.get('Content-Type', '?')}")
            if resposta.status_code == 200 and resposta.content[:2] == b"PK":
                conteudo_zip = resposta.content
                url_usada = url
                break
        except requests.exceptions.RequestException as erro:
            diagnostico.append(f"{url} -> erro de conexão: {erro}")
            continue

    if not conteudo_zip:
        print(
            "[AVISO] CARF: nenhuma das combinações de URL funcionou. Diagnóstico:\n  "
            + "\n  ".join(diagnostico) +
            "\n  Confirme manualmente em "
            "https://www.gov.br/carf/pt-br/acesso-a-informacao/dados-abertos "
            "e me envie o nome exato do arquivo mais recente."
        )
        return resultados

    try:
        with zipfile.ZipFile(io.BytesIO(conteudo_zip)) as zip_arquivo:
            nomes_csv = [n for n in zip_arquivo.namelist() if n.lower().endswith(".csv")]
            if not nomes_csv:
                print(f"[AVISO] CARF: ZIP baixado de {url_usada}, mas sem CSV dentro.")
                return resultados

            with zip_arquivo.open(nomes_csv[0]) as arquivo_csv:
                texto = io.TextIOWrapper(arquivo_csv, encoding="utf-8-sig", errors="replace")
                amostra = texto.read(2048)
                texto.seek(0)
                separador = ";" if amostra.count(";") > amostra.count(",") else ","

                leitor = csv.DictReader(texto, delimiter=separador)
                cabecalho = leitor.fieldnames or []
                cabecalho_lower = {c.lower().strip(): c for c in cabecalho}

                # Colunas reais confirmadas no arquivo do CARF (2026):
                # tributo, concentracao_tematica, questionamento1/2 dão o
                # contexto substantivo; numero_processo e data completam.
                col_tributo = cabecalho_lower.get("tributo")
                col_tema = cabecalho_lower.get("concentracao_tematica")
                col_q1 = cabecalho_lower.get("questionamento1")
                col_q2 = cabecalho_lower.get("questionamento2")
                col_contribuinte = cabecalho_lower.get("tipo_contribuinte")
                col_processo = cabecalho_lower.get("numero_processo")
                coluna_data = _achar_coluna(cabecalho, COLUNAS_DATA_CANDIDATAS)

                if not (col_tributo or col_tema or col_q1):
                    print(
                        f"[AVISO] CARF: baixei {url_usada}, mas nao reconheci as "
                        f"colunas esperadas. Colunas encontradas: {cabecalho}\n"
                        "  Me envie essa lista que eu ajusto o mapeamento."
                    )
                    return resultados

                for linha in leitor:
                    partes_titulo = [
                        linha.get(col_tributo, "") if col_tributo else "",
                        linha.get(col_tema, "") if col_tema else "",
                    ]
                    partes_resumo = [
                        linha.get(col_q1, "") if col_q1 else "",
                        linha.get(col_q2, "") if col_q2 else "",
                        f"Contribuinte: {linha.get(col_contribuinte, '')}" if col_contribuinte else "",
                        f"Processo: {linha.get(col_processo, '')}" if col_processo else "",
                    ]
                    titulo = " - ".join(p.strip() for p in partes_titulo if p and p.strip())
                    resumo = " | ".join(p.strip() for p in partes_resumo if p and p.strip())

                    if not titulo and not resumo:
                        continue

                    numero_processo_valor = linha.get(col_processo, "") if col_processo else ""
                    link_unico = f"{url_usada}#{numero_processo_valor}" if numero_processo_valor else url_usada

                    resultados.append({
                        "fonte": "CARF (estoque)",
                        "titulo": titulo or "Processo CARF",
                        "resumo": resumo,
                        "link": link_unico,
                        "data_publicacao": linha.get(coluna_data, "") if coluna_data else "",
                        "coletado_em": datetime.now(timezone.utc).isoformat(),
                    })

        print(f"[INFO] CARF: {len(resultados)} linha(s) coletada(s) de {url_usada}.")

    except zipfile.BadZipFile:
        print(f"[ERRO] CARF: arquivo baixado de {url_usada} nao e um ZIP valido.")
    except Exception as erro:
        print(f"[ERRO] CARF: falha ao processar o arquivo - {erro}")

    return resultados
