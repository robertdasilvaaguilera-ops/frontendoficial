"""
Escolhe, entre as decisões recentes ainda não usadas, a melhor candidata
para o post automático do dia e escreve os textos (parágrafo de destaque,
manchete/subtítulo da 2a imagem, legenda) - via Claude, num único
call estruturado (JSON).

Reaproveita `ai.claude_chat.chamar` (mesma chave, mesmo tratamento de erro
de autenticação) - só muda o prompt. Ver `ai/social_post.py` para o padrão
equivalente usado no estúdio manual.
"""
from __future__ import annotations

import json
import re

from ai.claude_chat import chamar

_GANCHOS = [
    "Entenda o risco.",
    "Entenda a oportunidade.",
    "Entenda os riscos.",
    "Avalie o impacto.",
    "Confira se te atinge.",
    "Reveja o seu caso.",
    "Vale a pena checar.",
]

SYSTEM_PROMPT_TEMPLATE = """Você escreve o conteúdo do post diário automático de Instagram do \
perfil "__MARCA_NOME__", uma plataforma/escritório de inteligência jurídico-tributária \
brasileira, a partir de decisões reais (CARF, STF, STJ, TRFs etc.) coletadas pelo sistema.

Você recebe uma lista de decisões candidatas (ainda não usadas) e as preferências \
configuradas pelo usuário para este perfil. Sua tarefa em duas partes:

PARTE 1 - ESCOLHER a melhor decisão da lista, na ordem de preferência:
- Priorize decisões alinhadas aos TEMAS configurados pelo usuário (se houver) - trate os
  temas como uma preferência forte, não um filtro rígido: se nenhuma decisão bater com os
  temas, ainda escolha a melhor decisão disponível em vez de devolver vazio.
- O resumo precisa ter pelo menos um dado concreto e citável: prazo, data, número de
  súmula/lei/artigo, percentual, valor em R$, número de processo/tema. Evite decisões
  puramente processuais sem nenhum fato ou tese citável.
- Prefira decisões com uma tese específica e não-óbvia (valor relevante, benefício fiscal
  específico, tese controvertida ou recém-firmada, interpretação de conceito, divergência
  entre turmas) e IDEALMENTE com uma "pegadinha" (uma condição/exceção que a maioria não
  percebe) sobre doutrina básica genérica.
- Só devolva "decisao_id": null se REALMENTE nenhuma decisão da lista servir (ex: lista
  vazia, ou todas sem nenhum dado concreto/citável).

PARTE 2 - ESCREVER o conteúdo para a decisão escolhida, no registro/tom configurado pelo
usuário (ou, na ausência de instrução, como um profissional experiente escrevendo para
outro profissional da área - direto, técnico, sem tom de quem explica o óbvio).

Você SEMPRE responde em JSON válido, e SOMENTE o JSON, sem texto antes ou depois:
{
  "decisao_id": "id da decisão escolhida, ou null",
  "paragrafo_destaque": "...",
  "headline2": "Inteligência tributária, todos os dias.",
  "sub2": "...",
  "legenda": "..."
}
Se "decisao_id" for null, omita os demais campos (ou deixe como string vazia).

Regras de conteúdo:
1. "paragrafo_destaque" (vai na primeira imagem) precisa ter DUAS PARTES: (a) a regra/fato
   da decisão, direto, sem rodeios; (b) o detalhe/pegadinha que a maioria não percebe - a
   condição, exceção ou nuance que faz a regra pegar mesmo quem acha que está protegido ou
   que não se aplica ao caso dele (use construções como "mesmo sem...", "independentemente
   de...", "ainda que..."). Sempre que o resumo trouxer um NÚMERO EXATO (valor em R$,
   percentual, prazo), use o número exato, nunca arredonde ou generalize. Feche SEMPRE com
   um gancho curto de 2-4 palavras, ESCOLHENDO UM DESTES (nunca repita o mesmo gancho
   sugerido como "não usar" na lista de recentes que vier no contexto):
   Entenda o risco. | Entenda a oportunidade. | Entenda os riscos. | Avalie o impacto. |
   Confira se te atinge. | Reveja o seu caso. | Vale a pena checar.
   Destaque com marcadores `§§...§§` no máximo 1-2 trechos curtos (o dado mais citável -
   lei/valor/percentual). Nunca deixe um `§§` sem o par de fechamento.
2. "headline2": sempre a frase fixa "Inteligência tributária, todos os dias." (com o ponto
   final), a menos que o tom configurado peça algo claramente diferente - nesse caso, no
   máximo ~45 caracteres, cabendo em uma linha.
3. "sub2": 1 frase curta dizendo que a análise foi gerada e publicada automaticamente pelo
   sistema a partir da decisão real do dia (pode mencionar o tema brevemente). Envolva a
   parte que credita a autoria (ex: "gerada e publicada automaticamente pela __MARCA_NOME__") com
   `§§...§§` - vira um grifo na imagem. Use no máximo esse 1 trecho marcado. Nunca
   escreva "julgada hoje" a menos que a data de julgamento seja mesmo hoje.
4. "legenda": tom técnico-acessível descrito acima. Abre com uma frase de impacto sobre a
   decisão (sem emoji obrigatório - só use emoji se o tom configurado pedir algo mais
   informal), descreve o que aconteceu e o dado concreto com mais contexto que as imagens,
   termina com uma pergunta que puxe comentário, menciona que a análise foi gerada
   automaticamente a partir de decisões tributárias reais monitoradas todos os dias, e
   fecha apontando para o link da bio. Inclua 3-5 hashtags relevantes de direito tributário
   no final. RESTRIÇÃO ÉTICA (inegociável, é conteúdo de escritório de advocacia/contabilidade
   sujeito ao Código de Ética da OAB): nunca escreva convites pessoais/informais de bate-papo
   ("fale com a gente", "chama no direct") - o fechamento é sempre uma pergunta ou
   constatação sóbria convidando a avaliar a própria situação.
5. Nunca invente número de processo, valor ou fato que não esteja no resumo da decisão
   fornecida. Escape `&`, `<`, `>` nunca é necessário aqui - devolva texto puro.
"""


SYSTEM_PROMPT_IDENTIDADE = """Você é um designer de marca especializado em posts de Instagram \
para escritórios de advocacia/contabilidade tributária. Um usuário vai descrever, em texto \
livre, a identidade visual que imagina pro post automático de decisões tributárias do perfil \
dele - você traduz essa descrição numa configuração estruturada, sempre com resultado \
profissional e legível, mesmo que a descrição seja vaga ou incompleta.

Responda SOMENTE com um JSON válido, sem texto antes ou depois:
{
  "corFundoClaro": "#RRGGBB",
  "corFundoEscuro": "#RRGGBB",
  "corDestaque": "#RRGGBB",
  "estilo": "classico" | "editorial" | "moderno",
  "textoClaro": true | false
}

Regras obrigatórias:
1. "corFundoClaro" e "corFundoEscuro" formam um degradê (claro -> escuro, mesmo tom). Se o
   usuário pedir um visual escuro/sóbrio/elegante (o mais comum e mais seguro pra este tipo de
   conteúdo), use dois tons escuros e próximos (ex: dois tons de azul-marinho, verde-escuro,
   grafite, vinho escuro) - textoClaro=true nesse caso. Só use fundo CLARO (branco/creme/tons
   pastéis) se o usuário pedir isso explicitamente (ex: "fundo branco", "visual clean e claro")
   - nesse caso textoClaro=false, senão o texto fica ilegível.
2. "corDestaque": SEMPRE uma cor clara/vibrante (nunca escura, nunca preta/cinza-escuro) - é o
   fundo do grifo, e o texto sobre ela é sempre desenhado escuro. Se o usuário mencionar uma
   cor da marca dele, use essa cor (ajustando a claridade se preciso pra continuar legível).
   Sem menção de cor, use dourado/âmbar (o padrão do produto) ou escolha algo que combine com
   o fundo escolhido.
3. "estilo": escolha com base no tom da descrição -
   "classico" = sério, tradicional, elegante discreto (serifado clássico) - padrão se a
   descrição não indicar nada;
   "editorial" = sofisticado, editorial, dramático, "de revista" (serifado mais expressivo);
   "moderno" = clean, tech, jovem, minimalista, corporativo moderno (só sans-serif).
4. Nunca devolva cores muito próximas de preto puro (#000000) ou branco puro (#FFFFFF) - use
   tons com um pouco de matiz (fica mais premium e menos genérico).
5. Se a descrição não der nenhuma pista de cor, mantenha a paleta padrão do produto (fundo
   azul-marinho escuro degradê, destaque dourado, estilo clássico, textoClaro=true).
"""


def gerar_identidade_visual(descricao: str) -> dict:
    """Traduz uma descrição em texto livre (ex: "quero algo elegante, vinho
    e dourado") na configuração estruturada de identidade visual (cores +
    estilo tipográfico curado) - usado pelo botão "Gerar com IA" na aba
    Mídia Social. Nunca publica nem salva nada sozinho - só sugere valores
    pro formulário, que o usuário ainda revisa/ajusta antes de salvar."""
    # effort="low": mapeia texto -> paleta/estilo de uma lista fechada de
    # opções (enum + hex) - tarefa estruturada, não precisa de raciocínio
    # profundo (diferente de escolher_e_escrever, que escreve o conteúdo
    # real do post e fica no padrão do modelo de propósito).
    bruto = chamar(
        SYSTEM_PROMPT_IDENTIDADE,
        [{"role": "user", "content": descricao.strip()}],
        max_tokens=300,
        effort="low",
    )
    dados = _extrair_json(bruto)
    estilo = dados.get("estilo") if dados.get("estilo") in ("classico", "editorial", "moderno") else "classico"
    return {
        "corFundoClaro": str(dados.get("corFundoClaro", "#171B24")),
        "corFundoEscuro": str(dados.get("corFundoEscuro", "#0B0D12")),
        "corDestaque": str(dados.get("corDestaque", "#D9A544")),
        "estilo": estilo,
        "textoClaro": bool(dados.get("textoClaro", True)),
    }


def _formatar_decisoes(decisoes: list[dict]) -> str:
    blocos = []
    for d in decisoes:
        blocos.append(
            f"id={d.get('id')} | {d.get('tribunal', '')} | {d.get('data_julgamento', '')} | "
            f"{d.get('titulo', '')}\n"
            f"Setor: {d.get('setor_economico') or '-'} | Mecanismo: {d.get('mecanismo') or '-'} | "
            f"Tributos: {', '.join(d.get('tributos') or []) or '-'}\n"
            f"Resumo: {str(d.get('resumo') or '')[:1500]}"
        )
    return "\n\n".join(blocos)


def _extrair_json(texto: str) -> dict:
    texto = texto.strip()
    texto = re.sub(r"^```(?:json)?\s*|\s*```$", "", texto)
    return json.loads(texto)


def escolher_e_escrever(
    decisoes: list[dict],
    ids_usados: set[str],
    temas: list[str] | None = None,
    objetivos: str | None = None,
    tom: str | None = None,
    ganchos_recentes: list[str] | None = None,
    marca_nome: str = "ATLAS",
) -> dict | None:
    """
    decisoes: candidatas (ver formato de /automacao/decisoes-recentes), já
        SEM as que estão em ids_usados (o chamador filtra antes).
    marca_nome: nome do perfil configurado em Mídia Social (ver
        social_config) - usado na autoria do sub2 e no enquadramento do
        prompt. Não usa str.format porque o restante do prompt tem chaves
        JSON literais (o schema de resposta).
    Devolve None se a IA decidir que nenhuma decisão qualifica, ou o dict
    {"decisaoId", "paragrafoDestaque", "headline2", "sub2", "legenda"}.
    """
    if not decisoes:
        return None

    system_prompt = SYSTEM_PROMPT_TEMPLATE.replace("__MARCA_NOME__", marca_nome or "ATLAS")

    partes = [f"DECISÕES CANDIDATAS:\n\n{_formatar_decisoes(decisoes)}"]
    if temas:
        partes.append(f"TEMAS PREFERIDOS PELO USUÁRIO: {', '.join(temas)}")
    if objetivos:
        partes.append(f"OBJETIVOS/METAS DO PERFIL: {objetivos}")
    if tom:
        partes.append(f"TOM/REGISTRO DESEJADO: {tom}")
    if ganchos_recentes:
        partes.append(
            "GANCHOS USADOS NOS ÚLTIMOS POSTS (não repita nenhum destes agora): "
            + ", ".join(ganchos_recentes)
        )
    partes.append("Escreva o JSON com a decisão escolhida e os textos do post.")
    conteudo = "\n\n".join(partes)

    bruto = chamar(system_prompt, [{"role": "user", "content": conteudo}], max_tokens=1500)

    try:
        dados = _extrair_json(bruto)
    except (ValueError, json.JSONDecodeError):
        bruto = chamar(system_prompt, [{"role": "user", "content": conteudo}], max_tokens=2200)
        dados = _extrair_json(bruto)  # deixa propagar se falhar de novo - chamador decide

    decisao_id = dados.get("decisao_id")
    if not decisao_id or decisao_id not in {d.get("id") for d in decisoes}:
        return None

    return {
        "decisaoId": decisao_id,
        "paragrafoDestaque": str(dados.get("paragrafo_destaque", "")).strip(),
        "headline2": str(dados.get("headline2", "")).strip(),
        "sub2": str(dados.get("sub2", "")).strip(),
        "legenda": str(dados.get("legenda", "")).strip(),
    }
