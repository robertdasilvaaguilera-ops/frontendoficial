"""
Gerador do carrossel "Intelligence Brief" para Instagram - a peça central
do modelo comercial da ATLAS: transforma uma decisão real coletada pela
ATLAS em conteúdo pronto para publicação, pensado para gerar autoridade
e prospecção comercial pro advogado/contador que publica, não como
"gerador de post" genérico.

Lógica do produto (não só da imagem): PESQUISA -> INTERPRETAÇÃO ->
INTELIGÊNCIA ECONÔMICA -> IDENTIFICAÇÃO DO PÚBLICO -> CONTEÚDO ->
PROSPECÇÃO. Por isso o prompt pede pra IA primeiro raciocinar (antes de
escrever) quem esse conteúdo tende a atrair - isso guia o ângulo, a
linguagem, a legenda e o CTA. O carrossel tem exatamente 5 slides fixos
(uma ideia por slide, sem enchimento):
  1. Capa - o que aconteceu
  2. Por que isso importa
  3. Quem é afetado
  4. Impacto econômico/estratégico (só usa número se a base tiver dado
     confiável - senão fica qualitativo, nunca inventa valor)
  5. O que observar/fazer - com um selo discreto de análise automática
     ATLAS (não uma "propaganda" da ATLAS, é um detalhe de credibilidade)

Reaproveita ai.imagem_contextual (foto contextual pro setor real da
decisão - nunca advogado de terno/tribunal genérico) e ai.perfil_visual
(quando o usuário quer manter a identidade visual do próprio escritório).
"""
import json
import re

from ai.claude_chat import chamar
from ai.imagem_contextual import selecionar_imagem_fundo
from ai.perfil_visual import extrair_perfil_visual

TONS_VALIDOS = {
    "tecnico", "empresarial", "comercial", "informativo", "sofisticado", "minimalista",
}

# Identidade visual padrão da ATLAS quando o usuário não anexa os próprios
# posts - premium, escura, discreta, muita respiração (nada de faixa de
# rodapé colorida gritante nem título em caixa alta o tempo todo).
PERFIL_ATLAS_PADRAO = {
    "logoPosicao": "superior-esquerda",
    "tituloAlinhamento": "esquerda",
    "tituloPosicaoVertical": "centro",
    "tituloCaixaAlta": False,
    "corPrimaria": "#D9A544",
    "corSecundaria": None,
    "corFundo": "#0B0D12",
    # "foto": todos os 5 slides usam a mesma imagem contextual do setor
    # (buscada por selecionar_imagem_fundo). imagemProporcao >= 0.85 faz o
    # renderer (renderPostComModelo, ver instagram-canvas.ts) tratar como
    # "tela cheia" - a foto cobre o slide inteiro e o texto fica sobre um
    # degradê escuro, em vez de uma faixa de foto só na metade de cima.
    "fundoTipo": "foto",
    "imagemProporcao": 1.0,
    "temFaixaRodape": False,
    "estiloGeral": "premium institucional",
    "observacoes": "",
}

SYSTEM_PROMPT = """Você é estrategista de conteúdo e inteligência de mercado para escritórios \
de advocacia e contabilidade tributária/empresarial brasileiros. Sua tarefa é transformar UMA \
decisão jurídica real, já pesquisada e interpretada pela ATLAS, num carrossel de Instagram \
que funciona como ferramenta de autoridade e prospecção comercial para o profissional que vai \
publicar - não é um "post sobre uma decisão", é inteligência de mercado embalada como conteúdo.

Modelo de negócio que você está servindo: o profissional (advogado/contador) usa esse \
conteúdo pra atrair e conversar com clientes que têm o problema ou a oportunidade descrita na \
decisão. Quem vê o post deve primeiro aprender algo relevante sobre o próprio negócio, e só \
depois (se notar) perceber que foi feito com apoio de tecnologia - o post nunca é uma \
propaganda da ATLAS.

ANTES de escrever, raciocine internamente (não exponha esse raciocínio na resposta, só deixe \
ele guiar as escolhas de ângulo, linguagem, imagem e CTA): que tipo de empresário/cliente esse \
conteúdo tende a atrair? Que tipo de empresa reconheceria "isso é sobre mim" ao ler? Essa \
audiência determina o tom, os exemplos e o CTA da legenda.

Você SEMPRE responde em JSON válido, e SOMENTE o JSON, sem texto antes ou depois, no formato:
{
  "slides": [
    {"tipo": "capa", "kicker": "...", "headline": "...", "corpo": "..."},
    {"tipo": "porque_importa", "kicker": "...", "headline": "...", "corpo": "..."},
    {"tipo": "quem_afetado", "kicker": "...", "headline": "...", "corpo": "..."},
    {"tipo": "impacto", "kicker": "...", "headline": "...", "corpo": "..."},
    {"tipo": "recomendacao", "kicker": "...", "headline": "...", "corpo": "..."}
  ],
  "legenda": "...",
  "cta": "...",
  "hashtags": ["...", "..."],
  "publicoAlvo": "..."
}

Regras de conteúdo:
1. Exatamente 5 slides, nesta ordem e função fixas - uma ideia central por slide, nunca duas:
   - "capa": o que aconteceu, em uma frase de efeito. É a manchete que faz alguém parar de
     rolar o feed.
   - "porque_importa": por que essa decisão é relevante agora - o que muda na prática.
   - "quem_afetado": que tipo de empresa/setor/situação é afetado - descreva de um jeito que
     o dono de uma empresa nessa situação se reconheça de cara.
   - "impacto": impacto econômico ou estratégico. Só cite um número/percentual se ele vier
     claramente da decisão/dados fornecidos - se não houver dado confiável, escreva o impacto
     de forma qualitativa (ex: "pode representar economia relevante em processos futuros"),
     NUNCA invente valor.
   - "recomendacao": o que o empresário/profissional deve observar ou avaliar - prático,
     acionável, sem soar como "fale conosco" ainda (isso fica na legenda).
2. Cada slide: "kicker" é um rótulo curtíssimo (2-4 palavras, ex: "O QUE MUDOU", "QUEM SENTE
   ISSO", "NA PRÁTICA"), "headline" é a ideia central em até 12 palavras (sem ponto final),
   "corpo" é UMA frase de apoio curta (até ~22 palavras) ou "" se o headline já for
   autoexplicativo - preferir corpo vazio a encher o slide de texto. Muito espaço em branco é
   o objetivo, não um problema.
3. "legenda": 3 a 5 parágrafos curtos pensados pra prospecção, não pra informar de novo o que
   já está nos slides. Deve ajudar o leitor a se perguntar "isso é sobre o meu negócio?",
   trazer um ângulo ou implicação prática que os slides não cobriram, e terminar com um convite
   sóbrio para avaliar a própria situação, sempre em formato de pergunta objetiva (ex: "Quer
   avaliar se a sua empresa está exposta a esse tipo de risco?"). Nunca comece com "Confira
   esta decisão" ou variações genéricas.
4. "cta": reforça o mesmo convite de avaliação em uma frase curta e objetiva (ex: "Quer avaliar
   se isso se aplica ao seu caso?"), coerente com o tom pedido.
4b. RESTRIÇÃO ÉTICA (vale para "legenda" e "cta", inegociável): este conteúdo é publicado por
   advogados e contadores sujeitos ao Código de Ética da OAB, que veda mercantilização da
   advocacia e captação de clientela. NUNCA escreva convites pessoais/informais de bate-papo -
   proibido usar "vamos conversar", "bora trocar uma ideia", "dá pra conversar com calma",
   "chama no direct/no privado", "fale com a gente", "me chama" ou qualquer variação que soe
   como abordagem comercial direta ou convite social. O fechamento deve SEMPRE ser uma pergunta
   ou constatação sóbria que convida a pessoa a avaliar/entender a própria situação - nunca um
   convite para iniciar contato/conversa com o profissional.
5. "hashtags": 4 a 7 hashtags relevantes em português, sem exagero.
6. "publicoAlvo": 1 frase curta (até 20 palavras) descrevendo o tipo de empresário/cliente que
   esse conteúdo tende a atrair - é uma informação estratégica pro profissional, não aparece
   no post.
7. Nunca invente número de processo, valores, nomes de partes ou dados que não estejam no
   material fornecido. Se um dado não vier, não mencione.
8. Nunca use markdown em nenhum campo (sem #, sem **, sem listas com * ou -).
9. Se vier um pedido de ajuste ou de tom diferente, aplique mantendo as 5 posições fixas e
   responda de novo com o JSON completo revisado.
"""

TOM_INSTRUCOES = {
    "tecnico": "Tom mais técnico: use terminologia jurídico-tributária com precisão, para um público que já entende o vocabulário (outros advogados, contadores, profissionais de compliance).",
    "empresarial": "Tom mais empresarial: fale a língua de quem toma decisão de negócio (CFO, dono de empresa), focando em risco e resultado, não em tecnicismo jurídico.",
    "comercial": "Tom mais comercial: reforce mais explicitamente a implicação prática e a urgência de agir, mantendo profissionalismo (sem soar como propaganda).",
    "informativo": "Tom mais informativo: priorize clareza didática acima de tudo, como se estivesse explicando o tema pela primeira vez para alguém inteligente mas leigo no assunto.",
    "sofisticado": "Tom mais sofisticado: linguagem mais refinada e enxuta, frases mais curtas e certeiras, menos explicação e mais afirmação segura.",
    "minimalista": "Tom mais minimalista: reduza ainda mais o texto de cada slide - prefira frases de 4 a 8 palavras, corte qualquer palavra que não seja essencial.",
}


def _extrair_json(texto: str) -> dict:
    texto = re.sub(r"^```(?:json)?\s*|\s*```$", "", texto.strip())
    return json.loads(texto)


def _formatar_decisao(decisao: dict) -> str:
    partes = [
        f"Título: {decisao.get('titulo', '')}",
        f"Tribunal/órgão: {decisao.get('tribunal', '')}",
        f"Data: {decisao.get('data', '')}",
        f"Mecanismo econômico: {decisao.get('mecanismo') or 'não classificado'}",
        f"Tributos envolvidos: {', '.join(decisao.get('tributos') or []) or '-'}",
        f"Setor(es) afetado(s): {', '.join(decisao.get('setores') or []) or 'não identificado automaticamente'}",
    ]
    if decisao.get("justificativaSetor"):
        partes.append(f"Por que esse setor é afetado: {decisao['justificativaSetor']}")
    if decisao.get("tipo"):
        resultado = "desfavorável ao contribuinte (risco)" if decisao["tipo"] == "risco" else "favorável ao contribuinte (oportunidade)"
        partes.append(f"Resultado para o contribuinte: {resultado}")
    if decisao.get("impactoFinanceiro"):
        partes.append(f"Impacto financeiro estimado (classificação interna ATLAS): {decisao['impactoFinanceiro']}")
    if decisao.get("probabilidadeExito"):
        partes.append(f"Probabilidade de êxito em teses semelhantes: {decisao['probabilidadeExito']}")
    partes.append(f"Ementa/resumo: {decisao.get('ementa') or decisao.get('resumoExecutivo') or ''}")
    return "\n".join(partes)


def _validar_slides(dados) -> list[dict]:
    tipos_esperados = ["capa", "porque_importa", "quem_afetado", "impacto", "recomendacao"]
    slides_brutos = dados.get("slides") if isinstance(dados, dict) else None
    resultado = []
    for i, tipo in enumerate(tipos_esperados):
        bruto = slides_brutos[i] if isinstance(slides_brutos, list) and i < len(slides_brutos) else {}
        if not isinstance(bruto, dict):
            bruto = {}
        resultado.append({
            "tipo": tipo,
            "kicker": str(bruto.get("kicker", "")).strip()[:40],
            "headline": str(bruto.get("headline", "")).strip()[:140],
            "corpo": str(bruto.get("corpo", "")).strip()[:200],
        })
    return resultado


def _normalizar_hashtags(brutos) -> list[str]:
    resultado = []
    for h in brutos:
        texto = str(h).strip().lstrip("#").strip()
        if not texto:
            continue
        resultado.append("#" + texto.replace(" ", ""))
    return resultado[:8]


def gerar_carrossel(
    decisao: dict,
    identidade: str = "atlas",
    referencias: list[dict] | None = None,
    tom: str | None = None,
    mensagem: str | None = None,
    historico: list[dict] | None = None,
    imagem_id: int | None = None,
) -> dict:
    """
    decisao: dict rico com titulo/tribunal/data/mecanismo/tributos/setores/
        justificativaSetor/tipo/impactoFinanceiro/probabilidadeExito/ementa.
    identidade: "atlas" (perfil visual premium padrão) ou "propria" (extrai
        de `referencias`, imagens de posts que o cliente já usa).
    tom: um de TONS_VALIDOS, opcional.
    mensagem: instrução livre do profissional, opcional (ajuste de conteúdo,
        não de visual).
    historico: para pedir um novo ajuste mantendo contexto da conversa.
    imagem_id: id de uma foto da Pexels já escolhida pelo profissional numa
        galeria (ver imagem_contextual.buscar_imagens_candidatas) - se
        vier, usa exatamente essa em vez de deixar a ATLAS escolher.

    Retorna slides validados (5, tipos fixos), legenda/cta/hashtags/
    publicoAlvo, perfilVisual (a usar no render) e imagemFundoDataUrl
    (mesma foto contextual usada em todos os slides, ou None).
    """
    mensagens = list(historico or [])

    if not mensagens:
        partes = [f"DECISÃO/TESE PARA O CARROSSEL:\n\n{_formatar_decisao(decisao)}"]
        if tom and tom in TONS_VALIDOS:
            partes.append(TOM_INSTRUCOES[tom])
        if mensagem:
            partes.append(f"Orientação adicional do profissional: {mensagem}")
        partes.append("Escreva o JSON completo do carrossel.")
        conteudo = "\n\n".join(partes)
    else:
        partes = []
        if tom and tom in TONS_VALIDOS:
            partes.append(TOM_INSTRUCOES[tom])
        if mensagem:
            partes.append(f"Pedido do profissional: {mensagem}")
        partes.append("Responda de novo com o JSON completo revisado.")
        conteudo = "\n\n".join(partes)

    mensagens.append({"role": "user", "content": conteudo})

    bruto = chamar(SYSTEM_PROMPT, mensagens, max_tokens=2200)
    try:
        dados = _extrair_json(bruto)
    except (ValueError, json.JSONDecodeError):
        bruto = chamar(SYSTEM_PROMPT, mensagens, max_tokens=3200)
        try:
            dados = _extrair_json(bruto)
        except (ValueError, json.JSONDecodeError):
            raise RuntimeError(
                "A IA não devolveu um JSON válido para o carrossel depois de 2 tentativas. "
                "Tente gerar de novo. Resposta recebida: " + bruto[:300]
            )

    if identidade == "propria" and referencias:
        perfil = extrair_perfil_visual(referencias)
    else:
        perfil = dict(PERFIL_ATLAS_PADRAO)

    imagem = selecionar_imagem_fundo(decisao, imagem_id=imagem_id)

    return {
        "slides": _validar_slides(dados),
        "legenda": str(dados.get("legenda", "")).strip(),
        "cta": str(dados.get("cta", "")).strip(),
        "hashtags": _normalizar_hashtags(dados.get("hashtags") or []),
        "publicoAlvo": str(dados.get("publicoAlvo", "")).strip()[:200],
        "perfilVisual": perfil,
        "imagemFundoDataUrl": imagem["dataUrl"] if imagem else None,
        "contextoVisual": imagem["contexto"] if imagem else None,
        "historico": mensagens + [{"role": "assistant", "content": bruto}],
    }
