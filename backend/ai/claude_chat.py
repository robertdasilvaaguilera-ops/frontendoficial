"""
Copiloto ATLAS - chat com a IA da Anthropic (Claude) que responde advogados
com base nas decisoes coletadas pelo pipeline da ATLAS.

Diferente do gemini.py (que gera parecer para UMA decisao ja identificada),
este modulo recebe a pergunta do advogado + as decisoes mais relevantes do
nosso banco (ver api_server.py -> _buscar_decisoes_relevantes) e devolve uma
resposta fundamentada, citando qual decisao sustenta cada afirmacao.

Como conseguir a chave:
  1. Acesse https://console.anthropic.com/settings/keys
  2. Crie uma API key
  3. Configure no Windows: setx ANTHROPIC_API_KEY "sua-chave-aqui"
     (feche e abra um terminal novo depois)
  Linux/Mac: export ANTHROPIC_API_KEY="sua-chave-aqui"
"""
import os
import requests

API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Modelo usado pelo copiloto. Pode ser trocado via variavel de ambiente sem
# precisar mexer no codigo (ex: para um modelo mais barato em volume alto).
MODELO = os.getenv("ATLAS_CLAUDE_MODEL", "claude-sonnet-5")

URL = "https://api.anthropic.com/v1/messages"

SYSTEM_PROMPT = """Você é o Copiloto ATLAS, assistente de IA de uma plataforma jurídica \
para escritórios de advocacia tributária e empresarial. Você conversa com o advogado \
como um colega experiente conversaria - direto, natural, sem parecer um consultor \
recitando um relatório.

Advogados vão te perguntar sobre teses, riscos e oportunidades tributárias. Junto de \
cada pergunta você recebe DECISÕES e, quando existirem, NOTÍCIAS relacionadas, \
encontradas por uma busca (palavra-chave + setor) rodada sobre TODA a base da ATLAS \
- milhares de decisões (CARF, STF, STJ, TRFs, tribunais estaduais, PGFN etc.) e \
centenas de notícias. O que você recebe já é o resultado dessa busca na base inteira, \
não uma amostra arbitrária - trate como "o que a nossa base tem sobre isso".

Regras obrigatórias:
1. Priorize SEMPRE as decisões e notícias fornecidas como fundamento da resposta. Ao
   usar uma, cite entre colchetes, ex: [Decisão 3] ou [Notícia 2], junto do tribunal/
   fonte e da data, para o advogado conseguir localizar e conferir.
2. Nunca invente número de processo, relator ou teor de decisão que não esteja no
   contexto fornecido. Se um dado (relator, número exato do processo) não vier na
   lista, diga que não consta na base em vez de supor.
3. Se a busca não trouxe nada relevante para o tema perguntado, diga isso de forma
   direta e natural - "não encontrei nada na nossa base sobre X" - sem mencionar
   quantas decisões vieram no contexto ou dar a entender que a base é pequena (a
   busca já varreu a base inteira; se não veio nada, é porque não há resultado, não
   porque só foi mostrado um recorte pequeno pra você). Só então complemente com
   conhecimento jurídico geral, deixando explícito que aquele trecho é orientação
   geral e NÃO está lastreado nas decisões coletadas pela ATLAS.
4. Cada decisão vem com o resultado dela para o contribuinte já classificado
   (desfavorável/risco ou favorável/oportunidade) - use essa classificação ao
   responder perguntas do tipo "o que prejudica" ou "o que favorece" o contribuinte,
   em vez de reinterpretar a ementa do zero.
5. Seja específico e prático: cite tributos, teses e valores sempre que possível
   extrair isso das decisões.
6. Responda em português do Brasil, em texto corrido normal, como se estivesse
   escrevendo um e-mail ou falando com o advogado - NUNCA use markdown: sem #, sem
   ## de título, sem ** de negrito, sem listas com * ou -, sem numeração tipo "1)"
   ou "### Seção". Parágrafos e frases comuns, pontuação normal. Se precisar separar
   ideias, use parágrafos, não marcadores.
"""


def _formatar_contexto(decisoes: list[dict], noticias: list[dict]) -> str:
    partes = []

    if decisoes:
        blocos = []
        for i, d in enumerate(decisoes, start=1):
            resultado = (
                "desfavorável ao contribuinte (risco)"
                if d.get("tipo") == "risco"
                else "favorável ao contribuinte (oportunidade)"
            )
            blocos.append(
                f"[Decisão {i}] id={d.get('id')} | {d.get('tribunal', '')} | "
                f"{d.get('data', '')} | {d.get('titulo', '')}\n"
                f"Resultado para o contribuinte: {resultado}\n"
                f"Mecanismo: {d.get('mecanismo') or 'não classificado'}\n"
                f"Tributos: {', '.join(d.get('tributos') or []) or '-'}\n"
                f"Ementa/resumo: {str(d.get('ementa') or '')[:1200]}\n"
                f"URL oficial: {d.get('url') or 'não disponível'}"
            )
        partes.append("DECISÕES ENCONTRADAS NA BASE:\n\n" + "\n\n".join(blocos))
    else:
        partes.append("Nenhuma decisão da base ATLAS bateu com esta pergunta.")

    if noticias:
        blocos = []
        for i, n in enumerate(noticias, start=1):
            blocos.append(
                f"[Notícia {i}] id={n.get('id')} | {n.get('tribunal', '')} | "
                f"{n.get('data', '')} | {n.get('titulo', '')}\n"
                f"Resumo: {str(n.get('resumo') or '')[:800]}\n"
                f"URL oficial: {n.get('url') or 'não disponível'}"
            )
        partes.append("NOTÍCIAS ENCONTRADAS NA BASE:\n\n" + "\n\n".join(blocos))

    return "\n\n---\n\n".join(partes)


def chamar(
    system: str, mensagens: list[dict], max_tokens: int = 1500, retornar_uso: bool = False
) -> str | tuple[str, dict]:
    """
    Chamada HTTP crua a Claude (Anthropic Messages API), com o tratamento de
    erro comum (chave ausente/invalida). Reaproveitada por perguntar() aqui
    embaixo e por ai/social_post.py (gerador de posts de Instagram).

    retornar_uso=True devolve (texto, {"tokensEntrada": N, "tokensSaida": N})
    em vez de só o texto - usado pelo chat do Copiloto pra medir o custo
    real da chamada contra o orçamento diário do usuário (ver auth.py).
    """
    if not API_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY nao encontrada no ambiente. Configure com "
            "'setx ANTHROPIC_API_KEY \"sua-chave\"' (Windows, terminal novo depois) "
            "ou 'export ANTHROPIC_API_KEY=...' (Linux/Mac)."
        )

    resposta = requests.post(
        URL,
        headers={
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": MODELO,
            "max_tokens": max_tokens,
            "system": system,
            "messages": mensagens,
        },
        timeout=120,
    )

    if resposta.status_code == 401:
        motivo = ""
        try:
            motivo = resposta.json().get("error", {}).get("message", "")
        except ValueError:
            pass
        raise RuntimeError(
            "A Claude API recusou a chave (401 Unauthorized)"
            + (f" - motivo da Anthropic: '{motivo}'" if motivo else "")
            + ". Confirme backend/.env (uma unica linha, sem aspas/espacos) ou "
            "gere uma chave nova em console.anthropic.com/settings/keys. Se o "
            "arquivo .env parecer correto mesmo assim, pode ser antivirus/proxy "
            "bloqueando ou alterando a conexao HTTPS com api.anthropic.com."
        )

    if resposta.status_code != 200:
        print(f"[ERRO] Claude API respondeu {resposta.status_code}: {resposta.text[:500]}")

    resposta.raise_for_status()

    dados = resposta.json()
    partes = [p.get("text", "") for p in dados.get("content", []) if p.get("type") == "text"]
    texto = "".join(partes).strip()
    if retornar_uso:
        uso = dados.get("usage", {})
        return texto, {
            "tokensEntrada": uso.get("input_tokens", 0),
            "tokensSaida": uso.get("output_tokens", 0),
        }
    return texto


def perguntar(
    pergunta: str,
    decisoes: list[dict],
    noticias: list[dict] | None = None,
    historico: list[dict] | None = None,
    retornar_uso: bool = False,
) -> str | tuple[str, dict]:
    """
    pergunta: texto do advogado.
    decisoes: lista de dicts (id, tipo, titulo, tribunal, data, mecanismo,
        tributos, ementa, url) - ja filtrada/rankeada por relevancia pelo
        chamador, buscando sobre a base inteira de decisoes.
    noticias: lista de dicts (id, titulo, tribunal, data, resumo, url) -
        mesma logica, buscando sobre a base inteira de noticias.
    historico: mensagens anteriores da conversa, no formato
        [{"role": "user"|"assistant", "content": "..."}], sem o contexto de
        decisoes/noticias (que e reinjetado a cada pergunta nova).
    """
    contexto = _formatar_contexto(decisoes, noticias or [])
    mensagens = list(historico or [])
    mensagens.append({
        "role": "user",
        "content": f"{contexto}\n\nPERGUNTA DO ADVOGADO:\n{pergunta}",
    })
    return chamar(SYSTEM_PROMPT, mensagens, retornar_uso=retornar_uso)
