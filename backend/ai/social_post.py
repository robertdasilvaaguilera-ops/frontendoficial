"""
Gerador de textos + foto de fundo contextual para posts de Instagram, a
partir de uma decisao/oportunidade (ou noticia) coletada pela ATLAS. A
arte final e montada no frontend (canvas: texto + moldura + logo), este
modulo escreve os textos (headline, corpo, legenda) e seleciona a foto de
fundo (ver ai/imagem_contextual.py - setor/tema da decisao -> busca na
Pexels) - mais barato e controlavel do que gerar a imagem inteira via IA
generativa.

O advogado pode conversar livremente com o gerador: mandar uma mensagem
explicando o que quer, colar um link (o conteudo da pagina e buscado e
passado pra IA como contexto) ou anexar uma imagem de referencia/inspiracao
(a Claude "ve" a imagem, mas so pode usa-la pra entender tom/estilo -
nunca pra inventar fato que nao esteja na decisao real).

Reaproveita ai.claude_chat.chamar() (mesma chave, mesmo tratamento de erro
de autenticacao) - so muda o prompt.
"""
import json
import re

import requests

from ai.claude_chat import chamar
from ai.imagem_contextual import selecionar_imagem_fundo

SYSTEM_PROMPT = """Você é redator(a) de conteúdo do departamento de marketing jurídico de \
um escritório de advocacia tributária e empresarial brasileiro. Sua tarefa é escrever o \
texto de uma arte para Instagram (estilo "card" informativo) a partir de uma decisão/tese \
jurídica real, coletada pela ATLAS.

O público são clientes e potenciais clientes do escritório (empresários, produtores rurais, \
outros advogados) - não são juristas técnicos, então o texto deve ser claro e direto, mas \
sem perder precisão jurídica nem inventar fatos que não estejam na decisão fornecida.

Você SEMPRE responde em JSON válido, e SOMENTE o JSON, sem texto antes ou depois, no formato:
{
  "headline": "...",
  "corpo": "...",
  "legenda": "...",
  "estilo": {
    "template": null,
    "corDestaque": null,
    "tamanhoFonte": null
  }
}

Regras de conteúdo e de formatação:
1. "headline": título curto (até ~90 caracteres) para o topo/destaque da arte. Frase de \
   efeito jornalística, resume o fato/mudança em si. Use capitalização normal de frase em \
   português - só a primeira palavra e nomes próprios/siglas (STJ, CARF, IRPJ etc.) com \
   maiúscula, como manchete de jornal brasileiro de verdade (ex: "STJ nega recurso que \
   buscava levar caso ao STF", NUNCA "STJ Nega Recurso Que Buscava Levar Caso Ao STF" - \
   maiúscula em toda palavra é convenção do inglês, não existe em português). NÃO tudo em \
   maiúsculas, NÃO tudo minúsculo - a caixa alta visual quando houver fica a cargo do \
   design, não do texto.
2. "corpo": 2 a 3 frases curtas (parágrafo corrido, sem bullet points, até ~420 \
   caracteres no total), explicando o que mudou, quem é afetado e por quê importa, com \
   base SOMENTE no que está na decisão fornecida. Português correto, pontuação e \
   acentuação corretas, sem gírias. Este texto vai dentro da arte da imagem (espaço \
   limitado) - prefira frases mais curtas e diretas a frases longas.
3. "legenda": legenda para a publicação no Instagram (2 a 4 parágrafos curtos, pode usar \
   quebras de linha), tom institucional-acessível, terminando com um convite sóbrio pra \
   avaliar a própria situação, em formato de pergunta objetiva (ex: "Quer avaliar se isso \
   se aplica ao seu caso?") e 3 a 6 hashtags relevantes em português (ex: \
   #DireitoTributário #ReformaTributária), sem exagero de emojis (no máximo 2-3 no total). \
   RESTRIÇÃO ÉTICA (inegociável): quem publica é advogado ou contador sujeito ao Código de \
   Ética da OAB, que veda mercantilização da advocacia e captação de clientela. NUNCA \
   escreva convites pessoais/informais de bate-papo - proibido "fale com a gente", "fale \
   com nosso time", "chama no direct/no privado", "vamos conversar" ou qualquer variação \
   que soe como abordagem comercial direta. O fechamento é sempre uma pergunta ou \
   constatação sóbria convidando a avaliar a própria situação, nunca um convite pra \
   iniciar contato.
4. Nunca invente número de processo, valores ou nome de partes que não estejam na decisão \
   fornecida. Se a decisão não trouxer um dado, não mencione esse dado.
5. O advogado pode conversar livremente com você em cada mensagem: pedir um ajuste ("mais \
   direto", "foque no produtor rural"), colar um link (você recebe um resumo do conteúdo \
   da página, use como contexto/inspiração de tema ou redação) ou anexar uma imagem de \
   referência (use só para entender o estilo/tom visual que o advogado quer - nunca para \
   inventar fatos jurídicos que não estejam na decisão). Sempre responda de novo com o \
   JSON completo revisado, não só a parte alterada.
6. Nunca use markdown em "headline" ou "corpo" (sem #, sem **, sem listas com * ou -).
   Em "legenda" vale usar quebra de linha entre parágrafos e as hashtags pedidas na
   regra 3, mas nada de **negrito** nem #título de markdown.
7. "estilo": o layout/cor/tamanho de fonte da arte são controlados por botões na tela do
   advogado (ele pode trocar template, cor e tamanho manualmente a qualquer momento) - você
   só preenche um subcampo de "estilo" quando o advogado pedir EXPLICITAMENTE algo visual
   na mensagem dele (ex: "fundo azul", "letra maior", "algo mais moderno/minimalista",
   "quero centralizado"). Se ele não pediu nada visual, devolva os três campos como null -
   não invente preferência de estilo.
   - "template": um destes ids, ou null: "editorial-escuro" (foto de fundo, texto embaixo),
     "minimal-claro" (fundo claro, texto no topo, visual clean), "cartao-centralizado" (cor
     sólida, tudo centralizado), "diagonal" (foto + painel colorido diagonal, moderno),
     "faixa-superior" (foto em cima, texto embaixo, estilo citação). Escolha pelo que o
     advogado descreveu (ex: "mais moderno" -> "diagonal"; "mais limpo/simples" ->
     "minimal-claro"; "chamativo, cor forte" -> "cartao-centralizado").
   - "corDestaque": um código hexadecimal "#RRGGBB" só se o advogado pediu uma cor
     específica (ex: "fundo azul" -> um azul como "#2563EB"; "verde" -> "#16A34A"; "vermelho
     institucional" -> "#B91C1C"). Escolha uma cor sóbria e profissional (nada neon).
   - "tamanhoFonte": "pequena", "media" ou "grande", só se ele pediu letra maior/menor ou
     "mais compacto"/"mais espaçoso".
"""

_URL_RE = re.compile(r"https?://[^\s<>\"]+")


def _formatar_decisao(decisao: dict) -> str:
    return (
        f"Título: {decisao.get('titulo', '')}\n"
        f"Tribunal/órgão: {decisao.get('tribunal', '')}\n"
        f"Data: {decisao.get('data', '')}\n"
        f"Mecanismo: {decisao.get('mecanismo') or 'não classificado'}\n"
        f"Tributos: {', '.join(decisao.get('tributos') or []) or '-'}\n"
        f"Setores afetados: {', '.join(decisao.get('setores') or []) or '-'}\n"
        f"Ementa/resumo: {decisao.get('ementa') or decisao.get('resumoExecutivo') or ''}\n"
    )


def _extrair_json(texto: str) -> dict:
    texto = texto.strip()
    # Claude as vezes envolve em ```json ... ``` mesmo quando instruido a nao fazer -
    # removemos a cerca de codigo se vier.
    texto = re.sub(r"^```(?:json)?\s*|\s*```$", "", texto.strip())
    return json.loads(texto)


def _extrair_url(texto: str) -> str | None:
    m = _URL_RE.search(texto or "")
    return m.group(0) if m else None


def _buscar_conteudo_link(url: str) -> str:
    """Busca titulo + um trecho de texto da pagina, pra dar contexto real
    do link pro Claude (que nao navega na internet sozinho). Falha
    silenciosamente (devolve um aviso) se o site nao responder - nao trava
    a geracao do post por causa de um link ruim/lento."""
    try:
        resposta = requests.get(
            url, timeout=10, headers={"User-Agent": "Mozilla/5.0 (ATLAS bot)"}
        )
        resposta.raise_for_status()
        html = resposta.text[:200_000]
        m_titulo = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        titulo = re.sub(r"\s+", " ", m_titulo.group(1)).strip() if m_titulo else ""
        texto = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.IGNORECASE | re.DOTALL)
        texto = re.sub(r"<[^>]+>", " ", texto)
        texto = re.sub(r"\s+", " ", texto).strip()
        return f"Título da página: {titulo}\n\nTrecho do conteúdo: {texto[:1500]}"
    except requests.RequestException as erro:
        return f"(não consegui acessar esse link: {erro})"


def gerar_textos_post(
    decisao: dict,
    mensagem: str | None = None,
    historico: list[dict] | None = None,
    imagem_base64: str | None = None,
    imagem_media_type: str | None = None,
) -> dict:
    """
    decisao: dict com pelo menos titulo/tribunal/data/mecanismo/tributos/setores/ementa
        (mesmo shape usado no /copilot/chat - ver _linha_para_opportunity em api_server.py).
    mensagem: texto livre do advogado (pedido, ajuste, ou explicação do que quer) - pode
        conter um link, que é buscado automaticamente. Opcional na primeira geração.
    historico: mensagens anteriores desta sessao de geracao (para o advogado poder
        conversar em varias rodadas mantendo contexto), no formato
        [{"role": "user"|"assistant", "content": ...}].
    imagem_base64 / imagem_media_type: imagem de referência anexada pelo advogado
        (opcional), em base64 + mime type (ex: "image/jpeg").

    Retorna {"headline": str, "corpo": str, "legenda": str, "estilo": {...},
    "imagemFundoDataUrl": str|None, "contextoVisual": str|None, "historico": [...]}.
    """
    mensagens = list(historico or [])
    primeira_geracao = not mensagens

    if primeira_geracao:
        partes = [f"DECISÃO/TESE PARA A ARTE:\n\n{_formatar_decisao(decisao)}"]
        if mensagem:
            partes.append(f"Orientação do advogado para este post: {mensagem}")
        partes.append("Escreva o JSON com headline, corpo e legenda para este post.")
        conteudo_texto = "\n\n".join(partes)
    else:
        conteudo_texto = (
            f"Mensagem do advogado: {mensagem}\n\nResponda de novo com o JSON completo revisado."
        )

    url = _extrair_url(mensagem or "")
    if url:
        conteudo_texto += f"\n\nConteúdo do link enviado ({url}):\n{_buscar_conteudo_link(url)}"

    if imagem_base64:
        conteudo = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": imagem_media_type or "image/jpeg",
                    "data": imagem_base64,
                },
            },
            {"type": "text", "text": conteudo_texto},
        ]
    else:
        conteudo = conteudo_texto

    mensagens.append({"role": "user", "content": conteudo})

    # 2048 da folga confortavel para headline+corpo+legenda+hashtags sem cortar
    # o JSON no meio (decisoes mais longas/complexas geram texto mais longo).
    bruto = chamar(SYSTEM_PROMPT, mensagens, max_tokens=2048)

    try:
        dados = _extrair_json(bruto)
    except (ValueError, json.JSONDecodeError):
        # Resposta cortada no meio (bateu o limite de tokens) - tenta so mais uma vez
        # com ainda mais folga antes de desistir e mostrar erro pro advogado.
        bruto = chamar(SYSTEM_PROMPT, mensagens, max_tokens=3000)
        try:
            dados = _extrair_json(bruto)
        except (ValueError, json.JSONDecodeError):
            raise RuntimeError(
                "A IA não devolveu um JSON válido para o post depois de 2 tentativas. "
                "Tente gerar de novo ou peça um ajuste mais curto. Resposta recebida: "
                + bruto[:300]
            )

    # Imagem de fundo contextual (setor/tema da decisão -> busca na Pexels) -
    # só na primeira geração, pra não ficar reconsultando a cada ajuste de
    # texto que o advogado peça na conversa. Se falhar por qualquer motivo
    # (sem PEXELS_API_KEY, sem internet, sem resultado), vem None e o front
    # segue com o degradê da cor da marca, como antes.
    imagem_fundo = selecionar_imagem_fundo(decisao) if primeira_geracao else None

    return {
        "headline": str(dados.get("headline", "")).strip(),
        "corpo": str(dados.get("corpo", "")).strip(),
        "legenda": str(dados.get("legenda", "")).strip(),
        "estilo": _validar_estilo(dados.get("estilo")),
        "imagemFundoDataUrl": imagem_fundo["dataUrl"] if imagem_fundo else None,
        "contextoVisual": imagem_fundo["contexto"] if imagem_fundo else None,
        # devolvido para o chamador reenviar em mensagens seguintes (mantem contexto
        # da conversa sem o backend precisar guardar estado em memoria/sessao).
        "historico": mensagens + [{"role": "assistant", "content": bruto}],
    }


_TEMPLATES_VALIDOS = {
    "editorial-escuro", "minimal-claro", "cartao-centralizado", "diagonal", "faixa-superior",
}
_FONT_SCALES_VALIDAS = {"pequena", "media", "grande"}
_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _validar_estilo(estilo) -> dict:
    """Nunca confia cegamente no que a IA devolveu em 'estilo' - se vier um
    template/cor/tamanho fora do que o front sabe desenhar, ignora esse
    campo (fica null) em vez de quebrar o canvas do advogado."""
    if not isinstance(estilo, dict):
        return {"template": None, "corDestaque": None, "tamanhoFonte": None}
    template = estilo.get("template")
    cor = estilo.get("corDestaque")
    tamanho = estilo.get("tamanhoFonte")
    return {
        "template": template if template in _TEMPLATES_VALIDOS else None,
        "corDestaque": cor if isinstance(cor, str) and _HEX_RE.match(cor) else None,
        "tamanhoFonte": tamanho if tamanho in _FONT_SCALES_VALIDAS else None,
    }
