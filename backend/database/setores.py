"""
Fase 1 - Base Economica por Setor

Tabela SQLite com os 20 setores prioritarios. Dados combinam fontes
reais (numero de empresas, do Cadastro Central de Empresas do IBGE/
RAIS) com ESTIMATIVAS RAZOAVEIS onde o dado exato publico e dificil de
achar rapido (receita media, margem media) - marcadas como tal.

IMPORTANTE - honestidade sobre a qualidade do dado: os numeros de
"numero de empresas" tem base solida (Cadastro Central de Empresas /
RAIS, ordem de grandeza correta). Os numeros de "receita_media_anual" e
"margem_media" sao estimativas de mercado (nao vieram de uma consulta
setor-por-setor no IBGE agora) - substitua por dado real assim que
tiver acesso a um estudo setorial mais preciso. Esta ressalva fica no
proprio banco (campo `confianca_dado`) para nao mascarar a incerteza.
"""
import sqlite3
import os

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
CAMINHO_DB = os.path.join(PASTA_BASE, "atlas.db")

# (cnae_generico, setor, empresas_brasil, receita_media_anual,
#  margem_media, regime_predominante, tributos_relevantes, confianca_dado)
SETORES = [
    ("47", "Supermercados", 94000, 8_400_000, 0.05, "Lucro Presumido", "ICMS,PIS,COFINS", "media"),
    ("46", "Atacado", 180000, 12_000_000, 0.06, "Lucro Presumido", "ICMS,PIS,COFINS", "media"),
    ("47", "Varejo em geral", 1_500_000, 900_000, 0.06, "Simples Nacional", "ICMS,PIS,COFINS,ISS", "media"),
    ("45", "Revenda de veículos", 28000, 15_000_000, 0.04, "Lucro Presumido", "ICMS,IPI,PIS,COFINS", "media"),
    ("10", "Indústria de alimentos", 45000, 20_000_000, 0.08, "Lucro Real", "ICMS,IPI,PIS,COFINS,IRPJ,CSLL", "media"),
    ("24", "Indústria metalúrgica", 15000, 25_000_000, 0.09, "Lucro Real", "ICMS,IPI,PIS,COFINS,IRPJ,CSLL", "media"),
    ("86", "Clínicas médicas", 220000, 1_800_000, 0.20, "Lucro Presumido", "ISS,PIS,COFINS,IRPJ,CSLL", "media"),
    ("86", "Clínicas odontológicas", 130000, 900_000, 0.22, "Simples Nacional", "ISS,PIS,COFINS", "media"),
    ("86", "Hospitais", 7000, 45_000_000, 0.10, "Lucro Real", "ISS,PIS,COFINS,IRPJ,CSLL", "media"),
    ("49", "Transportadoras", 220000, 3_500_000, 0.08, "Lucro Presumido", "ICMS,PIS,COFINS,ISS", "media"),
    ("01", "Agronegócio", 5_000_000, 600_000, 0.15, "Simples Nacional/Funrural", "ICMS,Funrural,ITR", "baixa"),
    ("41", "Construção civil", 220000, 4_500_000, 0.10, "Lucro Presumido", "ISS,PIS,COFINS,IRPJ,CSLL", "media"),
    ("41", "Incorporação imobiliária", 45000, 8_000_000, 0.18, "RET (regime especial)", "ISS,PIS,COFINS,IRPJ,CSLL", "media"),
    ("70", "Escritórios de serviços", 900000, 600_000, 0.25, "Simples Nacional", "ISS,PIS,COFINS,IRPJ,CSLL", "media"),
    ("62", "Software / TI", 180000, 1_500_000, 0.20, "Simples Nacional/Lucro Presumido", "ISS,PIS,COFINS,IRPJ,CSLL", "media"),
    ("46", "Distribuidoras", 95000, 10_000_000, 0.05, "Lucro Presumido", "ICMS,PIS,COFINS", "baixa"),
    ("47", "Farmácias", 95000, 3_200_000, 0.10, "Lucro Presumido", "ICMS,PIS,COFINS", "media"),
    ("47", "Postos de combustíveis", 40000, 18_000_000, 0.03, "Lucro Presumido", "ICMS,PIS,COFINS", "media"),
    ("45", "Autopeças", 60000, 2_500_000, 0.12, "Simples Nacional/Lucro Presumido", "ICMS,PIS,COFINS", "baixa"),
    ("64", "Cooperativas", 12000, 6_000_000, 0.07, "Regime próprio", "PIS,COFINS,IRPJ,CSLL", "baixa"),
]


def criar_tabela_setores():
    conexao = sqlite3.connect(CAMINHO_DB)
    cursor = conexao.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS setores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cnae_generico TEXT,
            setor TEXT UNIQUE,
            empresas_brasil INTEGER,
            receita_media_anual REAL,
            margem_media REAL,
            regime_predominante TEXT,
            tributos_relevantes TEXT,
            confianca_dado TEXT
        )
    """)

    for linha in SETORES:
        cursor.execute("""
            INSERT OR REPLACE INTO setores
            (cnae_generico, setor, empresas_brasil, receita_media_anual,
             margem_media, regime_predominante, tributos_relevantes, confianca_dado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, linha)

    conexao.commit()
    conexao.close()
    print(f"Tabela 'setores' criada/atualizada com {len(SETORES)} setores em {CAMINHO_DB}")


def buscar_setor_por_texto(texto: str):
    """
    Recebe um texto (titulo+resumo de uma oportunidade) e tenta
    identificar qual setor ele menciona, comparando com os nomes de
    setor cadastrados. Retorna o dict do setor ou None se nao achar.
    """
    texto_lower = texto.lower()

    conexao = sqlite3.connect(CAMINHO_DB)
    conexao.row_factory = sqlite3.Row
    cursor = conexao.cursor()
    cursor.execute("SELECT * FROM setores")
    todos_setores = cursor.fetchall()
    conexao.close()

    palavras_chave_setor = {
        "Supermercados": ["supermercado"],
        "Atacado": ["atacado", "atacadista"],
        "Varejo em geral": ["varejo", "comércio varejista"],
        "Revenda de veículos": ["revenda de veículo", "concessionária"],
        "Indústria de alimentos": ["indústria de alimentos", "alimentícia"],
        "Indústria metalúrgica": ["metalúrgica", "metalurgia"],
        "Clínicas médicas": ["clínica médica"],
        "Clínicas odontológicas": ["clínica odontológica", "odontologia"],
        "Hospitais": ["hospital"],
        "Transportadoras": ["transportadora", "transporte de carga"],
        "Agronegócio": ["agronegócio", "agropecuária", "rural"],
        "Construção civil": ["construção civil", "construtora"],
        "Incorporação imobiliária": ["incorporação imobiliária", "incorporadora"],
        "Escritórios de serviços": ["escritório de serviços", "prestação de serviços"],
        "Software / TI": ["software", "tecnologia da informação", " ti "],
        "Distribuidoras": ["distribuidora"],
        "Farmácias": ["farmácia", "drogaria"],
        "Postos de combustíveis": ["posto de combustível", "posto de gasolina"],
        "Autopeças": ["autopeças", "peças automotivas"],
        "Cooperativas": ["cooperativa"],
    }

    for setor_row in todos_setores:
        nome_setor = setor_row["setor"]
        candidatos = palavras_chave_setor.get(nome_setor, [nome_setor.lower()])
        if any(p in texto_lower for p in candidatos):
            return dict(setor_row)

    return None


if __name__ == "__main__":
    criar_tabela_setores()
