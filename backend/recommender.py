def recomendar(item):

    score = item.get("score", 0)
    impacto = item.get("impacto", "")
    area = item.get("area", "")
    tributos = item.get("tributos", "")

    if score >= 80:
        return {
            "acao": "Produzir parecer técnico imediatamente",
            "prioridade": "Urgente",
            "tipo_post": "LinkedIn + Instagram + Newsletter",
            "prospeccao": True
        }

    if score >= 60:
        return {
            "acao": "Produzir artigo",
            "prioridade": "Alta",
            "tipo_post": "LinkedIn",
            "prospeccao": True
        }

    if score >= 40:
        return {
            "acao": "Monitorar evolução",
            "prioridade": "Média",
            "tipo_post": "Banco de Conteúdo",
            "prospeccao": False
        }

    return {
        "acao": "Arquivar",
        "prioridade": "Baixa",
        "tipo_post": "",
        "prospeccao": False
    }