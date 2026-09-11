"""
Coletor: STF (Supremo Tribunal Federal)

LIMITAÇÃO CONHECIDA: o STF não oferece um RSS público simples como o
STJ. O canal de RSS existente ("STF Push") exige cadastro prévio no
site do tribunal e gera uma URL de feed pessoal, vinculada à sua conta
— não é uma URL fixa que qualquer script possa consultar sem login.

Duas alternativas reais, em ordem de esforço:

1. (Recomendado para Sprint 1) Cadastre-se manualmente em
   https://portal.stf.jus.br/ no serviço "Receba no seu E-mail (PUSH)"
   e filtre por Repercussão Geral. Vira uma rotina manual de 5 min/semana,
   não um coletor automático — mas funciona hoje.

2. (Sprint 2+) Cadastrar-se no STF Push, copiar a URL de feed pessoal
   gerada, e colar abaixo em URL_RSS. Nesse caso este coletor passa a
   funcionar como os demais.

Por enquanto, devolve lista vazia propositalmente — não vale a pena
fazer scraping do site do STF (instável, muda de estrutura com frequência,
e vocês já decidiram evitar scraping).
"""


def coletar() -> list[dict]:
    print("[INFO] Coletor do STF ainda não está automatizado — veja o "
          "docstring deste arquivo para as duas alternativas disponíveis.")
    return []
