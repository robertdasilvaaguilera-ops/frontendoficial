"""
Gera legenda pronta para Instagram a partir dos dados JA estruturados
da oportunidade - sem chamada de IA nova (usa mecanismo_economico,
percentual estimado, natureza), para nao consumir cota do Gemini a
mais so para isso.

Formato baseado na referencia visual do usuario: emoji + resumo em
negrito, checklist do que muda na pratica, destaque de percentual,
exemplo de calculo, aviso de escopo.
"""
import re

PERCENTUAIS_TRIBUTO = {
    "irpj": 0.25, "csll": 0.09, "pis": 0.0165, "cofins": 0.076, "icms": 0.18,
}

CONSEQUENCIAS_POR_MECANISMO = {
    "Exclusão de valores da base de cálculo": [
        "Redução da carga tributária federal",
        "Possibilidade de compensar valores pagos indevidamente",
        "Correção dos créditos pela SELIC",
        "Ajuste da escrita fiscal e recomposição de prejuízos fiscais",
    ],
    "Restituição / repetição de indébito": [
        "Direito a reaver valores pagos a mais",
        "Correção pela SELIC sobre o período",
        "Prazo de até 5 anos para pedir a restituição",
    ],
    "Compensação tributária": [
        "Direito de usar o crédito para abater tributos futuros",
        "Redução do desembolso de caixa nos próximos períodos",
    ],
    "Créditos de PIS/COFINS não aproveitados": [
        "Recuperação de crédito não utilizado sobre insumos",
        "Possibilidade de compensação com tributos federais",
    ],
    "Redução de alíquota": [
        "Redução direta e permanente da carga tributária",
    ],
    "Isenção / imunidade tributária": [
        "Não incidência do tributo sobre a operação",
    ],
    "Prescrição / decadência": [
        "Fisco perde o direito de cobrar o débito",
    ],
    "Redução / cancelamento de multa": [
        "Redução ou eliminação de penalidade aplicada",
    ],
}

CONSEQUENCIAS_PADRAO_RISCO = [
    "Atenção: pode gerar autuação ou cobrança adicional",
    "Recomendável revisão preventiva de procedimentos internos",
]


def _estimar_percentual(tributos_texto: str) -> float:
    tributos_texto = tributos_texto.lower()
    percentual = sum(v for k, v in PERCENTUAIS_TRIBUTO.items() if k in tributos_texto)
    return percentual if percentual > 0 else 0.0


def gerar_legenda_instagram(item: dict) -> str:
    mecanismo = str(item.get("mecanismo_economico", "") or "")
    natureza = str(item.get("natureza_mecanismo", "") or "")
    tributos = str(item.get("tributos", "") or "")
    area = str(item.get("area", "") or "Tributário")
    risco = float(item.get("risco", 0) or 0)

    eh_oportunidade = natureza == "oportunidade" or (not natureza and risco < 50)

    emoji_cabecalho = "🎉" if eh_oportunidade else "⚠️"
    palavra_status = "favorável" if eh_oportunidade else "de atenção"

    linha_titulo = f"{emoji_cabecalho} Decisão {palavra_status} — {mecanismo or area}"

    consequencias = CONSEQUENCIAS_POR_MECANISMO.get(mecanismo, [])
    if not consequencias:
        consequencias = CONSEQUENCIAS_PADRAO_RISCO if not eh_oportunidade else [
            "Pode representar redução de custo tributário",
            "Vale avaliação individualizada da aplicabilidade",
        ]

    checklist = "\n".join(f"✅ {c}" for c in consequencias)

    percentual = _estimar_percentual(tributos)
    bloco_percentual = ""
    if percentual > 0:
        percentual_fmt = f"{percentual*100:.1f}".rstrip("0").rstrip(".")
        exemplo_valor = 1_000_000
        exemplo_economia = exemplo_valor * percentual
        bloco_percentual = (
            f"\n💰 A economia pode chegar a cerca de {percentual_fmt}% do valor envolvido.\n\n"
            f"Exemplo: uma empresa com R$ {exemplo_valor:,.0f}".replace(",", ".") +
            f" em base tributável pode ter economia próxima de "
            f"R$ {exemplo_economia:,.0f}".replace(",", ".") + " anuais."
        )

    aviso = (
        "\n\n⚠️ Atenção: o entendimento é específico ao caso analisado. "
        "Outras situações podem ter regras diferentes — consulte um especialista antes de aplicar."
    )

    return f"{linha_titulo}\n\nO Tribunal analisou uma questão relevante para empresas.\n\nNa prática, isso significa:\n{checklist}{bloco_percentual}{aviso}"
