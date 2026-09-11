"""
Script de limpeza - roda uma vez so.
Remove da planilha as linhas antigas que nao tem as colunas de
classificacao/economia preenchidas (foram salvas antes dessas colunas
existirem no codigo). Faz backup antes de sobrescrever, por seguranca.
"""
import os
import shutil
import pandas as pd

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
CAMINHO_EXCEL = os.path.join(PASTA_BASE, "reports", "oportunidades.xlsx")
CAMINHO_BACKUP = os.path.join(PASTA_BASE, "reports", "oportunidades_backup_antes_limpeza.xlsx")

if not os.path.exists(CAMINHO_EXCEL):
    print(f"[ERRO] Arquivo nao encontrado: {CAMINHO_EXCEL}")
    exit()

# Backup de seguranca antes de mexer em qualquer coisa
shutil.copy2(CAMINHO_EXCEL, CAMINHO_BACKUP)
print(f"Backup salvo em: {CAMINHO_BACKUP}")

df = pd.read_excel(CAMINHO_EXCEL)
total_antes = len(df)

if "score" not in df.columns:
    print("[ERRO] Coluna 'score' nao encontrada na planilha - abortando, nada foi alterado.")
    exit()

# Mantem so as linhas que tem "score" preenchido (nao-nulo)
df_limpo = df[df["score"].notna() & df["link"].notna() & (df["link"] != "")].copy()
total_depois = len(df_limpo)

df_limpo.to_excel(CAMINHO_EXCEL, index=False)

print(f"Linhas antes: {total_antes}")
print(f"Linhas depois: {total_depois}")
print(f"Removidas: {total_antes - total_depois}")
print("Concluido - planilha atualizada.")
