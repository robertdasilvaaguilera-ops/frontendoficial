"""
Armazenamento local (SQLite) para os dados que o app cria em uso normal e
que precisam persistir entre sessões - carteira de clientes e histórico do
Copiloto ATLAS. Separado do pipeline de coleta (que só lê/escreve o Excel
em reports/oportunidades.xlsx) porque é um tipo de dado bem diferente:
pequeno volume, escrito pelo usuário, não reprocessado em lote.

Um arquivo, duas tabelas, sqlite3 puro (sem ORM) - mesma filosofia do
resto do backend: direto e fácil de inspecionar (basta abrir com
`sqlite3 database/atlas_app.db`).
"""
import json
import os
import sqlite3
import time
import uuid

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
CAMINHO_DB = os.path.join(PASTA_BASE, "database", "atlas_app.db")


def _conectar():
    os.makedirs(os.path.dirname(CAMINHO_DB), exist_ok=True)
    conn = sqlite3.connect(CAMINHO_DB)
    conn.row_factory = sqlite3.Row
    return conn


def iniciar():
    conn = _conectar()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS clientes (
            id TEXT PRIMARY KEY,
            nome TEXT NOT NULL,
            cnpj TEXT,
            regime TEXT,
            setor TEXT,
            cnae TEXT,
            uf TEXT,
            cidade TEXT,
            tributos_relevantes TEXT,
            faturamento_anual TEXT,
            grupo_economico INTEGER DEFAULT 0,
            comercio_exterior INTEGER DEFAULT 0,
            folha_relevante INTEGER DEFAULT 0,
            ufs_atuacao TEXT,
            contencioso_ativo INTEGER DEFAULT 0,
            contencioso_descricao TEXT,
            tese_interesse TEXT,
            prioridade TEXT,
            observacoes TEXT,
            criado_em TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS conversas (
            id TEXT PRIMARY KEY,
            titulo TEXT,
            mensagens TEXT NOT NULL,
            criado_em TEXT,
            atualizado_em TEXT
        )
    """)
    # Login local multiusuário - cada login (usuário/senha) é criado pelo
    # dono do ATLAS na tela "Usuários", não por cadastro aberto. Ver auth.py.
    # "nivel" controla o que a pessoa pode fazer no app (admin/basico/
    # intermediario/plus) - ver LIMITES_NIVEL em auth.py.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS credencial (
            usuario TEXT PRIMARY KEY,
            senha_hash TEXT NOT NULL,
            senha_salt TEXT NOT NULL,
            nivel TEXT NOT NULL DEFAULT 'basico',
            criado_em TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessao (
            token TEXT PRIMARY KEY,
            usuario TEXT NOT NULL,
            criado_em TEXT,
            expira_em TEXT
        )
    """)
    # Cota semanal combinada de pareceres + posts gerados (reseta por
    # semana ISO, ex: "2026-W33") e gasto diário do chat em USD (reseta
    # por dia, ex: "2026-08-12") - ambos por usuário, ambos ignorados pra
    # quem é admin (sem limite).
    conn.execute("""
        CREATE TABLE IF NOT EXISTS uso_semanal (
            usuario TEXT NOT NULL,
            semana TEXT NOT NULL,
            contador INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (usuario, semana)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS uso_chat_diario (
            usuario TEXT NOT NULL,
            dia TEXT NOT NULL,
            custo_usd REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (usuario, dia)
        )
    """)
    # Mídia Social - automação de posts de Instagram (ver social/*.py e as
    # rotas /social/* em api_server.py). Config é uma linha única (id=1);
    # decisões usadas evita repetir a mesma decisão em posts futuros; posts
    # é o histórico (sucesso ou erro) mostrado na aba Mídia Social.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS social_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            ativo INTEGER NOT NULL DEFAULT 0,
            temas TEXT NOT NULL DEFAULT '[]',
            objetivos TEXT NOT NULL DEFAULT '',
            tom TEXT NOT NULL DEFAULT '',
            horarios TEXT NOT NULL DEFAULT '[]',
            ig_access_token TEXT NOT NULL DEFAULT '',
            ig_business_account_id TEXT NOT NULL DEFAULT '',
            atualizado_em TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS social_decisoes_usadas (
            decisao_id TEXT PRIMARY KEY,
            usado_em TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS social_posts (
            id TEXT PRIMARY KEY,
            criado_em TEXT,
            decisao_id TEXT,
            titulo TEXT,
            paragrafo_destaque TEXT,
            headline2 TEXT,
            sub2 TEXT,
            legenda TEXT,
            gancho TEXT,
            imagem1_path TEXT,
            imagem2_path TEXT,
            status TEXT NOT NULL,
            post_id TEXT,
            permalink TEXT,
            erro_detalhe TEXT
        )
    """)
    conn.commit()
    _migrar_credenciais_legado(conn)
    conn.close()


def _migrar_credenciais_legado(conn: sqlite3.Connection) -> None:
    """Versões anteriores tinham uma única credencial fixa (id=1) e sessões
    sem dono. Se o banco ainda estiver nesse formato antigo, migra a
    credencial existente para o novo formato multiusuário (ela vira o
    primeiro login) e recria a tabela de sessões (sessões antigas não têm
    dono - perdê-las só significa pedir login de novo, sem risco)."""
    colunas_credencial = {l[1] for l in conn.execute("PRAGMA table_info(credencial)")}
    if "id" in colunas_credencial:
        conn.execute("ALTER TABLE credencial RENAME TO credencial_legado")
        conn.execute("""
            CREATE TABLE credencial (
                usuario TEXT PRIMARY KEY,
                senha_hash TEXT NOT NULL,
                senha_salt TEXT NOT NULL,
                nivel TEXT NOT NULL DEFAULT 'basico',
                criado_em TEXT
            )
        """)
        conn.execute("""
            INSERT INTO credencial (usuario, senha_hash, senha_salt, nivel, criado_em)
            SELECT usuario, senha_hash, senha_salt, 'admin', criado_em FROM credencial_legado
        """)
        conn.execute("DROP TABLE credencial_legado")
    elif "nivel" not in colunas_credencial:
        # Banco já multiusuário, mas de antes dos níveis existirem - quem já
        # tinha login continua podendo fazer tudo (vira admin), pra não
        # perder acesso de repente por causa de uma migração.
        conn.execute("ALTER TABLE credencial ADD COLUMN nivel TEXT NOT NULL DEFAULT 'admin'")

    colunas_sessao = {l[1] for l in conn.execute("PRAGMA table_info(sessao)")}
    if "usuario" not in colunas_sessao:
        conn.execute("DROP TABLE sessao")
        conn.execute("""
            CREATE TABLE sessao (
                token TEXT PRIMARY KEY,
                usuario TEXT NOT NULL,
                criado_em TEXT,
                expira_em TEXT
            )
        """)
    conn.commit()


# --- clientes ---------------------------------------------------------

def listar_clientes() -> list[dict]:
    conn = _conectar()
    linhas = conn.execute("SELECT * FROM clientes ORDER BY criado_em DESC").fetchall()
    conn.close()
    return [_linha_cliente_para_dict(l) for l in linhas]


def inserir_cliente(dados: dict) -> dict:
    id_ = uuid.uuid4().hex[:12]
    criado_em = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        """
        INSERT INTO clientes (
            id, nome, cnpj, regime, setor, cnae, uf, cidade,
            tributos_relevantes, faturamento_anual, grupo_economico,
            comercio_exterior, folha_relevante, ufs_atuacao,
            contencioso_ativo, contencioso_descricao, tese_interesse,
            prioridade, observacoes, criado_em
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            id_,
            dados.get("nome", ""),
            dados.get("cnpj", ""),
            dados.get("regime", ""),
            dados.get("setor", ""),
            dados.get("cnae", ""),
            dados.get("uf", ""),
            dados.get("cidade", ""),
            json.dumps(dados.get("tributosRelevantes", []), ensure_ascii=False),
            dados.get("faturamentoAnual", ""),
            int(bool(dados.get("grupoEconomico"))),
            int(bool(dados.get("comercioExterior"))),
            int(bool(dados.get("folhaRelevante"))),
            json.dumps(dados.get("ufsAtuacao", []), ensure_ascii=False),
            int(bool(dados.get("contenciosoAtivo"))),
            dados.get("contenciosoDescricao", ""),
            dados.get("teseInteresse", ""),
            dados.get("prioridade", ""),
            dados.get("observacoes", ""),
            criado_em,
        ),
    )
    conn.commit()
    conn.close()
    return listar_cliente_por_id(id_)


def listar_cliente_por_id(id_: str) -> dict | None:
    conn = _conectar()
    linha = conn.execute("SELECT * FROM clientes WHERE id = ?", (id_,)).fetchone()
    conn.close()
    return _linha_cliente_para_dict(linha) if linha else None


def remover_cliente(id_: str) -> bool:
    conn = _conectar()
    cur = conn.execute("DELETE FROM clientes WHERE id = ?", (id_,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def contar_clientes() -> int:
    conn = _conectar()
    n = conn.execute("SELECT COUNT(*) FROM clientes").fetchone()[0]
    conn.close()
    return int(n)


def _linha_cliente_para_dict(linha: sqlite3.Row) -> dict:
    return {
        "id": linha["id"],
        "nome": linha["nome"] or "",
        "cnpj": linha["cnpj"] or "",
        "regime": linha["regime"] or "",
        "setor": linha["setor"] or "",
        "cnae": linha["cnae"] or "",
        "uf": linha["uf"] or "",
        "cidade": linha["cidade"] or "",
        "tributosRelevantes": json.loads(linha["tributos_relevantes"] or "[]"),
        "faturamentoAnual": linha["faturamento_anual"] or "",
        "grupoEconomico": bool(linha["grupo_economico"]),
        "comercioExterior": bool(linha["comercio_exterior"]),
        "folhaRelevante": bool(linha["folha_relevante"]),
        "ufsAtuacao": json.loads(linha["ufs_atuacao"] or "[]"),
        "contenciosoAtivo": bool(linha["contencioso_ativo"]),
        "contenciosoDescricao": linha["contencioso_descricao"] or "",
        "teseInteresse": linha["tese_interesse"] or "",
        "prioridade": linha["prioridade"] or "",
        "observacoes": linha["observacoes"] or "",
    }


# --- conversas do Copiloto ---------------------------------------------

def listar_conversas() -> list[dict]:
    conn = _conectar()
    linhas = conn.execute(
        "SELECT id, titulo, criado_em, atualizado_em FROM conversas ORDER BY atualizado_em DESC"
    ).fetchall()
    conn.close()
    return [
        {
            "id": l["id"],
            "titulo": l["titulo"] or "Nova conversa",
            "criadoEm": l["criado_em"],
            "atualizadoEm": l["atualizado_em"],
        }
        for l in linhas
    ]


def obter_conversa(id_: str) -> dict | None:
    conn = _conectar()
    linha = conn.execute("SELECT * FROM conversas WHERE id = ?", (id_,)).fetchone()
    conn.close()
    if not linha:
        return None
    return {
        "id": linha["id"],
        "titulo": linha["titulo"] or "Nova conversa",
        "mensagens": json.loads(linha["mensagens"] or "[]"),
        "criadoEm": linha["criado_em"],
        "atualizadoEm": linha["atualizado_em"],
    }


def salvar_conversa(id_: str | None, titulo: str, mensagens: list[dict]) -> dict:
    """Cria a conversa se id_ for None/novo, ou atualiza se já existir -
    o Copiloto salva a cada troca de mensagem, então é sempre um upsert."""
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    if id_ and conn.execute("SELECT 1 FROM conversas WHERE id = ?", (id_,)).fetchone():
        conn.execute(
            "UPDATE conversas SET titulo = ?, mensagens = ?, atualizado_em = ? WHERE id = ?",
            (titulo, json.dumps(mensagens, ensure_ascii=False), agora, id_),
        )
    else:
        id_ = id_ or uuid.uuid4().hex[:12]
        conn.execute(
            "INSERT INTO conversas (id, titulo, mensagens, criado_em, atualizado_em) "
            "VALUES (?,?,?,?,?)",
            (id_, titulo, json.dumps(mensagens, ensure_ascii=False), agora, agora),
        )
    conn.commit()
    conn.close()
    return obter_conversa(id_)


def remover_conversa(id_: str) -> bool:
    conn = _conectar()
    cur = conn.execute("DELETE FROM conversas WHERE id = ?", (id_,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


# --- credenciais de acesso (login local multiusuário) --------------------

def credencial_existe() -> bool:
    """Verdadeiro assim que existir pelo menos um login - usado só para
    saber se o app ainda precisa passar pela tela de criar o primeiro
    login (bootstrap)."""
    conn = _conectar()
    linha = conn.execute("SELECT 1 FROM credencial LIMIT 1").fetchone()
    conn.close()
    return linha is not None


def obter_credencial(usuario: str) -> dict | None:
    conn = _conectar()
    linha = conn.execute(
        "SELECT * FROM credencial WHERE usuario = ?", (usuario.strip(),)
    ).fetchone()
    conn.close()
    if not linha:
        return None
    return {
        "usuario": linha["usuario"],
        "senhaHash": linha["senha_hash"],
        "senhaSalt": linha["senha_salt"],
        "nivel": linha["nivel"],
    }


def obter_nivel(usuario: str) -> str | None:
    conn = _conectar()
    linha = conn.execute(
        "SELECT nivel FROM credencial WHERE usuario = ?", (usuario.strip(),)
    ).fetchone()
    conn.close()
    return linha["nivel"] if linha else None


def listar_usuarios() -> list[dict]:
    conn = _conectar()
    linhas = conn.execute(
        "SELECT usuario, nivel, criado_em FROM credencial ORDER BY criado_em ASC"
    ).fetchall()
    conn.close()
    return [
        {"usuario": l["usuario"], "nivel": l["nivel"], "criadoEm": l["criado_em"]} for l in linhas
    ]


def criar_usuario(usuario: str, senha_hash: str, senha_salt: str, nivel: str) -> None:
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        "INSERT INTO credencial (usuario, senha_hash, senha_salt, nivel, criado_em) VALUES (?, ?, ?, ?, ?)",
        (usuario.strip(), senha_hash, senha_salt, nivel, agora),
    )
    conn.commit()
    conn.close()


def remover_usuario(usuario: str) -> None:
    conn = _conectar()
    conn.execute("DELETE FROM credencial WHERE usuario = ?", (usuario.strip(),))
    conn.execute("DELETE FROM sessao WHERE usuario = ?", (usuario.strip(),))
    conn.execute("DELETE FROM uso_semanal WHERE usuario = ?", (usuario.strip(),))
    conn.execute("DELETE FROM uso_chat_diario WHERE usuario = ?", (usuario.strip(),))
    conn.commit()
    conn.close()


# --- cota de uso (pareceres/posts por semana, chat por dia) --------------

def uso_semanal(usuario: str, semana: str) -> int:
    conn = _conectar()
    linha = conn.execute(
        "SELECT contador FROM uso_semanal WHERE usuario = ? AND semana = ?", (usuario, semana)
    ).fetchone()
    conn.close()
    return linha["contador"] if linha else 0


def registrar_uso_semanal(usuario: str, semana: str) -> None:
    conn = _conectar()
    conn.execute(
        """
        INSERT INTO uso_semanal (usuario, semana, contador) VALUES (?, ?, 1)
        ON CONFLICT(usuario, semana) DO UPDATE SET contador = contador + 1
        """,
        (usuario, semana),
    )
    conn.commit()
    conn.close()


def uso_chat_diario(usuario: str, dia: str) -> float:
    conn = _conectar()
    linha = conn.execute(
        "SELECT custo_usd FROM uso_chat_diario WHERE usuario = ? AND dia = ?", (usuario, dia)
    ).fetchone()
    conn.close()
    return linha["custo_usd"] if linha else 0.0


def registrar_gasto_chat(usuario: str, dia: str, custo_usd: float) -> None:
    conn = _conectar()
    conn.execute(
        """
        INSERT INTO uso_chat_diario (usuario, dia, custo_usd) VALUES (?, ?, ?)
        ON CONFLICT(usuario, dia) DO UPDATE SET custo_usd = custo_usd + excluded.custo_usd
        """,
        (usuario, dia, custo_usd),
    )
    conn.commit()
    conn.close()


# --- sessões -------------------------------------------------------------

def criar_sessao(token: str, usuario: str, expira_em: str) -> None:
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        "INSERT INTO sessao (token, usuario, criado_em, expira_em) VALUES (?, ?, ?, ?)",
        (token, usuario, agora, expira_em),
    )
    conn.commit()
    conn.close()


def usuario_da_sessao(token: str) -> str | None:
    info = sessao_info(token)
    return info["usuario"] if info else None


def sessao_info(token: str) -> dict | None:
    """Usuário + nível de quem está por trás do token, num só SELECT (join
    com credencial) - usado em toda checagem de permissão/cota."""
    if not token:
        return None
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    linha = conn.execute(
        """
        SELECT s.usuario AS usuario, c.nivel AS nivel
        FROM sessao s JOIN credencial c ON c.usuario = s.usuario
        WHERE s.token = ? AND s.expira_em > ?
        """,
        (token, agora),
    ).fetchone()
    conn.close()
    return {"usuario": linha["usuario"], "nivel": linha["nivel"]} if linha else None


def sessao_valida(token: str) -> bool:
    return usuario_da_sessao(token) is not None


def apagar_sessao(token: str) -> None:
    conn = _conectar()
    conn.execute("DELETE FROM sessao WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def limpar_sessoes_expiradas() -> None:
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute("DELETE FROM sessao WHERE expira_em <= ?", (agora,))
    conn.commit()
    conn.close()


# --- Mídia Social (automação de posts de Instagram) -----------------------

_SOCIAL_CONFIG_PADRAO = {
    "ativo": False,
    "temas": [],
    "objetivos": "",
    "tom": "",
    "horarios": [],
    "igAccessToken": "",
    "igBusinessAccountId": "",
}


def obter_social_config() -> dict:
    conn = _conectar()
    linha = conn.execute("SELECT * FROM social_config WHERE id = 1").fetchone()
    conn.close()
    if not linha:
        return dict(_SOCIAL_CONFIG_PADRAO)
    return {
        "ativo": bool(linha["ativo"]),
        "temas": json.loads(linha["temas"] or "[]"),
        "objetivos": linha["objetivos"] or "",
        "tom": linha["tom"] or "",
        "horarios": json.loads(linha["horarios"] or "[]"),
        "igAccessToken": linha["ig_access_token"] or "",
        "igBusinessAccountId": linha["ig_business_account_id"] or "",
    }


def salvar_social_config(dados: dict) -> dict:
    """Upsert da linha única de configuração (id=1). Campos ausentes em
    `dados` mantêm o valor já salvo (permite, por ex., atualizar só os
    horários sem reenviar o token do Instagram)."""
    atual = obter_social_config()
    mesclado = {**atual, **{k: v for k, v in dados.items() if v is not None}}
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        """
        INSERT INTO social_config
            (id, ativo, temas, objetivos, tom, horarios, ig_access_token, ig_business_account_id, atualizado_em)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            ativo = excluded.ativo, temas = excluded.temas, objetivos = excluded.objetivos,
            tom = excluded.tom, horarios = excluded.horarios,
            ig_access_token = excluded.ig_access_token,
            ig_business_account_id = excluded.ig_business_account_id,
            atualizado_em = excluded.atualizado_em
        """,
        (
            int(bool(mesclado["ativo"])),
            json.dumps(mesclado["temas"], ensure_ascii=False),
            mesclado["objetivos"],
            mesclado["tom"],
            json.dumps(mesclado["horarios"], ensure_ascii=False),
            mesclado["igAccessToken"],
            mesclado["igBusinessAccountId"],
            agora,
        ),
    )
    conn.commit()
    conn.close()
    return obter_social_config()


def social_decisao_ja_usada(decisao_id: str) -> bool:
    conn = _conectar()
    linha = conn.execute(
        "SELECT 1 FROM social_decisoes_usadas WHERE decisao_id = ?", (decisao_id,)
    ).fetchone()
    conn.close()
    return linha is not None


def listar_social_decisoes_usadas() -> set[str]:
    conn = _conectar()
    linhas = conn.execute("SELECT decisao_id FROM social_decisoes_usadas").fetchall()
    conn.close()
    return {l["decisao_id"] for l in linhas}


def marcar_social_decisao_usada(decisao_id: str) -> None:
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        "INSERT OR IGNORE INTO social_decisoes_usadas (decisao_id, usado_em) VALUES (?, ?)",
        (decisao_id, agora),
    )
    conn.commit()
    conn.close()


def inserir_social_post(dados: dict) -> dict:
    id_ = uuid.uuid4().hex[:12]
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        """
        INSERT INTO social_posts (
            id, criado_em, decisao_id, titulo, paragrafo_destaque, headline2, sub2,
            legenda, gancho, imagem1_path, imagem2_path, status, post_id, permalink, erro_detalhe
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            id_, agora,
            dados.get("decisaoId"), dados.get("titulo", ""),
            dados.get("paragrafoDestaque", ""), dados.get("headline2", ""), dados.get("sub2", ""),
            dados.get("legenda", ""), dados.get("gancho", ""),
            dados.get("imagem1Path"), dados.get("imagem2Path"),
            dados.get("status", "erro"), dados.get("postId"), dados.get("permalink"),
            dados.get("erroDetalhe"),
        ),
    )
    conn.commit()
    conn.close()
    return obter_social_post(id_)


def obter_social_post(id_: str) -> dict | None:
    conn = _conectar()
    linha = conn.execute("SELECT * FROM social_posts WHERE id = ?", (id_,)).fetchone()
    conn.close()
    return _linha_social_post_para_dict(linha) if linha else None


def listar_social_posts(limit: int = 30) -> list[dict]:
    conn = _conectar()
    linhas = conn.execute(
        "SELECT * FROM social_posts ORDER BY criado_em DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [_linha_social_post_para_dict(l) for l in linhas]


def ultimos_ganchos_social(n: int = 5) -> list[str]:
    conn = _conectar()
    linhas = conn.execute(
        "SELECT gancho FROM social_posts WHERE status = 'publicado' AND gancho != '' "
        "ORDER BY criado_em DESC LIMIT ?",
        (n,),
    ).fetchall()
    conn.close()
    return [l["gancho"] for l in linhas]


def _linha_social_post_para_dict(linha: sqlite3.Row) -> dict:
    return {
        "id": linha["id"],
        "criadoEm": linha["criado_em"],
        "decisaoId": linha["decisao_id"],
        "titulo": linha["titulo"] or "",
        "paragrafoDestaque": linha["paragrafo_destaque"] or "",
        "headline2": linha["headline2"] or "",
        "sub2": linha["sub2"] or "",
        "legenda": linha["legenda"] or "",
        "gancho": linha["gancho"] or "",
        "imagem1Path": linha["imagem1_path"],
        "imagem2Path": linha["imagem2_path"],
        "status": linha["status"],
        "postId": linha["post_id"],
        "permalink": linha["permalink"],
        "erroDetalhe": linha["erro_detalhe"],
    }
