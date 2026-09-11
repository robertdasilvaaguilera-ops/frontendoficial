"""
Palavras-chave de filtro da ATLAS.
Baseadas diretamente na Biblioteca de Conteúdo (Etapa 4): oportunidades
tributárias, riscos societários e erros financeiros.

Ajuste livremente — este é o coração do "motor de classificação"
mencionado na estratégia. Quanto mais preciso, menos ruído entra
na planilha de oportunidades.
"""

TRIBUTARIO = [
    "irpj", "pis", "cofins", "icms", "iss", "issqn",
    "lucro presumido", "lucro real", "simples nacional",
    "carf", "transação tributária", "parcelamento",
    "crédito tributário", "substituição tributária", "icms-st",
    "reforma tributária", "solução de consulta", "compensação tributária",
    "regime tributário", "planejamento tributário", "holding",
]

SOCIETARIO = [
    "contrato social", "acordo de sócios", "sucessão empresarial",
    "holding familiar", "dissolução de sociedade", "sociedade limitada",
    "desconsideração da personalidade jurídica", "sócio", "quotista",
    "cisão", "incorporação", "fusão", "governança corporativa",
]

FINANCEIRO = [
    "fluxo de caixa", "capital de giro", "inadimplência",
    "recuperação judicial", "endividamento", "crédito empresarial",
    "taxa de juros", "financiamento empresarial", "cet",
    "renegociação de dívida",
]

SETORES = [
    "revenda de veículos", "concessionária", "clínica médica",
    "clínica odontológica", "indústria", "varejo", "comércio",
    "prestação de serviços", "agronegócio",
]

TODAS_PALAVRAS = TRIBUTARIO + SOCIETARIO + FINANCEIRO + SETORES


def classificar(texto: str) -> list[str]:
    """
    Recebe um texto (título + resumo de uma notícia) e retorna
    as categorias que bateram (ex: ['tributario', 'setor']).
    Não usa IA — apenas correspondência de palavra-chave (Sprint 1).
    """
    texto_lower = texto.lower()
    categorias = []
    if any(p in texto_lower for p in TRIBUTARIO):
        categorias.append("tributario")
    if any(p in texto_lower for p in SOCIETARIO):
        categorias.append("societario")
    if any(p in texto_lower for p in FINANCEIRO):
        categorias.append("financeiro")
    if any(p in texto_lower for p in SETORES):
        categorias.append("setor_especifico")
    return categorias


def contem_palavra_chave(texto: str) -> bool:
    """Retorno rápido: vale a pena guardar essa notícia?"""
    texto_lower = texto.lower()
    return any(p in texto_lower for p in TODAS_PALAVRAS)
