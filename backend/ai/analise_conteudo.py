"""
Análise de conteúdo B2B - a camada que decide, pra UMA decisão específica
já pré-selecionada pelo índice determinístico (ver
economics/indice_prospeccao.py), COMO ela deveria virar conteúdo: quem é
afetado, pra que tipo de advogado/contador/empresário isso interessa, qual
o melhor ângulo de prospecção, e o quanto ela tende a performar em
compartilhamento/salvamento/conversa comercial.

Only roda pra shortlist (ver api_server.py -> /prospeccao/prioritarias),
nunca em toda decisão coletada no dia - por isso é cacheada por id
(app_db.salvar_analise_conteudo) assim que calculada uma vez.

A pergunta central que orienta o prompt (a mesma que orienta o produto):
"esta informação pode ajudar um advogado ou contador a demonstrar
autoridade, iniciar uma conversa com um potencial cliente e gerar
negócio?" - se não, "recomendado" vem False mesmo que a decisão seja
juridicamente relevante.
"""
import json
import re

from ai.claude_chat import chamar

SYSTEM_PROMPT = """Você é estrategista de aquisição B2B para escritórios de advocacia e \
contabilidade tributária/empresarial brasileiros. Você recebe UMA decisão jurídica já \
identificada e pré-qualificada pela ATLAS, e sua tarefa é avaliar o potencial dela como \
matéria-prima de conteúdo de prospecção - não escrever o post ainda, só decidir o \
direcionamento estratégico que vai guiar quem escrever.

A pergunta central: esta informação pode ajudar um advogado ou contador a demonstrar \
autoridade, iniciar uma conversa com um cliente em potencial e gerar negócio? Avalie com \
honestidade - nem toda decisão juridicamente interessante tem esse potencial.

Você SEMPRE responde em JSON válido, e SOMENTE o JSON, sem texto antes ou depois, no formato:
{
  "recomendado": true,
  "porQueRelevante": "...",
  "quemEAfetado": "...",
  "classificacao": "oportunidade",
  "publicoAlvo": {
    "advogado": "...",
    "contador": "...",
    "empresario": "..."
  },
  "anguloProspeccao": "...",
  "potencialCompartilhamento": {"nivel": "alto", "motivo": "..."},
  "potencialSalvamento": {"nivel": "alto", "motivo": "..."},
  "potencialConversaComercial": {"nivel": "alto", "motivo": "..."}
}

Regras de conteúdo:
1. "recomendado": false SE a decisão, apesar de juridicamente relevante, não tiver potencial
   real de virar conteúdo de prospecção (público-alvo vago demais, sem nenhuma empresa/setor
   identificável, ou puramente processual sem nenhuma implicação prática pro dia a dia de um
   negócio). Nesses casos os outros campos ainda devem ser preenchidos com sua melhor avaliação,
   só que "recomendado" fica false pra não subir a lista de prioridade.
2. "porQueRelevante": 1-2 frases objetivas, focadas na implicação prática, não em explicar a
   decisão de novo.
3. "quemEAfetado": 1 frase concreta - que tipo de empresa/situação, não "contribuintes em geral".
4. "classificacao": "oportunidade" (favorável ao contribuinte, tese a replicar), "risco"
   (desfavorável, alerta pra adequação) ou "informativo" (mudança relevante sem lado claro).
5. "publicoAlvo": para cada um dos três, 1 frase curta e ESPECÍFICA (nunca genérica) descrevendo
   o profissional/empresário que se interessaria - ex: não "advogados tributaristas", mas
   "advogados tributaristas que atendem clínicas médicas e consultórios".
6. "anguloProspeccao": a melhor forma de transformar essa decisão em conteúdo que um advogado
   queira publicar pra demonstrar conhecimento aos próprios clientes - 1-2 frases descrevendo o
   enquadramento (não o texto final do post, a estratégia por trás dele).
7. Os três "potencial*": "nivel" é "alto", "medio" ou "baixo"; "motivo" é 1 frase objetiva
   explicando o nível escolhido, pensando no comportamento real de quem usa Instagram
   (compartilha o que faz parecer bem informado, salva o que é útil de consultar depois, entra
   em contato quando reconhece problema próprio no conteúdo).
8. Nunca invente número de processo, valores ou dados que não estejam no material fornecido.
9. Nunca use markdown em nenhum campo (sem #, sem **, sem listas com * ou -).
"""


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
        resultado = (
            "desfavorável ao contribuinte (risco)"
            if decisao["tipo"] == "risco"
            else "favorável ao contribuinte (oportunidade)"
        )
        partes.append(f"Resultado para o contribuinte: {resultado}")
    if decisao.get("impactoFinanceiro"):
        partes.append(f"Impacto financeiro estimado (classificação interna ATLAS): {decisao['impactoFinanceiro']}")
    if decisao.get("empresasAfetadas"):
        partes.append(f"Empresas potencialmente afetadas (estimativa ATLAS): {decisao['empresasAfetadas']:,}")
    partes.append(f"Ementa/resumo: {decisao.get('ementa') or decisao.get('resumoExecutivo') or ''}")
    return "\n".join(partes)


def _validar(dados: dict) -> dict:
    def nivel(bruto) -> dict:
        bruto = bruto if isinstance(bruto, dict) else {}
        nivel_valido = str(bruto.get("nivel", "")).strip().lower()
        if nivel_valido not in ("alto", "medio", "baixo"):
            nivel_valido = "medio"
        return {"nivel": nivel_valido, "motivo": str(bruto.get("motivo", "")).strip()[:200]}

    publico_bruto = dados.get("publicoAlvo") if isinstance(dados.get("publicoAlvo"), dict) else {}
    classificacao = str(dados.get("classificacao", "")).strip().lower()
    if classificacao not in ("oportunidade", "risco", "informativo"):
        classificacao = "informativo"

    return {
        "recomendado": bool(dados.get("recomendado", False)),
        "porQueRelevante": str(dados.get("porQueRelevante", "")).strip()[:400],
        "quemEAfetado": str(dados.get("quemEAfetado", "")).strip()[:300],
        "classificacao": classificacao,
        "publicoAlvo": {
            "advogado": str(publico_bruto.get("advogado", "")).strip()[:200],
            "contador": str(publico_bruto.get("contador", "")).strip()[:200],
            "empresario": str(publico_bruto.get("empresario", "")).strip()[:200],
        },
        "anguloProspeccao": str(dados.get("anguloProspeccao", "")).strip()[:400],
        "potencialCompartilhamento": nivel(dados.get("potencialCompartilhamento")),
        "potencialSalvamento": nivel(dados.get("potencialSalvamento")),
        "potencialConversaComercial": nivel(dados.get("potencialConversaComercial")),
    }


def analisar_potencial_conteudo(decisao: dict) -> dict:
    """decisao: mesmo shape usado por ai/carrossel.py (titulo/tribunal/data/
    mecanismo/tributos/setores/justificativaSetor/tipo/impactoFinanceiro/
    ementa), mais empresasAfetadas (opcional, número). Devolve o dict
    validado do formato do SYSTEM_PROMPT."""
    conteudo = f"DECISÃO PARA ANÁLISE:\n\n{_formatar_decisao(decisao)}\n\nResponda o JSON completo."
    mensagens = [{"role": "user", "content": conteudo}]

    bruto = chamar(SYSTEM_PROMPT, mensagens, max_tokens=1400)
    try:
        dados = _extrair_json(bruto)
    except (ValueError, json.JSONDecodeError):
        bruto = chamar(SYSTEM_PROMPT, mensagens, max_tokens=2000)
        try:
            dados = _extrair_json(bruto)
        except (ValueError, json.JSONDecodeError):
            raise RuntimeError(
                "A IA não devolveu um JSON válido para a análise de conteúdo depois de 2 "
                "tentativas. Resposta recebida: " + bruto[:300]
            )

    return _validar(dados)
