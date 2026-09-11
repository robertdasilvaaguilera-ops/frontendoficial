"""
Indice ATLAS - pontuacao ponderada multi-fator (substitui usar so o
"score" de palavra-chave como criterio de prioridade).

Formula (0-100):
  Impacto economico       0-25  (economia_estimada, escala log)
  Alcance empresarial     0-20  (empresas_afetadas, escala log)
  Seguranca juridica      0-15  (tese consolidada > individual; favoravel > neutro)
  Potencial comercial     0-15  (setor identificado + parecer gerado)
  Urgencia/Risco de acao  0-15  (risco alto = mais urgente agir)
  Complexidade (inverso)  0-10  (mecanismo identificado = mais simples de comunicar)

Escala log usada para impacto/alcance porque a distribuicao de valores
reais e muito assimetrica.
"""
import math


def _escala_log(valor: float, teto_referencia: float, peso_maximo: float) -> float:
    if valor <= 0:
        return 0.0
    log_valor = math.log10(valor + 1)
    log_teto = math.log10(teto_referencia + 1)
    return min(peso_maximo, (log_valor / log_teto) * peso_maximo)


def calcular_indice_atlas(item: dict) -> dict:
    economia = float(item.get("economia_estimada", 0) or 0)
    empresas = float(item.get("empresas_afetadas", 0) or 0)
    risco = float(item.get("risco", 0) or 0)
    tipo_decisao = str(item.get("tipo_decisao", "") or "")
    natureza_mecanismo = str(item.get("natureza_mecanismo", "") or "")
    setor_identificado = str(item.get("setor_identificado", "") or "")
    parecer = str(item.get("parecer", "") or "")
    mecanismo = str(item.get("mecanismo_economico", "") or "")

    impacto_economico = _escala_log(economia, teto_referencia=10_000_000, peso_maximo=25)
    alcance_empresarial = _escala_log(empresas, teto_referencia=20_000_000, peso_maximo=20)

    seguranca_juridica = 5.0
    if tipo_decisao == "tese":
        seguranca_juridica += 7
    if natureza_mecanismo == "oportunidade":
        seguranca_juridica += 3

    potencial_comercial = 0.0
    if setor_identificado:
        potencial_comercial += 8
    if parecer and parecer != "nan":
        potencial_comercial += 7

    urgencia = (risco / 100) * 15
    complexidade = 10.0 if mecanismo else 5.0

    total = round(
        impacto_economico + alcance_empresarial + seguranca_juridica +
        potencial_comercial + urgencia + complexidade, 1
    )

    return {
        "indice_atlas": min(100, total),
        "indice_impacto_economico": round(impacto_economico, 1),
        "indice_alcance_empresarial": round(alcance_empresarial, 1),
        "indice_seguranca_juridica": round(seguranca_juridica, 1),
        "indice_potencial_comercial": round(potencial_comercial, 1),
        "indice_urgencia": round(urgencia, 1),
        "indice_complexidade": round(complexidade, 1),
    }
