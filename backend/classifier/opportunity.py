from dataclasses import dataclass
from typing import List


@dataclass
class Opportunity:
    titulo: str
    area: str
    setores: List[str]
    tributos: List[str]
    impacto: str
    score: int
    oportunidade: bool
    motivo: str


def classify(item):
    """
    Recebe um item coletado (notícia, decisão ou acórdão)
    e retorna uma Opportunity.
    """

    texto = (
        f"{item.get('titulo', '')} "
        f"{item.get('resumo', '')}"
    ).lower()

    score = 0
    setores = []
    tributos = []

    # ---------- Tributos ----------
    if "irpj" in texto:
        score += 30
        tributos.append("IRPJ")

    if "csll" in texto:
        score += 20
        tributos.append("CSLL")

    if "pis" in texto:
        score += 15
        tributos.append("PIS")

    if "cofins" in texto:
        score += 15
        tributos.append("COFINS")

    if "icms" in texto:
        score += 20
        tributos.append("ICMS")

    # ---------- Setores ----------

    if "revenda" in texto:
        score += 15
        setores.append("Revendas")

    if "clínica" in texto or "clinica" in texto:
        score += 15
        setores.append("Clínicas")

    if "indústria" in texto or "industria" in texto:
        score += 10
        setores.append("Indústrias")

    # ---------- Área ----------

    area = "Empresarial"

    if tributos:
        area = "Tributário"

    # ---------- Impacto ----------

    if score >= 70:
        impacto = "Muito Alto"
    elif score >= 50:
        impacto = "Alto"
    elif score >= 30:
        impacto = "Médio"
    else:
        impacto = "Baixo"

    oportunidade = score >= 50

    return Opportunity(
        titulo=item.get("titulo", ""),
        area=area,
        setores=setores,
        tributos=tributos,
        impacto=impacto,
        score=score,
        oportunidade=oportunidade,
        motivo="Classificação automática da ATLAS"
    )