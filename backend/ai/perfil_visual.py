"""
Extracao de perfil visual a partir de posts de Instagram ja usados pelo
cliente (fornecidos como imagens de referencia), para o Estudio Visual
(ver ai/post_com_modelo.py e a rota /estudio-visual no frontend).

Isto e a etapa B da arquitetura descrita: REFERENCIAS -> ANALISE ->
perfil_visual estruturado. Nao gera nem edita imagem nenhuma aqui - so
descreve, em campos objetivos, o padrao recorrente entre as referencias
(posicao da logo, alinhamento/caixa do titulo, cor predominante, proporcao
da foto, presenca de faixa de rodape). Esse perfil e usado depois pelo
motor de canvas do frontend (instagram-canvas.ts, template
"modelo-cliente") para renderizar o novo post de forma deterministica -
ver a explicacao de arquitetura dada ao usuario: preservar proporcao,
posicao e fidelidade de texto e mais confiavel com renderizacao
parametrica do que pedindo pra uma IA "desenhar parecido".

Quando 2+ referencias sao enviadas, a instrucao pede explicitamente pra
Claude identificar o que se REPETE entre elas (nao descrever só a
primeira imagem) - e pra usar null nos campos que não conseguir
determinar com segurança, em vez de inventar (nunca inventar identidade).
"""
import json
import re

from ai.claude_chat import chamar

SYSTEM_PROMPT = """Você é um analista de identidade visual/design gráfico, especializado em \
extrair o padrão estrutural recorrente de peças gráficas de Instagram (posts institucionais \
de empresas/escritórios), para que esse padrão possa ser reaplicado de forma fiel em uma \
nova peça sobre outro assunto.

Você recebe uma ou mais imagens de posts JÁ USADOS por um escritório de advocacia/empresa. \
Se vier mais de uma imagem, sua tarefa é identificar o que SE REPETE entre elas (o padrão \
real da marca), não descrever cada imagem isoladamente - uma característica que aparece em \
só uma das referências não é o padrão, é uma variação pontual.

Você SEMPRE responde em JSON válido, e SOMENTE o JSON, sem texto antes ou depois, no formato:
{
  "logoPosicao": "superior-esquerda",
  "tituloAlinhamento": "esquerda",
  "tituloPosicaoVertical": "inferior",
  "tituloCaixaAlta": false,
  "corPrimaria": "#RRGGBB",
  "corSecundaria": null,
  "corFundo": null,
  "fundoTipo": "foto",
  "imagemProporcao": 0.55,
  "temFaixaRodape": true,
  "estiloGeral": "institucional sóbrio",
  "observacoes": ""
}

Regras para cada campo:
- "logoPosicao": uma destas: "superior-esquerda", "superior-direita", "superior-centro",
  "inferior-esquerda", "inferior-direita", "inferior-centro". Se não houver logo visível ou
  a posição variar entre as referências, use "superior-esquerda" (padrão mais comum).
- "tituloAlinhamento": "esquerda", "centro" ou "direita" - onde o texto principal/título
  começa.
- "tituloPosicaoVertical": "superior", "centro" ou "inferior" - em que terço da peça o bloco
  de título/texto principal fica.
- "tituloCaixaAlta": true se o título aparece predominantemente EM MAIÚSCULAS nas
  referências, false se usa capitalização normal.
- "corPrimaria": código hex #RRGGBB da cor de destaque mais usada (fundo de selo, faixa,
  detalhe gráfico, ou cor de texto de destaque). Estime pela percepção visual geral, não
  precisa ser exato ao pixel.
- "corSecundaria": segunda cor de destaque, se houver um padrão claro de duas cores; senão
  null.
- "corFundo": se houver uma cor de fundo sólida/predominante fora de fotografia, o hex dela;
  senão null.
- "fundoTipo": "foto" (fundo é fotografia), "cor_solida" (fundo é cor lisa/degradê sem foto),
  ou "gradiente".
- "imagemProporcao": número de 0.15 a 0.9 estimando que fração da composição vertical é
  ocupada por fotografia/imagem (0.55 = pouco mais da metade). Se não houver fotografia
  nas referências, use 0.
- "temFaixaRodape": true se há uma faixa/bloco distinto no rodapé com nome/contato/logo
  separado visualmente do resto (linha divisória, cor de fundo diferente etc.).
- "estiloGeral": 2 a 4 palavras descrevendo o estilo (ex: "institucional sóbrio", "moderno
  minimalista", "vibrante colorido", "corporativo tradicional").
- "observacoes": até 2 frases citando algum elemento gráfico distintivo e recorrente que não
  se encaixa nos campos acima (ícones específicos, formas geométricas, textura, borda) - só
  se for claramente recorrente entre as referências. Deixe "" se não houver nada assim.

Se as referências forem poucas, ambíguas ou contraditórias entre si em algum campo, prefira \
a opção mais neutra/conservadora - nunca invente um padrão que não conseguiu observar de \
verdade nas imagens fornecidas."""


def _extrair_json(texto: str) -> dict:
    texto = re.sub(r"^```(?:json)?\s*|\s*```$", "", texto.strip())
    return json.loads(texto)


_LOGO_POSICOES = {
    "superior-esquerda", "superior-direita", "superior-centro",
    "inferior-esquerda", "inferior-direita", "inferior-centro",
}
_ALINHAMENTOS = {"esquerda", "centro", "direita"}
_POSICOES_VERTICAIS = {"superior", "centro", "inferior"}
_FUNDO_TIPOS = {"foto", "cor_solida", "gradiente"}
_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _validar_perfil(dados: dict) -> dict:
    """Nunca confia cegamente no JSON da IA - qualquer campo fora do
    esperado cai pro default mais neutro, pra nunca quebrar o canvas nem
    inventar um padrão maluco."""

    def cor(valor):
        return valor if isinstance(valor, str) and _HEX_RE.match(valor) else None

    return {
        "logoPosicao": dados.get("logoPosicao") if dados.get("logoPosicao") in _LOGO_POSICOES else "superior-esquerda",
        "tituloAlinhamento": dados.get("tituloAlinhamento") if dados.get("tituloAlinhamento") in _ALINHAMENTOS else "esquerda",
        "tituloPosicaoVertical": dados.get("tituloPosicaoVertical") if dados.get("tituloPosicaoVertical") in _POSICOES_VERTICAIS else "inferior",
        "tituloCaixaAlta": bool(dados.get("tituloCaixaAlta")),
        "corPrimaria": cor(dados.get("corPrimaria")) or "#D9A544",
        "corSecundaria": cor(dados.get("corSecundaria")),
        "corFundo": cor(dados.get("corFundo")),
        "fundoTipo": dados.get("fundoTipo") if dados.get("fundoTipo") in _FUNDO_TIPOS else "foto",
        "imagemProporcao": _num_entre(dados.get("imagemProporcao"), 0.0, 0.9, 0.55),
        "temFaixaRodape": bool(dados.get("temFaixaRodape", True)),
        "estiloGeral": str(dados.get("estiloGeral") or "institucional").strip()[:60],
        "observacoes": str(dados.get("observacoes") or "").strip()[:300],
    }


def _num_entre(valor, minimo: float, maximo: float, padrao: float) -> float:
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return padrao
    return max(minimo, min(maximo, n))


def extrair_perfil_visual(referencias: list[dict]) -> dict:
    """
    referencias: lista de dicts {"base64": str, "mediaType": str} - as
    imagens de posts que o cliente já usa, na ordem que quiser.

    Retorna o perfil_visual validado (ver _validar_perfil). Se a lista
    vier vazia, devolve o perfil default (equivalente a "sem preferência
    detectada" - o chamador decide o que fazer, mas normalmente isso não
    deveria ocorrer já que o endpoint exige ao menos 1 referência).
    """
    if not referencias:
        return _validar_perfil({})

    conteudo = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": ref.get("mediaType") or "image/jpeg",
                "data": ref["base64"],
            },
        }
        for ref in referencias
    ]
    intro = (
        f"Seguem {len(referencias)} imagem(ns) de posts que o escritório já usa. "
        "Identifique o padrão visual recorrente e responda com o JSON do perfil visual."
        if len(referencias) > 1
        else "Segue 1 imagem de post que o escritório já usa. Responda com o JSON do perfil visual."
    )
    conteudo.append({"type": "text", "text": intro})

    bruto = chamar(SYSTEM_PROMPT, [{"role": "user", "content": conteudo}], max_tokens=600)
    try:
        dados = _extrair_json(bruto)
    except (ValueError, json.JSONDecodeError):
        dados = {}
    return _validar_perfil(dados)
