"""
Script de DIAGNOSTICO - roda uma vez so, para ver o conteudo real das
colunas do CARF (sem passar pelo filtro de palavras-chave).
Coloque este arquivo na pasta atlas/ (mesmo nivel do main.py) e rode:
    python debug_carf.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from collectors.carf import coletar

resultados = coletar()

print(f"\nTotal de linhas processadas: {len(resultados)}\n")
print("=" * 70)
print("PRIMEIRAS 5 LINHAS (titulo e resumo construidos pelo coletor):")
print("=" * 70)

for i, item in enumerate(resultados[:5]):
    print(f"\n--- Linha {i+1} ---")
    print(f"titulo : {item['titulo']!r}")
    print(f"resumo : {item['resumo']!r}")

print("\n" + "=" * 70)
print("VALORES UNICOS encontrados na coluna 'titulo' (amostra de 20):")
print("=" * 70)
titulos_unicos = sorted(set(item['titulo'] for item in resultados))
for t in titulos_unicos[:20]:
    print(f"  - {t!r}")

print(f"\nTotal de titulos unicos diferentes: {len(titulos_unicos)}")
