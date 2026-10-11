"""
Login local do ATLAS - multiusuário, mas sem cadastro aberto: o dono do
ATLAS (primeiro login, criado no bootstrap, sempre nível "admin") convida
cada pessoa da equipe pela tela "Usuários", escolhendo só o nível de
acesso dela (básico/intermediário/plus). O convite vira um link de uso
único (ver criar_convite/aceitar_convite) que o dono manda pra pessoa por
fora da plataforma (WhatsApp, e-mail etc) - é a própria pessoa quem
escolhe seu usuário e senha ao abrir o link, então ninguém (nem o dono)
fica sabendo o login de mais ninguém.

Senha nunca é guardada em texto puro - PBKDF2-HMAC-SHA256 com salt
aleatório por credencial (só a biblioteca padrão do Python, sem
dependência nova). Sessão é um token aleatório opaco guardado no SQLite
(sobrevive a reinicio do backend), amarrado ao usuário que a criou, e
devolvida ao navegador como cookie HttpOnly - o front nunca vê nem
manipula o token diretamente.

Níveis de acesso: admin (o dono - sem limite nenhum) e três níveis pra
equipe, cada um com um teto semanal combinado de pareceres+posts gerados
e (a partir do intermediário) um orçamento diário em USD pro chat do
Copiloto ATLAS - básico não tem chat. O custo do chat é estimado a partir
dos tokens reais que a Claude API devolve em cada resposta (ver
registrar_gasto_chat), não é um valor fixo por pergunta. Básico também
não tem Minha Carteira nem Estúdio Visual - só Radar e Notícias (ver
recursosAvancados).
"""
import hashlib
import secrets
from datetime import datetime, timedelta

import app_db

ITERACOES_PBKDF2 = 200_000
DURACAO_SESSAO_DIAS = 30
DURACAO_CONVITE_DIAS = 7
_SALT_FANTASMA = "0" * 32  # usado só pra gastar o mesmo tempo de CPU quando o usuário não existe

NIVEIS_CRIAVEIS = ("basico", "intermediario", "plus")  # "admin" só existe via bootstrap

# Preço aproximado de um modelo Claude classe Sonnet (USD por milhão de
# tokens) - usado só pra estimar o gasto do chat contra o orçamento diário
# de cada nível, não precisa bater centavo a centavo com a fatura real.
_PRECO_ENTRADA_POR_MTOK_USD = 3.0
_PRECO_SAIDA_POR_MTOK_USD = 15.0

LIMITES_NIVEL = {
    "basico": {
        "chat": False, "chatUsdDia": 0.0, "pareceresPostsSemana": 10,
        "recursosAvancados": False,
    },
    "intermediario": {
        "chat": True, "chatUsdDia": 1.0, "pareceresPostsSemana": 15,
        "recursosAvancados": True,
    },
    "plus": {
        "chat": True, "chatUsdDia": 2.0, "pareceresPostsSemana": 30,
        "recursosAvancados": True,
    },
    "admin": {
        "chat": True, "chatUsdDia": None, "pareceresPostsSemana": None,
        "recursosAvancados": True,
    },
}


def _hash_senha(senha: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", senha.encode("utf-8"), salt.encode("utf-8"), ITERACOES_PBKDF2
    ).hex()


def esta_configurado() -> bool:
    """Verdadeiro assim que existir pelo menos um login - controla se o
    app ainda precisa passar pelo bootstrap (criar o primeiro login)."""
    return app_db.credencial_existe()


def criar_primeiro_usuario(usuario: str, senha: str) -> None:
    """Bootstrap: cria o dono do ATLAS (nível admin, sem limite nenhum).
    Só deve ser chamada quando ainda não existe nenhum login (ver
    esta_configurado)."""
    salt = secrets.token_hex(16)
    senha_hash = _hash_senha(senha, salt)
    app_db.criar_usuario(usuario.strip(), senha_hash, salt, "admin")


def criar_usuario(usuario: str, senha: str, nivel: str) -> None:
    if nivel not in NIVEIS_CRIAVEIS:
        raise ValueError(f"Nível inválido: {nivel!r} (use um de {NIVEIS_CRIAVEIS})")
    salt = secrets.token_hex(16)
    senha_hash = _hash_senha(senha, salt)
    app_db.criar_usuario(usuario.strip(), senha_hash, salt, nivel)


def registrar_aceite_termos(usuario: str) -> None:
    """Registra quando esta conta aceitou os Termos de Uso/Política de
    Privacidade (ver /auth/registro) - fica só como registro/auditoria, o
    acesso em si não depende disso (contas criadas pelo admin pra equipe,
    antes de existir cadastro aberto, nunca passam por aqui)."""
    app_db.registrar_aceite_termos(usuario)


def listar_usuarios() -> list[dict]:
    return app_db.listar_usuarios()


def remover_usuario(usuario: str) -> None:
    app_db.remover_usuario(usuario)


# --- convites de acesso (ver docstring do módulo) -------------------------

def _agora() -> datetime:
    return datetime.now()


def criar_convite(nivel: str, rotulo: str, criado_por: str) -> str:
    if nivel not in NIVEIS_CRIAVEIS:
        raise ValueError(f"Nível inválido: {nivel!r} (use um de {NIVEIS_CRIAVEIS})")
    token = secrets.token_urlsafe(24)
    expira_em = (_agora() + timedelta(days=DURACAO_CONVITE_DIAS)).strftime("%Y-%m-%dT%H:%M:%S")
    app_db.criar_convite(token, nivel, rotulo.strip(), criado_por, expira_em)
    return token


def listar_convites() -> list[dict]:
    return app_db.listar_convites()


def remover_convite(token: str) -> None:
    app_db.remover_convite(token)


def validar_convite(token: str) -> dict | None:
    """{"nivel": ..., "rotulo": ...} se o convite existe, não foi usado e
    não expirou - None caso contrário (a página de aceitar mostra "convite
    inválido ou já usado" sem distinguir o motivo, pra não vazar detalhe
    de convite alheio)."""
    convite = app_db.obter_convite(token)
    if not convite or convite["usadoEm"]:
        return None
    if convite["expiraEm"] <= _agora().strftime("%Y-%m-%dT%H:%M:%S"):
        return None
    return {"nivel": convite["nivel"], "rotulo": convite["rotulo"]}


def aceitar_convite(token: str, usuario: str, senha: str) -> str | None:
    """Cria o login com o nível embutido no convite e marca o convite como
    usado - devolve o nível criado, ou None se o convite não era mais
    válido (checagem de novo aqui, não só na validação anterior: evita
    corrida de dois aceites simultâneos do mesmo link)."""
    info = validar_convite(token)
    if not info:
        return None
    criar_usuario(usuario, senha, info["nivel"])
    app_db.marcar_convite_usado(token, usuario.strip())
    return info["nivel"]


def verificar_login(usuario: str, senha: str) -> bool:
    credencial = app_db.obter_credencial(usuario)
    if not credencial:
        _hash_senha(senha, _SALT_FANTASMA)  # normaliza o tempo de resposta
        return False
    senha_hash = _hash_senha(senha, credencial["senhaSalt"])
    return secrets.compare_digest(credencial["senhaHash"], senha_hash)


def criar_sessao(usuario: str) -> str:
    token = secrets.token_urlsafe(32)
    expira_em = (datetime.now() + timedelta(days=DURACAO_SESSAO_DIAS)).strftime(
        "%Y-%m-%dT%H:%M:%S"
    )
    app_db.criar_sessao(token, usuario.strip(), expira_em)
    return token


def sessao_info(token: str | None) -> dict | None:
    """{"usuario": ..., "nivel": ...} de quem está por trás do token, ou
    None se a sessão não existe/expirou."""
    return app_db.sessao_info(token) if token else None


def usuario_da_sessao(token: str | None) -> str | None:
    info = sessao_info(token)
    return info["usuario"] if info else None


def sessao_valida(token: str | None) -> bool:
    return sessao_info(token) is not None


def encerrar_sessao(token: str | None) -> None:
    if token:
        app_db.apagar_sessao(token)


# --- cota de uso (pareceres/posts por semana, chat por dia) --------------

def _semana_atual() -> str:
    ano, semana, _ = datetime.now().isocalendar()
    return f"{ano}-W{semana:02d}"


def _dia_atual() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def status_cota(usuario: str, nivel: str) -> dict:
    """Usado por /auth/status e pela tela Usuários - dá pro front mostrar
    quanto já foi usado e qual o teto de cada coisa, sem duplicar essa
    conta no lado do cliente."""
    limites = LIMITES_NIVEL.get(nivel, LIMITES_NIVEL["basico"])
    return {
        "limites": limites,
        "uso": {
            "pareceresPostsSemana": app_db.uso_semanal(usuario, _semana_atual()),
            "chatUsdHoje": round(app_db.uso_chat_diario(usuario, _dia_atual()), 4),
        },
    }


def verificar_cota_geracao(usuario: str, nivel: str) -> tuple[bool, int | None]:
    """(permitido, limite) - limite é None quando o nível não tem teto
    (admin). Usado antes de gerar parecer/post/carrossel."""
    limite = LIMITES_NIVEL.get(nivel, LIMITES_NIVEL["basico"])["pareceresPostsSemana"]
    if limite is None:
        return True, None
    usados = app_db.uso_semanal(usuario, _semana_atual())
    return usados < limite, limite


def registrar_geracao(usuario: str) -> None:
    app_db.registrar_uso_semanal(usuario, _semana_atual())


def verificar_chat_permitido(usuario: str, nivel: str) -> tuple[bool, str | None]:
    """(permitido, motivo_do_bloqueio) - motivo é None quando permitido."""
    limites = LIMITES_NIVEL.get(nivel, LIMITES_NIVEL["basico"])
    if not limites["chat"]:
        return False, "Seu nível de acesso não inclui o Copiloto ATLAS."
    limite_usd = limites["chatUsdDia"]
    if limite_usd is None:
        return True, None
    gasto = app_db.uso_chat_diario(usuario, _dia_atual())
    if gasto >= limite_usd:
        return False, (
            f"Orçamento diário do chat (US$ {limite_usd:.2f}) foi atingido. Volta amanhã."
        )
    return True, None


def verificar_recursos_avancados(nivel: str) -> bool:
    """Minha Carteira e Estúdio Visual - básico não tem, todos os outros
    níveis (a partir de intermediário) têm."""
    limites = LIMITES_NIVEL.get(nivel, LIMITES_NIVEL["basico"])
    return limites["recursosAvancados"]


def registrar_gasto_chat(usuario: str, tokens_entrada: int, tokens_saida: int) -> None:
    custo_usd = (
        (tokens_entrada / 1_000_000) * _PRECO_ENTRADA_POR_MTOK_USD
        + (tokens_saida / 1_000_000) * _PRECO_SAIDA_POR_MTOK_USD
    )
    app_db.registrar_gasto_chat(usuario, _dia_atual(), custo_usd)
