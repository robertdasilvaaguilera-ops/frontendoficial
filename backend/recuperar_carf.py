"""
Recupera as decisoes do CARF direto da fonte oficial (nao depende de
nenhum backup ou planilha local - o CARF publica um arquivo estatico
que sempre podemos rebaixar).

Adiciona ao oportunidades_completa.xlsx (o arquivo limpo que criamos em
reconstruir_planilha.py). Se esse arquivo nao existir ainda, cria do zero.
"""
import os
import pandas as pd

from collectors import carf_julgamentos
from filters.keywords import contem_palavra_chave, classificar
from classifier.opportunity import classify
from economics.estimator import estimate
from recommender import recomendar

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
CAMINHO_SAIDA = os.path.join(PASTA_BASE, "reports", "oportunidades_completa.xlsx")


def main():
    print("Baixando e lendo o arquivo do CARF...")
    entradas_carf = carf_julgamentos.coletar()
    print(f"Total de linhas do CARF coletadas: {len(entradas_carf)}")

    linhas_finais = []

    for entrada in entradas_carf:
        titulo = entrada.get("titulo", "") or ""
        resumo = entrada.get("resumo", "") or ""
        link = entrada.get("link", "") or ""

        if not link:
            continue

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

        entrada["parecer"] = ""

        linhas_finais.append(entrada)

    print(f"Linhas do CARF classificadas e com link: {len(linhas_finais)}")

    df_novo = pd.DataFrame(linhas_finais)

    if os.path.exists(CAMINHO_SAIDA):
        df_existente = pd.read_excel(CAMINHO_SAIDA)
        # remove eventuais linhas de CARF que ja estivessem la, para nao duplicar
        df_existente = df_existente[~df_existente["fonte"].astype(str).str.contains("CARF", na=False)]
        df_final = pd.concat([df_existente, df_novo], ignore_index=True)
    else:
        df_final = df_novo

    df_final.to_excel(CAMINHO_SAIDA, index=False)
    print(f"\nArquivo atualizado: {CAMINHO_SAIDA}")
    print(f"Total de linhas no arquivo agora: {len(df_final)}")


if __name__ == "__main__":
    main()
