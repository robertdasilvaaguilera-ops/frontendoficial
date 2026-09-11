"""
Simulador de regime tributario - portado e CORRIGIDO da planilha
SIDE_Modulo_T01_Diagnostico_Tributario.xlsx do usuario.

BUGS ENCONTRADOS NA PLANILHA ORIGINAL (corrigidos aqui):
1. Aba "Comparativo", celula B25 (Total de Tributos - Lucro Presumido):
   a formula soma B22+B23+B24+B20+B18 (ISS+ICMS+CPP+CSLL+IRPJ) mas
   ESQUECE de somar B21 (PIS+COFINS) - subestimava o total.
2. Secao final (linhas 54-61), que quebrava tributo por "regime mais
   vantajoso": referenciava celulas erradas (ex: IRPJ do Lucro
   Presumido apontando para B7, que e "Valor Anual Estimado" do
   Simples Nacional) - por isso todos os valores davam zero. Refeito
   do zero aqui.

Mantidas as aliquotas e faixas exatamente como a planilha original
definia (Simples Nacional Anexo I/II/III, presuncoes de Lucro
Presumido, aliquotas de Lucro Real).
"""
from dataclasses import dataclass, field

ANEXO_I_COMERCIO = [
    (180_000, 0.04, 0),
    (360_000, 0.073, 5_940),
    (720_000, 0.095, 13_860),
    (1_800_000, 0.107, 22_500),
    (3_600_000, 0.143, 87_300),
    (4_800_000, 0.19, 378_000),
]
ANEXO_III_SERVICOS = [
    (180_000, 0.06, 0),
    (360_000, 0.112, 9_360),
    (720_000, 0.135, 17_640),
    (1_800_000, 0.16, 35_640),
    (3_600_000, 0.21, 125_640),
    (4_800_000, 0.33, 648_000),
]

LIMITE_SIMPLES = 4_800_000
LIMITE_PRESUMIDO = 78_000_000

PRESUNCAO_IRPJ_COMERCIO = 0.08
PRESUNCAO_IRPJ_SERVICOS = 0.32
PRESUNCAO_CSLL_COMERCIO = 0.12
PRESUNCAO_CSLL_SERVICOS = 0.32

ALIQUOTA_IRPJ = 0.15
ADICIONAL_IRPJ = 0.10
LIMITE_ANUAL_SEM_ADICIONAL = 240_000
ALIQUOTA_CSLL = 0.09

PIS_CUMULATIVO = 0.0065
COFINS_CUMULATIVO = 0.03
PIS_NAO_CUMULATIVO = 0.0165
COFINS_NAO_CUMULATIVO = 0.076

ALIQUOTA_ISS = 0.05
ALIQUOTA_ICMS = 0.18
CPP_PATRONAL = 0.20


@dataclass
class ResultadoRegime:
    regime: str
    total_tributos_anual: float
    percentual_efetivo: float
    detalhamento: dict = field(default_factory=dict)


def _aliquota_efetiva_simples(faturamento_12m: float, tabela: list) -> tuple:
    for limite, aliquota, deducao in tabela:
        if faturamento_12m <= limite:
            if faturamento_12m == 0:
                return (aliquota, deducao, 0)
            aliquota_efetiva = ((faturamento_12m * aliquota) - deducao) / faturamento_12m
            return (aliquota, deducao, max(0, aliquota_efetiva))
    limite, aliquota, deducao = tabela[-1]
    aliquota_efetiva = ((faturamento_12m * aliquota) - deducao) / faturamento_12m
    return (aliquota, deducao, max(0, aliquota_efetiva))


def simular_simples_nacional(receita_comercio: float, receita_servicos: float) -> ResultadoRegime:
    faturamento_total = receita_comercio + receita_servicos

    if faturamento_total > LIMITE_SIMPLES:
        return ResultadoRegime("Simples Nacional", 0, 0,
                                {"erro": f"Faturamento acima do limite de R$ {LIMITE_SIMPLES:,.0f}".replace(",", ".")})

    _, _, aliq_ef_comercio = _aliquota_efetiva_simples(faturamento_total, ANEXO_I_COMERCIO) if receita_comercio > 0 else (0, 0, 0)
    _, _, aliq_ef_servicos = _aliquota_efetiva_simples(faturamento_total, ANEXO_III_SERVICOS) if receita_servicos > 0 else (0, 0, 0)

    das_comercio = receita_comercio * aliq_ef_comercio
    das_servicos = receita_servicos * aliq_ef_servicos
    total = das_comercio + das_servicos

    return ResultadoRegime(
        "Simples Nacional", round(total, 2),
        round(total / faturamento_total, 4) if faturamento_total else 0,
        {"DAS (comércio)": round(das_comercio, 2), "DAS (serviços)": round(das_servicos, 2)},
    )


def simular_lucro_presumido(receita_comercio: float, receita_servicos: float, folha_salarial: float) -> ResultadoRegime:
    faturamento_total = receita_comercio + receita_servicos

    base_irpj = (receita_comercio * PRESUNCAO_IRPJ_COMERCIO) + (receita_servicos * PRESUNCAO_IRPJ_SERVICOS)
    irpj = (base_irpj * ALIQUOTA_IRPJ) + max(0, (base_irpj - LIMITE_ANUAL_SEM_ADICIONAL) * ADICIONAL_IRPJ)

    base_csll = (receita_comercio * PRESUNCAO_CSLL_COMERCIO) + (receita_servicos * PRESUNCAO_CSLL_SERVICOS)
    csll = base_csll * ALIQUOTA_CSLL

    pis_cofins = (PIS_CUMULATIVO + COFINS_CUMULATIVO) * faturamento_total

    iss = receita_servicos * ALIQUOTA_ISS
    icms = receita_comercio * ALIQUOTA_ICMS
    cpp = folha_salarial * CPP_PATRONAL

    total = irpj + csll + pis_cofins + iss + icms + cpp

    return ResultadoRegime(
        "Lucro Presumido", round(total, 2),
        round(total / faturamento_total, 4) if faturamento_total else 0,
        {
            "IRPJ": round(irpj, 2), "CSLL": round(csll, 2),
            "PIS/COFINS": round(pis_cofins, 2), "ISS": round(iss, 2),
            "ICMS": round(icms, 2), "CPP Patronal": round(cpp, 2),
        },
    )


def simular_lucro_real(receita_comercio: float, receita_servicos: float, cmv: float,
                        despesas_operacionais: float, folha_salarial: float) -> ResultadoRegime:
    faturamento_total = receita_comercio + receita_servicos
    lucro_liquido = faturamento_total - cmv - despesas_operacionais - folha_salarial

    irpj = (lucro_liquido * ALIQUOTA_IRPJ) + max(0, (lucro_liquido - LIMITE_ANUAL_SEM_ADICIONAL) * ADICIONAL_IRPJ) if lucro_liquido > 0 else 0
    csll = lucro_liquido * ALIQUOTA_CSLL if lucro_liquido > 0 else 0

    pis_cofins = (faturamento_total * (PIS_NAO_CUMULATIVO + COFINS_NAO_CUMULATIVO)) - \
                 (cmv * (PIS_NAO_CUMULATIVO + COFINS_NAO_CUMULATIVO))

    iss = receita_servicos * ALIQUOTA_ISS
    icms = receita_comercio * ALIQUOTA_ICMS
    cpp = folha_salarial * CPP_PATRONAL

    total = irpj + csll + pis_cofins + iss + icms + cpp

    return ResultadoRegime(
        "Lucro Real", round(total, 2),
        round(total / faturamento_total, 4) if faturamento_total else 0,
        {
            "IRPJ": round(irpj, 2), "CSLL": round(csll, 2),
            "PIS/COFINS": round(pis_cofins, 2), "ISS": round(iss, 2),
            "ICMS": round(icms, 2), "CPP Patronal": round(cpp, 2),
        },
    )


def comparar_regimes(receita_comercio: float, receita_servicos: float, folha_salarial: float,
                      cmv: float = 0, despesas_operacionais: float = 0) -> dict:
    resultados = []
    faturamento_total = receita_comercio + receita_servicos

    if faturamento_total <= LIMITE_SIMPLES:
        resultados.append(simular_simples_nacional(receita_comercio, receita_servicos))

    resultados.append(simular_lucro_presumido(receita_comercio, receita_servicos, folha_salarial))

    if cmv or despesas_operacionais:
        resultados.append(simular_lucro_real(receita_comercio, receita_servicos, cmv, despesas_operacionais, folha_salarial))

    valido = [r for r in resultados if "erro" not in r.detalhamento]
    melhor = min(valido, key=lambda r: r.total_tributos_anual) if valido else None
    pior = max(valido, key=lambda r: r.total_tributos_anual) if valido else None
    economia_potencial = (pior.total_tributos_anual - melhor.total_tributos_anual) if (melhor and pior) else 0

    return {
        "resultados": resultados,
        "regime_mais_vantajoso": melhor.regime if melhor else None,
        "economia_potencial_anual": round(economia_potencial, 2),
    }
