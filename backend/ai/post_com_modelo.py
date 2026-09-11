"""
Orquestra o "Estudio Visual": gera um post novo preservando o modelo
visual que o cliente já usa (posts de referência fornecidos por ele) e
contextualizado pela decisão/notícia real da ATLAS.

Não duplica lógica - reaproveita os dois módulos já existentes e testados:
  - ai.social_post.gerar_textos_post: headline/corpo/legenda (mesma
    qualidade de texto já aprovada no estúdio de Instagram padrão).
  - ai.imagem_contextual.selecionar_imagem_fundo: foto contextual pelo
    setor/tema da decisão (banco Pexels).
Só adiciona a etapa nova: ai.perfil_visual.extrair_perfil_visual, que lê
as referências do cliente e devolve o padrão estrutural (posição de
logo, alinhamento/caixa do título, cores, proporção de imagem, faixa de
rodapé) usado pelo frontend para renderizar o post no template
"modelo-cliente" (ver instagram-canvas.ts).
"""
from ai import social_post
from ai.imagem_contextual import selecionar_imagem_fundo
from ai.perfil_visual import extrair_perfil_visual


def gerar_post_com_modelo(
    decisao: dict, referencias: list[dict], mensagem: str | None = None
) -> dict:
    """
    decisao: mesmo shape usado em social_post.gerar_textos_post (titulo/
        tribunal/mecanismo/tributos/setores/ementa).
    referencias: lista de {"base64": str, "mediaType": str} com os posts
        que o cliente já usa (pelo menos 1).
    mensagem: instrução opcional do advogado sobre o conteúdo do post
        (não sobre o visual - o visual vem das referências).

    Retorna headline/corpo/legenda (texto real gerado, igual ao estúdio
    padrão), perfilVisual (estrutura pro canvas desenhar) e a foto
    contextual já em data URL (ou None se não configurada/disponível).
    """
    perfil = extrair_perfil_visual(referencias)

    texto = social_post.gerar_textos_post(decisao, mensagem, historico=None)

    imagem = selecionar_imagem_fundo(decisao)

    return {
        "headline": texto["headline"],
        "corpo": texto["corpo"],
        "legenda": texto["legenda"],
        "perfilVisual": perfil,
        "imagemFundoDataUrl": imagem["dataUrl"] if imagem else None,
        "contextoVisual": imagem["contexto"] if imagem else None,
    }
