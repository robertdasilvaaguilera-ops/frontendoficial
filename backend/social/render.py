"""
Renderizador server-side das duas imagens do post automático de Instagram
(1080x1350 cada) - a mesma identidade visual validada manualmente (fundo em
degradê radial, tipografia serifada dourada/creme, destaque em `<mark>`,
rodapé de marca) - só que gerada com Pillow em vez de HTML + navegador,
porque este backend não tem Node/Playwright e roda como serviço de longa
duração no Railway (mais leve e mais robusto sem depender de um Chromium
headless em produção).

Identidade visual configurável (`Marca`): cada escritório/perfil que usa a
Mídia Social define seu próprio nome, @handle, cores e logo (ver
/social/config) - os valores de MARCA_PADRAO abaixo são só o default (a
identidade original da Atlas), usado quando o perfil ainda não configurou a
própria marca.

Convenção de destaque: o chamador usa `§§texto§§` para marcar os trechos
que devem virar o grifo dourado (mesma convenção usada no resto da geração
de conteúdo da ATLAS) - ver `parse_marks`.
"""
from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass, field

from PIL import Image, ImageDraw, ImageFont, ImageOps

_PASTA = os.path.dirname(os.path.abspath(__file__))
_FONTE_LORA = os.path.join(_PASTA, "fonts", "Lora-Variable.ttf")
_FONTE_PLEX = os.path.join(_PASTA, "fonts", "IBMPlexSans-Variable.ttf")
_FONTE_PLAYFAIR = os.path.join(_PASTA, "fonts", "PlayfairDisplay-Variable.ttf")
_FONTE_INTER = os.path.join(_PASTA, "fonts", "Inter-Variable.ttf")

LARGURA = 1080
ALTURA = 1350

# Estilos tipográficos curados (título, corpo) - conjunto fechado de
# propósito: garante que qualquer combinação escolhida (manualmente ou pela
# IA em /social/gerar-identidade) sempre fica com aparência profissional,
# em vez de liberar qualquer fonte do sistema.
ESTILO_PADRAO = "classico"
FONTES_ESTILOS: dict[str, tuple[str, str]] = {
    "classico": (_FONTE_LORA, _FONTE_PLEX),  # serifado clássico + sans neutro (identidade original da Atlas)
    "editorial": (_FONTE_PLAYFAIR, _FONTE_PLEX),  # serifado editorial, mais dramático
    "moderno": (_FONTE_INTER, _FONTE_INTER),  # só sans, limpo e corporativo
}


def _fontes_da_marca(marca: "Marca") -> tuple[str, str]:
    return FONTES_ESTILOS.get(marca.estilo, FONTES_ESTILOS[ESTILO_PADRAO])


# Onde o bloco de texto principal fica na imagem - pensado pra quem já tem
# um fundo próprio (upload em /social/fundo) cujo espaço em branco não é
# necessariamente no centro. Afeta o parágrafo/manchete/subtítulo/CTA; o
# rodapé de marca (traço+nome+@handle) e o traço divisor continuam sempre
# centralizados - é a assinatura do post, convenção comum mesmo em designs
# com corpo alinhado à esquerda/direita.
POSICAO_VERTICAL_PADRAO = "centro"
POSICOES_VERTICAIS = ("topo", "centro", "rodape")
ALINHAMENTO_PADRAO = "centro"
ALINHAMENTOS_HORIZONTAIS = ("esquerda", "centro", "direita")
_MARGEM_VERTICAL = 100
_MARGEM_HORIZONTAL = 110


def _y0_ancorado(altura_total: float, marca: "Marca") -> float:
    if marca.posicao_vertical == "topo":
        return float(_MARGEM_VERTICAL)
    if marca.posicao_vertical == "rodape":
        return ALTURA - altura_total - _MARGEM_VERTICAL
    return (ALTURA - altura_total) / 2


def _x0_alinhado(largura_conteudo: float, marca: "Marca") -> float:
    if marca.alinhamento == "esquerda":
        return float(_MARGEM_HORIZONTAL)
    if marca.alinhamento == "direita":
        return LARGURA - largura_conteudo - _MARGEM_HORIZONTAL
    return (LARGURA - largura_conteudo) / 2


# Cores de texto - claras (fundo escuro, o caso comum) ou escuras (fundo
# customizado claro, ver Marca.texto_claro). Não fazem parte da identidade
# de marca configurável em cor (só o par claro/escuro muda, via toggle).
COR_TEXTO_CLARO = (245, 241, 230)  # #F5F1E6
COR_TEXTO_CLARO_MUTED = (201, 196, 180)  # #C9C4B4
COR_TEXTO_ESCURO = (26, 24, 20)  # #1A1814
COR_TEXTO_ESCURO_MUTED = (90, 86, 78)  # #5A564E
COR_TEXTO_SOBRE_DESTAQUE = (20, 21, 28)  # #14151C - texto dentro do grifo, sempre escuro


def _cores_texto_da_marca(marca: "Marca") -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    if marca.texto_claro:
        return COR_TEXTO_CLARO, COR_TEXTO_CLARO_MUTED
    return COR_TEXTO_ESCURO, COR_TEXTO_ESCURO_MUTED

# Padding horizontal/vertical do grifo dourado atrás de um trecho marcado -
# equivalente ao `padding: 2px 8px` do CSS original. Diferente do CSS (onde
# o padding empurra o layout ao redor), aqui reservamos esse espaço na conta
# de posicionamento (ver `_layout_linha`) para o grifo nunca invadir a
# palavra vizinha.
PAD_H = 8
PAD_V = 6

_EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\U00002600-\U000027BF"
    "\U0001F1E6-\U0001F1FF"
    "\U00002190-\U000021FF"
    "\U0000FE0F\U0000200D"
    "]+",
    flags=re.UNICODE,
)


def _sem_emoji(texto: str) -> str:
    """As artes (parágrafo/headline/sub) não usam emoji no design aprovado -
    isso só existe como rede de segurança, já que a Lora/IBM Plex Sans não
    têm glifo de emoji (viraria um □ na imagem em vez de travar a geração)."""
    return re.sub(r"\s+", " ", _EMOJI_RE.sub("", texto)).strip()


def hex_para_rgb(cor_hex: str, default: tuple[int, int, int]) -> tuple[int, int, int]:
    """`"#D9A544"` -> `(217, 165, 68)`. Cai no `default` se o valor vier
    vazio/inválido (ex: cor ainda não configurada, ou digitada errado) - a
    imagem sempre renderiza, nunca quebra por causa de uma cor ruim."""
    if not cor_hex:
        return default
    s = cor_hex.strip().lstrip("#")
    if len(s) != 6:
        return default
    try:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except ValueError:
        return default


@dataclass
class Marca:
    """Identidade visual de um perfil da Mídia Social - tudo que varia de
    escritório para escritório entre um post e outro (ver social_config no
    banco). Os defaults abaixo reproduzem a identidade original da Atlas."""
    nome: str = "ATLAS"
    handle: str = "@ATLAS.TRIBUTOS"
    cor_destaque: tuple[int, int, int] = field(default=(217, 165, 68))  # #D9A544
    cor_fundo_claro: tuple[int, int, int] = field(default=(23, 27, 36))  # #171B24
    cor_fundo_escuro: tuple[int, int, int] = field(default=(11, 13, 18))  # #0B0D12
    logo_path: str | None = None  # caminho absoluto no disco, ou None
    estilo: str = ESTILO_PADRAO  # ver FONTES_ESTILOS
    texto_claro: bool = True  # False = texto escuro (fundo customizado claro)
    fundo1_path: str | None = None  # imagem de fundo própria (slide 1), no lugar do degradê
    fundo2_path: str | None = None  # idem, slide 2
    posicao_vertical: str = POSICAO_VERTICAL_PADRAO  # topo | centro | rodape
    alinhamento: str = ALINHAMENTO_PADRAO  # esquerda | centro | direita


MARCA_PADRAO = Marca()


def _fonte(caminho: str, tamanho: int, peso: bytes = b"Regular") -> ImageFont.FreeTypeFont:
    fonte = ImageFont.truetype(caminho, tamanho)
    try:
        fonte.set_variation_by_name(peso)
    except Exception:
        pass  # variação indisponível - segue com o peso default da fonte
    return fonte


def _gradiente_radial(
    size: tuple[int, int],
    centro_pct: tuple[float, float],
    cor_clara: tuple[int, int, int],
    cor_escura: tuple[int, int, int],
) -> Image.Image:
    """Aproxima o `radial-gradient(circle at X% Y%, claro 0%, escuro 55%)`
    do CSS original: interpola claro->escuro conforme a distância do centro,
    saturando em escuro a partir de 55% do raio até o canto mais distante."""
    w, h = size
    cx, cy = w * centro_pct[0], h * centro_pct[1]
    cantos = [(0, 0), (w, 0), (0, h), (w, h)]
    raio_max = max(math.hypot(cx - x, cy - y) for x, y in cantos)
    parada = 0.55

    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        dy = y - cy
        for x in range(w):
            dx = x - cx
            d = math.hypot(dx, dy) / raio_max
            t = min(1.0, d / parada)
            r = round(cor_clara[0] + (cor_escura[0] - cor_clara[0]) * t)
            g = round(cor_clara[1] + (cor_escura[1] - cor_clara[1]) * t)
            b = round(cor_clara[2] + (cor_escura[2] - cor_clara[2]) * t)
            px[x, y] = (r, g, b)
    return img


def _luminancia_relativa(cor: tuple[int, int, int]) -> float:
    """Luminância relativa (WCAG) - usada só pra medir contraste entre duas
    cores, não pra escolher cor nenhuma."""
    def _linear(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = cor
    return 0.2126 * _linear(r) + 0.7152 * _linear(g) + 0.0722 * _linear(b)


def razao_contraste(cor_a: tuple[int, int, int], cor_b: tuple[int, int, int]) -> float:
    """Razão de contraste WCAG entre duas cores (1.0 = idênticas, 21.0 =
    preto/branco). Usada pra impedir salvar uma cor de destaque ilegível
    (o texto marcado é sempre escuro, então a cor de destaque precisa ter
    contraste suficiente contra ele - e contra os dois fundos)."""
    l1, l2 = _luminancia_relativa(cor_a), _luminancia_relativa(cor_b)
    claro, escuro = max(l1, l2), min(l1, l2)
    return (claro + 0.05) / (escuro + 0.05)


def _fundo_imagem(caminho: str) -> Image.Image:
    """Fundo próprio do usuário (upload em /social/fundo) - recorta e
    redimensiona preenchendo o quadro (equivalente a `object-fit: cover`),
    pra funcionar independente da proporção original do arquivo enviado."""
    img = Image.open(caminho).convert("RGB")
    return ImageOps.fit(img, (LARGURA, ALTURA), method=Image.LANCZOS)


def _fundo_slide(marca: "Marca", fundo_path: str | None, centro_pct: tuple[float, float]) -> Image.Image:
    if fundo_path and os.path.isfile(fundo_path):
        try:
            return _fundo_imagem(fundo_path)
        except Exception:
            pass  # arquivo corrompido/formato inesperado - cai pro degradê
    return _gradiente_radial((LARGURA, ALTURA), centro_pct, marca.cor_fundo_claro, marca.cor_fundo_escuro)


@dataclass
class Palavra:
    texto: str
    marcada: bool


def parse_marks(texto: str) -> list[tuple[str, bool]]:
    """`"a §§b§§ c"` -> `[("a ", False), ("b", True), (" c", False)]` -
    mesma convenção de `§§...§§` alternando dentro/fora de destaque a cada
    marcador, usada em todo o resto da geração de conteúdo da ATLAS."""
    partes = texto.split("§§")
    return [(parte, i % 2 == 1) for i, parte in enumerate(partes) if parte]


def _palavras(segments: list[tuple[str, bool]]) -> list[Palavra]:
    palavras: list[Palavra] = []
    for texto, marcada in segments:
        for tok in texto.split(" "):
            if tok:
                palavras.append(Palavra(tok, marcada))
    return palavras


def _preparar_palavras(texto: str) -> list[Palavra]:
    return _palavras(parse_marks(_sem_emoji(texto)))


def _quebrar_linhas(
    draw: ImageDraw.ImageDraw, palavras: list[Palavra], fonte: ImageFont.FreeTypeFont, largura_max: int
) -> list[list[Palavra]]:
    """Quebra de linha "greedy" clássica, preservando a flag `marcada` de
    cada palavra para o desenho do grifo depois. Reserva uma folga extra
    (2*PAD_H) sempre que a linha teria um trecho marcado, pra cobrir o
    padding do grifo sem precisar remedir por fronteira (aproximação
    suficiente: o grifo raramente ocupa a linha inteira)."""
    espaco = draw.textlength(" ", font=fonte)
    linhas: list[list[Palavra]] = []
    linha_atual: list[Palavra] = []
    largura_atual = 0.0
    tem_marca_atual = False
    largura_util = largura_max - 2 * PAD_H
    for p in palavras:
        largura_palavra = draw.textlength(p.texto, font=fonte)
        acrescimo = largura_palavra + (espaco if linha_atual else 0)
        limite = largura_max if not (tem_marca_atual or p.marcada) else largura_util
        if linha_atual and largura_atual + acrescimo > limite:
            linhas.append(linha_atual)
            linha_atual = [p]
            largura_atual = largura_palavra
            tem_marca_atual = p.marcada
        else:
            linha_atual.append(p)
            largura_atual += acrescimo
            tem_marca_atual = tem_marca_atual or p.marcada
    if linha_atual:
        linhas.append(linha_atual)
    return linhas


def _layout_linha(
    draw: ImageDraw.ImageDraw,
    linha: list[Palavra],
    fonte_normal: ImageFont.FreeTypeFont,
    fonte_marcada: ImageFont.FreeTypeFont,
    largura_canvas: int,
    marca: "Marca",
) -> tuple[list[float], list[float]]:
    """Calcula a posição x de cada palavra da linha (alinhada conforme
    `marca.alinhamento`) e a largura de cada uma, JÁ reservando o padding do
    grifo nas fronteiras marcado/não-marcado - assim o retângulo do destaque
    nunca precisa "invadir" o espaço de uma palavra vizinha (ver PAD_H)."""
    espaco_normal = draw.textlength(" ", font=fonte_normal)
    espaco_marc = draw.textlength(" ", font=fonte_marcada)
    larguras = [
        draw.textlength(p.texto, font=(fonte_marcada if p.marcada else fonte_normal))
        for p in linha
    ]

    gaps_antes = [0.0] * len(linha)
    for i in range(1, len(linha)):
        gap = espaco_marc if (linha[i].marcada or linha[i - 1].marcada) else espaco_normal
        if linha[i].marcada != linha[i - 1].marcada:
            gap += PAD_H
        gaps_antes[i] = gap

    borda_ini = PAD_H if linha and linha[0].marcada else 0.0
    borda_fim = PAD_H if linha and linha[-1].marcada else 0.0
    largura_linha = sum(larguras) + sum(gaps_antes) + borda_ini + borda_fim
    x0 = _x0_alinhado(largura_linha, marca)

    xs: list[float] = []
    x_cursor = x0 + borda_ini
    for i in range(len(linha)):
        x_cursor += gaps_antes[i]
        xs.append(x_cursor)
        x_cursor += larguras[i]

    return xs, larguras


def _desenhar_linha_rica(
    draw: ImageDraw.ImageDraw,
    linha: list[Palavra],
    fonte_normal: ImageFont.FreeTypeFont,
    fonte_marcada: ImageFont.FreeTypeFont,
    y_baseline_normal: float,
    largura_canvas: int,
    cor_normal: tuple[int, int, int],
    cor_destaque: tuple[int, int, int],
    marca: "Marca",
) -> None:
    """Desenha uma linha alinhada conforme `marca.alinhamento`, com grifo na
    cor de destaque atrás de cada trecho contínuo marcado (equivalente ao
    `<mark>` + `box-decoration-break: clone` do CSS). `y_baseline_normal` é a
    linha de base (baseline) do texto não-marcado - se a fonte marcada tiver
    tamanho diferente (caso do subtítulo do slide 2), o texto marcado é
    alinhado pela MESMA baseline, não pelo topo, pra não "flutuar" fora do
    lugar."""
    if not linha:
        return
    xs, larguras = _layout_linha(draw, linha, fonte_normal, fonte_marcada, largura_canvas, marca)
    ascent_normal, _ = fonte_normal.getmetrics()
    ascent_marc, _ = fonte_marcada.getmetrics()
    y_topo_normal = y_baseline_normal - ascent_normal
    y_topo_marc = y_baseline_normal - ascent_marc

    # 1a passada: grifo na cor de destaque atrás de cada trecho contínuo marcado
    i = 0
    while i < len(linha):
        if linha[i].marcada:
            j = i
            while j < len(linha) and linha[j].marcada:
                j += 1
            x_ini = xs[i] - PAD_H
            x_fim = xs[j - 1] + larguras[j - 1] + PAD_H
            draw.rounded_rectangle(
                [x_ini, y_topo_marc - PAD_V, x_fim, y_topo_marc + ascent_marc + PAD_V],
                radius=8,
                fill=cor_destaque,
            )
            i = j
        else:
            i += 1

    # 2a passada: o texto por cima
    for i, p in enumerate(linha):
        if p.marcada:
            draw.text((xs[i], y_topo_marc), p.texto, font=fonte_marcada, fill=COR_TEXTO_SOBRE_DESTAQUE)
        else:
            draw.text((xs[i], y_topo_normal), p.texto, font=fonte_normal, fill=cor_normal)


def _desenhar_paragrafo(
    draw: ImageDraw.ImageDraw,
    linhas: list[list[Palavra]],
    fonte: ImageFont.FreeTypeFont,
    y_topo: float,
    largura_canvas: int,
    line_height: float,
    cor_destaque: tuple[int, int, int],
    marca: "Marca",
    cor_texto: tuple[int, int, int] = COR_TEXTO_CLARO,
) -> float:
    """Desenha um parágrafo de várias linhas onde marcado/não-marcado usam a
    MESMA fonte (só muda a cor) - caso do parágrafo de destaque e da
    manchete. Devolve a altura total ocupada."""
    ascent, _ = fonte.getmetrics()
    y = y_topo
    for linha in linhas:
        _desenhar_linha_rica(draw, linha, fonte, fonte, y + ascent, largura_canvas, cor_texto, cor_destaque, marca)
        y += line_height
    return y - y_topo


def _desenhar_marca(
    img: Image.Image, draw: ImageDraw.ImageDraw, marca: Marca, y_topo: int, largura_canvas: int, escala: float = 1.0
) -> int:
    """Bloco de marca (traço + nome/logo + @handle + traço), idêntico ao
    `.brand` do template HTML original, só que com nome/handle/cor/logo
    configuráveis por perfil em vez de fixos na Atlas. Devolve a altura
    ocupada."""
    _, fonte_corpo_path = _fontes_da_marca(marca)
    _, cor_texto_muted = _cores_texto_da_marca(marca)
    y = y_topo
    largura_tra_co = 90
    x_centro = largura_canvas / 2

    draw.line(
        [(x_centro - largura_tra_co / 2, y), (x_centro + largura_tra_co / 2, y)],
        fill=marca.cor_destaque, width=3,
    )
    y += 20 * escala

    altura_linha_nome = round(46 * escala)
    if marca.logo_path and os.path.isfile(marca.logo_path):
        try:
            logo = Image.open(marca.logo_path).convert("RGBA")
            razao = logo.width / logo.height if logo.height else 1.0
            altura_logo = altura_linha_nome
            largura_logo = round(altura_logo * razao)
            logo = logo.resize((largura_logo, altura_logo), Image.LANCZOS)
            img.paste(logo, (round(x_centro - largura_logo / 2), round(y)), logo)
            y += altura_logo + 8 * escala
        except Exception:
            # logo corrompido/formato inesperado - não trava o post, só cai
            # pro nome em texto (mesmo caminho de quem nunca subiu logo).
            marca = Marca(**{**marca.__dict__, "logo_path": None})

    if not marca.logo_path or not os.path.isfile(marca.logo_path or ""):
        fonte_titulo_path, _ = _fontes_da_marca(marca)
        fonte_nome = _fonte(fonte_titulo_path, round(38 * escala), b"Bold")
        _desenhar_texto_com_tracking(draw, marca.nome.upper(), fonte_nome, x_centro, y, 2, marca.cor_destaque)
        y += fonte_nome.getbbox(marca.nome.upper())[3] + 8 * escala

    fonte_sub = _fonte(fonte_corpo_path, round(20 * escala), b"SemiBold")
    sub = marca.handle.upper()
    _desenhar_texto_com_tracking(draw, sub, fonte_sub, x_centro, y, 7, cor_texto_muted)
    y += fonte_sub.getbbox(sub)[3] + 20 * escala

    draw.line(
        [(x_centro - largura_tra_co / 2, y), (x_centro + largura_tra_co / 2, y)],
        fill=marca.cor_destaque, width=3,
    )
    y += 3
    return y - y_topo


def _desenhar_texto_com_tracking(
    draw: ImageDraw.ImageDraw,
    texto: str,
    fonte: ImageFont.FreeTypeFont,
    x_centro: float,
    y: float,
    tracking: float,
    cor: tuple[int, int, int],
) -> None:
    """Desenha `texto` centralizado em `x_centro`, com espaçamento extra
    `tracking` (px) entre letras - equivalente ao `letter-spacing` do CSS,
    que o Pillow não tem embutido."""
    larguras = [draw.textlength(c, font=fonte) for c in texto]
    largura_total = sum(larguras) + tracking * (len(texto) - 1)
    x = x_centro - largura_total / 2
    for c, lw in zip(texto, larguras):
        draw.text((x, y), c, font=fonte, fill=cor)
        x += lw + tracking


def _linha_tracejada(
    draw: ImageDraw.ImageDraw, y: int, largura_canvas: int, cor: tuple[int, int, int], largura_max: int = 760
) -> None:
    largura = min(largura_max, largura_canvas - 220)
    x0 = (largura_canvas - largura) / 2
    x1 = x0 + largura
    traco, vao = 14, 10
    x = x0
    while x < x1:
        fim = min(x + traco, x1)
        draw.line([(x, y), (fim, y)], fill=cor, width=3)
        x += traco + vao


# Tamanhos tentados em ordem, do desenhado ao menor ainda legível - protege
# contra parágrafo/legenda mais longos que o normal (entrada de IA nem
# sempre respeita o tamanho pedido) estourarem a moldura ou ficarem
# espremidos: encolhe a fonte até caber, em vez de cortar ou sobrepor.
_TAMANHOS_PARAGRAFO = [42, 38, 34, 30, 26, 23]
_MARGEM_RESPIRO = 160  # espaço mínimo topo+rodapé fora do bloco de conteúdo


def render_slide1(paragrafo_destaque: str, out_path: str, marca: Marca = MARCA_PADRAO) -> None:
    """Imagem 1: parágrafo de destaque (regra + pegadinha) + marca do perfil."""
    img = _fundo_slide(marca, marca.fundo1_path, (0.15, 0.0))
    draw = ImageDraw.Draw(img)
    fonte_titulo_path, _ = _fontes_da_marca(marca)
    cor_texto, _ = _cores_texto_da_marca(marca)

    altura_divisor_bloco = 56 + 44
    altura_marca = 20 + 46 + 8 + 24 + 20 + 3 + 23  # aprox. altura do bloco de marca (38px+20px+8px+20px)
    altura_disponivel = ALTURA - _MARGEM_RESPIRO

    largura_max_texto = 830
    palavras = _preparar_palavras(paragrafo_destaque)
    for tamanho in _TAMANHOS_PARAGRAFO:
        fonte_par = _fonte(fonte_titulo_path, tamanho, b"Bold")
        linhas = _quebrar_linhas(draw, palavras, fonte_par, largura_max_texto)
        line_height = round(tamanho * 1.5)
        altura_paragrafo = line_height * len(linhas)
        altura_total = altura_paragrafo + altura_divisor_bloco + altura_marca
        if altura_total <= altura_disponivel:
            break
    y = _y0_ancorado(altura_total, marca)

    y += _desenhar_paragrafo(draw, linhas, fonte_par, y, LARGURA, line_height, marca.cor_destaque, marca, cor_texto)
    y += 56
    _linha_tracejada(draw, int(y), LARGURA, marca.cor_destaque)
    y += 44
    _desenhar_marca(img, draw, marca, int(y), LARGURA)

    img.save(out_path, "PNG")


_TAMANHOS_HEADLINE = [40, 36, 32, 28, 25]
_TAMANHOS_SUB = [25, 23, 21, 19]  # fonte_sub_mark acompanha a +4 (proporção original)


def render_slide2(headline2: str, sub2: str, out_path: str, marca: Marca = MARCA_PADRAO) -> None:
    """Imagem 2: manchete fixa + subtítulo (com o crédito ao perfil grifado) +
    CTA pro link da bio + marca do perfil."""
    img = _fundo_slide(marca, marca.fundo2_path, (0.85, 1.0))
    draw = ImageDraw.Draw(img)
    fonte_titulo_path, fonte_corpo_path = _fontes_da_marca(marca)
    cor_texto, cor_texto_muted = _cores_texto_da_marca(marca)

    # Headline é sempre 1 linha só ("nowrap") - se vier mais longa que o
    # esperado (a IA nem sempre respeita o limite pedido no prompt),
    # encolhe até caber na largura em vez de vazar pra fora da moldura.
    largura_max_headline = LARGURA - 220
    linhas_headline = [_preparar_palavras(headline2)]
    for tamanho in _TAMANHOS_HEADLINE:
        fonte_headline = _fonte(fonte_titulo_path, tamanho, b"Bold")
        largura_headline = sum(draw.textlength(p.texto, font=fonte_headline) + 10 for p in linhas_headline[0])
        if largura_headline <= largura_max_headline:
            break
    altura_headline = round(fonte_headline.size * 1.25)

    largura_max_sub = 660
    palavras_sub = _preparar_palavras(sub2)
    altura_marca = 20 + 34 + 8 + 18 + 20 + 3
    fonte_cta = _fonte(fonte_corpo_path, 28, b"SemiBold")
    altura_cta = fonte_cta.getbbox("Ag")[3]
    altura_disponivel = ALTURA - _MARGEM_RESPIRO

    for tamanho_sub in _TAMANHOS_SUB:
        fonte_sub = _fonte(fonte_corpo_path, tamanho_sub, b"Regular")
        fonte_sub_mark = _fonte(fonte_corpo_path, tamanho_sub + 4, b"Bold")
        linhas_sub = _quebrar_linhas(draw, palavras_sub, fonte_sub, largura_max_sub)
        altura_linha_sub = round(tamanho_sub * 1.55)
        altura_sub = altura_linha_sub * len(linhas_sub)
        altura_total = (
            altura_headline + 28 + altura_sub + 52 + 44 + altura_cta + 48 + altura_marca
        )
        if altura_total <= altura_disponivel:
            break
    y = _y0_ancorado(altura_total, marca)

    y += _desenhar_paragrafo(draw, linhas_headline, fonte_headline, y, LARGURA, altura_headline, marca.cor_destaque, marca, cor_texto)
    y += 28
    # sub usa fonte maior/mais pesada pro trecho marcado (baseline alinhada
    # com o resto do subtítulo) - ver _desenhar_linha_rica.
    ascent_sub, _ = fonte_sub.getmetrics()
    for linha in linhas_sub:
        _desenhar_linha_rica(
            draw, linha, fonte_sub, fonte_sub_mark, y + ascent_sub, LARGURA, cor_texto_muted, marca.cor_destaque, marca
        )
        y += altura_linha_sub
    y += 52
    _linha_tracejada(draw, int(y), LARGURA, marca.cor_destaque)
    y += 44

    texto_cta_1, texto_cta_2 = "Toque no ", "link da bio"
    texto_cta_3 = f" e conheça a {marca.nome.title()}"
    l1 = draw.textlength(texto_cta_1, font=fonte_cta)
    l2 = draw.textlength(texto_cta_2, font=fonte_cta)
    l3 = draw.textlength(texto_cta_3, font=fonte_cta)
    x = _x0_alinhado(l1 + l2 + l3, marca)
    draw.text((x, y), texto_cta_1, font=fonte_cta, fill=cor_texto)
    x += l1
    draw.text((x, y), texto_cta_2, font=fonte_cta, fill=marca.cor_destaque)
    x += l2
    draw.text((x, y), texto_cta_3, font=fonte_cta, fill=cor_texto)
    y += altura_cta + 48

    _desenhar_marca(img, draw, marca, int(y), LARGURA, escala=34 / 38)

    img.save(out_path, "PNG")
