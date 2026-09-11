import sqlite3

DB = "database/atlas.db"


def criar_banco():

    conn = sqlite3.connect(DB)
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS oportunidades (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        fonte TEXT,

        data TEXT,

        titulo TEXT,

        resumo TEXT,

        link TEXT,

        area TEXT,

        tributos TEXT,

        setores TEXT,

        score INTEGER,

        impacto TEXT,

        oportunidade TEXT,

        empresas_afetadas INTEGER,

        economia_estimada REAL,

        risco INTEGER,

        seguranca_juridica INTEGER,

        acao_sugerida TEXT,

        status TEXT

    )
    """)

    conn.commit()
    conn.close()


def inserir(item):

    conn = sqlite3.connect(DB)
    c = conn.cursor()

    c.execute("""
    INSERT INTO oportunidades(

        fonte,
        data,
        titulo,
        resumo,
        link,
        area,
        tributos,
        setores,
        score,
        impacto,
        oportunidade,
        empresas_afetadas,
        economia_estimada,
        risco,
        seguranca_juridica,
        acao_sugerida,
        status

    )

    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (

        item.get("fonte",""),
        item.get("data_publicacao",""),
        item.get("titulo",""),
        item.get("resumo",""),
        item.get("link",""),
        item.get("area",""),
        item.get("tributos",""),
        item.get("setores",""),
        item.get("score",0),
        item.get("impacto",""),
        item.get("oportunidade",""),
        0,
        0,
        0,
        0,
        "",
        "Nova"

    ))

    conn.commit()
    conn.close()