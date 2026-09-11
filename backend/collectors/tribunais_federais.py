"""
Coletor: TRFs (Tribunais Regionais Federais), via API DataJud.

Substitui a abordagem anterior (trf_regionais.py, que tentava adivinhar
RSS de cada site e falhava na maioria). Também complementa o trf4.py
(que so tras noticias institucionais) com dados processuais de verdade.

Ver datajud_base.py para a logica compartilhada e contexto completo.
"""
from .datajud_base import consultar_tribunal

ALIASES_TRF = {
    "trf1": "TRF1 (13 estados incl. DF)",
    "trf2": "TRF2 (RJ, ES)",
    "trf3": "TRF3 (SP, MS)",
    "trf4": "TRF4 (RS, SC, PR)",
    "trf5": "TRF5 (Nordeste)",
    "trf6": "TRF6 (MG)",
}


def coletar() -> list[dict]:
    todos_resultados = []
    com_erro = []

    for alias, nome_exibicao in ALIASES_TRF.items():
        resultado = consultar_tribunal(alias, nome_exibicao, "TRF")
        if resultado:
            todos_resultados.extend(resultado)
        else:
            com_erro.append(alias.upper())

    print(f"[INFO] TRFs (DataJud): {len(todos_resultados)} processo(s) "
          f"coletado(s) de {len(ALIASES_TRF) - len(com_erro)}/{len(ALIASES_TRF)} tribunais.")
    if com_erro:
        print(f"[AVISO] TRFs sem retorno: {', '.join(com_erro)}")

    return todos_resultados
