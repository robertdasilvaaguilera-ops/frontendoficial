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
import sqlite3
import time
import uuid

import paths

CAMINHO_DB = paths.caminho("database", "atlas_app.db")


def _conectar():
    conn = sqlite3.connect(CAMINHO_DB)
    conn.row_factory = sqlite3.Row
    return conn


def iniciar():
    conn = _conectar()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS clientes (
            id TEXT PRIMARY KEY,
            usuario TEXT NOT NULL DEFAULT '',
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
            usuario TEXT NOT NULL DEFAULT '',
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
    # Trava de força bruta no login (ver auth.py: registrar_falha_login /
    # bloqueado_ate) - por usuário tentado, não por IP (protege a conta
    # mesmo contra tentativas vindas de vários IPs).
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tentativa_login (
            usuario TEXT PRIMARY KEY,
            falhas INTEGER NOT NULL DEFAULT 0,
            bloqueado_ate TEXT
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
    # rotas /social/* em api_server.py). Cada usuário tem a própria linha de
    # config (próprio token do Instagram, própria identidade visual, próprios
    # horários) - cada escritório automatiza o próprio perfil, isolado dos
    # demais logins; decisões usadas evita repetir a mesma decisão em posts
    # futuros de um mesmo usuário; posts é o histórico (sucesso ou erro)
    # mostrado na aba Mídia Social, também por usuário.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS social_config (
            usuario TEXT PRIMARY KEY,
            ativo INTEGER NOT NULL DEFAULT 0,
            temas TEXT NOT NULL DEFAULT '[]',
            objetivos TEXT NOT NULL DEFAULT '',
            tom TEXT NOT NULL DEFAULT '',
            horarios TEXT NOT NULL DEFAULT '[]',
            ig_access_token TEXT NOT NULL DEFAULT '',
            ig_business_account_id TEXT NOT NULL DEFAULT '',
            marca_nome TEXT NOT NULL DEFAULT 'ATLAS',
            marca_handle TEXT NOT NULL DEFAULT '@atlas.tributos',
            cor_fundo_claro TEXT NOT NULL DEFAULT '#171B24',
            cor_fundo_escuro TEXT NOT NULL DEFAULT '#0B0D12',
            cor_destaque TEXT NOT NULL DEFAULT '#D9A544',
            logo_path TEXT NOT NULL DEFAULT '',
            estilo TEXT NOT NULL DEFAULT 'classico',
            texto_claro INTEGER NOT NULL DEFAULT 1,
            fundo1_path TEXT NOT NULL DEFAULT '',
            fundo2_path TEXT NOT NULL DEFAULT '',
            posicao_vertical TEXT NOT NULL DEFAULT 'centro',
            alinhamento TEXT NOT NULL DEFAULT 'centro',
            atualizado_em TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS social_decisoes_usadas (
            usuario TEXT NOT NULL,
            decisao_id TEXT NOT NULL,
            usado_em TEXT,
            PRIMARY KEY (usuario, decisao_id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS social_posts (
            id TEXT PRIMARY KEY,
            usuario TEXT NOT NULL DEFAULT '',
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
    _migrar_social_config_marca(conn)
    _migrar_clientes_dono(conn)
    _migrar_conversas_dono(conn)
    _migrar_social_config_multiusuario(conn)
    _migrar_social_decisoes_usadas_dono(conn)
    _migrar_social_posts_dono(conn)
    # Índices só depois das migrações acima - em bancos legados, a coluna
    # `usuario` só passa a existir depois que elas rodam (bancos novos já
    # nascem com a coluna, então isso é um no-op nesse caso).
    conn.execute("CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON clientes(usuario)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_conversas_usuario ON conversas(usuario)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_social_posts_usuario ON social_posts(usuario)")
    conn.commit()
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


def _migrar_social_config_marca(conn: sqlite3.Connection) -> None:
    """Bancos criados antes da identidade de marca (nome/handle/cores/logo/
    fonte/fundo) ficarem configuráveis não têm essas colunas - adiciona com
    os mesmos defaults do CREATE TABLE acima (a identidade original da
    Atlas), pra quem já tinha configuração salva continuar publicando
    exatamente igual."""
    colunas = {l[1] for l in conn.execute("PRAGMA table_info(social_config)")}
    novas_texto = {
        "marca_nome": "'ATLAS'",
        "marca_handle": "'@atlas.tributos'",
        "cor_fundo_claro": "'#171B24'",
        "cor_fundo_escuro": "'#0B0D12'",
        "cor_destaque": "'#D9A544'",
        "logo_path": "''",
        "estilo": "'classico'",
        "fundo1_path": "''",
        "fundo2_path": "''",
        "posicao_vertical": "'centro'",
        "alinhamento": "'centro'",
    }
    # f-string aqui é seguro: coluna/default vêm só do dict fixo acima
    # (nunca de entrada externa) - e nomes de coluna não dá pra parametrizar
    # com "?" de qualquer forma (só valores), então não tem como escrever
    # isso com placeholder mesmo se quisesse.
    for coluna, default in novas_texto.items():
        if coluna not in colunas:
            conn.execute(f"ALTER TABLE social_config ADD COLUMN {coluna} TEXT NOT NULL DEFAULT {default}")
    if "texto_claro" not in colunas:
        conn.execute("ALTER TABLE social_config ADD COLUMN texto_claro INTEGER NOT NULL DEFAULT 1")
    conn.commit()


def _usuario_admin_legado(conn: sqlite3.Connection) -> str | None:
    """Login que herda os dados de dono único de antes do multiusuário
    (carteira de clientes, conversas do Copiloto, automação de Mídia Social)
    - o primeiro admin, ou se nenhum existir ainda, o primeiro login
    cadastrado. Usado só pelas migrações abaixo, uma vez cada."""
    linha = conn.execute(
        "SELECT usuario FROM credencial WHERE nivel = 'admin' ORDER BY criado_em ASC LIMIT 1"
    ).fetchone()
    if not linha:
        linha = conn.execute("SELECT usuario FROM credencial ORDER BY criado_em ASC LIMIT 1").fetchone()
    return linha["usuario"] if linha else None


def _migrar_clientes_dono(conn: sqlite3.Connection) -> None:
    """Bancos de antes do multiusuário não tinham dono na carteira de
    clientes (todo mundo via tudo) - atribui os clientes já cadastrados ao
    login legado (ver _usuario_admin_legado), pra continuar exatamente onde
    estava em vez de "perder" a carteira."""
    colunas = {l[1] for l in conn.execute("PRAGMA table_info(clientes)")}
    if "usuario" in colunas:
        return
    conn.execute("ALTER TABLE clientes ADD COLUMN usuario TEXT NOT NULL DEFAULT ''")
    dono = _usuario_admin_legado(conn)
    if dono:
        conn.execute("UPDATE clientes SET usuario = ? WHERE usuario = ''", (dono,))
    conn.execute("CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON clientes(usuario)")
    conn.commit()


def _migrar_conversas_dono(conn: sqlite3.Connection) -> None:
    """Mesma lógica de _migrar_clientes_dono, pro histórico do Copiloto -
    cada conversa passa a pertencer a quem a criou; as já existentes (de
    antes de existir dono) vão para o login legado."""
    colunas = {l[1] for l in conn.execute("PRAGMA table_info(conversas)")}
    if "usuario" in colunas:
        return
    conn.execute("ALTER TABLE conversas ADD COLUMN usuario TEXT NOT NULL DEFAULT ''")
    dono = _usuario_admin_legado(conn)
    if dono:
        conn.execute("UPDATE conversas SET usuario = ? WHERE usuario = ''", (dono,))
    conn.execute("CREATE INDEX IF NOT EXISTS idx_conversas_usuario ON conversas(usuario)")
    conn.commit()


def _migrar_social_config_multiusuario(conn: sqlite3.Connection) -> None:
    """Versões anteriores tinham uma única configuração de Mídia Social
    (id=1) compartilhada por toda a equipe - cada login precisa da própria
    (próprio token do Instagram, própria identidade visual, próprios
    horários), então a linha única vira uma linha por usuário (chave
    primária `usuario`). A config antiga, se existir, vira a config do login
    legado, pra quem já estava automatizado continuar publicando exatamente
    como antes."""
    colunas = {l[1] for l in conn.execute("PRAGMA table_info(social_config)")}
    if "usuario" in colunas:
        return
    conn.execute("ALTER TABLE social_config RENAME TO social_config_legado")
    conn.execute("""
        CREATE TABLE social_config (
            usuario TEXT PRIMARY KEY,
            ativo INTEGER NOT NULL DEFAULT 0,
            temas TEXT NOT NULL DEFAULT '[]',
            objetivos TEXT NOT NULL DEFAULT '',
            tom TEXT NOT NULL DEFAULT '',
            horarios TEXT NOT NULL DEFAULT '[]',
            ig_access_token TEXT NOT NULL DEFAULT '',
            ig_business_account_id TEXT NOT NULL DEFAULT '',
            marca_nome TEXT NOT NULL DEFAULT 'ATLAS',
            marca_handle TEXT NOT NULL DEFAULT '@atlas.tributos',
            cor_fundo_claro TEXT NOT NULL DEFAULT '#171B24',
            cor_fundo_escuro TEXT NOT NULL DEFAULT '#0B0D12',
            cor_destaque TEXT NOT NULL DEFAULT '#D9A544',
            logo_path TEXT NOT NULL DEFAULT '',
            estilo TEXT NOT NULL DEFAULT 'classico',
            texto_claro INTEGER NOT NULL DEFAULT 1,
            fundo1_path TEXT NOT NULL DEFAULT '',
            fundo2_path TEXT NOT NULL DEFAULT '',
            posicao_vertical TEXT NOT NULL DEFAULT 'centro',
            alinhamento TEXT NOT NULL DEFAULT 'centro',
            atualizado_em TEXT
        )
    """)
    dono = _usuario_admin_legado(conn)
    linha_legado = conn.execute("SELECT * FROM social_config_legado WHERE id = 1").fetchone()
    if linha_legado and dono:
        # Nomes de coluna vêm só do próprio schema legado (nunca de entrada
        # externa) - "id" é a única que não existe na tabela nova.
        campos = [c for c in linha_legado.keys() if c != "id"]
        placeholders = ", ".join("?" for _ in campos)
        conn.execute(
            f"INSERT INTO social_config (usuario, {', '.join(campos)}) VALUES (?, {placeholders})",
            (dono, *[linha_legado[c] for c in campos]),
        )
    conn.execute("DROP TABLE social_config_legado")
    conn.commit()


def _migrar_social_decisoes_usadas_dono(conn: sqlite3.Connection) -> None:
    """Idem social_config: decisão usada passa a ser por usuário (cada
    automação evita repetir só as próprias decisões já publicadas, não as de
    outros logins) - histórico existente vai para o login legado."""
    colunas = {l[1] for l in conn.execute("PRAGMA table_info(social_decisoes_usadas)")}
    if "usuario" in colunas:
        return
    conn.execute("ALTER TABLE social_decisoes_usadas RENAME TO social_decisoes_usadas_legado")
    conn.execute("""
        CREATE TABLE social_decisoes_usadas (
            usuario TEXT NOT NULL,
            decisao_id TEXT NOT NULL,
            usado_em TEXT,
            PRIMARY KEY (usuario, decisao_id)
        )
    """)
    dono = _usuario_admin_legado(conn)
    if dono:
        conn.execute(
            "INSERT INTO social_decisoes_usadas (usuario, decisao_id, usado_em) "
            "SELECT ?, decisao_id, usado_em FROM social_decisoes_usadas_legado",
            (dono,),
        )
    conn.execute("DROP TABLE social_decisoes_usadas_legado")
    conn.commit()


def _migrar_social_posts_dono(conn: sqlite3.Connection) -> None:
    """Idem clientes/conversas: histórico de posts existente vai para o
    login legado; novos posts já nascem com o usuário que os gerou."""
    colunas = {l[1] for l in conn.execute("PRAGMA table_info(social_posts)")}
    if "usuario" in colunas:
        return
    conn.execute("ALTER TABLE social_posts ADD COLUMN usuario TEXT NOT NULL DEFAULT ''")
    dono = _usuario_admin_legado(conn)
    if dono:
        conn.execute("UPDATE social_posts SET usuario = ? WHERE usuario = ''", (dono,))
    conn.execute("CREATE INDEX IF NOT EXISTS idx_social_posts_usuario ON social_posts(usuario)")
    conn.commit()


# --- clientes ---------------------------------------------------------

def listar_clientes(usuario: str) -> list[dict]:
    conn = _conectar()
    linhas = conn.execute(
        "SELECT * FROM clientes WHERE usuario = ? ORDER BY criado_em DESC", (usuario,)
    ).fetchall()
    conn.close()
    return [_linha_cliente_para_dict(l) for l in linhas]


def inserir_cliente(dados: dict, usuario: str) -> dict:
    id_ = uuid.uuid4().hex[:12]
    criado_em = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        """
        INSERT INTO clientes (
            id, usuario, nome, cnpj, regime, setor, cnae, uf, cidade,
            tributos_relevantes, faturamento_anual, grupo_economico,
            comercio_exterior, folha_relevante, ufs_atuacao,
            contencioso_ativo, contencioso_descricao, tese_interesse,
            prioridade, observacoes, criado_em
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            id_,
            usuario,
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
    return listar_cliente_por_id(id_, usuario)


def listar_cliente_por_id(id_: str, usuario: str) -> dict | None:
    conn = _conectar()
    linha = conn.execute(
        "SELECT * FROM clientes WHERE id = ? AND usuario = ?", (id_, usuario)
    ).fetchone()
    conn.close()
    return _linha_cliente_para_dict(linha) if linha else None


def remover_cliente(id_: str, usuario: str) -> bool:
    conn = _conectar()
    cur = conn.execute("DELETE FROM clientes WHERE id = ? AND usuario = ?", (id_, usuario))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def contar_clientes(usuario: str) -> int:
    conn = _conectar()
    n = conn.execute("SELECT COUNT(*) FROM clientes WHERE usuario = ?", (usuario,)).fetchone()[0]
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

def listar_conversas(usuario: str) -> list[dict]:
    conn = _conectar()
    linhas = conn.execute(
        "SELECT id, titulo, criado_em, atualizado_em FROM conversas "
        "WHERE usuario = ? ORDER BY atualizado_em DESC",
        (usuario,),
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


def obter_conversa(id_: str, usuario: str) -> dict | None:
    conn = _conectar()
    linha = conn.execute(
        "SELECT * FROM conversas WHERE id = ? AND usuario = ?", (id_, usuario)
    ).fetchone()
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


def salvar_conversa(id_: str | None, titulo: str, mensagens: list[dict], usuario: str) -> dict:
    """Cria a conversa se id_ for None/novo, ou atualiza se já existir (e for
    do mesmo usuário) - o Copiloto salva a cada troca de mensagem, então é
    sempre um upsert. Um id que não é deste usuário é tratado como novo
    (nunca sobrescreve/anexa a conversa de outro login)."""
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    existente = (
        conn.execute(
            "SELECT 1 FROM conversas WHERE id = ? AND usuario = ?", (id_, usuario)
        ).fetchone()
        if id_
        else None
    )
    if existente:
        conn.execute(
            "UPDATE conversas SET titulo = ?, mensagens = ?, atualizado_em = ? WHERE id = ?",
            (titulo, json.dumps(mensagens, ensure_ascii=False), agora, id_),
        )
    else:
        # id_ ausente, ou pertencente a outro usuário (nunca reaproveitado,
        # pra não colidir com a PK de uma conversa que não é desta pessoa) -
        # sempre nasce com um id novo.
        id_ = uuid.uuid4().hex[:12]
        conn.execute(
            "INSERT INTO conversas (id, usuario, titulo, mensagens, criado_em, atualizado_em) "
            "VALUES (?,?,?,?,?,?)",
            (id_, usuario, titulo, json.dumps(mensagens, ensure_ascii=False), agora, agora),
        )
    conn.commit()
    conn.close()
    return obter_conversa(id_, usuario)


def remover_conversa(id_: str, usuario: str) -> bool:
    conn = _conectar()
    cur = conn.execute("DELETE FROM conversas WHERE id = ? AND usuario = ?", (id_, usuario))
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


# --- trava de força bruta no login (ver auth.py) -----------------------

def obter_tentativa_login(usuario: str) -> dict:
    conn = _conectar()
    linha = conn.execute(
        "SELECT * FROM tentativa_login WHERE usuario = ?", (usuario.strip(),)
    ).fetchone()
    conn.close()
    if not linha:
        return {"falhas": 0, "bloqueadoAte": None}
    return {"falhas": linha["falhas"], "bloqueadoAte": linha["bloqueado_ate"]}


def registrar_falha_login(usuario: str, falhas: int, bloqueado_ate: str | None) -> None:
    conn = _conectar()
    conn.execute(
        """
        INSERT INTO tentativa_login (usuario, falhas, bloqueado_ate) VALUES (?, ?, ?)
        ON CONFLICT(usuario) DO UPDATE SET falhas = excluded.falhas, bloqueado_ate = excluded.bloqueado_ate
        """,
        (usuario.strip(), falhas, bloqueado_ate),
    )
    conn.commit()
    conn.close()


def limpar_tentativas_login(usuario: str) -> None:
    conn = _conectar()
    conn.execute("DELETE FROM tentativa_login WHERE usuario = ?", (usuario.strip(),))
    conn.commit()
    conn.close()


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
    """Remove o login e tudo que é exclusivamente dele - inclui a
    automação de Mídia Social (social_config): sem isso, um usuário
    removido continuaria automaticamente publicando no Instagram dele pra
    sempre, já que o agendador (social/scheduler.py) não olha credencial,
    só quem tem config ativa. Carteira de clientes e conversas do Copiloto
    ficam guardadas (só ficam inacessíveis, ninguém mais loga como esse
    usuário) - histórico do escritório, não um segredo de acesso como o
    token do Instagram."""
    usuario = usuario.strip()
    conn = _conectar()
    conn.execute("DELETE FROM credencial WHERE usuario = ?", (usuario,))
    conn.execute("DELETE FROM sessao WHERE usuario = ?", (usuario,))
    conn.execute("DELETE FROM uso_semanal WHERE usuario = ?", (usuario,))
    conn.execute("DELETE FROM uso_chat_diario WHERE usuario = ?", (usuario,))
    conn.execute("DELETE FROM social_config WHERE usuario = ?", (usuario,))
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
    "marcaNome": "ATLAS",
    "marcaHandle": "@atlas.tributos",
    "corFundoClaro": "#171B24",
    "corFundoEscuro": "#0B0D12",
    "corDestaque": "#D9A544",
    "logoPath": "",
    "estilo": "classico",
    "textoClaro": True,
    "fundo1Path": "",
    "fundo2Path": "",
    "posicaoVertical": "centro",
    "alinhamento": "centro",
}


def obter_social_config(usuario: str) -> dict:
    conn = _conectar()
    linha = conn.execute("SELECT * FROM social_config WHERE usuario = ?", (usuario,)).fetchone()
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
        "marcaNome": linha["marca_nome"] or "ATLAS",
        "marcaHandle": linha["marca_handle"] or "@atlas.tributos",
        "corFundoClaro": linha["cor_fundo_claro"] or "#171B24",
        "corFundoEscuro": linha["cor_fundo_escuro"] or "#0B0D12",
        "corDestaque": linha["cor_destaque"] or "#D9A544",
        "logoPath": linha["logo_path"] or "",
        "estilo": linha["estilo"] or "classico",
        "textoClaro": bool(linha["texto_claro"]),
        "fundo1Path": linha["fundo1_path"] or "",
        "fundo2Path": linha["fundo2_path"] or "",
        "posicaoVertical": linha["posicao_vertical"] or "centro",
        "alinhamento": linha["alinhamento"] or "centro",
    }


def salvar_social_config(usuario: str, dados: dict) -> dict:
    """Upsert da configuração deste usuário. Campos ausentes em `dados`
    mantêm o valor já salvo (permite, por ex., atualizar só os horários sem
    reenviar o token do Instagram)."""
    atual = obter_social_config(usuario)
    mesclado = {**atual, **{k: v for k, v in dados.items() if v is not None}}
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        """
        INSERT INTO social_config
            (usuario, ativo, temas, objetivos, tom, horarios, ig_access_token, ig_business_account_id,
             marca_nome, marca_handle, cor_fundo_claro, cor_fundo_escuro, cor_destaque, logo_path,
             estilo, texto_claro, fundo1_path, fundo2_path, posicao_vertical, alinhamento, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(usuario) DO UPDATE SET
            ativo = excluded.ativo, temas = excluded.temas, objetivos = excluded.objetivos,
            tom = excluded.tom, horarios = excluded.horarios,
            ig_access_token = excluded.ig_access_token,
            ig_business_account_id = excluded.ig_business_account_id,
            marca_nome = excluded.marca_nome, marca_handle = excluded.marca_handle,
            cor_fundo_claro = excluded.cor_fundo_claro, cor_fundo_escuro = excluded.cor_fundo_escuro,
            cor_destaque = excluded.cor_destaque, logo_path = excluded.logo_path,
            estilo = excluded.estilo, texto_claro = excluded.texto_claro,
            fundo1_path = excluded.fundo1_path, fundo2_path = excluded.fundo2_path,
            posicao_vertical = excluded.posicao_vertical, alinhamento = excluded.alinhamento,
            atualizado_em = excluded.atualizado_em
        """,
        (
            usuario,
            int(bool(mesclado["ativo"])),
            json.dumps(mesclado["temas"], ensure_ascii=False),
            mesclado["objetivos"],
            mesclado["tom"],
            json.dumps(mesclado["horarios"], ensure_ascii=False),
            mesclado["igAccessToken"],
            mesclado["igBusinessAccountId"],
            mesclado["marcaNome"],
            mesclado["marcaHandle"],
            mesclado["corFundoClaro"],
            mesclado["corFundoEscuro"],
            mesclado["corDestaque"],
            mesclado["logoPath"],
            mesclado["estilo"],
            int(bool(mesclado["textoClaro"])),
            mesclado["fundo1Path"],
            mesclado["fundo2Path"],
            mesclado["posicaoVertical"],
            mesclado["alinhamento"],
            agora,
        ),
    )
    conn.commit()
    conn.close()
    return obter_social_config(usuario)


def listar_usuarios_social_ativos() -> list[str]:
    """Todo usuário com a automação ligada (`ativo`) e pelo menos um
    horário configurado - usado pelo agendador pra saber pra quem montar
    jobs (ver social/scheduler.py: um job por usuário/horário, não um job
    global só)."""
    conn = _conectar()
    linhas = conn.execute(
        "SELECT usuario FROM social_config WHERE ativo = 1 AND horarios != '[]'"
    ).fetchall()
    conn.close()
    return [l["usuario"] for l in linhas]


def listar_social_decisoes_usadas(usuario: str) -> set[str]:
    conn = _conectar()
    linhas = conn.execute(
        "SELECT decisao_id FROM social_decisoes_usadas WHERE usuario = ?", (usuario,)
    ).fetchall()
    conn.close()
    return {l["decisao_id"] for l in linhas}


def marcar_social_decisao_usada(usuario: str, decisao_id: str) -> None:
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        "INSERT OR IGNORE INTO social_decisoes_usadas (usuario, decisao_id, usado_em) VALUES (?, ?, ?)",
        (usuario, decisao_id, agora),
    )
    conn.commit()
    conn.close()


def inserir_social_post(usuario: str, dados: dict) -> dict:
    id_ = uuid.uuid4().hex[:12]
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        """
        INSERT INTO social_posts (
            id, usuario, criado_em, decisao_id, titulo, paragrafo_destaque, headline2, sub2,
            legenda, gancho, imagem1_path, imagem2_path, status, post_id, permalink, erro_detalhe
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            id_, usuario, agora,
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


def listar_social_posts(usuario: str, limit: int = 30) -> list[dict]:
    conn = _conectar()
    linhas = conn.execute(
        "SELECT * FROM social_posts WHERE usuario = ? ORDER BY criado_em DESC LIMIT ?",
        (usuario, limit),
    ).fetchall()
    conn.close()
    return [_linha_social_post_para_dict(l) for l in linhas]


def ultimos_ganchos_social(usuario: str, n: int = 5) -> list[str]:
    conn = _conectar()
    linhas = conn.execute(
        "SELECT gancho FROM social_posts WHERE usuario = ? AND status = 'publicado' AND gancho != '' "
        "ORDER BY criado_em DESC LIMIT ?",
        (usuario, n),
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
