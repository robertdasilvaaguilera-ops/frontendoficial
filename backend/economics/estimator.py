"""
Modelo economico da ATLAS - v4

Adicoes em relacao a v3:
1. mecanismo_economico: taxonomia de COMO a decisao gera valor/risco
   (exclusao de base, restituicao, compensacao, etc) - mais util que
   forcar um R$ artificial quando o texto nao traz valor real.
2. natureza_mecanismo: "oportunidade" ou "risco", conforme o mecanismo.
3. regime_tributario_detectado: Simples Nacional / Lucro Presumido /
   Lucro Real / MEI / Lucro Arbitrado, quando mencionado no texto.

O calculo de empresas_afetadas/economia_estimada (v3, baseado em setor)
continua igual - isso aqui SOMA informacao, nao substitui.
"""
import re
from dataclasses import dataclass

from database.setores import buscar_setor_por_texto

TOTAL_EMPRESAS_ATIVAS_BRASIL = 21_600_000
EMPRESAS_SIMPLES_NACIONAL = 18_200_000
EMPRESAS_LUCRO_PRESUMIDO_REAL = 3_200_000
EMPRESAS_ICMS_ESTIMADO = int(TOTAL_EMPRESAS_ATIVAS_BRASIL * 0.6)
PERCENTUAL_AFETADO_PADRAO = 0.30


@dataclass
class EconomicImpact:
    empresas_afetadas: int
    economia_estimada: float
    prioridade: int
    risco: int
    justificativa: str
    tipo_decisao: str
    setor_identificado: str
    mecanismo_economico: str
    natureza_mecanismo: str
    regime_tributario_detectado: str


# ---------------------------------------------------------------
# Taxonomia de mecanismo economico - ordem importa (primeiro match vence)
# ---------------------------------------------------------------
MECANISMOS = [
    ("Exclusão de valores da base de cálculo", "oportunidade",
     [r"exclus[ãa]o.{0,20}base de c[áa]lculo", r"n[ãa]o deve (integrar|compor) a base",
      r"exclu[ií]do.{0,15}base de c[áa]lculo"]),
    ("Inclusão de valores na base de cálculo", "risco",
     [r"inclus[ãa]o.{0,20}base de c[áa]lculo", r"deve (integrar|compor) a base",
      r"integra a base de c[áa]lculo"]),
    ("Restituição / repetição de indébito", "oportunidade",
     [r"repeti[çc][ãa]o de ind[ée]bito", r"restitui[çc][ãa]o de valores",
      r"devolu[çc][ãa]o.{0,15}pago"]),
    ("Compensação tributária", "oportunidade",
     [r"compensa[çc][ãa]o tribut[áa]ria", r"direito [àa] compensa[çc][ãa]o",
      r"cr[ée]dito.{0,20}compensar"]),
    ("Créditos de PIS/COFINS não aproveitados", "oportunidade",
     [r"cr[ée]dito de pis", r"cr[ée]dito de cofins", r"cr[ée]dito.{0,15}insumo"]),
    ("Redução de alíquota", "oportunidade",
     [r"redu[çc][ãa]o de al[íi]quota", r"al[íi]quota reduzida",
      r"reclassifica[çc][ãa]o.{0,20}al[íi]quota"]),
    ("Majoração de alíquota", "risco",
     [r"majora[çc][ãa]o de al[íi]quota", r"aumento de al[íi]quota",
      r"eleva[çc][ãa]o da al[íi]quota"]),
    ("Isenção / imunidade tributária", "oportunidade",
     [r"isen[çc][ãa]o tribut[áa]ria", r"imunidade tribut[áa]ria", r"n[ãa]o incid[êe]ncia"]),
    ("Prescrição / decadência", "oportunidade",
     [r"prescri[çc][ãa]o", r"decad[êe]ncia", r"prazo prescricional"]),
    ("Redução / cancelamento de multa", "oportunidade",
     [r"cancelamento da multa", r"redu[çc][ãa]o da multa", r"afastamento da multa",
      r"multa.{0,15}(cancelad|afastad|reduzid)"]),
    ("Responsabilização de sócio/terceiro", "risco",
     [r"desconsidera[çc][ãa]o da personalidade jur[íi]dica",
      r"responsabiliza[çc][ãa]o.{0,15}s[óo]cio", r"redirecionamento.{0,15}execu[çc][ãa]o"]),
    ("Mudança de regime tributário aplicável", "risco",
     [r"exclus[ãa]o do simples", r"desenquadramento", r"mudan[çc]a de regime"]),
]

REGIMES = [
    ("MEI", [r"\bmei\b", r"microempreendedor individual"]),
    ("Simples Nacional", [r"simples nacional"]),
    ("Lucro Presumido", [r"lucro presumido"]),
    ("Lucro Real", [r"lucro real"]),
    ("Lucro Arbitrado", [r"lucro arbitrado"]),
]

PESO_TEMA_TESE_FALLBACK = {
    "icms": {"empresas": EMPRESAS_ICMS_ESTIMADO, "prioridade": 30,
             "motivo": "ICMS incide sobre comércio/indústria - ampla base de contribuintes"},
    "pis": {"empresas": EMPRESAS_LUCRO_PRESUMIDO_REAL + EMPRESAS_SIMPLES_NACIONAL, "prioridade": 20,
            "motivo": "Contribuição federal de incidência ampla"},
    "cofins": {"empresas": EMPRESAS_LUCRO_PRESUMIDO_REAL + EMPRESAS_SIMPLES_NACIONAL, "prioridade": 20,
               "motivo": "Contribuição federal de incidência ampla"},
    "irpj": {"empresas": EMPRESAS_LUCRO_PRESUMIDO_REAL, "prioridade": 25,
             "motivo": "Afeta empresas do Lucro Presumido/Real"},
    "csll": {"empresas": EMPRESAS_LUCRO_PRESUMIDO_REAL, "prioridade": 20,
             "motivo": "Afeta empresas do Lucro Presumido/Real"},
    "simples nacional": {"empresas": EMPRESAS_SIMPLES_NACIONAL, "prioridade": 40,
                          "motivo": "Atinge empresas do Simples Nacional"},
    "lucro presumido": {"empresas": EMPRESAS_LUCRO_PRESUMIDO_REAL, "prioridade": 30,
                         "motivo": "Regime usado por médias empresas"},
}

PADRAO_VALOR_CAUSA = re.compile(r"valor\s+da\s+causa[:\s]*r\$\s*([\d.,]+)", re.IGNORECASE)
PALAVRAS_TESE = [
    "recurso repetitivo", "repercussão geral", "tema ", "acórdão",
    "recurso voluntário", "turma", "câmara", "conselho",
]


def _extrair_valor_causa(texto: str) -> float:
    match = PADRAO_VALOR_CAUSA.search(texto)
    if not match:
        return 0.0
    valor_str = match.group(1).replace(".", "").replace(",", ".")
    try:
        return float(valor_str)
    except ValueError:
        return 0.0


def _eh_decisao_de_tese(texto_lower: str, fonte: str) -> bool:
    fonte_lower = fonte.lower()
    if "carf" in fonte_lower or "stj" in fonte_lower or "stf" in fonte_lower:
        return True
    return any(p in texto_lower for p in PALAVRAS_TESE)


def _detectar_mecanismo(texto_lower: str):
    for nome, natureza, padroes in MECANISMOS:
        for padrao in padroes:
            if re.search(padrao, texto_lower):
                return nome, natureza
    return "", ""


def _detectar_regime(texto_lower: str) -> str:
    for nome, padroes in REGIMES:
        for padrao in padroes:
            if re.search(padrao, texto_lower):
                return nome
    return ""


def estimate(item):
    titulo = item.get("titulo", "") or ""
    resumo = item.get("resumo", "") or ""
    fonte = item.get("fonte", "") or ""
    texto = f"{titulo} {resumo}"
    texto_lower = texto.lower()

    valor_causa = _extrair_valor_causa(texto)
    eh_tese = _eh_decisao_de_tese(texto_lower, fonte)
    mecanismo, natureza_mecanismo = _detectar_mecanismo(texto_lower)
    regime_detectado = _detectar_regime(texto_lower)

    empresas = 0
    prioridade = 0
    motivo = []
    economia_estimada = 0.0
    setor_nome = ""

    if eh_tese:
        setor = buscar_setor_por_texto(texto)
        if setor:
            setor_nome = setor["setor"]
            empresas = int(setor["empresas_brasil"] * PERCENTUAL_AFETADO_PADRAO)
            prioridade = 30
            motivo.append(
                f"Setor identificado: {setor_nome} ({setor['empresas_brasil']:,} empresas no Brasil, "
                f"{PERCENTUAL_AFETADO_PADRAO:.0%} estimado como afetado)"
            )
            economia_estimada = setor["receita_media_anual"] * 0.005
        else:
            melhor_match = None
            for termo, dados in PESO_TEMA_TESE_FALLBACK.items():
                if termo in texto_lower:
                    if melhor_match is None or dados["empresas"] > melhor_match["empresas"]:
                        melhor_match = dados
            if melhor_match:
                empresas = melhor_match["empresas"]
                prioridade = melhor_match["prioridade"]
                motivo.append(melhor_match["motivo"] + " (setor não identificado)")
            economia_estimada = valor_causa
        tipo_decisao = "tese"
    else:
        empresas = 1
        economia_estimada = valor_causa
        prioridade = 15 if valor_causa > 0 else 5
        if valor_causa > 0:
            motivo.append(f"Processo individual - valor da causa: R$ {valor_causa:,.2f}")
        else:
            motivo.append("Processo individual - valor da causa não identificado no texto")
        tipo_decisao = "individual"

    if mecanismo:
        motivo.append(f"Mecanismo: {mecanismo}")

    resultado = str(item.get("resultado_bruto", "") or "").lower()
    favoravel_contribuinte = any(p in resultado for p in ["provido", "procedente", "cancelad"])
    desfavoravel_contribuinte = any(p in resultado for p in ["negado", "improcedente", "mantid"])

    # O "natureza_mecanismo" (se detectado) tem prioridade sobre o resultado
    # bruto do julgamento para decidir oportunidade x risco - e mais preciso.
    if natureza_mecanismo == "risco":
        risco = min(100, prioridade + 20)
        motivo.append(f"Risco pelo mecanismo identificado: {mecanismo}")
    elif natureza_mecanismo == "oportunidade":
        risco = max(0, prioridade - 20)
        motivo.append(f"Oportunidade pelo mecanismo identificado: {mecanismo}")
    elif favoravel_contribuinte:
        risco = max(0, prioridade - 20)
        motivo.append("Decisão favorável ao contribuinte - oportunidade de replicação")
    elif desfavoravel_contribuinte:
        risco = min(100, prioridade + 20)
        motivo.append("Decisão desfavorável ao contribuinte - sinal de risco/alerta")
    else:
        risco = prioridade

    return EconomicImpact(
        empresas_afetadas=empresas,
        economia_estimada=round(economia_estimada, 2),
        prioridade=prioridade,
        risco=risco,
        justificativa="; ".join(motivo),
        tipo_decisao=tipo_decisao,
        setor_identificado=setor_nome,
        mecanismo_economico=mecanismo,
        natureza_mecanismo=natureza_mecanismo,
        regime_tributario_detectado=regime_detectado,
    )
