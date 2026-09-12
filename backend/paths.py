"""
Caminhos de dados persistentes (banco SQLite do app, Excel de decisões
coletadas, cache derivado, log de itens já vistos) - centralizados aqui
pra funcionarem igual em dev local (relativos à pasta do backend) e em
produção, onde ATLAS_DATA_DIR aponta pro volume persistente do Railway.

Sem isso, cada novo deploy reconstrói o container do zero: qualquer
arquivo gravado fora do volume persistente (login, clientes, decisões
coletadas, histórico do Copiloto, config e histórico da automação de
Mídia Social) desaparece - foi exatamente o que intitulou esse módulo a
existir (ver conversa/commit que o introduziu).
"""
import os

PASTA_BACKEND = os.path.dirname(os.path.abspath(__file__))
DIR_DADOS = os.getenv("ATLAS_DATA_DIR", "").strip() or PASTA_BACKEND


def caminho(*partes: str) -> str:
    """Caminho absoluto dentro de DIR_DADOS - cria os diretórios pai se
    ainda não existirem (o volume do Railway começa vazio)."""
    caminho_final = os.path.join(DIR_DADOS, *partes)
    os.makedirs(os.path.dirname(caminho_final), exist_ok=True)
    return caminho_final
