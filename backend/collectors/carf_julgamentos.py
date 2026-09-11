"""
Coletor: CARF - Julgamentos de Processos (RESULTADO das decisoes)

ATUALIZACAO: antes, parava no PRIMEIRO semestre que encontrava (por
isso so vinha 2025_1semestre). Agora busca VARIOS semestres (ultimos
~3 anos) e ACUMULA tudo - historico completo, nao so o mais recente
disponivel.

Sobre atualizacao diaria: o CARF nao publica arquivo diario - publica
por semestre, e o semestre "em andamento" tem sufixo "parcial" e vai
sendo atualizado ao longo do tempo. Como o main.py roda todo dia e
sempre baixa esse arquivo parcial de novo, novas decisoes que entrarem
nele aparecem como "novas" automaticamente (o vistos.json ja cuida de
nao duplicar as que ja vimos) - no e um coletor diario dedicado, mas o
efeito pratico de pegar decisao nova e o mesmo.

URL: https://www.gov.br/carf/pt-br/acesso-a-informacao/dados-abertos/dispe/carf_julgamentos_{ano}_{semestre}semestre{parcial|vazio}.zip
"""
import csv
import io
import zipfile
import requests
from datetime import datetime, timezone

URL_BASE = (
    "https://www.gov.br/carf/pt-br/acesso-a-informacao/dados-abertos/dispe/"
    "carf_julgamentos_{ano}_{semestre}semestre{sufixo}.zip"
)

CABECALHOS_NAVEGADOR = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}

COLUNAS_RESULTADO_CANDIDATAS = [
    "resultado", "decisao", "resultado_julgamento", "situacao_julgamento",
    "provimento", "decisao_recurso",
]
COLUNAS_DATA_CANDIDATAS = [
    "data_sessao", "data_julgamento", "data", "dt_sessao",
]

# Quantos anos para tras tentar buscar (cada ano tem 2 semestres) -
# ajuste este numero se quiser historico ainda mais completo.
ANOS_DE_HISTORICO = 3


def _gerar_periodos() -> list[tuple]:
    """Gera (ano, semestre) do periodo atual ate ANOS_DE_HISTORICO atras."""
    hoje = datetime.now()
    ano_atual = hoje.year
    semestre_atual = 1 if hoje.month <= 6 else 2

    periodos = []
    ano, semestre = ano_atual, semestre_atual
    total_periodos = ANOS_DE_HISTORICO * 2 + 1

    for _ in range(total_periodos):
        periodos.append((ano, semestre))
        semestre -= 1
        if semestre == 0:
            semestre = 2
            ano -= 1

    return periodos


def _achar_coluna(cabecalho: list[str], candidatas: list[str]) -> str | None:
    cabecalho_lower = [c.lower().strip() for c in cabecalho]
    for candidata in candidatas:
        if candidata in cabecalho_lower:
            return cabecalho[cabecalho_lower.index(candidata)]
    return None


def _baixar_periodo(ano: int, semestre: int) -> tuple:
    """Tenta 'parcial' e sem sufixo para um periodo. Devolve (conteudo_zip, url) ou (None, None)."""
    for sufixo in ("parcial", ""):
        url = URL_BASE.format(ano=ano, semestre=semestre, sufixo=sufixo)
        try:
            resposta = requests.get(url, headers=CABECALHOS_NAVEGADOR, timeout=30)
            if resposta.status_code == 200 and resposta.content[:2] == b"PK":
                return resposta.content, url
        except requests.exceptions.RequestException:
            continue
    return None, None


def _processar_zip(conteudo_zip: bytes, url_usada: str) -> list[dict]:
    resultados = []
    try:
        with zipfile.ZipFile(io.BytesIO(conteudo_zip)) as zip_arquivo:
            nomes_csv = [n for n in zip_arquivo.namelist() if n.lower().endswith(".csv")]
            if not nomes_csv:
                return resultados

            with zip_arquivo.open(nomes_csv[0]) as arquivo_csv:
                texto = io.TextIOWrapper(arquivo_csv, encoding="utf-8-sig", errors="replace")
                amostra = texto.read(2048)
                texto.seek(0)
                separador = ";" if amostra.count(";") > amostra.count(",") else ","

                leitor = csv.DictReader(texto, delimiter=separador)
                cabecalho = leitor.fieldnames or []
                cabecalho_lower = {c.lower().strip(): c for c in cabecalho}

                col_tributo = cabecalho_lower.get("tributo")
                col_tema = cabecalho_lower.get("concentracao_tematica")
                col_resultado = _achar_coluna(cabecalho, COLUNAS_RESULTADO_CANDIDATAS)
                col_processo = cabecalho_lower.get("numero_processo")
                col_ementa = cabecalho_lower.get("texto_ementa")
                col_link_pdf = cabecalho_lower.get("link_pdf")
                col_tipo_resultado = cabecalho_lower.get("tipo_resultado")
                coluna_data = _achar_coluna(cabecalho, COLUNAS_DATA_CANDIDATAS)

                if not col_resultado:
                    return resultados

                for linha in leitor:
                    resultado_valor = (linha.get(col_resultado) or "").strip()
                    if not resultado_valor:
                        continue

                    titulo_partes = [
                        linha.get(col_tributo, "") if col_tributo else "",
                        linha.get(col_tema, "") if col_tema else "",
                    ]
                    titulo = " - ".join(p.strip() for p in titulo_partes if p and p.strip())

                    ementa_valor = (linha.get(col_ementa, "") if col_ementa else "").strip()
                    tipo_resultado_valor = (linha.get(col_tipo_resultado, "") if col_tipo_resultado else "").strip()

                    partes_resumo = [
                        f"Resultado: {resultado_valor}",
                        f"Tipo: {tipo_resultado_valor}" if tipo_resultado_valor else "",
                        ementa_valor,
                    ]
                    resumo = " | ".join(p for p in partes_resumo if p)

                    numero_processo_valor = linha.get(col_processo, "") if col_processo else ""
                    link_pdf_valor = (linha.get(col_link_pdf, "") if col_link_pdf else "").strip()
                    link_unico = (
                        link_pdf_valor if link_pdf_valor
                        else (f"{url_usada}#{numero_processo_valor}" if numero_processo_valor else url_usada)
                    )

                    resultados.append({
                        "fonte": "CARF (julgamentos)",
                        "titulo": titulo or "Julgamento CARF",
                        "resumo": resumo,
                        "link": link_unico,
                        "data_publicacao": linha.get(coluna_data, "") if coluna_data else "",
                        "coletado_em": datetime.now(timezone.utc).isoformat(),
                        "resultado_bruto": resultado_valor,
                        "tipo_resultado_bruto": tipo_resultado_valor,
                    })
    except zipfile.BadZipFile:
        pass
    return resultados


def coletar() -> list[dict]:
    todos_resultados = []
    periodos_ok = []
    periodos_falha = []

    for ano, semestre in _gerar_periodos():
        conteudo_zip, url_usada = _baixar_periodo(ano, semestre)
        if conteudo_zip:
            resultados_periodo = _processar_zip(conteudo_zip, url_usada)
            todos_resultados.extend(resultados_periodo)
            periodos_ok.append(f"{ano}/{semestre} ({len(resultados_periodo)} linhas)")
        else:
            periodos_falha.append(f"{ano}/{semestre}")

    print(f"[INFO] CARF-Julgamentos: {len(todos_resultados)} linha(s) total, "
          f"de {len(periodos_ok)} período(s): {', '.join(periodos_ok)}")
    if periodos_falha:
        print(f"[AVISO] CARF-Julgamentos: períodos sem arquivo disponível "
              f"(normal para o futuro/muito antigo): {', '.join(periodos_falha)}")

    return todos_resultados
