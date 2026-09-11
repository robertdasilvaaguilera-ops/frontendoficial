"""
Recalcula empresas_afetadas, economia_estimada, risco, prioridade e
justificativa de TODAS as linhas da planilha atual, usando o modelo
economico v3 (com base em setor). Nao mexe em titulo, resumo, link,
score, area, tributos, parecer - so nos campos do modulo economics.

Faz backup com TIMESTAMP no nome (nao reusa nome fixo - licao aprendida
da ultima vez que isso deu problema).
"""
import os
import shutil
from datetime import datetime
import pandas as pd

from economics.estimator import estimate

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
CAMINHO_EXCEL = os.path.join(PASTA_BASE, "reports", "oportunidades.xlsx")

agora = datetime.now().strftime("%Y%m%d_%H%M%S")
CAMINHO_BACKUP = os.path.join(PASTA_BASE, "reports", f"oportunidades_backup_{agora}.xlsx")


def main():
    if not os.path.exists(CAMINHO_EXCEL):
        print(f"[ERRO] Planilha não encontrada: {CAMINHO_EXCEL}")
        return

    shutil.copy2(CAMINHO_EXCEL, CAMINHO_BACKUP)
    print(f"Backup salvo em: {CAMINHO_BACKUP}")

    df = pd.read_excel(CAMINHO_EXCEL)
    total = len(df)
    print(f"Total de linhas a recalcular: {total}")

    novas_empresas = []
    novas_economias = []
    novos_riscos = []
    novas_prioridades = []
    novas_justificativas = []
    novos_setores = []

    for _, linha in df.iterrows():
        item = {
            "titulo": linha.get("titulo", "") or "",
            "resumo": linha.get("resumo", "") or "",
            "fonte": linha.get("fonte", "") or "",
            "resultado_bruto": linha.get("resultado_bruto", "") or "",
        }
        resultado = estimate(item)

        novas_empresas.append(resultado.empresas_afetadas)
        novas_economias.append(resultado.economia_estimada)
        novos_riscos.append(resultado.risco)
        novas_prioridades.append(resultado.prioridade)
        novas_justificativas.append(resultado.justificativa)
        novos_setores.append(resultado.setor_identificado)

    df["empresas_afetadas"] = novas_empresas
    df["economia_estimada"] = novas_economias
    df["risco"] = novos_riscos
    df["prioridade"] = novas_prioridades
    df["justificativa"] = novas_justificativas
    df["setor_identificado"] = novos_setores

    df.to_excel(CAMINHO_EXCEL, index=False)
    print(f"\nPlanilha atualizada com o modelo v3: {CAMINHO_EXCEL}")
    print(f"Linhas recalculadas: {total}")


if __name__ == "__main__":
    main()
