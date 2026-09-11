"""
ATLAS Engine - Sprint 1 (com diagnostico temporario)
Coleta noticias/decisoes de fontes oficiais, filtra por palavras-chave
relevantes (tributario/societario/financeiro) e salva em Excel.

Como rodar:
    python main.py
"""
import json
import os
import re
from datetime import datetime

import pandas as pd

from collectors import receita, pgfn, stj, carf_julgamentos, carf_acordaos_live, trf4, djen, carf_noticias
from filters.keywords import contem_palavra_chave, classificar
from classifier.opportunity import classify
from database.database import criar_banco, inserir
from economics.estimator import estimate
from economics.indice_atlas import calcular_indice_atlas
from recommender import recomendar
from ai.legenda_instagram import gerar_legenda_instagram

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
CAMINHO_EXCEL = os.path.join(PASTA_BASE, "reports", "oportunidades.xlsx")
CAMINHO_VISTOS = os.path.join(PASTA_BASE, "logs", "vistos.json")

# Parecer/analise estruturada nao rodam mais aqui em lote (eram Gemini,
# removidos - ver ai/parecer.py). Agora sao gerados sob demanda pela API
# (Claude) quando o advogado clica "Gerar parecer" na pagina da decisao.
COLETORES = [receita, pgfn, stj, carf_julgamentos, carf_acordaos_live, trf4, djen, carf_noticias]


def carregar_vistos() -> set:
    if os.path.exists(CAMINHO_VISTOS):
        with open(CAMINHO_VISTOS, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def salvar_vistos(vistos: set) -> None:
    with open(CAMINHO_VISTOS, "w", encoding="utf-8") as f:
        json.dump(list(vistos), f, ensure_ascii=False, indent=2)


def coletar_tudo() -> list[dict]:
    todas_entradas = []
    for modulo in COLETORES:
        print(f"Coletando: {modulo.__name__.split('.')[-1]}...")
        todas_entradas.extend(modulo.coletar())
    return todas_entradas


def filtrar_e_classificar(entradas: list[dict], vistos: set) -> list[dict]:
    novas_relevantes = []

    total = len(entradas)
    sem_link = 0
    ja_visto = 0
    sem_keyword = 0
    passou = 0

    for entrada in entradas:
        link = entrada.get("link", "")
        if not link or link in vistos:
            if not link:
                sem_link += 1
            else:
                ja_visto += 1
            continue

        texto_completo = f"{entrada['titulo']} {entrada['resumo']}"
        if not contem_palavra_chave(texto_completo):
            sem_keyword += 1
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
        entrada["setor_identificado"] = economia.setor_identificado
        entrada["mecanismo_economico"] = economia.mecanismo_economico
        entrada["natureza_mecanismo"] = economia.natureza_mecanismo
        entrada["regime_tributario_detectado"] = economia.regime_tributario_detectado
        indice = calcular_indice_atlas(entrada)
        entrada.update(indice)

        entrada["legenda_instagram"] = gerar_legenda_instagram(entrada)

        plano = recomendar(entrada)

        entrada["acao_sugerida"] = plano["acao"]
        entrada["prioridade_operacional"] = plano["prioridade"]
        entrada["tipo_post"] = plano["tipo_post"]
        entrada["prospeccao"] = plano["prospeccao"]

        novas_relevantes.append(entrada)
        if passou == 0:
            print(f"\n[DEBUG PRIMEIRO ITEM]\n{entrada}\n")
        vistos.add(link)
        passou += 1

    print(f"\n[DIAGNOSTICO] total={total} | sem_link={sem_link} | "
          f"ja_visto(dedup)={ja_visto} | sem_keyword={sem_keyword} | passou={passou}\n")

    return novas_relevantes


CARACTERES_ILEGAIS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")

def limpar_texto_para_excel(valor):
    if isinstance(valor, str):
        return CARACTERES_ILEGAIS.sub("", valor)
    return valor
def salvar_no_excel(novas_entradas: list[dict]) -> None:
    if not novas_entradas:
        print("Nenhuma oportunidade nova encontrada nesta execucao.")
        return

    df_novo = pd.DataFrame(novas_entradas)
    df_novo = df_novo.map(limpar_texto_para_excel)

    if os.path.exists(CAMINHO_EXCEL):
        df_existente = pd.read_excel(CAMINHO_EXCEL)
        df_final = pd.concat([df_existente, df_novo], ignore_index=True)
    else:
        df_final = df_novo

    df_final.to_excel(CAMINHO_EXCEL, index=False)
    print(f"{len(novas_entradas)} nova(s) oportunidade(s) salva(s) em {CAMINHO_EXCEL}")


def main():
    print(f"=== ATLAS Engine - execucao em {datetime.now().isoformat()} ===\n")
        
    criar_banco()

    vistos = carregar_vistos()
    entradas = coletar_tudo()
    print(f"\nTotal coletado (bruto): {len(entradas)} noticias")

    novas_relevantes = filtrar_e_classificar(entradas, vistos)
    print(f"Relevantes e novas: {len(novas_relevantes)}")

    salvar_no_excel(novas_relevantes)
        
    for oportunidade in novas_relevantes:
        inserir(oportunidade)
    salvar_vistos(vistos)

    print("\n=== Concluido ===")


if __name__ == "__main__":
    main()
