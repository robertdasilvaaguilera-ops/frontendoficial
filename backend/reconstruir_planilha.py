"""
RECONSTRUCAO COMPLETA - roda uma vez so.

Le o backup original (oportunidades_backup_antes_limpeza.xlsx - confirmado
que tem todos os links corretos) e reclassifica TODAS as linhas do zero,
ignorando qualquer score/coluna que ja exista nele (para nao herdar
inconsistencia de execucoes anteriores misturadas).

NAO gera parecer via Gemini aqui (isso fica pra um segundo script,
rodado depois, em lotes menores - essa parte aqui e so classificacao
local, rapida e gratis, sem risco de estourar cota).

Gera um arquivo NOVO: oportunidades_completa.xlsx
(nao mexe no oportunidades.xlsx atual, para voce poder comparar antes
de decidir qual usar)
"""
import os
import pandas as pd

from filters.keywords import contem_palavra_chave, classificar
from classifier.opportunity import classify
from economics.estimator import estimate
from recommender import recomendar

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
CAMINHO_BACKUP = os.path.join(PASTA_BASE, "reports", "oportunidades_backup_antes_limpeza.xlsx")
CAMINHO_SAIDA = os.path.join(PASTA_BASE, "reports", "oportunidades_completa.xlsx")


def main():
    if not os.path.exists(CAMINHO_BACKUP):
        print(f"[ERRO] Backup não encontrado: {CAMINHO_BACKUP}")
        return

    df_backup = pd.read_excel(CAMINHO_BACKUP)
    total = len(df_backup)
    print(f"Total de linhas no backup: {total}")

    linhas_finais = []
    sem_link = 0
    sem_keyword = 0

    for _, linha in df_backup.iterrows():
        entrada = linha.to_dict()

        link = entrada.get("link")
        link = "" if pd.isna(link) else str(link)
        if not link:
            sem_link += 1
            continue
        entrada["link"] = link

        titulo = entrada.get("titulo")
        titulo = "" if pd.isna(titulo) else str(titulo)
        resumo = entrada.get("resumo")
        resumo = "" if pd.isna(resumo) else str(resumo)

        texto_completo = f"{titulo} {resumo}"
        if not contem_palavra_chave(texto_completo):
            sem_keyword += 1
            continue

        entrada["titulo"] = titulo
        entrada["resumo"] = resumo
        entrada["categorias"] = ", ".join(classificar(texto_completo))
        analise = classify(entrada)

        entrada["score"] = analise.score
        entrada["impacto"] = analise.impacto
        entrada["area"] = analise.area
        entrada["setores"] = ", ".join(analise.setores)
        entrada["tributos"] = ", ".join(analise.tributos)
        entrada["oportunidade"] = "SIM" if analise.oportunidade else "NAO"

        economia = estimate(entrada)
        entrada["empresas_afetadas"] = economia.empresas_afetadas
        entrada["economia_estimada"] = economia.economia_estimada
        entrada["risco"] = economia.risco
        entrada["prioridade"] = economia.prioridade
        entrada["justificativa"] = economia.justificativa

        plano = recomendar(entrada)
        entrada["acao_sugerida"] = plano["acao"]
        entrada["prioridade_operacional"] = plano["prioridade"]
        entrada["tipo_post"] = plano["tipo_post"]
        entrada["prospeccao"] = plano["prospeccao"]

        # Parecer fica vazio aqui de proposito - gerado depois, em lotes
        entrada["parecer"] = ""

        linhas_finais.append(entrada)

    print(f"Descartadas por falta de link: {sem_link}")
    print(f"Descartadas por não bater palavra-chave: {sem_keyword}")
    print(f"Linhas finais, completas: {len(linhas_finais)}")

    df_final = pd.DataFrame(linhas_finais)
    df_final.to_excel(CAMINHO_SAIDA, index=False)
    print(f"\nArquivo gerado: {CAMINHO_SAIDA}")
    print("Confira esse arquivo. Se estiver correto, ele vai substituir o oportunidades.xlsx.")


if __name__ == "__main__":
    main()
