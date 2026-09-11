"""
Atualiza a tabela 'setores' (SQLite) com contagens REAIS de empresas,
vindas do cnae_contagem.json (gerado por baixar_cnpj_agregado.py) - em
vez das estimativas anteriores.

Mapeamento setor -> codigo(s) CNAE (subclasse, 7 digitos, sem
pontuacao - formato usado pela Receita Federal). Baseado em
conhecimento das classes CNAE 2.0 mais representativas de cada setor -
nao e exaustivo (um setor real pode ter atividade em varios CNAEs
secundarios), mas cobre a atividade PRINCIPAL de forma solida.

IMPORTANTE: "Cooperativas" nao mapeia bem para CNAE (e definido por
NATUREZA JURIDICA, nao CNAE, no cadastro da Receita) - fica marcado
como nao atualizavel com este metodo, mantém a estimativa anterior.
"""
import json
import os
import sqlite3

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
CAMINHO_JSON = os.path.join(PASTA_BASE, "database", "cnae_contagem.json")
CAMINHO_DB = os.path.join(PASTA_BASE, "database", "atlas.db")

# setor -> lista de codigos CNAE subclasse (7 digitos, sem pontuacao)
MAPEAMENTO_CNAE = {
    "Supermercados": ["4711302"],
    "Atacado": ["4691500", "4692300", "4693100"],
    "Varejo em geral": ["4712100", "4713002", "4713004"],
    "Revenda de veículos": ["4511101", "4511102", "4511103"],
    "Indústria de alimentos": ["1091101", "1091102", "1092900", "1093701", "1094500"],
    "Indústria metalúrgica": ["2411300", "2412100", "2421100", "2422901"],
    "Clínicas médicas": ["8630501", "8630502", "8630503", "8630599"],
    "Clínicas odontológicas": ["8630504"],
    "Hospitais": ["8610101", "8610102"],
    "Transportadoras": ["4930201", "4930202", "4930203"],
    "Agronegócio": ["0111301", "0111302", "0113000", "0151201", "0151202"],
    "Construção civil": ["4120400", "4211101", "4213800"],
    "Incorporação imobiliária": ["4110700"],
    "Escritórios de serviços": ["8211300", "6920601", "6911701"],
    "Software / TI": ["6201501", "6201502", "6202300"],
    "Distribuidoras": ["4635401", "4637107", "4649408"],
    "Farmácias": ["4771701", "4771702", "4771703"],
    "Postos de combustíveis": ["4731800"],
    "Autopeças": ["4530701", "4530703", "4530704"],
    "Cooperativas": None,  # nao mapeavel por CNAE - mantem estimativa anterior
}


def main():
    if not os.path.exists(CAMINHO_JSON):
        print(f"[ERRO] {CAMINHO_JSON} não encontrado - rode baixar_cnpj_agregado.py primeiro.")
        return

    with open(CAMINHO_JSON, "r", encoding="utf-8") as f:
        contagem_cnae = json.load(f)

    conexao = sqlite3.connect(CAMINHO_DB)
    cursor = conexao.cursor()

    print(f"{'Setor':<30} {'Estimativa anterior':>20} {'Real (CNPJ/RF)':>18}")
    print("-" * 70)

    for setor_nome, codigos in MAPEAMENTO_CNAE.items():
        cursor.execute("SELECT empresas_brasil FROM setores WHERE setor = ?", (setor_nome,))
        linha = cursor.fetchone()
        estimativa_anterior = linha[0] if linha else "?"

        if codigos is None:
            print(f"{setor_nome:<30} {estimativa_anterior:>20} {'(não mapeável)':>18}")
            continue

        total_real = sum(contagem_cnae.get(codigo, 0) for codigo in codigos)

        if total_real == 0:
            print(f"{setor_nome:<30} {estimativa_anterior:>20} {'0 (verificar código)':>18}")
            continue

        cursor.execute(
            "UPDATE setores SET empresas_brasil = ? WHERE setor = ?",
            (total_real, setor_nome)
        )
        print(f"{setor_nome:<30} {estimativa_anterior:>20,} {total_real:>18,}")

    conexao.commit()
    conexao.close()
    print("\nTabela 'setores' atualizada com dados reais da Receita Federal.")


if __name__ == "__main__":
    main()
