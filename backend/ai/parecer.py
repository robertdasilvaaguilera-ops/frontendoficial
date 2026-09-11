"""
Parecer tecnico estruturado, gerado sob demanda (o advogado clica em
"Gerar parecer" na pagina da decisao) via Claude.

Substitui o antigo par ai/gemini.py + ai/analise_estrutural.py, que
usavam o Gemini e rodavam em lote durante a coleta (main.py), so pra uma
fracao pequena das decisoes (as de maior indice) - o resto ficava com o
"Parecer tecnico" vazio. Gerar sob demanda, so quando o advogado realmente
precisa, e mais economico e cobre qualquer decisao, nao so as poucas que
o lote alcancava.
"""
import json
import re

from ai.claude_chat import chamar

CAMPOS = [
    "fatos", "arguido", "defendido", "contestado",
    "fundamentacao", "dispositivo", "aplicacaoPratica",
]

SYSTEM_PROMPT = """Você é consultor tributário sênior de um escritório de advocacia \
brasileiro, escrevendo um parecer técnico interno sobre uma decisão real coletada pela \
ATLAS, para o advogado responsável usar direto com o cliente.

Escreva em texto corrido, natural, como um advogado experiente explicando o caso pra um \
colega - SEM markdown (nunca use #, ##, **, listas com * ou -, numeração tipo "1)" ou \
títulos tipo "### Seção"). Frases e parágrafos normais, pontuação normal.

Você responde SOMENTE em JSON válido, sem texto antes ou depois, neste formato:
{
  "fatos": "...",
  "arguido": "...",
  "defendido": "...",
  "contestado": "...",
  "fundamentacao": "...",
  "dispositivo": "...",
  "aplicacaoPratica": "..."
}

O que cada campo deve conter:
- fatos: o que aconteceu, contexto do caso, em 2 a 4 frases.
- arguido: o que a Fazenda/parte contrária sustentou no processo.
- defendido: o que o contribuinte/parte defendida sustentou.
- contestado: qual foi o ponto controvertido de fato discutido e decidido.
- fundamentacao: a base legal e jurisprudencial usada na decisão.
- dispositivo: o que foi decidido, o resultado prático do julgamento.
- aplicacaoPratica: o que o advogado deve fazer com isso na prática, em 2 a 3 frases
  diretas (ex: revisar caso similar de cliente, monitorar recurso, orientar preventivamente).

Baseie-se SOMENTE no texto da decisão fornecida. Se um campo não puder ser preenchido com \
segurança a partir do texto (ex: a ementa não deixa claro o que a Fazenda arguiu), devolva \
esse campo como string vazia (""). NÃO escreva "não especificado", "não consta na ementa" \
ou qualquer variação disso - deixe vazio mesmo, o advogado prefere não ver nada a ver um \
aviso genérico repetido. Nunca invente.

Se vier um pedido de ajuste do advogado, aplique-o mantendo as regras acima e responda de \
novo com o JSON completo revisado.
"""


def _formatar_decisao(decisao: dict) -> str:
    return (
        f"Título: {decisao.get('titulo', '')}\n"
        f"Tribunal/órgão: {decisao.get('tribunal', '')}\n"
        f"Data: {decisao.get('data', '')}\n"
        f"Ementa/resumo: {decisao.get('ementa', '')}\n"
    )


def _extrair_json(texto: str) -> dict:
    texto = re.sub(r"^```(?:json)?\s*|\s*```$", "", texto.strip())
    return json.loads(texto)


def gerar_parecer(decisao: dict, ajuste: str | None = None, historico: list[dict] | None = None) -> dict:
    """
    decisao: dict com titulo/tribunal/data/ementa (mesmo shape usado no
        /copilot/chat e no gerador de post de Instagram).
    ajuste: pedido de revisao do advogado (ex: "seja mais cauteloso na
        aplicacao pratica"), opcional.
    historico: mensagens anteriores desta sessao de geracao, pra permitir
        pedir varios ajustes em sequencia mantendo contexto.

    Retorna os 7 campos do parecer + "historico" pra reenviar em ajustes.
    """
    mensagens = list(historico or [])

    if not mensagens:
        conteudo = (
            f"DECISÃO PARA O PARECER:\n\n{_formatar_decisao(decisao)}\n\n"
            "Escreva o JSON do parecer técnico."
        )
    else:
        conteudo = f"Ajuste pedido pelo advogado: {ajuste}\n\nResponda de novo com o JSON completo revisado."

    mensagens.append({"role": "user", "content": conteudo})

    bruto = chamar(SYSTEM_PROMPT, mensagens, max_tokens=2048)
    try:
        dados = _extrair_json(bruto)
    except (ValueError, json.JSONDecodeError):
        bruto = chamar(SYSTEM_PROMPT, mensagens, max_tokens=3000)
        try:
            dados = _extrair_json(bruto)
        except (ValueError, json.JSONDecodeError):
            raise RuntimeError(
                "A IA não devolveu um JSON válido para o parecer depois de 2 tentativas. "
                "Tente gerar de novo. Resposta recebida: " + bruto[:300]
            )

    resultado = {campo: str(dados.get(campo, "")).strip() for campo in CAMPOS}
    resultado["historico"] = mensagens + [{"role": "assistant", "content": bruto}]
    return resultado
