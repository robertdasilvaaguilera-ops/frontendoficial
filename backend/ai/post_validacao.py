"""
Validação compartilhada de campos "ricos" do post de Instagram - destaques
automáticos por atenção (destaquesTitulo/destaquesCorpo) e elemento visual
(número/gráfico em destaque). Extraído de ai/carrossel.py (onde nasceu, pro
carrossel de 5 slides) pra ser reaproveitado também em ai/social_post.py
(post único, usado por Notícias e Estúdio Visual) - mesma regra, mesmo
rigor: nunca confia cegamente no que a IA devolveu, nunca inventa dado.
"""


def texto(valor, limite: int) -> str:
    return str(valor if valor is not None else "").strip()[:limite]


def num(valor):
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def validar_elemento_visual(bruto) -> dict | None:
    """Nunca confia cegamente no JSON da IA pro elemento visual - qualquer
    formato fora do esperado vira None (sem elemento), nunca quebra o
    desenho nem inventa um número que a IA não devolveu certinho."""
    if not isinstance(bruto, dict):
        return None
    tipo = bruto.get("tipo")

    if tipo == "numero_destaque":
        valor = texto(bruto.get("valor"), 24)
        rotulo = texto(bruto.get("rotulo"), 80)
        if not valor or not rotulo:
            return None
        return {"tipo": "numero_destaque", "valor": valor, "rotulo": rotulo}

    if tipo == "grafico_rosca":
        rotulo = texto(bruto.get("rotulo"), 90)
        pct = num(bruto.get("percentual"))
        if not rotulo or pct is None:
            return None
        return {"tipo": "grafico_rosca", "rotulo": rotulo, "percentual": max(0.0, min(100.0, pct))}

    if tipo == "grafico_barra":
        itens_brutos = bruto.get("itens")
        if not isinstance(itens_brutos, list):
            return None
        itens = []
        for item in itens_brutos[:4]:
            if not isinstance(item, dict):
                continue
            rotulo = texto(item.get("rotulo"), 24)
            valor = num(item.get("valor"))
            if rotulo and valor is not None:
                itens.append({"rotulo": rotulo, "valor": valor})
        if len(itens) < 2:
            return None
        return {"tipo": "grafico_barra", "itens": itens}

    if tipo == "comparacao":
        def lado(chave):
            d = bruto.get(chave)
            if not isinstance(d, dict):
                return None
            rotulo = texto(d.get("rotulo"), 40)
            valor = texto(d.get("valor"), 20)
            return {"rotulo": rotulo, "valor": valor} if rotulo and valor else None

        antes, depois = lado("antes"), lado("depois")
        if not antes or not depois:
            return None
        return {"tipo": "comparacao", "antes": antes, "depois": depois}

    return None


def validar_destaques(brutos, texto_fonte: str) -> list[str]:
    """Só aceita trecho que realmente existe (case-insensitive) dentro do
    texto de origem - um "destaque" que não bate com nada é silenciosamente
    descartado, nunca quebra o desenho nem inventa um trecho que a IA não
    copiou certo (a regra é sempre cópia literal do headline/corpo)."""
    if not isinstance(brutos, list) or not texto_fonte:
        return []
    texto_lower = texto_fonte.lower()
    resultado = []
    for bruto in brutos[:2]:
        trecho = texto(bruto, 40)
        if trecho and trecho.lower() in texto_lower and trecho not in resultado:
            resultado.append(trecho)
    return resultado
