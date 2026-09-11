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

SYSTEM_PROMPT = """Você escreve o conteúdo do post diário automático de Instagram de uma \
plataforma de inteligência jurídico-tributária brasileira, a partir de decisões reais \
(CARF, STF, STJ, TRFs etc.) coletadas pelo sistema.

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
   parte que credita a autoria (ex: "gerada e publicada automaticamente pela Atlas") com
   `§§...§§` - vira um grifo dourado na imagem. Use no máximo esse 1 trecho marcado. Nunca
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
) -> dict | None:
    """
    decisoes: candidatas (ver formato de /automacao/decisoes-recentes), já
        SEM as que estão em ids_usados (o chamador filtra antes).
    Devolve None se a IA decidir que nenhuma decisão qualifica, ou o dict
    {"decisaoId", "paragrafoDestaque", "headline2", "sub2", "legenda"}.
    """
    if not decisoes:
        return None

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

    bruto = chamar(SYSTEM_PROMPT, [{"role": "user", "content": conteudo}], max_tokens=1500)

    try:
        dados = _extrair_json(bruto)
    except (ValueError, json.JSONDecodeError):
        bruto = chamar(SYSTEM_PROMPT, [{"role": "user", "content": conteudo}], max_tokens=2200)
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
