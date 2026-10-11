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
# ATLAS_DATA_DIR aponta o SQLite pra fora da pasta do código - em produção
# (Railway) é o mount de um volume persistente, pra login/clientes/cota
# sobreviverem a um redeploy. Sem essa variável (uso local, dentro do
# zip), continua gravando em backend/database/ como sempre foi.
_PASTA_DADOS = os.getenv("ATLAS_DATA_DIR") or os.path.join(PASTA_BASE, "database")
CAMINHO_DB = os.path.join(_PASTA_DADOS, "atlas_app.db")


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
    # Login local - cada login (usuário/senha) é criado pelo dono do ATLAS
    # na tela "Usuários" (equipe) OU pelo próprio cadastro aberto em
    # /auth/registro (nível sempre "basico" nesse caso). Ver auth.py.
    # "nivel" controla o que a pessoa pode fazer no app (admin/basico/
    # intermediario/plus) - ver LIMITES_NIVEL em auth.py. termos_aceitos_em
    # só é preenchido por quem passou pelo cadastro aberto (aceite
    # explícito dos Termos de Uso/Política de Privacidade); contas criadas
    # manualmente pelo admin pra equipe não passam por essa tela.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS credencial (
            usuario TEXT PRIMARY KEY,
            senha_hash TEXT NOT NULL,
            senha_salt TEXT NOT NULL,
            nivel TEXT NOT NULL DEFAULT 'basico',
            criado_em TEXT,
            termos_aceitos_em TEXT
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
    # Modelo de estilo visual salvo (fonte, tamanhos, cor, estilos de
    # destaque) - pra não precisar reconfigurar tudo a cada post (ver
    # InstagramWorkspace/estúdio visual). Compartilhado entre toda a
    # equipe (mesma lógica de "clientes"), não é preferência pessoal de
    # ninguém - é o estilo padrão do escritório.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS modelo_visual (
            id TEXT PRIMARY KEY,
            nome TEXT NOT NULL,
            config_json TEXT NOT NULL,
            criado_por TEXT NOT NULL,
            criado_em TEXT
        )
    """)
    # Cache da análise de conteúdo B2B (ver ai/analise_conteudo.py e
    # economics/indice_prospeccao.py) - calculada uma vez por decisão/
    # notícia (chamada de IA tem custo), reaproveitada depois. "tipo"
    # distingue "opportunities" de "news" porque os dois têm o mesmo
    # formato de id (hash), então precisam de chave composta.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS analise_conteudo (
            id TEXT NOT NULL,
            tipo TEXT NOT NULL,
            indice_json TEXT NOT NULL,
            analise_json TEXT NOT NULL,
            calculado_em TEXT,
            PRIMARY KEY (id, tipo)
        )
    """)
    # Convite de acesso - o dono nunca escolhe usuário/senha de ninguém (ver
    # auth.py): gera um link de uso único com o nível já embutido, manda pra
    # pessoa por fora da plataforma, e é ela quem escolhe o próprio login ao
    # abrir o link. "rotulo" é só uma anotação livre do dono pra lembrar pra
    # quem mandou cada convite (ex: "João - jurídico") - nunca é usuário nem
    # senha de ninguém.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS convite (
            token TEXT PRIMARY KEY,
            nivel TEXT NOT NULL,
            rotulo TEXT,
            criado_por TEXT NOT NULL,
            criado_em TEXT,
            expira_em TEXT,
            usado_em TEXT,
            usuario_criado TEXT
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
    conn.commit()
    _migrar_credenciais_legado(conn)
    _migrar_credencial_termos(conn)
    conn.close()


def _migrar_credencial_termos(conn: sqlite3.Connection) -> None:
    """Bancos de antes do cadastro aberto existir não têm a coluna de
    aceite dos Termos de Uso/Política de Privacidade - só passa a existir
    daqui pra frente, pra quem se cadastrar sozinho (ver /auth/registro)."""
    colunas = {l[1] for l in conn.execute("PRAGMA table_info(credencial)")}
    if "termos_aceitos_em" not in colunas:
        conn.execute("ALTER TABLE credencial ADD COLUMN termos_aceitos_em TEXT")
        conn.commit()


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


def registrar_aceite_termos(usuario: str) -> None:
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        "UPDATE credencial SET termos_aceitos_em = ? WHERE usuario = ?", (agora, usuario.strip())
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


# --- convites de acesso ---------------------------------------------------

def criar_convite(token: str, nivel: str, rotulo: str, criado_por: str, expira_em: str) -> None:
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        "INSERT INTO convite (token, nivel, rotulo, criado_por, criado_em, expira_em) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (token, nivel, rotulo or None, criado_por, agora, expira_em),
    )
    conn.commit()
    conn.close()


def listar_convites() -> list[dict]:
    conn = _conectar()
    linhas = conn.execute("SELECT * FROM convite ORDER BY criado_em DESC").fetchall()
    conn.close()
    return [_linha_convite_para_dict(l) for l in linhas]


def obter_convite(token: str) -> dict | None:
    conn = _conectar()
    linha = conn.execute("SELECT * FROM convite WHERE token = ?", (token,)).fetchone()
    conn.close()
    return _linha_convite_para_dict(linha) if linha else None


def marcar_convite_usado(token: str, usuario: str) -> None:
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        "UPDATE convite SET usado_em = ?, usuario_criado = ? WHERE token = ?",
        (agora, usuario, token),
    )
    conn.commit()
    conn.close()


def remover_convite(token: str) -> bool:
    conn = _conectar()
    cur = conn.execute("DELETE FROM convite WHERE token = ?", (token,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def _linha_convite_para_dict(linha: sqlite3.Row) -> dict:
    return {
        "token": linha["token"],
        "nivel": linha["nivel"],
        "rotulo": linha["rotulo"],
        "criadoPor": linha["criado_por"],
        "criadoEm": linha["criado_em"],
        "expiraEm": linha["expira_em"],
        "usadoEm": linha["usado_em"],
        "usuarioCriado": linha["usuario_criado"],
    }


# --- cache de análise de conteúdo B2B -------------------------------------

def obter_analise_conteudo(id_: str, tipo: str) -> dict | None:
    conn = _conectar()
    linha = conn.execute(
        "SELECT * FROM analise_conteudo WHERE id = ? AND tipo = ?", (id_, tipo)
    ).fetchone()
    conn.close()
    if not linha:
        return None
    return {
        "indice": json.loads(linha["indice_json"]),
        "analise": json.loads(linha["analise_json"]),
        "calculadoEm": linha["calculado_em"],
    }


def salvar_analise_conteudo(id_: str, tipo: str, indice: dict, analise: dict) -> None:
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        """
        INSERT INTO analise_conteudo (id, tipo, indice_json, analise_json, calculado_em)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id, tipo) DO UPDATE SET
            indice_json = excluded.indice_json,
            analise_json = excluded.analise_json,
            calculado_em = excluded.calculado_em
        """,
        (id_, tipo, json.dumps(indice, ensure_ascii=False), json.dumps(analise, ensure_ascii=False), agora),
    )
    conn.commit()
    conn.close()


def listar_analises_conteudo(tipo: str) -> dict[str, dict]:
    """{id: {"indice":..., "analise":..., "calculadoEm":...}} de tudo que já
    foi calculado pra esse tipo - usado pra saber, sem recalcular, quais
    itens da shortlist do dia já têm análise pronta."""
    conn = _conectar()
    linhas = conn.execute(
        "SELECT * FROM analise_conteudo WHERE tipo = ?", (tipo,)
    ).fetchall()
    conn.close()
    return {
        l["id"]: {
            "indice": json.loads(l["indice_json"]),
            "analise": json.loads(l["analise_json"]),
            "calculadoEm": l["calculado_em"],
        }
        for l in linhas
    }


# --- modelo de estilo visual salvo ----------------------------------------

def criar_modelo_visual(nome: str, config: dict, criado_por: str) -> dict:
    id_ = uuid.uuid4().hex[:12]
    agora = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn = _conectar()
    conn.execute(
        "INSERT INTO modelo_visual (id, nome, config_json, criado_por, criado_em) VALUES (?, ?, ?, ?, ?)",
        (id_, nome, json.dumps(config, ensure_ascii=False), criado_por, agora),
    )
    conn.commit()
    conn.close()
    return {"id": id_, "nome": nome, "config": config, "criadoPor": criado_por, "criadoEm": agora}


def listar_modelos_visuais() -> list[dict]:
    conn = _conectar()
    linhas = conn.execute("SELECT * FROM modelo_visual ORDER BY criado_em DESC").fetchall()
    conn.close()
    return [
        {
            "id": l["id"],
            "nome": l["nome"],
            "config": json.loads(l["config_json"]),
            "criadoPor": l["criado_por"],
            "criadoEm": l["criado_em"],
        }
        for l in linhas
    ]


def remover_modelo_visual(id_: str) -> bool:
    conn = _conectar()
    cur = conn.execute("DELETE FROM modelo_visual WHERE id = ?", (id_,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


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
