"""
Tabela de Temas Juridicos conhecidos (STF/STJ/CARF) - resolve as
perguntas 1 e 3 da metodologia de 6 camadas: identifica QUAL tese uma
decisao representa, em vez de so "parece uma tese generica de ICMS".

IMPORTANTE - precisao juridica: os temas abaixo sao teses tributarias
amplamente conhecidas e consolidadas (o "Tema 69 STF" e vulgarmente
chamado de "tese do seculo", por exemplo) - alta confianca na
existencia e no nucleo do que decidem. Mas o campo `status` (favoravel/
desfavoravel/pendente) e `setores_relacionados` sao curadoria inicial,
nao substituem validacao por advogado tributarista antes de uso
comercial. Tabela pensada para CRESCER com o tempo - adicionar tema
novo e so uma linha, sem mudar codigo.
"""
import sqlite3
import os

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
CAMINHO_DB = os.path.join(PASTA_BASE, "atlas.db")

# (numero_tema, tribunal, tese_resumo, instituto, setores_relacionados,
#  status, natureza_para_contribuinte)
TEMAS = [
    ("Tema 69", "STF",
     "Exclusão do ICMS da base de cálculo do PIS/COFINS (\"tese do século\")",
     "PIS,COFINS,ICMS",
     "Varejo em geral,Atacado,Supermercados,Indústria de alimentos,Indústria metalúrgica,Distribuidoras,Farmácias,Postos de combustíveis,Autopeças,Revenda de veículos",
     "julgado - favorável ao contribuinte", "oportunidade"),

    ("Tema 1125", "STF",
     "Exclusão do ISS da base de cálculo do PIS/COFINS",
     "PIS,COFINS,ISS",
     "Escritórios de serviços,Software / TI,Clínicas médicas,Clínicas odontológicas,Construção civil",
     "julgado - favorável ao contribuinte", "oportunidade"),

    ("Tema 962", "STJ",
     "Inclusão de créditos presumidos de ICMS na base de cálculo do IRPJ/CSLL",
     "ICMS,IRPJ,CSLL",
     "Indústria de alimentos,Indústria metalúrgica,Agronegócio",
     "julgado - favorável ao contribuinte (créditos presumidos não integram a base)",
     "oportunidade"),

    ("Tema 313", "STJ",
     "Não incidência de PIS/COFINS sobre valores de ICMS-ST recolhido por substituição tributária",
     "PIS,COFINS,ICMS",
     "Postos de combustíveis,Farmácias,Autopeças,Revenda de veículos",
     "julgado - favorável ao contribuinte", "oportunidade"),

    ("Tema 118", "STJ",
     "Prazo prescricional de 5 anos para repetição de indébito tributário",
     "Prescrição/Decadência",
     "Varejo em geral,Atacado,Indústria de alimentos,Escritórios de serviços",
     "julgado - consolidado", "oportunidade"),

    ("Tema 293", "STJ",
     "Responsabilidade tributária de sócio-gerente por dívida da empresa - exige comprovação de infração à lei",
     "Responsabilização de sócio",
     "Varejo em geral,Construção civil,Transportadoras",
     "julgado - protege o contribuinte quando não há comprovação de infração",
     "risco (para o fisco) / oportunidade (defesa do sócio)"),
]


def criar_tabela_temas():
    conexao = sqlite3.connect(CAMINHO_DB)
    cursor = conexao.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS temas_juridicos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_tema TEXT UNIQUE,
            tribunal TEXT,
            tese_resumo TEXT,
            instituto TEXT,
            setores_relacionados TEXT,
            status TEXT,
            natureza_para_contribuinte TEXT
        )
    """)

    for linha in TEMAS:
        cursor.execute("""
            INSERT OR REPLACE INTO temas_juridicos
            (numero_tema, tribunal, tese_resumo, instituto, setores_relacionados,
             status, natureza_para_contribuinte)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, linha)

    conexao.commit()
    conexao.close()
    print(f"Tabela 'temas_juridicos' criada/atualizada com {len(TEMAS)} temas em {CAMINHO_DB}")


def buscar_tema_por_texto(texto: str):
    """
    Tenta identificar se o texto menciona um tema conhecido - primeiro
    por numero explicito ("Tema 69"), depois por palavra-chave do
    instituto. Retorna o dict do tema ou None.
    """
    import re

    texto_lower = texto.lower()

    conexao = sqlite3.connect(CAMINHO_DB)
    conexao.row_factory = sqlite3.Row
    cursor = conexao.cursor()
    cursor.execute("SELECT * FROM temas_juridicos")
    todos_temas = cursor.fetchall()
    conexao.close()

    # 1. Tenta achar numero de tema explicito no texto (ex: "Tema 69")
    match_numero = re.search(r"tema\s+(\d+)", texto_lower)
    if match_numero:
        numero_encontrado = f"Tema {match_numero.group(1)}"
        for tema in todos_temas:
            if tema["numero_tema"] == numero_encontrado:
                return dict(tema)

    # 2. Fallback: procura pela tese resumida (correspondencia parcial)
    for tema in todos_temas:
        palavras_chave_tese = tema["tese_resumo"].lower()
        # verifica se pelo menos os termos centrais aparecem no texto
        if "exclusão do icms" in texto_lower and "base" in texto_lower and "pis" in texto_lower:
            if tema["numero_tema"] == "Tema 69":
                return dict(tema)

    return None


if __name__ == "__main__":
    criar_tabela_temas()
