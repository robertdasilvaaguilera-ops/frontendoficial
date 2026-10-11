"""
Índice de Potencial de Conteúdo/Prospecção - pontuação ponderada (0-100)
que decide QUAIS decisões do dia valem virar post de Instagram, antes de
gastar uma chamada de IA em cada uma. Não é o mesmo critério do índice
ATLAS (economics/indice_atlas.py, que prioriza pra parecer/dashboard) -
aqui o que importa é "isso tem potencial de virar conteúdo que atrai
cliente pra um advogado/contador", não só relevância jurídica.

Formula (0-100), cada peso documentado pra poder ajustar com dado real de
desempenho no Instagram mais adiante (ver app_db.analise_conteudo):
  Alcance de empresas       0-25  (empresas_afetadas, escala log - quanto
                                    mais empresas, mais gente se reconhece
                                    no post)
  Impacto econômico         0-20  (economia_estimada, escala log)
  Setor definido            0-20  (sem setor identificado não dá pra mirar
                                    público-alvo nem imagem contextual -
                                    tudo-ou-nada, não escala)
  Novidade/urgência         0-15  (inédito > reforço > consolidado - notícia
                                    "quente" tem mais potencial de
                                    compartilhamento que jurisprudência
                                    pacificada)
  Autoridade da fonte       0-10  (STF/STJ pacifica tese pro Brasil todo;
                                    CARF é relevante mas só administrativo;
                                    demais tribunais, alcance mais local)
  Mecanismo identificado    0-10  (mecanismo econômico claro = ângulo de
                                    conteúdo claro, "o que fazer" objetivo)

Essa pontuação roda em TODOS os itens do dia (é só aritmética sobre
colunas já calculadas pelo pipeline - main.py, estimator.py - nenhuma
chamada de IA aqui), pra escolher uma shortlist barata. Só a shortlist
(as N melhores) passa pela análise de público-alvo/ângulo via Claude (ver
ai/analise_conteudo.py) - análise de IA em toda decisão do dia não
escalaria em custo.
"""
import math
import re

TETO_EMPRESAS = 20_000_000
TETO_ECONOMIA = 10_000_000

_SIGLAS_TRIBUNAL = ["STF", "STJ", "CARF", "TRF1", "TRF2", "TRF3", "TRF4", "TRF5", "TRF6", "PGFN"]
_AUTORIDADE_TRIBUNAL = {
    "STF": 10, "STJ": 10,  # pacifica tese pro Brasil inteiro - alcance nacional
    "CARF": 7,             # relevante, mas só esfera administrativa federal
    "PGFN": 5,
}


def _escala_log(valor: float, teto_referencia: float, peso_maximo: float) -> float:
    if valor <= 0:
        return 0.0
    log_valor = math.log10(valor + 1)
    log_teto = math.log10(teto_referencia + 1)
    return min(peso_maximo, (log_valor / log_teto) * peso_maximo)


def _autoridade_da_fonte(fonte: str) -> float:
    fonte = str(fonte or "")
    for sigla in _SIGLAS_TRIBUNAL:
        if sigla in fonte:
            return _AUTORIDADE_TRIBUNAL.get(sigla, 4)
    return 3.0  # TRFs regionais e demais fontes - alcance mais local


def _novidade(item: dict) -> float:
    if str(item.get("inov_nova_interpretacao", "")).lower() == "true":
        return 15.0
    if str(item.get("inov_diverge", "")).lower() == "true":
        return 9.0
    return 4.0


def calcular_indice_prospeccao(item: dict) -> dict:
    """item: linha bruta do pipeline (dict ou pandas.Series) - mesmas
    colunas que main.py grava (empresas_afetadas, economia_estimada,
    setor_identificado, mecanismo_economico, fonte, inov_*)."""
    empresas = float(item.get("empresas_afetadas", 0) or 0)
    economia = float(item.get("economia_estimada", 0) or 0)
    setor_identificado = str(item.get("setor_identificado", "") or "").strip()
    mecanismo = str(item.get("mecanismo_economico", "") or "").strip()
    fonte = item.get("fonte", "")

    alcance = _escala_log(empresas, TETO_EMPRESAS, 25)
    impacto = _escala_log(economia, TETO_ECONOMIA, 20)
    setor = 20.0 if setor_identificado else 0.0
    novidade = _novidade(item)
    autoridade = _autoridade_da_fonte(fonte)
    mecanismo_pontos = 10.0 if mecanismo else 0.0

    total = round(alcance + impacto + setor + novidade + autoridade + mecanismo_pontos, 1)

    return {
        "indiceProspeccao": min(100.0, total),
        "subscores": {
            "alcanceEmpresas": round(alcance, 1),
            "impactoEconomico": round(impacto, 1),
            "setorDefinido": setor,
            "novidade": round(novidade, 1),
            "autoridadeFonte": round(autoridade, 1),
            "mecanismoIdentificado": mecanismo_pontos,
        },
    }
