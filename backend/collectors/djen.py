"""
Coletor: DJEN - Diario de Justica Eletronico Nacional (CNJ)

Desde a Resolucao CNJ 455/2022, e OBRIGATORIO que praticamente todos os
tribunais (TJs estaduais e TRFs, incluindo o TRF4) publiquem no DJEN o
conteudo de despachos, decisoes interlocutorias, dispositivos de sentenca
e a EMENTA DOS ACORDAOS - todo santo dia, num lugar so.

DESCOBERTA IMPORTANTE (09/07/2026): pesquisa confirmou que o TRF4 migrou
a parte "Judicial" (atos vinculados a processo) para o DJEN desde
18/01/2021 - ou seja, DEVERIA estar la. TRF4/TRF6/TJRS/TJSC vindo sempre
vazio nao e necessariamente falta de integracao - pode ser que o
parametro "siglaTribunal" que estamos usando nao seja o correto para
esses tribunais (por exemplo, pode ser que decisoes de 1o grau usem um
codigo diferente, tipo "JFRS"/"JFSC"/"JFPR" em vez de "TRF4").

Por isso, para os tribunais que historicamente vem vazios, este coletor
agora imprime a resposta BRUTA da API (uma vez, no primeiro termo de
busca) para diagnostico real - em vez de continuar chutando.

API publica (usada pelo proprio site comunica.pje.jus.br):
    GET https://comunicaapi.pje.jus.br/api/v1/comunicacao
"""
import time
import requests
from datetime import datetime, timezone
from .base import CABECALHOS_NAVEGADOR, PROXIES_BR, avisar_proxy_ausente_uma_vez

URL_BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao"
PAUSA_ENTRE_CHAMADAS_SEGUNDOS = 0.5

TRIBUNAIS = [
    "TRF1", "TRF2", "TRF3", "TRF4", "TRF5", "TRF6",
    "TJRS", "TJSC", "TJPR",
    "TJSP", "TJRJ", "TJMG", "TJBA", "TJPE", "TJGO", "TJDFT",
    "TJAC", "TJAL", "TJAM", "TJAP", "TJCE", "TJES", "TJMA", "TJMS",
    "TJMT", "TJPA", "TJPB", "TJPI", "TJRN", "TJRO", "TJRR", "TJSE", "TJTO",
]

# Tribunais que historicamente vem vazios - recebem diagnostico bruto
# detalhado, para descobrirmos o motivo real.
TRIBUNAIS_SUSPEITOS = {"TRF4", "TRF5", "TRF6", "TJRS", "TJSC"}

TERMOS_BUSCA = [
    "ICMS", "PIS", "COFINS", "IRPJ", "tributário", "societário",
    "recuperação judicial", "falência",
]

ITENS_POR_PAGINA = 20


def _buscar_por_termo(sigla: str, termo: str, data_hoje: str, diagnostico: bool = False,
                       max_tentativas: int = 3) -> list[dict]:
    resultados = []
    tentativas = 0

    while tentativas < max_tentativas:
        tentativas += 1
        try:
            resposta = requests.get(
                URL_BASE,
                headers=CABECALHOS_NAVEGADOR,
                proxies=PROXIES_BR,
                params={
                    "siglaTribunal": sigla,
                    "dataDisponibilizacaoInicio": data_hoje,
                    "dataDisponibilizacaoFim": data_hoje,
                    "texto": termo,
                    "itensPorPagina": ITENS_POR_PAGINA,
                    "pagina": 1,
                },
                timeout=20,
            )

            if resposta.status_code == 429 or resposta.status_code == 500:
                espera = 8 * tentativas
                motivo = "limite de requisições" if resposta.status_code == 429 else "servidor sobrecarregado"
                if diagnostico or tentativas == max_tentativas:
                    print(f"[AVISO] {sigla}: HTTP {resposta.status_code} ({motivo}) - "
                          f"tentativa {tentativas}/{max_tentativas}, esperando {espera}s...")
                if tentativas < max_tentativas:
                    time.sleep(espera)
                continue

            if diagnostico:
                print(f"\n[DIAGNOSTICO DETALHADO] {sigla} / termo='{termo}'")
                print(f"  URL completa: {resposta.url}")
                print(f"  HTTP status: {resposta.status_code}")
                print(f"  Corpo (primeiros 500 caracteres): {resposta.text[:500]}\n")

            if resposta.status_code != 200:
                return resultados

            dados = resposta.json()
            itens = dados.get("items") or dados.get("content") or (dados if isinstance(dados, list) else [])

            for item in itens:
                texto_publicacao = item.get("texto", "") or item.get("conteudo", "")
                numero_processo = item.get("numero_processo", "") or item.get("numeroprocesso", "")
                orgao = item.get("nomeOrgao", "") or item.get("orgao", "")
                link = item.get("link", "") or f"{URL_BASE}?siglaTribunal={sigla}#{numero_processo}"
                data_disp = item.get("data_disponibilizacao", "") or data_hoje

                if not texto_publicacao:
                    continue

                resultados.append({
                    "fonte": f"DJEN ({sigla})",
                    "titulo": f"{sigla} - {orgao}" if orgao else f"{sigla} - Publicação",
                    "resumo": texto_publicacao[:1500],
                    "link": link,
                    "data_publicacao": data_disp,
                    "coletado_em": datetime.now(timezone.utc).isoformat(),
                })

            break  # sucesso, sai do loop de tentativas

        except (requests.exceptions.RequestException, ValueError) as erro:
            if diagnostico:
                print(f"[DIAGNOSTICO DETALHADO] {sigla}: exceção - {erro}")
            break

    return resultados


def coletar() -> list[dict]:
    if not PROXIES_BR:
        avisar_proxy_ausente_uma_vez("DJEN/PJe Comunica")

    todos_resultados = []
    data_hoje = datetime.now().strftime("%Y-%m-%d")
    tribunais_com_erro = []
    falhas_consecutivas = 0
    modo_rapido_ativado = False

    for sigla in TRIBUNAIS:
        encontrou_algo = False
        primeiro_termo = True

        # Disjuntor: se muitos tribunais seguidos falharam, provavel
        # indisponibilidade total do DJEN hoje - reduz tentativas para
        # nao gastar horas tentando algo que nao vai se recuperar rapido.
        tentativas_a_usar = 1 if modo_rapido_ativado else 3

        for termo in TERMOS_BUSCA:
            mostrar_diagnostico = (sigla in TRIBUNAIS_SUSPEITOS) and primeiro_termo
            resultado = _buscar_por_termo(sigla, termo, data_hoje, diagnostico=mostrar_diagnostico,
                                            max_tentativas=tentativas_a_usar)
            primeiro_termo = False
            time.sleep(PAUSA_ENTRE_CHAMADAS_SEGUNDOS)
            if resultado:
                todos_resultados.extend(resultado)
                encontrou_algo = True

        if not encontrou_algo:
            tribunais_com_erro.append(sigla)
            falhas_consecutivas += 1
        else:
            falhas_consecutivas = 0

        if falhas_consecutivas >= 5 and not modo_rapido_ativado:
            modo_rapido_ativado = True
            print("[AVISO] DJEN: 5 tribunais seguidos sem retorno - possível indisponibilidade "
                  "total do serviço hoje. Reduzindo tentativas para não travar por horas.")

    print(f"[INFO] DJEN: {len(todos_resultados)} publicação(ões) coletada(s) de "
          f"{len(TRIBUNAIS) - len(tribunais_com_erro)}/{len(TRIBUNAIS)} tribunais consultados.")
    if tribunais_com_erro:
        print(f"[AVISO] DJEN - sem retorno hoje: {', '.join(tribunais_com_erro)}")

    return todos_resultados
