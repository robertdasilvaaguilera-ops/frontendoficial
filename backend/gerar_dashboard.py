"""
Painel ATLAS - v4

Novidade principal: cada oportunidade agora tem sua PROPRIA pagina de
caso (visual premium, igual ao mockup de referencia), gerada em
reports/casos/caso_N.html. A tabela principal linka para essa pagina
interna, nao mais direto para o site do governo (o link externo
aparece DENTRO da pagina de caso, como "ver decisao original").

Gera paginas de caso so para as N melhores oportunidades (por score) -
gerar milhares de arquivos individuais nao faz sentido pratico.
"""
import os
import re
import json
import html
import sqlite3
import pandas as pd
from datetime import datetime

PASTA_BASE = os.path.dirname(os.path.abspath(__file__))
CAMINHO_EXCEL = os.path.join(PASTA_BASE, "reports", "oportunidades.xlsx")
CAMINHO_SAIDA = os.path.join(PASTA_BASE, "reports", "dashboard.html")
PASTA_CASOS = os.path.join(PASTA_BASE, "reports", "casos")

def _resumo_curto(row) -> str:
    """Texto curto de fallback (tabela) quando nao ha valor numerico ou
    parecer de IA - usa o mecanismo/tributo ja identificado, sem custo
    de IA extra."""
    mecanismo = str(row.get("mecanismo_economico", "") or "").strip()
    tributos = str(row.get("tributos", "") or "").strip()
    area = str(row.get("area", "") or "").strip()
    if mecanismo and tributos:
        return f"{mecanismo} ({tributos})"
    if mecanismo:
        return mecanismo
    if tributos:
        return f"Impacto identificado em: {tributos}"
    return f"Decisão classificada em {area or 'área não identificada'}, sem mecanismo específico detectado"


LIMITE_PAGINAS_DE_CASO = None  # None = gera pagina para TODAS as decisoes (Fase 1 do PDF: "todas devem estar disponíveis")


def _limpar_markdown(texto: str) -> str:
    """Remove marcadores de markdown (**negrito**, *itálico*, #) que o
    Gemini as vezes retorna, mas que aparecem como simbolos soltos em
    HTML puro se nao forem tratados."""
    texto = str(texto or "")
    texto = re.sub(r"\*\*(.+?)\*\*", r"\1", texto)
    texto = re.sub(r"\*(.+?)\*", r"\1", texto)
    texto = texto.replace("*", "").replace("#", "")
    return texto.strip()

# Percentual aproximado de reducao por mecanismo/tributo - usado so para
# ilustrar a tabela de "regra pratica" na pagina de caso. Estimativa
# generica (aliquotas nominais federais), nao substitui calculo real.
PERCENTUAIS_MECANISMO = {
    "irpj": 0.25, "csll": 0.09, "pis": 0.0165, "cofins": 0.076, "icms": 0.18,
}


def _slug(texto: str) -> str:
    texto = re.sub(r"[^a-zA-Z0-9]+", "-", texto.lower()).strip("-")
    return texto[:40] or "caso"


def _estimar_percentual(row) -> float:
    tributos = str(row.get("tributos", "")).lower()
    percentual = 0.0
    for chave, valor in PERCENTUAIS_MECANISMO.items():
        if chave in tributos:
            percentual += valor
    return percentual if percentual > 0 else 0.15  # fallback generico


def gerar_pagina_caso(row: dict, indice: int) -> str:
    titulo = html.escape(str(row.get("titulo", "Oportunidade"))[:140])
    fonte = html.escape(str(row.get("fonte", "")))
    area = html.escape(str(row.get("area", "")))
    mecanismo = html.escape(str(row.get("mecanismo_economico", "") or "Não classificado"))
    score = row.get("score", 0)
    risco = row.get("risco", 0)
    economia = row.get("economia_estimada", 0) or 0
    empresas = row.get("empresas_afetadas", 0) or 0
    setores = html.escape(str(row.get("setores", "")))
    parecer = html.escape(_limpar_markdown(row.get("parecer", "")))
    link_original = html.escape(str(row.get("link", "")))
    resultado_bruto = html.escape(str(row.get("resultado_bruto", "")))

    favoravel = risco < 50
    status_texto = "Entendimento favorável ao contribuinte" if favoravel else "Sinal de risco / alerta"
    status_cor = "#6FAE8C" if favoravel else "#C77B7B"

    percentual = _estimar_percentual(row)
    percentual_fmt = f"{percentual*100:.1f}".rstrip("0").rstrip(".")

    tributos_lista = [t.strip() for t in str(row.get("tributos", "")).split(",") if t.strip()]
    linhas_explicacao_tributo = "".join(
        f'<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:13px;">'
        f'<span>{html.escape(t)}</span>'
        f'<span class="mono" style="color:#5B85C9">{PERCENTUAIS_MECANISMO.get(t.lower(), 0)*100:.2f}% sobre a base de cálculo do {html.escape(t)}</span></div>'
        for t in tributos_lista if t.lower() in PERCENTUAIS_MECANISMO
    )
    if not linhas_explicacao_tributo:
        linhas_explicacao_tributo = '<div style="font-size:13px; color:var(--gray)">Percentual não identificado especificamente por tributo neste caso.</div>'

    exemplos_valores = [100_000, 500_000, 1_000_000, 5_000_000]
    linhas_exemplo = "".join(
        f"""<div class="exemplo-card">
                <div class="exemplo-lbl">Crédito</div>
                <div class="exemplo-val mono">R$ {v:,.0f}".replace(",", ".")</div>
                <div class="exemplo-lbl" style="margin-top:10px">Economia</div>
                <div class="exemplo-val mono" style="color:#6FAE8C">R$ {v*percentual:,.0f}".replace(",", ".")</div>
            </div>""" for v in exemplos_valores
    )
    # corrige a formatacao (o replace acima nao funciona dentro do f-string aninhado)
    linhas_exemplo = "".join(
        f"""<div class="exemplo-card">
                <div class="exemplo-lbl">Crédito</div>
                <div class="exemplo-val mono">R$ {format(v, ",.0f").replace(",", ".")}</div>
                <div class="exemplo-lbl" style="margin-top:10px">Economia</div>
                <div class="exemplo-val mono" style="color:#6FAE8C">R$ {format(v*percentual, ",.0f").replace(",", ".")}</div>
            </div>""" for v in exemplos_valores
    )

    dados_grafico = json.dumps([round(v * percentual) for v in exemplos_valores])
    labels_grafico = json.dumps([f"R$ {v//1000}k" if v < 1_000_000 else f"R$ {v//1_000_000}M" for v in exemplos_valores])

    legenda = str(row.get("legenda_instagram", "") or "")
    legenda_html = html.escape(legenda).replace("\n", "<br>")
    legenda_js = json.dumps(legenda)

    legenda_bloco = f"""
    <div class="secao box">
        <div class="secao-titulo" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Legenda sugerida (Instagram)</span>
            <button onclick="copiarLegenda()" style="background:rgba(91,133,201,0.15); border:1px solid rgba(91,133,201,0.3); color:#5B85C9; padding:5px 12px; border-radius:6px; font-size:11px; cursor:pointer;">Copiar texto</button>
        </div>
        <div style="font-size:13px; line-height:1.7; color:#D5DAE8;">{legenda_html}</div>
    </div>
    <script>
    function copiarLegenda() {{
        navigator.clipboard.writeText({legenda_js});
    }}
    </script>""" if legenda else ""

    tem_parecer_ia = bool(parecer and parecer != "nan")
    texto_parecer_final = parecer if tem_parecer_ia else html.escape(_resumo_curto(row))
    rotulo_parecer = "Parecer executivo (ATLAS · gerado por IA)" if tem_parecer_ia else "Resumo (classificação automática — sem análise aprofundada de IA)"

    parecer_bloco = f"""
    <div class="secao msg-executiva">
        <div class="rotulo">{rotulo_parecer}</div>
        <p>{texto_parecer_final}</p>
    </div>"""

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>ATLAS | {titulo}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
<style>
    :root {{ --navy-dark:#080D16; --navy-mid:#101A30; --gray:#8A93A8; --blue:#5B85C9; --green:#6FAE8C; }}
    * {{ box-sizing:border-box; margin:0; padding:0; }}
    body {{ font-family:'Inter',Arial,sans-serif; background:radial-gradient(circle at 15% -10%, var(--navy-mid) 0%, var(--navy-dark) 60%); color:#EAEEF7; padding:48px 56px 80px; }}
    .mono {{ font-family:'IBM Plex Mono',monospace; }}
    .wrap {{ max-width:1080px; margin:0 auto; }}
    a.voltar {{ color:var(--gray); font-size:12px; text-decoration:none; }}
    a.voltar:hover {{ color:#fff; }}
    header {{ margin:20px 0 36px; }}
    .marca {{ display:flex; align-items:center; gap:10px; margin-bottom:16px; }}
    .simbolo {{ width:30px; height:30px; border-radius:50%; border:1.5px solid var(--blue); position:relative; }}
    .simbolo::after {{ content:''; position:absolute; top:50%; left:-1.5px; right:-1.5px; height:1px; background:var(--blue); }}
    .marca span {{ font-size:16px; font-weight:800; letter-spacing:3px; }}
    .titulo-analise {{ font-size:26px; font-weight:700; color:#fff; max-width:760px; line-height:1.3; }}
    .status {{ display:inline-flex; align-items:center; gap:8px; background:{status_cor}1A; border:1px solid {status_cor}55; color:{status_cor}; padding:6px 16px; border-radius:24px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; margin-top:16px; }}
    .status::before {{ content:''; width:7px; height:7px; border-radius:50%; background:{status_cor}; }}
    .cards {{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:28px; }}
    .card {{ background:rgba(255,255,255,0.045); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.09); border-radius:14px; padding:20px; }}
    .card .icone {{ width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; margin-bottom:10px; }}
    .icone.verde {{ background:rgba(111,174,140,0.15); color:#6FAE8C; }}
    .icone.vermelho {{ background:rgba(199,123,123,0.15); color:#C77B7B; }}
    .icone.azul {{ background:rgba(91,133,201,0.15); color:#5B85C9; }}
    .icone.roxo {{ background:rgba(155,124,201,0.15); color:#9B7CC9; }}
    .card .num {{ font-size:22px; font-weight:800; color:#fff; }}
    .card .lbl {{ color:var(--gray); font-size:10px; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px; font-weight:600; }}
    .secao {{ margin-bottom:24px; }}
    .secao-titulo {{ font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:var(--gray); font-weight:700; margin-bottom:12px; }}
    .box {{ background:rgba(255,255,255,0.045); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.09); border-radius:14px; padding:24px; }}
    .exemplos {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:14px; }}
    .exemplo-card {{ background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:14px; }}
    .exemplo-lbl {{ font-size:10px; color:var(--gray); text-transform:uppercase; letter-spacing:0.5px; }}
    .exemplo-val {{ font-size:14px; font-weight:700; color:#fff; margin-top:2px; }}
    .msg-executiva {{ background:linear-gradient(135deg, rgba(91,133,201,0.1), rgba(111,174,140,0.06)); border:1px solid rgba(91,133,201,0.25); border-radius:14px; padding:26px; }}
    .msg-executiva .rotulo {{ font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:var(--blue); font-weight:700; margin-bottom:10px; }}
    .msg-executiva p {{ font-size:14px; line-height:1.7; color:#EAEEF7; }}
    .fonte-original {{ font-size:12px; color:var(--gray); margin-top:30px; }}
    .fonte-original a {{ color:var(--blue); }}
    .chart-container {{ position:relative; height:200px; }}
</style>
</head>
<body>
<div class="wrap">
<a class="voltar" href="../dashboard.html">&larr; Voltar ao painel</a>
<header>
    <div class="marca"><div class="simbolo"></div><span>ATLAS</span></div>
    <div class="titulo-analise">{titulo}</div>
    <div class="status">{status_texto}</div>
</header>

<div class="cards">
    <div class="card">
        <div class="icone verde"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div>
        <div class="num">R$ {format(economia, ",.0f").replace(",", ".") if economia else "-"}</div><div class="lbl">Economia estimada</div>
    </div>
    <div class="card">
        <div class="icone azul"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></div>
        <div class="num">{row.get("indice_atlas", score)}</div><div class="lbl">Índice ATLAS (score bruto: {score})</div>
    </div>
    <div class="card">
        <div class="icone roxo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="14" rx="1"/><path d="M9 21V7a2 2 0 012-2h2a2 2 0 012 2v14"/></svg></div>
        <div class="num">{format(empresas, ",.0f").replace(",", ".") if empresas else "-"}</div><div class="lbl">Empresas potencialmente afetadas</div>
    </div>
    <div class="card">
        <div class="icone vermelho"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L14.7 3.86a2 2 0 00-3.4 0z"/></svg></div>
        <div class="num" style="color:{status_cor}">{risco}</div><div class="lbl">Índice de risco</div>
    </div>
</div>

<div class="secao box">
    <div class="secao-titulo">De onde vem o percentual estimado</div>
    {linhas_explicacao_tributo}
</div>

<div class="secao box">
    <div class="secao-titulo">Regra prática — economia estimada ({percentual_fmt}% do valor envolvido)</div>
    <div class="chart-container"><canvas id="grafico"></canvas></div>
    <div class="exemplos">{linhas_exemplo}</div>
</div>

<div class="secao box">
    <div class="secao-titulo">Classificação</div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; font-size:13px;">
        <div><span style="color:var(--gray)">Área:</span> {area}</div>
        <div><span style="color:var(--gray)">Mecanismo:</span> {mecanismo}</div>
        <div><span style="color:var(--gray)">Setores:</span> {setores or '-'}</div>
        <div><span style="color:var(--gray)">Resultado:</span> {resultado_bruto or '-'}</div>
    </div>
</div>
{parecer_bloco}
{legenda_bloco}

<div class="fonte-original">Fonte: {fonte} — <a href="{link_original}" target="_blank">ver decisão original</a></div>
</div>

<script>
Chart.defaults.color = '#8A93A8';
Chart.defaults.font.family = 'Inter';
new Chart(document.getElementById('grafico'), {{
    type: 'line',
    data: {{
        labels: {labels_grafico},
        datasets: [{{ data: {dados_grafico}, borderColor: '#5B85C9', backgroundColor: 'rgba(91,133,201,0.12)',
            fill: true, tension: 0.35, pointBackgroundColor: '#5B85C9', pointRadius: 4 }}]
    }},
    options: {{ plugins: {{ legend: {{ display:false }} }},
        scales: {{ y: {{ grid: {{ color:'rgba(255,255,255,0.05)' }} }}, x: {{ grid: {{ display:false }} }} }} }}
}});
</script>
</body>
</html>"""


def gerar():
    if not os.path.exists(CAMINHO_EXCEL):
        print(f"[ERRO] Planilha não encontrada: {CAMINHO_EXCEL}")
        return

    os.makedirs(PASTA_CASOS, exist_ok=True)

    df = pd.read_excel(CAMINHO_EXCEL)
    df = df.fillna("")

    total_analisadas = len(df)
    economia_total = df["economia_estimada"].sum() if "economia_estimada" in df.columns else 0
    valor_em_risco = df[df["risco"] >= 50]["economia_estimada"].sum() if "risco" in df.columns else 0
    qtd_riscos_altos = len(df[df["risco"] >= 50]) if "risco" in df.columns else 0
    qtd_score_alto = len(df[df["score"] >= 80]) if "score" in df.columns else 0
    taxa_aproveitamento = round((qtd_score_alto / total_analisadas * 100), 2) if total_analisadas else 0

    # CORRIGIDO: empresas afetadas nao pode ser SOMA por linha (conta a
    # mesma empresa varias vezes se o mesmo setor aparecer em muitas
    # decisoes). Conta por SETOR UNICO mencionado, usando o numero real
    # de empresas desse setor (tabela setores, dados da Receita Federal).
    setores_unicos_mencionados = set()
    if "setor_identificado" in df.columns:
        setores_unicos_mencionados.update(s for s in df["setor_identificado"] if s and str(s).strip())
    if not setores_unicos_mencionados and "setores" in df.columns:
        for v in df["setores"]:
            setores_unicos_mencionados.update(s.strip() for s in str(v).split(",") if s.strip())

    empresas_total = 0
    if setores_unicos_mencionados:
        try:
            conexao_setores = sqlite3.connect(os.path.join(PASTA_BASE, "database", "atlas.db"))
            cursor_setores = conexao_setores.cursor()
            for setor_nome in setores_unicos_mencionados:
                cursor_setores.execute("SELECT empresas_brasil FROM setores WHERE setor = ?", (setor_nome,))
                linha_setor = cursor_setores.fetchone()
                if linha_setor:
                    empresas_total += linha_setor[0]
            conexao_setores.close()
        except sqlite3.Error:
            empresas_total = 0

    # Mapa de sigla de tribunal (TJ estadual) para UF, usado no filtro
    MAPA_UF = {
        "TJAC":"AC","TJAL":"AL","TJAM":"AM","TJAP":"AP","TJBA":"BA","TJCE":"CE","TJDFT":"DF",
        "TJES":"ES","TJGO":"GO","TJMA":"MA","TJMG":"MG","TJMS":"MS","TJMT":"MT","TJPA":"PA",
        "TJPB":"PB","TJPE":"PE","TJPI":"PI","TJPR":"PR","TJRJ":"RJ","TJRN":"RN","TJRO":"RO",
        "TJRR":"RR","TJRS":"RS","TJSC":"SC","TJSE":"SE","TJSP":"SP","TJTO":"TO",
    }

    def _extrair_uf(fonte_texto: str) -> str:
        match = re.search(r"\(([A-Z]{2,5})\)", str(fonte_texto))
        if match:
            return MAPA_UF.get(match.group(1), "")
        return ""

    if "fonte" in df.columns:
        df["_uf"] = df["fonte"].apply(_extrair_uf)
    else:
        df["_uf"] = ""
    ufs_unicas = sorted(set(u for u in df["_uf"] if u))

    def fmt_moeda(v):
        try: return f"{float(v):,.0f}".replace(",", ".")
        except (ValueError, TypeError): return "0"
    def fmt_numero(v):
        try: return f"{int(v):,}".replace(",", ".")
        except (ValueError, TypeError): return "0"

    fontes_unicas = sorted(set(str(v).split(" (")[0].split(" - ")[0].strip() for v in df.get("fonte", []) if str(v).strip()))
    areas_unicas = sorted(set(str(v).strip() for v in df.get("area", []) if str(v).strip()))
    setores_unicos = sorted(set(s.strip() for v in df.get("setores", []) for s in str(v).split(",") if s.strip())) if "setores" in df.columns else []

    df_ordenado = df.sort_values("indice_atlas", ascending=False) if "indice_atlas" in df.columns else (
        df.sort_values("score", ascending=False) if "score" in df.columns else df
    )

    # Gera pagina individual para as N melhores, e monta o link interno
    links_internos = {}
    df_para_paginas = df_ordenado if LIMITE_PAGINAS_DE_CASO is None else df_ordenado.head(LIMITE_PAGINAS_DE_CASO)
    for indice, (_, row) in enumerate(df_para_paginas.iterrows()):
        html_caso = gerar_pagina_caso(row.to_dict(), indice)
        nome_arquivo = f"caso_{indice}_{_slug(str(row.get('titulo','')))}.html"
        with open(os.path.join(PASTA_CASOS, nome_arquivo), "w", encoding="utf-8") as f:
            f.write(html_caso)
        links_internos[row.name] = f"casos/{nome_arquivo}"

    registros = []
    for idx, row in df_ordenado.iterrows():
        item = row[[c for c in ["titulo","fonte","area","setores","score","economia_estimada",
                                  "empresas_afetadas","risco","mecanismo_economico"] if c in df.columns]].to_dict()
        item["link_interno"] = links_internos.get(idx, "")
        item["uf"] = row.get("_uf", "")
        item["resumo_curto"] = _resumo_curto(row)
        if "parecer" in df.columns:
            item["tem_parecer"] = bool(str(row.get("parecer", "")).strip())
        registros.append(item)

    dados_json = json.dumps(registros, ensure_ascii=False)
    fontes_json = json.dumps(fontes_unicas, ensure_ascii=False)
    areas_json = json.dumps(areas_unicas, ensure_ascii=False)
    setores_json = json.dumps(setores_unicos, ensure_ascii=False)
    ufs_json = json.dumps(ufs_unicas, ensure_ascii=False)
    agora_str = datetime.now().strftime("%d/%m/%Y às %H:%M")

    html_principal = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>ATLAS | Inteligência Econômico-Tributária</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
<style>
    :root {{ --navy-dark:#0A1220; --navy-mid:#14213D; --gray:#8A93A8; --blue:#5B85C9; --red-soft:#C77B7B; }}
    * {{ box-sizing:border-box; }}
    body {{ font-family:'Inter',Arial,sans-serif; background:radial-gradient(circle at 20% 0%, var(--navy-mid) 0%, var(--navy-dark) 55%); color:#EAEEF7; margin:0; padding:48px 56px; }}
    .mono {{ font-family:'IBM Plex Mono',monospace; }}
    header {{ display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; }}
    .marca {{ display:flex; align-items:center; gap:14px; }}
    .simbolo {{ width:38px; height:38px; border-radius:50%; border:2px solid var(--blue); position:relative; }}
    .simbolo::after {{ content:''; position:absolute; top:50%; left:-2px; right:-2px; height:1px; background:var(--blue); }}
    h1 {{ font-size:24px; font-weight:800; letter-spacing:3px; margin:0; color:#fff; }}
    .tagline {{ color:var(--gray); font-size:13px; margin-top:4px; }}
    .cards {{ display:grid; grid-template-columns:repeat(4,1fr); gap:20px; margin:36px 0; }}
    .card {{ background:rgba(255,255,255,0.04); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:26px; box-shadow:0 8px 32px rgba(0,0,0,0.25); }}
    .card .icone {{ width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; margin-bottom:14px; }}
    .icone.verde {{ background:rgba(111,174,140,0.15); color:#6FAE8C; }}
    .icone.vermelho {{ background:rgba(199,123,123,0.15); color:#C77B7B; }}
    .icone.azul {{ background:rgba(91,133,201,0.15); color:#5B85C9; }}
    .icone.roxo {{ background:rgba(155,124,201,0.15); color:#9B7CC9; }}
    .card .numero {{ font-size:30px; font-weight:800; color:#fff; }}
    .card.risco .numero {{ color:var(--red-soft); }}
    .card .label {{ color:var(--gray); font-size:11px; text-transform:uppercase; letter-spacing:1px; margin-top:8px; font-weight:600; }}
    .filtros {{ display:flex; gap:14px; margin:30px 0 20px; flex-wrap:wrap; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:16px 20px; }}
    .filtros select {{ padding:8px 14px; border:1px solid rgba(255,255,255,0.08); border-radius:8px; font-size:13px; color:#EAEEF7; background:var(--navy-mid); }}
    .filtros label {{ font-size:10px; text-transform:uppercase; color:var(--gray); letter-spacing:1px; display:block; margin-bottom:4px; }}
    .contador-resultado {{ color:var(--gray); font-size:12px; margin-bottom:14px; }}
    .tabela-container {{ background:rgba(255,255,255,0.04); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden; max-height:600px; overflow-y:auto; }}
    table {{ width:100%; border-collapse:collapse; }}
    th {{ text-align:left; background:rgba(255,255,255,0.03); color:var(--gray); padding:14px 16px; font-size:10px; text-transform:uppercase; letter-spacing:1px; position:sticky; top:0; }}
    td {{ padding:13px 16px; border-bottom:1px solid rgba(255,255,255,0.04); font-size:13px; color:#D5DAE8; }}
    a {{ color:var(--blue); text-decoration:none; }}
    a:hover {{ text-decoration:underline; }}
    .score-badge {{ font-weight:700; padding:3px 10px; border-radius:6px; font-size:11px; background:rgba(91,133,201,0.15); color:var(--blue); border:1px solid rgba(91,133,201,0.3); }}
</style>
</head>
<body>
<header>
    <div>
        <div class="marca"><div class="simbolo"></div><h1>ATLAS</h1></div>
        <div class="tagline">Inteligência Econômico-Tributária para Empresas</div>
    </div>
    <div class="mono" style="color:var(--gray); font-size:11px;">Atualizado em {agora_str}</div>
</header>

<div class="cards">
    <div class="card">
        <div class="icone verde"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div>
        <div class="numero">R$ {fmt_moeda(economia_total)}</div><div class="label">Economia identificada</div>
    </div>
    <div class="card risco">
        <div class="icone vermelho"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L14.7 3.86a2 2 0 00-3.4 0z"/></svg></div>
        <div class="numero">R$ {fmt_moeda(valor_em_risco)}</div><div class="label">Exposto a risco ({qtd_riscos_altos})</div>
    </div>
    <div class="card">
        <div class="icone azul"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="14" rx="1"/><path d="M9 21V7a2 2 0 012-2h2a2 2 0 012 2v14"/></svg></div>
        <div class="numero">{fmt_numero(empresas_total)}</div><div class="label">Empresas potencialmente afetadas</div>
    </div>
    <div class="card">
        <div class="icone roxo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M18 9l-5 5-3-3-4 4"/></svg></div>
        <div class="numero">{taxa_aproveitamento}%</div><div class="label">Taxa de aproveitamento</div>
    </div>
</div>

<div class="filtros">
    <div><label>Fonte</label><select id="filtroFonte"><option value="">Todas</option></select></div>
    <div><label>Área</label><select id="filtroArea"><option value="">Todas</option></select></div>
    <div><label>Setor</label><select id="filtroSetor"><option value="">Todos</option></select></div>
    <div><label>Estado (UF)</label><select id="filtroUF"><option value="">Todos</option></select></div>
</div>
<div class="contador-resultado" id="contadorResultado"></div>
<div class="tabela-container">
    <table><thead><tr><th>Título</th><th>Fonte</th><th>Score</th><th>Área</th><th>Economia/Risco</th></tr></thead>
    <tbody id="corpoTabela"></tbody></table>
</div>

<script>
const DADOS = {dados_json};
const FONTES = {fontes_json};
const AREAS = {areas_json};
const SETORES = {setores_json};
const UFS = {ufs_json};
function preencherSelect(id, lista) {{
    const s = document.getElementById(id);
    lista.forEach(i => {{ const o = document.createElement('option'); o.value=i; o.textContent=i; s.appendChild(o); }});
}}
preencherSelect('filtroFonte', FONTES); preencherSelect('filtroArea', AREAS); preencherSelect('filtroSetor', SETORES); preencherSelect('filtroUF', UFS);
function fmtMoeda(v) {{ return v ? 'R$ ' + Number(v).toLocaleString('pt-BR', {{maximumFractionDigits:0}}) : ''; }}
function renderizar() {{
    const fF=document.getElementById('filtroFonte').value, fA=document.getElementById('filtroArea').value,
          fS=document.getElementById('filtroSetor').value, fU=document.getElementById('filtroUF').value;
    let filtrados = DADOS.filter(i => (!fF || String(i.fonte||'').includes(fF)) && (!fA || i.area===fA) &&
        (!fS || String(i.setores||'').includes(fS)) && (!fU || i.uf===fU));
    document.getElementById('contadorResultado').textContent = filtrados.length + ' de ' + DADOS.length + ' decisões';
    document.getElementById('corpoTabela').innerHTML = filtrados.map(i => {{
        const temPagina = i.link_interno && i.link_interno.length > 0;
        const linkHtml = temPagina
            ? `<a href="${{i.link_interno}}">${{(i.titulo||'').substring(0,80)}}</a>`
            : `<span style="color:#8A93A8" title="Página detalhada não gerada para esta linha">${{(i.titulo||'').substring(0,80)}}</span>`;
        // Se nao ha valor numerico de economia, mostra o resumo textual do mecanismo em vez de branco
        const valorCelula = fmtMoeda(i.economia_estimada) || `<span style="color:#8A93A8; font-size:12px;">${{i.resumo_curto||'-'}}</span>`;
        return `<tr><td>${{linkHtml}}</td><td>${{i.fonte||''}}</td><td><span class="score-badge">${{i.score||0}}</span></td><td>${{i.area||''}}</td><td>${{valorCelula}}</td></tr>`;
    }}).join('');
}}
['filtroFonte','filtroArea','filtroSetor','filtroUF'].forEach(id => document.getElementById(id).addEventListener('change', renderizar));
renderizar();
</script>
</body>
</html>"""

    with open(CAMINHO_SAIDA, "w", encoding="utf-8") as f:
        f.write(html_principal)

    print(f"Painel gerado: {CAMINHO_SAIDA}")
    total_paginas_geradas = total_analisadas if LIMITE_PAGINAS_DE_CASO is None else min(LIMITE_PAGINAS_DE_CASO, total_analisadas)
    print(f"Páginas de caso individuais geradas: {total_paginas_geradas} em {PASTA_CASOS}")


if __name__ == "__main__":
    gerar()
