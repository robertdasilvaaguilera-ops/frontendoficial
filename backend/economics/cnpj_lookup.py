"""
Consulta de CNPJ individual via API publica gratuita (BrasilAPI), que
espelha dados da Receita Federal - sem precisar baixar/guardar nada
localmente.

Uso: dado o CNPJ de uma empresa real (cliente do escritorio, por
exemplo), retorna razao social, CNAE, regime tributario (Simples
Nacional ou nao) e faturamento presumido pelo porte - dados suficientes
para alimentar o simulador_regime.py com numeros reais em vez de
genericos.

IMPORTANTE: isso resolve consulta INDIVIDUAL (uma empresa por vez).
NAO serve para listar em massa "todas as empresas de um CNAE" - isso
exigiria milhares/milhoes de chamadas e tomaria rate limit
rapidamente. Para volume, a unica forma pratica continua sendo o
download em lote que ja fizemos (dados agregados).
"""
import requests

URL_BASE = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"

CABECALHOS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}


def _limpar_cnpj(cnpj: str) -> str:
    return "".join(c for c in cnpj if c.isdigit())


def consultar_cnpj(cnpj: str) -> dict:
    """
    Retorna um dict com os dados da empresa, ou {"erro": "..."} se
    nao encontrar/falhar. Nunca lanca excecao.
    """
    cnpj_limpo = _limpar_cnpj(cnpj)

    if len(cnpj_limpo) != 14:
        return {"erro": f"CNPJ inválido: '{cnpj}' (precisa ter 14 dígitos)"}

    try:
        resposta = requests.get(URL_BASE.format(cnpj=cnpj_limpo), headers=CABECALHOS, timeout=15)

        if resposta.status_code == 404:
            return {"erro": "CNPJ não encontrado na base da Receita Federal"}
        if resposta.status_code != 200:
            return {"erro": f"API respondeu HTTP {resposta.status_code}"}

        dados = resposta.json()

        opcao_simples = dados.get("opcao_pelo_simples", False)
        opcao_mei = dados.get("opcao_pelo_mei", False)

        if opcao_mei:
            regime_provavel = "MEI"
        elif opcao_simples:
            regime_provavel = "Simples Nacional"
        else:
            # sem opcao pelo Simples - provavelmente Presumido ou Real,
            # a API nao distingue isso diretamente (fica marcado para
            # confirmacao manual)
            regime_provavel = "Lucro Presumido ou Lucro Real (confirmar)"

        return {
            "cnpj": cnpj_limpo,
            "razao_social": dados.get("razao_social", ""),
            "nome_fantasia": dados.get("nome_fantasia", ""),
            "situacao_cadastral": dados.get("descricao_situacao_cadastral", ""),
            "cnae_principal": dados.get("cnae_fiscal", ""),
            "cnae_descricao": dados.get("cnae_fiscal_descricao", ""),
            "uf": dados.get("uf", ""),
            "municipio": dados.get("municipio", ""),
            "porte": dados.get("porte", ""),
            "capital_social": dados.get("capital_social", 0),
            "opcao_pelo_simples": opcao_simples,
            "opcao_pelo_mei": opcao_mei,
            "regime_provavel": regime_provavel,
            "data_inicio_atividade": dados.get("data_inicio_atividade", ""),
        }

    except (requests.exceptions.RequestException, ValueError) as erro:
        return {"erro": f"Falha na consulta: {erro}"}


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        resultado = consultar_cnpj(sys.argv[1])
        for chave, valor in resultado.items():
            print(f"{chave}: {valor}")
    else:
        print("Uso: python cnpj_lookup.py <CNPJ>")
