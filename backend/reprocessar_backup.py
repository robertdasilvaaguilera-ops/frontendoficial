"""
Script de recuperacao - roda quantas vezes for preciso.

Le o backup (linhas de antes da classificacao existir) e roda a
classificacao/economia local (gratis, sem IA) em TODAS elas. Nao gera
mais parecer aqui (era via Gemini, removido) - o parecer agora e gerado
sob demanda pela API (Claude), quando o advogado pede na pagina da
decisao (ver ai/parecer.py).
"""
import os
import pandas as pd

from filters.keywords import contem_palavra_chave, classificar
from classifier.opportunity import classify
from economics.estimator import estimate
from recommender import recomendar

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
CAMINHO_BACKUP = os.path.join(PASTA_BASE, "reports", "oportunidades_backup_antes_limpeza.xlsx")
CAMINHO_EXCEL = os.path.join(PASTA_BASE, "reports", "oportunidades.xlsx")


def main():
    if not os.path.exists(CAMINHO_BACKUP):
        print(f"[ERRO] Backup não encontrado: {CAMINHO_BACKUP}")
        return

    df_backup = pd.read_excel(CAMINHO_BACKUP)

    if "score" not in df_backup.columns:
        print("[ERRO] Coluna 'score' não existe no backup.")
        return

    # So as linhas que ainda nao foram classificadas
    df_pendentes = df_backup[df_backup["score"].isna()].copy()
    total_pendentes = len(df_pendentes)
    print(f"Linhas pendentes de classificação: {total_pendentes}")

    if total_pendentes == 0:
        print("Nada pendente - todas as linhas do backup já foram processadas.")
        return

    linhas_processadas = []

    for _, linha in df_pendentes.iterrows():
        entrada = linha.to_dict()

        titulo = str(entrada.get("titulo", "") or "")
        resumo = str(entrada.get("resumo", "") or "")
        texto_completo = f"{titulo} {resumo}"

        if not contem_palavra_chave(texto_completo):
            continue

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

        entrada["parecer"] = entrada.get("parecer") or ""
        linhas_processadas.append(entrada)

    print(f"Linhas classificadas nesta execução: {len(linhas_processadas)}")

    if not linhas_processadas:
        print("Nenhuma linha nova processada.")
        return

    df_novo = pd.DataFrame(linhas_processadas)

    if os.path.exists(CAMINHO_EXCEL):
        df_existente = pd.read_excel(CAMINHO_EXCEL)
        df_final = pd.concat([df_existente, df_novo], ignore_index=True)
    else:
        df_final = df_novo

    df_final.to_excel(CAMINHO_EXCEL, index=False)
    print(f"Planilha atualizada: {CAMINHO_EXCEL}")

    # Marca como processadas no backup, para nao reprocessar de novo
    indices_processados = df_pendentes.index[:len(linhas_processadas)]
    df_backup.loc[df_pendentes.index, "score"] = df_backup.loc[df_pendentes.index, "score"].fillna(-1)
    df_backup.to_excel(CAMINHO_BACKUP, index=False)

    restantes = total_pendentes - len(linhas_processadas)
    print(f"\nRestam aproximadamente {max(0, restantes)} linhas para uma próxima execução.")
    print("Rode este script de novo em alguns minutos para continuar.")


if __name__ == "__main__":
    main()
