"""
Baixa e processa os arquivos de Estabelecimentos da Receita Federal,
contando quantas empresas ATIVAS existem por CNAE - sem guardar os
dados brutos (que passam de 80GB no total).

Estrategia: baixa uma parte (zip), extrai, conta por CNAE, APAGA os
arquivos brutos, salva o resultado agregado (pequeno, poucos KB) em
JSON. Repete para as proximas partes. Se travar no meio, o progresso
ja salvo nao se perde - so rode de novo.

IMPORTANTE: cada parte (Estabelecimentos0.zip ate Estabelecimentos9.zip)
tem varios GB. Isso vai demorar bastante e consumir banda de internet
real. Recomendo testar com 1 parte primeiro (ver instrucoes no final).
"""
import csv
import io
import json
import os
import zipfile
import requests

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
PASTA_TEMP = os.path.join(PASTA_BASE, "temp_cnpj")
CAMINHO_RESULTADO = os.path.join(PASTA_BASE, "database", "cnae_contagem.json")
CAMINHO_PROGRESSO = os.path.join(PASTA_BASE, "database", "cnae_progresso.json")

os.makedirs(PASTA_TEMP, exist_ok=True)
os.makedirs(os.path.dirname(CAMINHO_RESULTADO), exist_ok=True)

URL_BASE = "https://github.com/jonathands/dados-abertos-receita-cnpj/releases/download/2024.09/Estabelecimentos{indice}.zip"
SITUACAO_ATIVA = "02"

# Indice no CSV (sem cabecalho) dos campos que importam:
IDX_SITUACAO_CADASTRAL = 5
IDX_CNAE_FISCAL_PRINCIPAL = 11

CABECALHOS_NAVEGADOR = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}


def carregar_progresso() -> dict:
    if os.path.exists(CAMINHO_PROGRESSO):
        with open(CAMINHO_PROGRESSO, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"partes_concluidas": []}


def salvar_progresso(progresso: dict):
    with open(CAMINHO_PROGRESSO, "w", encoding="utf-8") as f:
        json.dump(progresso, f, ensure_ascii=False, indent=2)


def carregar_contagem() -> dict:
    if os.path.exists(CAMINHO_RESULTADO):
        with open(CAMINHO_RESULTADO, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def salvar_contagem(contagem: dict):
    with open(CAMINHO_RESULTADO, "w", encoding="utf-8") as f:
        json.dump(contagem, f, ensure_ascii=False, indent=2)


def processar_parte(indice: int, contagem: dict):
    url = URL_BASE.format(indice=indice)
    caminho_zip = os.path.join(PASTA_TEMP, f"Estabelecimentos{indice}.zip")

    print(f"\n[PARTE {indice}] Baixando de {url} ...")
    print("  (isso pode demorar bastante - arquivo de varios GB)")

    with requests.get(url, headers=CABECALHOS_NAVEGADOR, stream=True, timeout=120) as resposta:
        resposta.raise_for_status()
        total_baixado = 0
        with open(caminho_zip, "wb") as f:
            for pedaco in resposta.iter_content(chunk_size=1024 * 1024):  # 1MB por vez
                f.write(pedaco)
                total_baixado += len(pedaco)
                if total_baixado % (100 * 1024 * 1024) < 1024 * 1024:  # a cada ~100MB
                    print(f"  {total_baixado / (1024*1024):.0f} MB baixados...")

    print(f"[PARTE {indice}] Download concluído ({total_baixado / (1024*1024):.0f} MB). Processando...")

    with zipfile.ZipFile(caminho_zip) as zip_arquivo:
        nome_csv = zip_arquivo.namelist()[0]
        with zip_arquivo.open(nome_csv) as arquivo_bruto:
            texto = io.TextIOWrapper(arquivo_bruto, encoding="latin-1", errors="replace")
            leitor = csv.reader(texto, delimiter=";")

            linhas_processadas = 0
            for linha in leitor:
                if len(linha) <= IDX_CNAE_FISCAL_PRINCIPAL:
                    continue
                if linha[IDX_SITUACAO_CADASTRAL] != SITUACAO_ATIVA:
                    continue
                cnae = linha[IDX_CNAE_FISCAL_PRINCIPAL].strip().strip('"')
                if not cnae:
                    continue
                contagem[cnae] = contagem.get(cnae, 0) + 1
                linhas_processadas += 1
                if linhas_processadas % 1_000_000 == 0:
                    print(f"  {linhas_processadas:,} linhas processadas...")

    print(f"[PARTE {indice}] Concluído: {linhas_processadas:,} empresas ativas contadas.")

    os.remove(caminho_zip)
    print(f"[PARTE {indice}] Arquivo temporário removido (não fica ocupando espaço).")


def main():
    progresso = carregar_progresso()
    contagem = carregar_contagem()

    partes_concluidas = set(progresso.get("partes_concluidas", []))

    for indice in range(10):
        if indice in partes_concluidas:
            print(f"[PARTE {indice}] Já processada anteriormente - pulando.")
            continue

        try:
            processar_parte(indice, contagem)
            partes_concluidas.add(indice)
            progresso["partes_concluidas"] = sorted(partes_concluidas)
            salvar_progresso(progresso)
            salvar_contagem(contagem)
            print(f"[PARTE {indice}] Progresso salvo. Pode interromper aqui com segurança se quiser.")
        except Exception as erro:
            print(f"[ERRO] Falha na parte {indice}: {erro}")
            print("O progresso das partes anteriores já está salvo. Rode de novo para tentar continuar.")
            break

    print(f"\nTotal de CNAEs distintos com contagem: {len(contagem)}")
    print(f"Resultado salvo em: {CAMINHO_RESULTADO}")


if __name__ == "__main__":
    main()
