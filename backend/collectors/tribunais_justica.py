"""
Coletor: Tribunais de Justica estaduais (todos os 27), via API DataJud.
Ver datajud_base.py para a logica compartilhada e contexto completo.
"""
from .datajud_base import consultar_tribunal

ALIASES_TJ = {
    "tjac": "Acre", "tjal": "Alagoas", "tjam": "Amazonas", "tjap": "Amapá",
    "tjba": "Bahia", "tjce": "Ceará", "tjdft": "Distrito Federal",
    "tjes": "Espírito Santo", "tjgo": "Goiás", "tjma": "Maranhão",
    "tjmg": "Minas Gerais", "tjms": "Mato Grosso do Sul", "tjmt": "Mato Grosso",
    "tjpa": "Pará", "tjpb": "Paraíba", "tjpe": "Pernambuco", "tjpi": "Piauí",
    "tjpr": "Paraná", "tjrj": "Rio de Janeiro", "tjrn": "Rio Grande do Norte",
    "tjro": "Rondônia", "tjrr": "Roraima", "tjrs": "Rio Grande do Sul",
    "tjsc": "Santa Catarina", "tjse": "Sergipe", "tjsp": "São Paulo",
    "tjto": "Tocantins",
}


def coletar() -> list[dict]:
    todos_resultados = []
    com_erro = []

    for alias, nome_estado in ALIASES_TJ.items():
        resultado = consultar_tribunal(alias, nome_estado, "TJ")
        if resultado:
            todos_resultados.extend(resultado)
        else:
            com_erro.append(alias.upper())

    print(f"[INFO] Tribunais de Justiça: {len(todos_resultados)} processo(s) "
          f"coletado(s) de {len(ALIASES_TJ) - len(com_erro)}/{len(ALIASES_TJ)} tribunais.")
    if com_erro:
        print(f"[AVISO] TJs sem retorno: {', '.join(com_erro)}")

    return todos_resultados
