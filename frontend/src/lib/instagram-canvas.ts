// Motor de desenho da arte de Instagram (canvas puro, sem lib externa).
// Renderiza no formato de post retrato (1080x1350) a partir de uma foto de
// fundo (ou gradiente, se não houver foto) + textos gerados pela IA.
//
// Suporta vários templates visuais (não um padrão único pra todo mundo) e
// controles de tamanho de fonte / família - tanto escolhidos manualmente
// pelo advogado quanto sugeridos pela IA quando ele pede algo no chat
// ("letra maior", "mais moderno", "fundo azul" etc - ver ai/social_post.py
// -> campo "estilo" da resposta).

export type TemplateId =
  "editorial-escuro" | "minimal-claro" | "cartao-centralizado" | "diagonal" | "faixa-superior";

// Alinhamento de título/corpo, escolhido manualmente pelo usuário (botões
// esquerda/centro/direita) - compartilhado pelos dois motores (moderno e
// legado) e pelo perfil visual (perfil.tituloAlinhamento usa o mesmo tipo).
export type AlinhamentoTexto = "esquerda" | "centro" | "direita";

export const ALINHAMENTO_CANVAS: Record<AlinhamentoTexto, CanvasTextAlign> = {
  esquerda: "left",
  centro: "center",
  direita: "right",
};

export type FontFamilyId = "sans" | "mono";

export const TEMPLATES: { id: TemplateId; label: string; descricao: string }[] = [
  {
    id: "editorial-escuro",
    label: "Editorial escuro",
    descricao: "Foto de fundo, texto branco embaixo",
  },
  { id: "minimal-claro", label: "Minimalista claro", descricao: "Fundo claro, texto no topo" },
  {
    id: "cartao-centralizado",
    label: "Cartão centralizado",
    descricao: "Cor sólida, texto centralizado",
  },
  { id: "diagonal", label: "Diagonal", descricao: "Foto + painel colorido diagonal" },
  { id: "faixa-superior", label: "Faixa superior", descricao: "Foto em cima, texto embaixo" },
];

const FONT_FAMILIES: Record<FontFamilyId, string> = {
  sans: '"Inter", Arial, sans-serif',
  mono: '"JetBrains Mono", "Courier New", monospace',
};

// Tamanho de fonte numérico e granular pra cada texto do carrossel/Estúdio
// Visual (rótulo, título, corpo, rodapé) - substitui o antigo P/M/G único
// (KICKER_ESTILOS já tinha virado "por texto"; agora o tamanho também).
// Cada unidade = 10% do tamanho que a ATLAS sempre usou; 10 é o padrão
// (100%, idêntico ao comportamento de antes quando nada é escolhido).
export const TAMANHOS_FONTE = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40];
export const TAMANHO_FONTE_PADRAO = 10;

function escalaDoTamanho(tamanho: number | undefined): number {
  return (tamanho ?? TAMANHO_FONTE_PADRAO) / TAMANHO_FONTE_PADRAO;
}

// Fontes de destaque pro título do carrossel ("instagramáveis" - display,
// alto contraste, feitas pra headline curta e grande). Lemon Milk e
// Covetica (pedidas pelo usuário) são pagas e não podem ser embutidas;
// aqui vai Bebas Neue (a única gratuita das três) mais alternativas
// abertas de mesma família visual (geométrica/impactante), todas via
// Google Fonts - ver link em routes/__root.tsx. O corpo do texto sempre
// fica em Inter, por legibilidade em blocos de frase.
export type FonteDestaqueId =
  "inter" | "bebas-neue" | "anton" | "league-spartan" | "archivo-black" | "poppins" | "oswald";

export const FONTES_DESTAQUE: { id: FonteDestaqueId; label: string }[] = [
  { id: "inter", label: "Inter (padrão)" },
  { id: "bebas-neue", label: "Bebas Neue" },
  { id: "anton", label: "Anton" },
  { id: "league-spartan", label: "League Spartan" },
  { id: "archivo-black", label: "Archivo Black" },
  { id: "poppins", label: "Poppins" },
  { id: "oswald", label: "Oswald" },
];

const FONTE_DESTAQUE_SPEC: Record<FonteDestaqueId, { family: string; peso: number }> = {
  inter: { family: '"Inter", Arial, sans-serif', peso: 800 },
  "bebas-neue": { family: '"Bebas Neue", Arial, sans-serif', peso: 400 },
  anton: { family: '"Anton", Arial, sans-serif', peso: 400 },
  "league-spartan": { family: '"League Spartan", Arial, sans-serif', peso: 800 },
  "archivo-black": { family: '"Archivo Black", Arial, sans-serif', peso: 400 },
  poppins: { family: '"Poppins", Arial, sans-serif', peso: 800 },
  oswald: { family: '"Oswald", Arial, sans-serif', peso: 700 },
};

// As fontes de destaque só são carregadas (link + fetch dos arquivos) na
// hora em que o carrossel de fato usa uma delas - nunca no carregamento
// geral do app, que só precisa de Inter/JetBrains Mono (ver __root.tsx).
// Injeta o <link> uma única vez (idempotente) e sem bloquear: por padrão
// fica com media="print" (não conta pro first paint) e vira "all" quando
// carrega, igual ao link de fontes global.
const LINK_FONTES_DESTAQUE_ID = "atlas-fontes-destaque-instagram";
const GOOGLE_FONTS_DESTAQUE_URL =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=League+Spartan:wght@700;800&family=Archivo+Black&family=Poppins:wght@700;800&family=Oswald:wght@600;700&display=swap";

function garantirLinkFontesDestaque(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(LINK_FONTES_DESTAQUE_ID)) return;
  const link = document.createElement("link");
  link.id = LINK_FONTES_DESTAQUE_ID;
  link.rel = "stylesheet";
  link.href = GOOGLE_FONTS_DESTAQUE_URL;
  link.media = "print";
  link.onload = () => {
    link.media = "all";
  };
  document.head.appendChild(link);
}

// Canvas não espera fonte web carregar sozinho (ao contrário de texto em
// HTML) - sem isso, o título pode desenhar com a fonte de fallback do
// sistema na primeira renderização. Idempotente: o navegador já cacheia
// fontes carregadas, então chamar de novo em cada slide não tem custo.
async function garantirFonteCarregada(id: FonteDestaqueId): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  if (id !== "inter") garantirLinkFontesDestaque();
  const spec = FONTE_DESTAQUE_SPEC[id];
  try {
    await document.fonts.load(`${spec.peso} 52px ${spec.family}`);
  } catch {
    // segue com a fonte de fallback do navegador se não conseguir carregar
  }
}

// Escolhe um template diferente por caso (determinístico pelo id da
// decisão/notícia) - assim 1000 usuários gerando posts em cima de casos
// diferentes não caem sempre no mesmo layout. O advogado pode trocar depois.
export function templatePadraoPara(id: string): TemplateId {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TEMPLATES[hash % TEMPLATES.length].id;
}

// --- Elemento visual contextual (número em destaque ou gráfico) ----------
// Card compacto e opcional, desenhado só quando o conteúdo REAL da
// decisão/notícia tem um número ou comparação forte o bastante pra virar
// elemento visual - a IA extrai isso do texto de verdade (ver
// ai/carrossel.py -> "elementoVisual"), nunca inventado aqui no desenho.
// Tem posição livre igual aos textos e à logo (arrastável via
// posicoes.grafico), pra caber em qualquer layout sem sobrepor o resto.
export type ElementoVisualSlide =
  | { tipo: "numero_destaque"; valor: string; rotulo: string }
  | { tipo: "grafico_barra"; itens: { rotulo: string; valor: number }[] }
  | { tipo: "grafico_rosca"; rotulo: string; percentual: number }
  | {
      tipo: "comparacao";
      antes: { rotulo: string; valor: string };
      depois: { rotulo: string; valor: string };
    };

function alturaElementoVisual(elemento: ElementoVisualSlide): number {
  switch (elemento.tipo) {
    case "numero_destaque":
      return 112;
    case "grafico_barra":
      return elemento.itens.slice(0, 4).length * 42 + 14;
    case "grafico_rosca":
      return 116;
    case "comparacao":
      return 84;
  }
}

// Ícones de "enviar" (avião de papel) e "salvar" (marcador) só pro slide
// de fechamento - reforça visualmente o próprio texto do slide ("salve
// esse post", "encaminhe pra quem precisa"), no mesmo traço fino/
// arredondado dos ícones nativos do Instagram.
function desenharIconeEnviar(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, cor: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 14);
  ctx.strokeStyle = cor;
  ctx.lineWidth = Math.max(2, s * 0.09);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, s * 0.12);
  ctx.lineTo(s * 0.48, -s * 0.46);
  ctx.lineTo(s * 0.08, s * 0.46);
  ctx.lineTo(-s * 0.04, s * 0.04);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.04, s * 0.04);
  ctx.lineTo(s * 0.48, -s * 0.46);
  ctx.stroke();
  ctx.restore();
}

function desenharIconeSalvar(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, cor: string) {
  ctx.save();
  ctx.strokeStyle = cor;
  ctx.lineWidth = Math.max(2, s * 0.09);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.32, cy - s * 0.42);
  ctx.lineTo(cx - s * 0.32, cy + s * 0.42);
  ctx.lineTo(cx, cy + s * 0.16);
  ctx.lineTo(cx + s * 0.32, cy + s * 0.42);
  ctx.lineTo(cx + s * 0.32, cy - s * 0.42);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// Ícone de "compartilhar" (caixa com seta pra cima, o glifo universal de
// exportar/compartilhar) - deliberadamente diferente do avião de papel
// (encaminhar/DM) e do marcador (salvar), pra não repetir o mesmo ícone
// com dois nomes diferentes no rodapé do fechamento.
function desenharIconeCompartilhar(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, cor: string) {
  ctx.save();
  ctx.strokeStyle = cor;
  ctx.lineWidth = Math.max(2, s * 0.09);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.34, cy - s * 0.02);
  ctx.lineTo(cx - s * 0.34, cy + s * 0.42);
  ctx.lineTo(cx + s * 0.34, cy + s * 0.42);
  ctx.lineTo(cx + s * 0.34, cy - s * 0.02);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.14);
  ctx.lineTo(cx, cy - s * 0.46);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, cy - s * 0.26);
  ctx.lineTo(cx, cy - s * 0.46);
  ctx.lineTo(cx + s * 0.2, cy - s * 0.26);
  ctx.stroke();
  ctx.restore();
}

function formatarNumeroBarra(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Sem card/fundo atrás - o card genérico destoava demais da linguagem
// visual do resto do post (kicker/título/corpo já convivem direto com a
// foto, só com a mesma sombra suave de sempre). Aqui usa exatamente a
// mesma fonte de destaque do título (fonteNumeroFamily/Peso) pros
// números - o elemento tem que parecer parte do mesmo post, não um
// widget colado por cima. Um traço curto na cor de destaque assina cada
// variação como "dado" (mesmo papel visual em todas, sem precisar de
// caixa). Devolve a altura usada, só informativo pra quem chama.
function desenharElementoVisual(
  ctx: CanvasRenderingContext2D,
  elemento: ElementoVisualSlide,
  x: number,
  y: number,
  largura: number,
  corDestaque: string,
  corTexto: string,
  corTextoSecundario: string,
  font: string,
  fonteNumeroFamily: string,
  fonteNumeroPeso: number,
): number {
  const altura = alturaElementoVisual(elemento);
  ctx.save();
  // Sombra discreta (não um cartão elevado) - o Sistema de Design ATLAS
  // define os gráficos como "traço fino editorial, sem cartão de fundo"
  // (ver design_system/schema.py::GraficoTokens), então a legibilidade
  // sobre a foto vem só do contraste do texto, não de um efeito de UI.
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.textAlign = "left";

  ctx.fillStyle = corDestaque;
  ctx.fillRect(x, y, 40, 3);
  const topo = y + 22;

  switch (elemento.tipo) {
    case "numero_destaque": {
      ctx.font = `${fonteNumeroPeso} 48px ${fonteNumeroFamily}`;
      ctx.fillStyle = corDestaque;
      ctx.fillText(elemento.valor, x, topo + 40);
      ctx.font = `600 17px ${font}`;
      ctx.fillStyle = corTextoSecundario;
      wrapLines(ctx, elemento.rotulo.toUpperCase(), largura)
        .slice(0, 2)
        .forEach((linha, i) => {
          ctx.fillText(linha, x, topo + 68 + i * 23);
        });
      break;
    }
    case "grafico_barra": {
      const itens = elemento.itens.slice(0, 4);
      const max = Math.max(...itens.map((i) => Math.abs(i.valor)), 1);
      const barW = largura - 56;
      let cy = topo;
      for (const item of itens) {
        ctx.font = `700 15px ${font}`;
        ctx.fillStyle = corTextoSecundario;
        ctx.fillText(item.rotulo.toUpperCase(), x, cy);
        ctx.textAlign = "right";
        ctx.font = `700 15px ${font}`;
        ctx.fillStyle = corTexto;
        ctx.fillText(formatarNumeroBarra(item.valor), x + largura, cy);
        ctx.textAlign = "left";
        const barY = cy + 9;
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(x, barY, barW, 4);
        const w = Math.max(6, (Math.abs(item.valor) / max) * barW);
        ctx.fillStyle = corDestaque;
        ctx.fillRect(x, barY, w, 4);
        cy += 42;
      }
      break;
    }
    case "grafico_rosca": {
      const r = 40;
      const cx = x + r + 2;
      const cyC = topo + r - 8;
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(cx, cyC, r, 0, Math.PI * 2);
      ctx.stroke();
      const pct = Math.min(100, Math.max(0, elemento.percentual));
      ctx.strokeStyle = corDestaque;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cyC, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct) / 100);
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.textAlign = "center";
      ctx.font = `${fonteNumeroPeso} 22px ${fonteNumeroFamily}`;
      ctx.fillStyle = corTexto;
      ctx.fillText(`${Math.round(pct)}%`, cx, cyC + 7);
      ctx.textAlign = "left";
      ctx.font = `600 15px ${font}`;
      ctx.fillStyle = corTextoSecundario;
      const larguraLabel = largura - (r * 2 + 18);
      wrapLines(ctx, elemento.rotulo.toUpperCase(), larguraLabel)
        .slice(0, 3)
        .forEach((linha, i) => {
          ctx.fillText(linha, cx + r + 18, topo + 8 + i * 21);
        });
      break;
    }
    case "comparacao": {
      const metade = largura / 2;
      const lado = (ox: number, item: { rotulo: string; valor: string }) => {
        ctx.font = `${fonteNumeroPeso} 30px ${fonteNumeroFamily}`;
        ctx.fillStyle = corTexto;
        ctx.fillText(item.valor, x + ox, topo + 28);
        ctx.font = `700 13px ${font}`;
        ctx.fillStyle = corTextoSecundario;
        ctx.fillText(item.rotulo.toUpperCase(), x + ox, topo + 50);
      };
      lado(0, elemento.antes);
      ctx.font = `600 22px ${font}`;
      ctx.fillStyle = corDestaque;
      ctx.fillText("→", x + metade - 6, topo + 27);
      lado(metade + 22, elemento.depois);
      break;
    }
  }

  ctx.restore();
  ctx.textAlign = "left";
  return altura;
}

// Estilos de destaque (rótulo, título e corpo) inspirados nos stickers de
// texto nativos do Instagram - "sólido" é o único que a ATLAS sempre teve
// no rótulo; os outros dão a mesma variedade que o próprio Instagram
// oferece na hora de escrever texto num Story/Reels, e agora qualquer um
// dos três textos do post pode usar qualquer estilo (o usuário escolhe
// onde aplicar, não é fixo no rótulo).
export type KickerEstiloId = "solido" | "contorno" | "grifado" | "sublinhado";
export type EstiloDestaqueId = KickerEstiloId | "nenhum";

// Posição livre de cada texto - o usuário arrasta rótulo/título/corpo/
// rodapé pra qualquer lugar da imagem, cada um independente dos outros.
// xPct/yPct são frações (0-1) da largura/altura do canvas, não pixels
// fixos, pra funcionar igual em qualquer resolução de exportação.
export type PapelTexto = "rotulo" | "titulo" | "corpo" | "rodape";
// A logo e o card de número/gráfico usam o mesmo mecanismo de posição
// livre dos textos (arrastar sobre o canvas), por isso entram na mesma
// chave de posições - nenhum dos dois é um PapelTexto de verdade (não têm
// conteúdo textual gerado pela IA), mas reaproveitar a estrutura evita
// duplicar todo o sistema de arrasto.
export type ChaveArrasto = PapelTexto | "logo" | "grafico";
export interface PosicaoTexto {
  xPct: number;
  yPct: number;
  // Só a logo usa - fator de tamanho livre (1 = tamanho padrão do
  // template). Arrastar a alça de redimensionar muda isso; texto ignora.
  escala?: number;
  // Só a logo usa - largura/altura efetivas (fração do canvas) do último
  // desenho, pra UI saber exatamente onde pousar a alça de redimensionar
  // (o canto real da logo, não uma estimativa).
  larguraPct?: number;
  alturaPct?: number;
}
export type PosicoesTexto = Partial<Record<ChaveArrasto, PosicaoTexto>>;

export const ESCALA_LOGO_PADRAO = 1;
export const ESCALA_LOGO_MIN = 0.5;
export const ESCALA_LOGO_MAX = 2.5;

export const ESCALA_GRAFICO_PADRAO = 1;
export const ESCALA_GRAFICO_MIN = 0.6;
export const ESCALA_GRAFICO_MAX = 1.8;

export const KICKER_ESTILOS: { id: KickerEstiloId; label: string }[] = [
  { id: "solido", label: "Sólido" },
  { id: "contorno", label: "Contorno" },
  { id: "grifado", label: "Grifado" },
  { id: "sublinhado", label: "Sublinhado" },
];

// Título e corpo começam sem nenhum destaque (comportamento de sempre) -
// "Nenhum" vem primeiro só nesses dois picker de estilo.
export const ESTILOS_DESTAQUE_TEXTO: { id: EstiloDestaqueId; label: string }[] = [
  { id: "nenhum", label: "Nenhum" },
  ...KICKER_ESTILOS,
];

// Desenha o "fundo" de destaque (preenchido, contorno ou sublinhado) atrás
// de uma linha de texto já posicionada por fillText - usado tanto pro
// título quanto pro corpo, com a mesma aparência das 3 variações do
// rótulo (ver drawKickerPill). Só uma aproximação da caixa do texto a
// partir do tamanho da fonte (sem introspecção de métrica), suficiente
// pro efeito de "marca-texto" sem mudar a posição do texto em si -
// garante que o visual de "nenhum" (o padrão de sempre) não muda nadinha.
function desenharFundoAtrasTexto(
  ctx: CanvasRenderingContext2D,
  texto: string,
  xAncora: number,
  yBase: number,
  tamanhoFonte: number,
  align: CanvasTextAlign,
  cor: string,
  estilo: EstiloDestaqueId,
): void {
  if (estilo === "nenhum" || !texto) return;
  const largura = ctx.measureText(texto).width;
  const padX = Math.round(tamanhoFonte * 0.2);
  const altura = Math.round(tamanhoFonte * 1.08);
  const yTopo = yBase - Math.round(tamanhoFonte * 0.8);
  let x: number;
  if (align === "left") x = xAncora - padX;
  else if (align === "right") x = xAncora - largura - padX;
  else x = xAncora - largura / 2 - padX;
  const w = largura + padX * 2;

  if (estilo === "contorno") {
    roundRect(ctx, x, yTopo, w, altura, Math.round(altura * 0.16));
    ctx.lineWidth = 2;
    ctx.strokeStyle = cor;
    ctx.stroke();
  } else if (estilo === "grifado") {
    roundRect(ctx, x, yTopo, w, altura, Math.round(altura * 0.08));
    ctx.fillStyle = cor;
    ctx.fill();
  } else if (estilo === "sublinhado") {
    ctx.strokeStyle = cor;
    ctx.lineWidth = Math.max(2, Math.round(tamanhoFonte * 0.05));
    ctx.beginPath();
    ctx.moveTo(x + padX, yBase + Math.round(tamanhoFonte * 0.18));
    ctx.lineTo(x + padX + largura, yBase + Math.round(tamanhoFonte * 0.18));
    ctx.stroke();
  } else {
    roundRect(ctx, x, yTopo, w, altura, Math.round(altura / 2));
    ctx.fillStyle = cor;
    ctx.fill();
  }
}

function drawKickerPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  h: number,
  bg: string,
  fg: string,
  estilo: KickerEstiloId = "solido",
  align: CanvasTextAlign = "left",
): number {
  const padX = 18;
  const upper = text.toUpperCase();
  const w = ctx.measureText(upper).width + padX * 2;
  // `x` é o ponto de ancoragem (esquerda/centro/direita, igual ao resto
  // dos textos) - a pílula sempre desenha da esquerda pra direita
  // internamente, então o alinhamento só desloca onde essa borda esquerda
  // cai, igual desenharFundoAtrasTexto faz pro título/corpo.
  const drawX = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  ctx.textBaseline = "middle";

  if (estilo === "contorno") {
    roundRect(ctx, drawX, y, w, h, h / 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = bg;
    ctx.stroke();
    ctx.fillStyle = bg;
    ctx.fillText(upper, drawX + padX, y + h / 2 + 1);
  } else if (estilo === "grifado") {
    // "Marcador de texto": bloco reto (cantos quase retos, não pílula) bem
    // preenchido atrás do texto - o "grifado/preenchido" pedido.
    roundRect(ctx, drawX, y, w, h, 4);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(upper, drawX + padX, y + h / 2 + 1);
  } else if (estilo === "sublinhado") {
    ctx.fillStyle = bg;
    ctx.fillText(upper, drawX, y + h / 2 + 1);
    const textW = ctx.measureText(upper).width;
    ctx.strokeStyle = bg;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(drawX, y + h - 2);
    ctx.lineTo(drawX + textW, y + h - 2);
    ctx.stroke();
  } else {
    roundRect(ctx, drawX, y, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(upper, drawX + padX, y + h / 2 + 1);
  }

  ctx.textBaseline = "alphabetic";
  return y + h;
}

function shade(hex: string, percent: number): string {
  const clean = hex.replace("#", "");
  const num = parseInt(
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean,
    16,
  );
  if (Number.isNaN(num)) return "#1a1a1a";
  const amt = Math.round((percent / 100) * 255);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Corta o corpo do texto pra caber no espaço vertical disponível (entre
// onde ele começa e o limite antes do rodapé/próximo bloco), acrescentando
// reticências na última linha se precisou cortar - sem isso, corpo longo +
// fonte "grande" (ou template com pouco espaço) invadia o rodapé.
function fitBody(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number,
  startY: number,
  limitY: number,
): string[] {
  let lines = wrapLines(ctx, text, maxWidth);
  const maxLines = Math.max(1, Math.floor((limitY - startY) / lineHeight));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[lines.length - 1] = ensureEllipsis(ctx, lines[lines.length - 1], maxWidth);
  }
  return lines;
}

// Tenta o corpo do carrossel (renderPostComModelo) em 28px e só diminui a
// fonte - nunca o espaçamento entre elementos, isso já é fixo - se não
// couber no espaço vertical disponível. Deixa ctx.font configurado com o
// tamanho escolhido ao retornar, pronto pro caller desenhar as linhas.
// Só cai pra reticências (fitBody) no menor tamanho testado, se nem assim
// couber - caso raro dado o limite de ~200 caracteres já no backend.
function ajustarCorpoParaCaber(
  ctx: CanvasRenderingContext2D,
  texto: string,
  maxWidth: number,
  startY: number,
  limitY: number,
  fontFamily: string,
  escala: number = 1,
): { linhas: string[]; lineHeight: number } {
  const tamanhos = [28, 26, 24, 22].map((t) => Math.round(t * escala));
  for (const tamanho of tamanhos) {
    ctx.font = `400 ${tamanho}px ${fontFamily}`;
    const lineHeight = Math.round(tamanho * 1.3);
    const linhas = wrapLines(ctx, texto, maxWidth);
    const linhasCabem = Math.max(1, Math.floor((limitY - startY) / lineHeight));
    if (linhas.length <= linhasCabem) {
      return { linhas, lineHeight };
    }
  }
  const menor = tamanhos[tamanhos.length - 1];
  ctx.font = `400 ${menor}px ${fontFamily}`;
  const lineHeight = Math.round(menor * 1.3);
  return { linhas: fitBody(ctx, texto, maxWidth, lineHeight, startY, limitY), lineHeight };
}

function ensureEllipsis(ctx: CanvasRenderingContext2D, line: string, maxWidth: number): string {
  const trimmed = line.replace(/[.,;:!?]+$/, "");
  let text = `${trimmed}…`;
  while (ctx.measureText(text).width > maxWidth && text.length > 1) {
    text = `${text.slice(0, -2)}…`;
  }
  return text;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// --- Cor por palavra (título/corpo) --------------------------------------
// Cada palavra do título e do corpo pode ter sua própria cor - por
// destaque automático da IA (números/dados reais, ver
// ai/carrossel.py -> destaquesTitulo/destaquesCorpo) ou por escolha
// manual do usuário (arrastando... clicando na palavra, ver
// ModelosVisuaisPainel/InstagramWorkspace). As duas fontes usam o mesmo
// índice: a posição da palavra dentro do texto completo (não da linha
// já quebrada), pra sobreviver ao wrapLines sem perder a referência.

export function tokenizarPalavras(texto: string): string[] {
  return texto.split(/\s+/).filter(Boolean);
}

function normalizarPalavra(p: string): string {
  return p.toLowerCase().replace(/[.,;:!?"'()]/g, "");
}

export function calcularCoresPalavras(
  palavras: string[],
  destaques: string[] | undefined,
  overrides: Record<number, string> | undefined,
  corDestaque: string,
): Record<number, string> {
  const resultado: Record<number, string> = {};
  if (destaques?.length) {
    const normPalavras = palavras.map(normalizarPalavra);
    for (const destaque of destaques) {
      const destaquePalavras = tokenizarPalavras(destaque).map(normalizarPalavra);
      if (!destaquePalavras.length) continue;
      for (let i = 0; i <= normPalavras.length - destaquePalavras.length; i++) {
        let bate = true;
        for (let j = 0; j < destaquePalavras.length; j++) {
          if (normPalavras[i + j] !== destaquePalavras[j]) {
            bate = false;
            break;
          }
        }
        if (bate) {
          for (let j = 0; j < destaquePalavras.length; j++) resultado[i + j] = corDestaque;
        }
      }
    }
  }
  if (overrides) {
    for (const chave of Object.keys(overrides)) {
      resultado[Number(chave)] = overrides[Number(chave)];
    }
  }
  return resultado;
}

// Desenha uma linha já quebrada com uma cor por palavra - reposiciona
// manualmente porque ctx.textAlign nativo só permite uma cor por
// fillText. indiceInicial é o índice global (no texto completo, não só
// nessa linha) da primeira palavra da linha, pra achar a cor certa de
// cada uma em `cores`.
function desenharLinhaColorida(
  ctx: CanvasRenderingContext2D,
  linha: string,
  indiceInicial: number,
  cores: Record<number, string>,
  x: number,
  y: number,
  align: CanvasTextAlign,
  corPadrao: string,
): void {
  const palavras = linha.split(" ").filter(Boolean);
  if (palavras.length === 0) return;
  const espacoW = ctx.measureText(" ").width;
  const larguras = palavras.map((p) => ctx.measureText(p).width);
  const larguraTotal = larguras.reduce((a, b) => a + b, 0) + espacoW * (palavras.length - 1);
  let cursorX = x;
  if (align === "center") cursorX = x - larguraTotal / 2;
  else if (align === "right") cursorX = x - larguraTotal;

  const alignAnterior = ctx.textAlign;
  ctx.textAlign = "left";
  palavras.forEach((palavra, i) => {
    ctx.fillStyle = cores[indiceInicial + i] ?? corPadrao;
    ctx.fillText(palavra, cursorX, y);
    cursorX += larguras[i] + espacoW;
  });
  ctx.textAlign = alignAnterior;
}

// Desenha um bloco de linhas já quebradas (título ou corpo) com cor por
// palavra, avançando lineHeight a cada linha - usado pelos 5 templates do
// motor legado (o motor moderno tem o próprio loop, com fonte/estilo por
// texto mais rico). Devolve quantas palavras foram desenhadas, pro
// chamador continuar o índice global corretamente no próximo bloco.
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx: number, sy: number, sw: number, sh: number;
  if (imgRatio > boxRatio) {
    sh = img.height;
    sw = sh * boxRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / boxRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem"));
    img.src = src;
  });
}

function distanciaCor(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// Luminância média (0-1) de um bloco de pixels - usada tanto pro fundo sob
// a logo quanto pra própria logo, pra decidir se a regra "auto" de
// contraste precisa entrar em ação (ver desenharLogoComContraste). Quando
// `soAlfaVisivel` é true, ignora pixels quase transparentes (função pra
// medir a logo em si, não a área retangular ao redor dela).
function luminanciaMediaPixels(data: Uint8ClampedArray, soAlfaVisivel: boolean): number {
  let total = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (soAlfaVisivel && data[i + 3] < 32) continue;
    total += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    n++;
  }
  return n > 0 ? total / n : 0.5;
}

// null = não deu pra medir (ex: canvas contaminado por imagem de outra
// origem) - o chamador trata null como "sem sinal", nunca como um valor
// de luminância de verdade, pra nunca decidir a regra de contraste com
// base numa leitura inventada.
function luminanciaFundoSobRetangulo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  W: number,
  H: number,
): number | null {
  const ix = Math.max(0, Math.round(x));
  const iy = Math.max(0, Math.round(y));
  const iw = Math.max(1, Math.min(Math.round(w), W - ix));
  const ih = Math.max(1, Math.min(Math.round(h), H - iy));
  try {
    return luminanciaMediaPixels(ctx.getImageData(ix, iy, iw, ih).data, false);
  } catch {
    return null;
  }
}

async function luminanciaDaImagem(img: HTMLImageElement): Promise<number | null> {
  const off = document.createElement("canvas");
  const tam = 48;
  off.width = tam;
  off.height = tam;
  const octx = off.getContext("2d");
  if (!octx) return null;
  try {
    octx.drawImage(img, 0, 0, tam, tam);
    return luminanciaMediaPixels(octx.getImageData(0, 0, tam, tam).data, true);
  } catch {
    return null;
  }
}

// Remove o fundo sólido/uniforme de uma logo (a maioria das logos de
// escritório é um emblema com fundo liso, não um PNG já transparente) -
// sem isso, mesmo sem plaqueta desenhada por trás, a logo continua
// parecendo um adesivo quadrado colado sobre a foto. Roda uma vez, no
// upload (não a cada render): amostra a cor das bordas da imagem, e só
// se ela for uniforme (provável fundo liso, não uma foto/textura), faz
// um "flood fill" a partir das bordas removendo tudo que for parecido
// com essa cor e estiver conectado à borda - preserva furos internos do
// próprio desenho da logo (não é uma remoção de cor global) e nunca mexe
// em logos que já vieram com fundo transparente ou que são fotográficas.
export async function removerFundoLogo(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h || w * h > 4_000_000) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const { data } = imageData;
    const idx = (x: number, y: number) => (y * w + x) * 4;

    const bordas: number[] = [];
    for (let x = 0; x < w; x++) {
      bordas.push(idx(x, 0), idx(x, h - 1));
    }
    for (let y = 0; y < h; y++) {
      bordas.push(idx(0, y), idx(w - 1, y));
    }

    // já tem transparência de verdade na borda (PNG já cortado) - não mexe
    const alphaMedioBorda = bordas.reduce((s, i) => s + data[i + 3], 0) / bordas.length;
    if (alphaMedioBorda < 200) return dataUrl;

    let r = 0;
    let g = 0;
    let b = 0;
    for (const i of bordas) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    r /= bordas.length;
    g /= bordas.length;
    b /= bordas.length;

    const distMedia =
      bordas.reduce((s, i) => s + distanciaCor(data[i], data[i + 1], data[i + 2], r, g, b), 0) /
      bordas.length;
    // borda não é uniforme (provável foto/textura na própria logo) - não arrisca cortar
    if (distMedia > 18) return dataUrl;

    const LIMIAR = 40;
    const LIMIAR_FEATHER = 65;
    const visitado = new Uint8Array(w * h);
    const fila: number[] = [];
    for (let x = 0; x < w; x++) {
      fila.push(x, (h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      fila.push(y * w, y * w + w - 1);
    }

    let cabeca = 0;
    while (cabeca < fila.length) {
      const p = fila[cabeca++];
      if (visitado[p]) continue;
      visitado[p] = 1;
      const px = p % w;
      const py = (p / w) | 0;
      const i = p * 4;
      const d = distanciaCor(data[i], data[i + 1], data[i + 2], r, g, b);
      if (d > LIMIAR_FEATHER) continue;
      const fatorAlpha = d <= LIMIAR ? 0 : (d - LIMIAR) / (LIMIAR_FEATHER - LIMIAR);
      data[i + 3] = Math.round(data[i + 3] * fatorAlpha);
      if (px > 0) fila.push(p - 1);
      if (px < w - 1) fila.push(p + 1);
      if (py > 0) fila.push(p - w);
      if (py < h - 1) fila.push(p + w);
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}

// ===========================================================================
// Motor moderno: renderização dirigida por um perfil visual (ver
// PerfilVisual abaixo) em vez de um algoritmo de desenho fixo por
// template - usado pelo carrossel, Estúdio Visual e Notícias (ver
// design_system/extracao.py e design_system/adapters.py no backend, e
// PERFIS_NOTICIAS mais abaixo). Reaproveita os helpers de desenho já
// existentes (wrapLines, drawCover, fitBody, shade, drawKickerPill etc.)
// pra não duplicar lógica.
// ===========================================================================

// Mesmos ids de design_system/schema.py::RegraContrasteLogo - "sombra" é o
// tratamento único que a ATLAS sempre teve (sombra suave, sem plaqueta);
// "chapa-escura"/"chapa-clara" forçam uma plaqueta atrás da logo
// independente do fundo; "auto" (padrão quando o campo não vem) mede o
// fundo sob a logo e a própria logo em tempo de render e só liga a
// plaqueta quando os dois têm luminância parecida o bastante pra a logo
// sumir sem ela (ver desenharLogoComContraste).
export type RegraContrasteLogo = "sombra" | "chapa-escura" | "chapa-clara" | "auto";

export interface PerfilVisual {
  logoPosicao:
    | "superior-esquerda"
    | "superior-direita"
    | "superior-centro"
    | "inferior-esquerda"
    | "inferior-direita"
    | "inferior-centro";
  // Tamanho da logo relativo ao padrão (1 = padrão), extraído das
  // referências do cliente - mesma escala usada pela alça de
  // redimensionar (ver ESCALA_LOGO_*). Vale só quando o usuário ainda
  // não arrastou/redimensionou a logo manualmente nesse post.
  logoEscala: number;
  // Regra de contraste da logo (ver design_system/schema.py::LogoRegras) -
  // opcional: undefined tem o mesmo efeito que "auto" (comportamento
  // seguro por padrão pra qualquer chamador que não mande esse campo).
  logoContraste?: RegraContrasteLogo;
  // Área segura da logo em px (ver design_system/schema.py::LogoRegras) -
  // espaço mínimo entre a logo e a plaqueta de contraste quando ela existe.
  // undefined cai no mesmo padrão de 24px do Sistema de Design ATLAS.
  logoAreaSeguraPx?: number;
  tituloAlinhamento: AlinhamentoTexto;
  tituloPosicaoVertical: "superior" | "centro" | "inferior";
  tituloCaixaAlta: boolean;
  corPrimaria: string;
  corSecundaria: string | null;
  corFundo: string | null;
  fundoTipo: "foto" | "cor_solida" | "gradiente";
  imagemProporcao: number;
  temFaixaRodape: boolean;
  // Fonte de destaque e estilos de rótulo/título/corpo extraídos das
  // referências - réplica fiel da tipografia, não só da paleta/layout.
  fonteDestaque: FonteDestaqueId;
  kickerEstilo: KickerEstiloId;
  estiloTitulo: EstiloDestaqueId;
  estiloCorpo: EstiloDestaqueId;
  estiloGeral: string;
  observacoes: string;
}

// Sucessor dos 5 templates do motor legado (aposentado na fase 5 do plano
// de arquitetura) pras Notícias: a variedade que antes vinha de 5
// algoritmos de desenho separados agora vem de 5 perfis do Sistema de
// Design, todos desenhados pelo MESMO motor (renderPostComModelo) - unifica a arquitetura sem
// perder a sensação de "5 visuais diferentes" que o advogado já conhece.
// Os ids batem exatamente com TemplateId/TEMPLATES acima (mesmo contrato
// que ai/social_post.py já valida em "estilo.template" via chat - "fundo
// azul" etc continua funcionando igual, como um corDestaque por cima do
// perfil escolhido, não como parte dele).
//
// "diagonal" é o único sem equivalente literal: o motor novo não desenha
// painéis geométricos, então a identidade dele foi reinterpretada como
// par de cores forte + destaque grifado, não uma cópia pixel a pixel do
// template antigo.
export const PERFIS_NOTICIAS: Record<TemplateId, PerfilVisual> = {
  "editorial-escuro": {
    logoPosicao: "superior-esquerda",
    logoEscala: 1,
    logoContraste: "auto",
    logoAreaSeguraPx: 24,
    tituloAlinhamento: "esquerda",
    tituloPosicaoVertical: "inferior",
    tituloCaixaAlta: false,
    corPrimaria: "#D9A544",
    corSecundaria: null,
    corFundo: "#0B0D12",
    fundoTipo: "foto",
    imagemProporcao: 1,
    temFaixaRodape: false,
    fonteDestaque: "inter",
    kickerEstilo: "solido",
    estiloTitulo: "nenhum",
    estiloCorpo: "nenhum",
    estiloGeral: "editorial escuro",
    observacoes: "",
  },
  "minimal-claro": {
    logoPosicao: "superior-esquerda",
    logoEscala: 0.9,
    logoContraste: "auto",
    logoAreaSeguraPx: 24,
    tituloAlinhamento: "esquerda",
    tituloPosicaoVertical: "superior",
    tituloCaixaAlta: false,
    corPrimaria: "#B4532F",
    corSecundaria: null,
    corFundo: "#FAFAF8",
    fundoTipo: "foto",
    imagemProporcao: 0.42,
    temFaixaRodape: false,
    fonteDestaque: "poppins",
    kickerEstilo: "solido",
    estiloTitulo: "nenhum",
    estiloCorpo: "nenhum",
    estiloGeral: "minimalista claro",
    observacoes: "",
  },
  "cartao-centralizado": {
    logoPosicao: "superior-centro",
    logoEscala: 1,
    logoContraste: "auto",
    logoAreaSeguraPx: 24,
    tituloAlinhamento: "centro",
    tituloPosicaoVertical: "centro",
    tituloCaixaAlta: false,
    corPrimaria: "#4FA3D1",
    corSecundaria: null,
    corFundo: "#0F1B2B",
    fundoTipo: "cor_solida",
    imagemProporcao: 0,
    temFaixaRodape: false,
    fonteDestaque: "archivo-black",
    kickerEstilo: "solido",
    estiloTitulo: "sublinhado",
    estiloCorpo: "nenhum",
    estiloGeral: "cartão centralizado",
    observacoes: "",
  },
  diagonal: {
    logoPosicao: "superior-direita",
    logoEscala: 1,
    logoContraste: "auto",
    logoAreaSeguraPx: 24,
    tituloAlinhamento: "esquerda",
    tituloPosicaoVertical: "inferior",
    tituloCaixaAlta: false,
    corPrimaria: "#E0592B",
    corSecundaria: "#1B2430",
    corFundo: "#161B22",
    fundoTipo: "foto",
    imagemProporcao: 0.55,
    temFaixaRodape: false,
    fonteDestaque: "league-spartan",
    kickerEstilo: "grifado",
    estiloTitulo: "grifado",
    estiloCorpo: "nenhum",
    estiloGeral: "moderno vibrante",
    observacoes: "",
  },
  "faixa-superior": {
    logoPosicao: "superior-esquerda",
    logoEscala: 1,
    logoContraste: "auto",
    logoAreaSeguraPx: 24,
    tituloAlinhamento: "esquerda",
    tituloPosicaoVertical: "superior",
    tituloCaixaAlta: true,
    corPrimaria: "#BF9B30",
    corSecundaria: null,
    corFundo: "#141110",
    fundoTipo: "foto",
    imagemProporcao: 0.48,
    temFaixaRodape: true,
    fonteDestaque: "bebas-neue",
    kickerEstilo: "sublinhado",
    estiloTitulo: "nenhum",
    estiloCorpo: "nenhum",
    estiloGeral: "editorial jornalístico",
    observacoes: "",
  },
};

export interface RenderModeloOptions {
  width: number;
  height: number;
  backgroundDataUrl: string | null;
  logoDataUrl: string | null;
  nomeEscritorio: string;
  registro: string;
  kicker: string;
  headline: string;
  corpo: string;
  perfil: PerfilVisual;
  // Indicador discreto de posição no carrossel (ex: {atual:1, total:5}) -
  // opcional, não usado no Estúdio Visual (post único). Some templates que
  // não usam RenderModeloOptions (os 5 fixos) não têm isso.
  progresso?: { atual: number; total: number };
  // Fonte de destaque só do título (kicker e corpo continuam em Inter, por
  // legibilidade) - opcional, cai em "inter" (comportamento anterior) se
  // não for informada.
  fonteDestaque?: FonteDestaqueId;
  // Estilo visual de cada texto - cada um independente, o usuário escolhe
  // onde aplicar. Rótulo cai em "solido" (o único que sempre existiu);
  // título e corpo caem em "nenhum" (sem destaque, comportamento de
  // sempre) se não forem informados.
  kickerEstilo?: KickerEstiloId;
  estiloTitulo?: EstiloDestaqueId;
  estiloCorpo?: EstiloDestaqueId;
  // Tamanho de cada texto, independente - ver TAMANHOS_FONTE. Cada um cai
  // em TAMANHO_FONTE_PADRAO (o tamanho de sempre) se não for informado.
  tamanhoRotulo?: number;
  tamanhoTitulo?: number;
  tamanhoCorpo?: number;
  tamanhoRodape?: number;
  // Cor usada nos destaques (fundo do rótulo e de título/corpo quando têm
  // estilo "sólido"/"grifado"/"contorno"/"sublinhado") - opcional, cai na
  // cor primária do perfil visual extraído das referências se não for
  // informada (comportamento de sempre).
  corDestaque?: string;
  // Posição livre por texto - quando um papel tem posição aqui, ela vale
  // no lugar da posição calculada automaticamente pro layout do perfil.
  // Cada texto que não tiver entrada aqui continua na posição de sempre.
  posicoes?: PosicoesTexto;
  // Card de número em destaque ou gráfico (barra/rosca/comparação) - só
  // desenhado quando presente, a partir de dado real extraído do
  // conteúdo (ver ai/carrossel.py). null/undefined = nenhum elemento.
  elementoVisual?: ElementoVisualSlide | null;
  // Trechos do título/corpo que a IA identificou como número/dado
  // relevante (psicologia da atenção - ver ai/carrossel.py) e que por
  // isso ganham a cor de destaque automaticamente. Cada item precisa ser
  // um trecho exato do texto correspondente.
  destaquesTitulo?: string[];
  destaquesCorpo?: string[];
  // Cor manual por palavra (índice da palavra no texto completo, não da
  // linha) - sempre tem prioridade sobre o destaque automático acima.
  // Editado pelo usuário clicando na palavra (ver InstagramWorkspace).
  coresPalavrasTitulo?: Record<number, string>;
  coresPalavrasCorpo?: Record<number, string>;
  // Linha de ícones estilo Instagram (enviar/salvar) desenhada abaixo do
  // corpo - usada só no slide de fechamento, onde o fundo vira neutro (sem
  // a foto do assunto) e o post fica com cara de "pronto pra publicar".
  iconesAcao?: boolean;
  // Alinhamento geral escolhido manualmente pelo usuário - vale como
  // padrão pra qualquer um dos 4 textos abaixo que não tenha o próprio
  // alinhamento definido. undefined = cada texto segue o padrão que
  // sempre teve (perfil.tituloAlinhamento pro título/corpo, esquerda pro
  // rótulo/rodapé).
  alinhamentoTexto?: AlinhamentoTexto;
  // Alinhamento independente por texto (ver SeletorAlinhamento, uma
  // instância por papel) - cada um, se definido, vence tanto o padrão do
  // texto quanto alinhamentoTexto acima. Existem pra que o rótulo possa
  // ficar à esquerda enquanto o título fica centralizado, por exemplo -
  // antes só havia um controle pro post inteiro.
  alinhamentoRotulo?: AlinhamentoTexto;
  alinhamentoTitulo?: AlinhamentoTexto;
  alinhamentoCorpo?: AlinhamentoTexto;
  alinhamentoRodape?: AlinhamentoTexto;
  // Componente da biblioteca do Sistema de Design que este slide usa (ver
  // backend/design_system/schema.py e ai/direcao_arte.py) - decidido pela
  // IA a partir do conteúdo já escrito, nunca pelo usuário. Hoje só
  // "bloco_risco"/"bloco_oportunidade" (faixa semântica lateral) e
  // "chamada_salvar"/"chamada_compartilhar"/"cta" (moldura do fechamento)
  // mudam o desenho; os demais ids seguem o layout padrão de sempre -
  // undefined/null tem exatamente o mesmo resultado que sempre existiu.
  componente?: string | null;
}

// Cor semântica (risco/oportunidade) é deliberadamente separada da cor de
// marca (corDestaque) - não é uma variação da identidade, é um sinal de
// leitura (ver design_system/schema.py, componentes bloco_risco/
// bloco_oportunidade) que precisa ler igual em qualquer perfil de cores.
const COR_SEMANTICA_RISCO = "#E2574C";
const COR_SEMANTICA_OPORTUNIDADE = "#3FA873";

function luminancia(hex: string): number {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return 0;
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function corTextoSobre(hexFundo: string): string {
  return luminancia(hexFundo) > 0.6 ? "#141414" : "#FFFFFF";
}

function corTextoSecundarioSobre(hexFundo: string): string {
  return luminancia(hexFundo) > 0.6 ? "rgba(20,20,20,0.72)" : "rgba(255,255,255,0.85)";
}

function logoAnchor(
  pos: PerfilVisual["logoPosicao"],
  W: number,
  H: number,
  logoW: number,
  logoH: number,
  pad: number,
): { x: number; y: number } {
  const y = pos.startsWith("superior") ? pad : H - pad - logoH;
  let x: number;
  if (pos.endsWith("esquerda")) x = pad;
  else if (pos.endsWith("direita")) x = W - pad - logoW;
  else x = (W - logoW) / 2;
  return { x, y };
}

/**
 * Renderiza um post seguindo o perfil visual extraído das referências do
 * cliente (posição de logo, alinhamento/caixa do título, cores, proporção
 * de imagem, presença de faixa de rodapé) - preserva a estrutura observada
 * em vez de aplicar um dos 5 templates fixos. Texto sempre desenhado (não
 * gerado por IA), pra garantir fidelidade de acentuação/números/nomes.
 */
export async function renderPostComModelo(
  canvas: HTMLCanvasElement,
  opts: RenderModeloOptions,
): Promise<PosicoesTexto> {
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return {};

  const W = opts.width;
  const H = opts.height;
  const pad = 64;
  const font = FONT_FAMILIES.sans;
  const fonteDestaqueId = opts.fonteDestaque ?? "inter";
  const fonteDestaque = FONTE_DESTAQUE_SPEC[fonteDestaqueId];
  await garantirFonteCarregada(fonteDestaqueId);
  const { perfil } = opts;
  const corFundoBase = perfil.corFundo || shade(perfil.corPrimaria, -70);

  // Posição livre: cada elemento (texto ou logo) pode ter sido arrastado
  // pra qualquer lugar da imagem - quando isso aconteceu, a posição
  // escolhida pelo usuário vale no lugar da calculada automaticamente
  // pro layout do perfil. Declarado aqui em cima (não só perto de onde os
  // textos são desenhados) porque a logo é desenhada bem antes deles e
  // também precisa registrar sua posição.
  const posicoesResultado: PosicoesTexto = {};
  function registrarPosicao(
    papel: ChaveArrasto,
    x: number,
    y: number,
    escala?: number,
    larguraPx?: number,
    alturaPx?: number,
  ): void {
    posicoesResultado[papel] = {
      xPct: x / W,
      yPct: y / H,
      ...(escala !== undefined ? { escala } : {}),
      ...(larguraPx !== undefined ? { larguraPct: larguraPx / W } : {}),
      ...(alturaPx !== undefined ? { alturaPct: alturaPx / H } : {}),
    };
  }

  // Só trata como "template com foto" se o perfil indicar fundo fotográfico
  // E existir uma foto de verdade disponível - nunca inventa uma divisão de
  // composição pra foto que não existe. imagemProporcao >= 0.85 é tratada
  // como "tela cheia": a foto cobre o slide inteiro (não só uma faixa) e o
  // texto fica sobre um degradê escuro, em vez de abaixo de uma linha de
  // corte - dá mais espaço vertical pro texto (evita cortar corpo longo) e
  // um resultado mais parecido com carrossel premium de Instagram de verdade.
  const temFoto = perfil.fundoTipo === "foto" && !!opts.backgroundDataUrl;
  const imagemCheia = temFoto && (perfil.imagemProporcao ?? 0.55) >= 0.85;
  const splitY =
    temFoto && !imagemCheia
      ? Math.max(H * 0.2, Math.min(H * 0.85, H * (perfil.imagemProporcao || 0.55)))
      : 0;

  if (temFoto) {
    const alturaFoto = imagemCheia ? H : splitY;
    try {
      drawCover(ctx, await loadImage(opts.backgroundDataUrl!), 0, 0, W, alturaFoto);
    } catch {
      ctx.fillStyle = corFundoBase;
      ctx.fillRect(0, 0, W, alturaFoto);
    }
    if (imagemCheia) {
      // Degradê escurecendo de cima (só o suficiente pra logo/kicker ficarem
      // legíveis) e, bem mais forte, de baixo (onde fica o bloco de texto e
      // o rodapé) - a foto continua visível no meio, sem virar só decoração.
      const baixo = ctx.createLinearGradient(0, H * 0.32, 0, H);
      baixo.addColorStop(0, "rgba(0,0,0,0)");
      baixo.addColorStop(0.55, "rgba(0,0,0,0.58)");
      baixo.addColorStop(1, "rgba(0,0,0,0.88)");
      ctx.fillStyle = baixo;
      ctx.fillRect(0, 0, W, H);
      const cima = ctx.createLinearGradient(0, 0, 0, H * 0.22);
      cima.addColorStop(0, "rgba(0,0,0,0.45)");
      cima.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cima;
      ctx.fillRect(0, 0, W, H * 0.22);
    } else {
      const dim = ctx.createLinearGradient(0, 0, 0, splitY);
      dim.addColorStop(0, "rgba(0,0,0,0.12)");
      dim.addColorStop(1, "rgba(0,0,0,0.32)");
      ctx.fillStyle = dim;
      ctx.fillRect(0, 0, W, splitY);
      ctx.fillStyle = corFundoBase;
      ctx.fillRect(0, splitY, W, H - splitY);
    }
  } else if (perfil.fundoTipo === "gradiente") {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, shade(perfil.corPrimaria, -15));
    g.addColorStop(1, corFundoBase);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = corFundoBase;
    ctx.fillRect(0, 0, W, H);
  }

  // Com a foto em tela cheia o texto sempre fica sobre o degradê escuro
  // (não sobre corFundoBase, que nem aparece nesse modo) - por isso é
  // sempre claro ali, independente da cor de marca configurada.
  const corTexto = imagemCheia ? "#FFFFFF" : corTextoSobre(corFundoBase);
  const corTextoSecundario = imagemCheia
    ? "rgba(255,255,255,0.85)"
    : corTextoSecundarioSobre(corFundoBase);

  if (opts.logoDataUrl) {
    try {
      const logo = await loadImage(opts.logoDataUrl);
      const ovLogo = opts.posicoes?.logo;
      const escalaLogo = ovLogo?.escala ?? perfil.logoEscala ?? ESCALA_LOGO_PADRAO;
      const logoH = 64 * escalaLogo;
      const logoW = (logo.width / logo.height) * logoH;
      const padrao = logoAnchor(perfil.logoPosicao, W, H, logoW, logoH, pad);
      const x = ovLogo ? ovLogo.xPct * W : padrao.x;
      const y = ovLogo ? ovLogo.yPct * H : padrao.y;

      // Regra de contraste (ver design_system/schema.py::LogoRegras): por
      // padrão nenhuma plaqueta, só a sombra suave de sempre - garante
      // leitura na maioria dos fundos sem parecer um adesivo colado. Só
      // quando a regra pede plaqueta fixa, ou quando "auto" mede o fundo
      // sob a logo e a própria logo e os dois saem parecidos demais (a
      // sombra sozinha não bastaria), é que uma plaqueta translúcida entra.
      const regraContraste = perfil.logoContraste ?? "auto";
      const areaSegura = perfil.logoAreaSeguraPx ?? 24;
      let usaPlaqueta = regraContraste === "chapa-escura" || regraContraste === "chapa-clara";
      let plaquetaEscura = regraContraste === "chapa-escura";

      if (regraContraste === "auto") {
        const lumFundo = luminanciaFundoSobRetangulo(ctx, x, y, logoW, logoH, W, H);
        const lumLogo = await luminanciaDaImagem(logo);
        if (lumFundo !== null && lumLogo !== null && Math.abs(lumFundo - lumLogo) < 0.35) {
          usaPlaqueta = true;
          plaquetaEscura = lumLogo > 0.5;
        }
      }

      ctx.save();
      if (usaPlaqueta) {
        roundRect(
          ctx,
          x - areaSegura,
          y - areaSegura,
          logoW + areaSegura * 2,
          logoH + areaSegura * 2,
          Math.min(logoH / 2 + areaSegura, areaSegura * 2),
        );
        ctx.fillStyle = plaquetaEscura ? "rgba(8,9,13,0.55)" : "rgba(255,255,255,0.55)";
        ctx.fill();
      } else {
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 3;
      }
      ctx.drawImage(logo, x, y, logoW, logoH);
      ctx.restore();

      registrarPosicao("logo", x, y, escalaLogo, logoW, logoH);
    } catch {
      // logo ilegível: segue sem travar a arte (nunca recriamos a logo por IA)
    }
  }

  const zonaTopo = imagemCheia ? H * 0.42 : temFoto ? splitY + 48 : H * 0.1;
  const zonaBase = perfil.temFaixaRodape ? H - 150 : H - pad - 40;
  const zonaAltura = zonaBase - zonaTopo;
  let blocoY: number;
  if (perfil.tituloPosicaoVertical === "superior") blocoY = zonaTopo + 12;
  else if (perfil.tituloPosicaoVertical === "centro") blocoY = zonaTopo + zonaAltura * 0.3;
  else blocoY = zonaBase - zonaAltura * 0.58;

  // Cada um dos 4 textos tem seu próprio alinhamento, escolhido na tela
  // (botões por texto - ver SeletorAlinhamento) - o rótulo e o rodapé
  // caem em "esquerda" sem escolha manual (comportamento de sempre);
  // título e corpo caem no alinhamento da identidade visual (perfil).
  // alinhamentoTexto é o padrão geral antigo: ainda funciona como piso
  // pra qualquer um dos 4 que não tenha o próprio alinhamento definido.
  const anchorXDoAlinhamento = (align: CanvasTextAlign): number =>
    align === "left" ? pad : align === "right" ? W - pad : W / 2;
  const alignRotulo = ALINHAMENTO_CANVAS[opts.alinhamentoRotulo ?? opts.alinhamentoTexto ?? "esquerda"];
  const alignTitulo =
    ALINHAMENTO_CANVAS[opts.alinhamentoTitulo ?? opts.alinhamentoTexto ?? perfil.tituloAlinhamento];
  const alignCorpo =
    ALINHAMENTO_CANVAS[opts.alinhamentoCorpo ?? opts.alinhamentoTexto ?? perfil.tituloAlinhamento];
  const alignRodape = ALINHAMENTO_CANVAS[opts.alinhamentoRodape ?? opts.alinhamentoTexto ?? "esquerda"];
  const anchorXTitulo = anchorXDoAlinhamento(alignTitulo);
  const anchorXCorpo = anchorXDoAlinhamento(alignCorpo);
  const maxTextWidth = W - pad * 2;

  const escalaRotulo = escalaDoTamanho(opts.tamanhoRotulo);
  const escalaTitulo = escalaDoTamanho(opts.tamanhoTitulo);
  const escalaCorpo = escalaDoTamanho(opts.tamanhoCorpo);
  const escalaRodape = escalaDoTamanho(opts.tamanhoRodape);
  const corDestaqueFinal = opts.corDestaque || perfil.corPrimaria;
  const corSobreDestaque = corTextoSobre(corDestaqueFinal);
  const temFundo = (estilo: EstiloDestaqueId) => estilo === "solido" || estilo === "grifado";

  // posicoesResultado (declarado lá em cima, antes da logo) devolve a
  // posição EFETIVA de cada elemento (arrastado ou padrão) pra UI saber
  // onde desenhar a alça de arrastar - cada papel é 100% independente,
  // arrastar um não empurra os outros.

  // Kicker: alinhamento próprio (ver alignRotulo acima) - continua
  // podendo ser arrastado pra qualquer lugar, igual aos outros três.
  const kickerAnchorX = anchorXDoAlinhamento(alignRotulo);
  const kickerX = opts.posicoes?.rotulo ? opts.posicoes.rotulo.xPct * W : kickerAnchorX;
  const kickerY = opts.posicoes?.rotulo ? opts.posicoes.rotulo.yPct * H : blocoY;
  registrarPosicao("rotulo", kickerX, kickerY);
  ctx.textAlign = "left";
  ctx.font = `700 ${Math.round(22 * escalaRotulo)}px ${font}`;
  let cursorY = drawKickerPill(
    ctx,
    opts.kicker,
    kickerX,
    kickerY,
    Math.round(40 * escalaRotulo),
    corDestaqueFinal,
    "#141414",
    opts.kickerEstilo ?? "solido",
    alignRotulo,
  );
  cursorY += Math.round(52 * escalaRotulo);

  ctx.textAlign = alignTitulo;
  const headlineTexto = perfil.tituloCaixaAlta ? opts.headline.toUpperCase() : opts.headline;
  const tamanhoTitulo = Math.round(52 * escalaTitulo);
  const lineHeightTitulo = Math.round(58 * escalaTitulo);
  ctx.font = `${fonteDestaque.peso} ${tamanhoTitulo}px ${fonteDestaque.family}`;
  const headlineLines = wrapLines(ctx, headlineTexto, maxTextWidth).slice(0, 3);
  const estiloTitulo = opts.estiloTitulo ?? "nenhum";
  const tituloX = opts.posicoes?.titulo ? opts.posicoes.titulo.xPct * W : anchorXTitulo;
  let tituloY = opts.posicoes?.titulo ? opts.posicoes.titulo.yPct * H : cursorY;
  registrarPosicao("titulo", tituloX, tituloY);
  const tituloTopo = tituloY;
  const coresTitulo = calcularCoresPalavras(
    tokenizarPalavras(headlineTexto),
    opts.destaquesTitulo,
    opts.coresPalavrasTitulo,
    corDestaqueFinal,
  );
  let indiceTitulo = 0;
  for (const line of headlineLines) {
    if (estiloTitulo !== "nenhum") {
      desenharFundoAtrasTexto(
        ctx,
        line,
        tituloX,
        tituloY,
        tamanhoTitulo,
        alignTitulo,
        corDestaqueFinal,
        estiloTitulo,
      );
    }
    // Quando o estilo já pinta um fundo sólido/marca-texto atrás da
    // linha inteira, a cor por palavra fica invisível/redundante (o
    // fundo já É a cor de destaque) - nesse caso mantém a cor de
    // contraste uniforme de sempre.
    if (temFundo(estiloTitulo)) {
      ctx.fillStyle = corSobreDestaque;
      ctx.fillText(line, tituloX, tituloY);
    } else {
      desenharLinhaColorida(
        ctx,
        line,
        indiceTitulo,
        coresTitulo,
        tituloX,
        tituloY,
        alignTitulo,
        corTexto,
      );
    }
    indiceTitulo += line.split(" ").filter(Boolean).length;
    tituloY += lineHeightTitulo;
  }
  cursorY += headlineLines.length * lineHeightTitulo + Math.round(40 * escalaTitulo);

  // Tenta o corpo no tamanho normal e só diminui a fonte (nunca o
  // espaçamento entre elementos) se não couber - evita tanto cortar texto
  // quanto voltar a amontoar as letras. Only recorre a reticências se nem o
  // menor tamanho testado couber (extremamente raro, dado o limite de
  // ~200 caracteres já aplicado no backend).
  const bodyLines = ajustarCorpoParaCaber(
    ctx,
    opts.corpo,
    maxTextWidth,
    cursorY,
    zonaBase,
    font,
    escalaCorpo,
  );
  const estiloCorpo = opts.estiloCorpo ?? "nenhum";
  const tamanhoCorpoEstimado = Math.round(bodyLines.lineHeight / 1.3);
  const corpoX = opts.posicoes?.corpo ? opts.posicoes.corpo.xPct * W : anchorXCorpo;
  let corpoY = opts.posicoes?.corpo ? opts.posicoes.corpo.yPct * H : cursorY;
  registrarPosicao("corpo", corpoX, corpoY);
  const coresCorpo = calcularCoresPalavras(
    tokenizarPalavras(opts.corpo),
    opts.destaquesCorpo,
    opts.coresPalavrasCorpo,
    corDestaqueFinal,
  );
  ctx.textAlign = alignCorpo;
  let indiceCorpo = 0;
  for (const line of bodyLines.linhas) {
    if (estiloCorpo !== "nenhum") {
      desenharFundoAtrasTexto(
        ctx,
        line,
        corpoX,
        corpoY,
        tamanhoCorpoEstimado,
        alignCorpo,
        corDestaqueFinal,
        estiloCorpo,
      );
    }
    if (temFundo(estiloCorpo)) {
      ctx.fillStyle = corSobreDestaque;
      ctx.fillText(line, corpoX, corpoY);
    } else {
      desenharLinhaColorida(
        ctx,
        line,
        indiceCorpo,
        coresCorpo,
        corpoX,
        corpoY,
        alignCorpo,
        corTextoSecundario,
      );
    }
    indiceCorpo += line.split(" ").filter(Boolean).length;
    corpoY += bodyLines.lineHeight;
  }
  ctx.textAlign = "left";

  // tituloTopo é a linha de base (baseline) da primeira linha do título -
  // as letras sobem bem acima dela (maiúsculas/ascendentes de uma fonte de
  // 52px sobem quase o tamanho inteiro da fonte). Qualquer moldura/faixa
  // que use tituloTopo direto corta o próprio texto por cima; este é o
  // topo visual de verdade, usado pelos dois blocos abaixo.
  const tituloTopoVisivel = tituloTopo - Math.round(tamanhoTitulo * 0.82);

  // Faixa semântica de risco/oportunidade: uma "espinha" colorida fixa na
  // margem esquerda da página (não do texto - por isso ignora o
  // alinhamento de título/corpo), como uma tarja de editorial de revista.
  // É a única leitura visual
  // reservada exclusivamente pra esses dois componentes (ver
  // ai/direcao_arte.py) - nenhum outro estilo usa essas cores.
  if (opts.componente === "bloco_risco" || opts.componente === "bloco_oportunidade") {
    const corSemantica =
      opts.componente === "bloco_risco" ? COR_SEMANTICA_RISCO : COR_SEMANTICA_OPORTUNIDADE;
    roundRect(
      ctx,
      pad - 20,
      tituloTopoVisivel - 6,
      5,
      Math.max(40, corpoY - tituloTopoVisivel + 10),
      2.5,
    );
    ctx.fillStyle = corSemantica;
    ctx.fill();
  }

  // Moldura do fechamento: o texto de CTA flutuando sozinho sobre um fundo
  // neutro é o que fazia o slide parecer print de sistema em vez de peça
  // pronta - um contorno fechado ao redor do próprio bloco de texto lê como
  // uma chamada de verdade (ver ai/carrossel.py::_slide_fechamento).
  if (
    opts.iconesAcao &&
    (opts.componente === "chamada_salvar" ||
      opts.componente === "chamada_compartilhar" ||
      opts.componente === "cta")
  ) {
    const cardPad = 24;
    roundRect(
      ctx,
      pad - cardPad,
      tituloTopoVisivel - cardPad,
      W - pad * 2 + cardPad * 2,
      corpoY - tituloTopoVisivel + cardPad * 1.8,
      18,
    );
    ctx.lineWidth = 2;
    ctx.strokeStyle = corDestaqueFinal;
    ctx.stroke();
  }

  if (opts.elementoVisual) {
    const larguraGrafico = Math.min(maxTextWidth, 420);
    const graficoXPadrao = alignCorpo === "right" ? W - pad - larguraGrafico : pad;
    // Vão maior que o de outros textos (40px não bastava): a etiqueta de
    // arrasto do gráfico flutua ACIMA do próprio ponto de ancoragem (igual
    // às outras), então precisa de espaço vertical real até a última linha
    // do corpo pra não ficar em cima do texto - a própria razão de ser
    // dessa correção. Se o corpo for tão longo que não sobra espaço antes
    // do rodapé, é melhor OMITIR o elemento do que desenhá-lo por cima do
    // próprio corpo (nunca usa um teto que jogue a posição pra trás do
    // ponto natural) - a posição arrastada manualmente ignora essa checagem.
    const alturaGrafico = alturaElementoVisual(opts.elementoVisual);
    const graficoYAuto = corpoY + 96;
    const temPosicaoManual = !!opts.posicoes?.grafico;
    if (temPosicaoManual || graficoYAuto + alturaGrafico <= zonaBase - 48) {
      const graficoX = opts.posicoes?.grafico ? opts.posicoes.grafico.xPct * W : graficoXPadrao;
      const graficoY = opts.posicoes?.grafico ? opts.posicoes.grafico.yPct * H : graficoYAuto;
      // Tamanho ajustável (alça de redimensionar, igual à logo) - em vez
      // de recalcular cada medida/fonte internamente, escala o contexto
      // inteiro ao redor do ponto de ancoragem: escala tudo que
      // desenharElementoVisual desenha (texto, barras, traços, sombra)
      // proporcionalmente, sem duplicar a lógica de desenho.
      const escalaGrafico = opts.posicoes?.grafico?.escala ?? ESCALA_GRAFICO_PADRAO;
      ctx.save();
      ctx.translate(graficoX, graficoY);
      ctx.scale(escalaGrafico, escalaGrafico);
      const alturaUsada = desenharElementoVisual(
        ctx,
        opts.elementoVisual,
        0,
        0,
        larguraGrafico,
        corDestaqueFinal,
        corTexto,
        corTextoSecundario,
        font,
        fonteDestaque.family,
        fonteDestaque.peso,
      );
      ctx.restore();
      registrarPosicao(
        "grafico",
        graficoX,
        graficoY,
        escalaGrafico,
        larguraGrafico * escalaGrafico,
        alturaUsada * escalaGrafico,
      );
    }
  }

  if (opts.iconesAcao) {
    const tamanhoIcone = 34;
    const gap = 30;
    const totalW = tamanhoIcone * 3 + gap * 2;
    const iconY = Math.min(corpoY + 56, zonaBase - 30);
    const iconStartX = W / 2 - totalW / 2 + tamanhoIcone / 2;
    desenharIconeEnviar(ctx, iconStartX, iconY, tamanhoIcone, corTexto);
    desenharIconeCompartilhar(ctx, iconStartX + tamanhoIcone + gap, iconY, tamanhoIcone, corTexto);
    desenharIconeSalvar(ctx, iconStartX + (tamanhoIcone + gap) * 2, iconY, tamanhoIcone, corTexto);
  }

  const rodapeAnchorX = anchorXDoAlinhamento(alignRodape);
  const rodapeYPadrao = perfil.temFaixaRodape ? H - 84 : H - pad - 8 + 34;
  const rodapeX = opts.posicoes?.rodape ? opts.posicoes.rodape.xPct * W : rodapeAnchorX;
  const rodapeY = opts.posicoes?.rodape ? opts.posicoes.rodape.yPct * H : rodapeYPadrao;
  registrarPosicao("rodape", rodapeX, rodapeY);
  ctx.textAlign = alignRodape;

  if (perfil.temFaixaRodape) {
    const corFaixa = perfil.corSecundaria || perfil.corPrimaria;
    ctx.fillStyle = corFaixa;
    ctx.fillRect(0, H - 150, W, 150);
    ctx.font = `700 ${Math.round(26 * escalaRodape)}px ${font}`;
    ctx.fillStyle = corTextoSobre(corFaixa);
    ctx.fillText(opts.nomeEscritorio || "Seu Escritório", rodapeX, rodapeY);
    if (opts.registro) {
      ctx.font = `400 ${Math.round(20 * escalaRodape)}px ${font}`;
      ctx.fillStyle = corTextoSecundarioSobre(corFaixa);
      ctx.fillText(opts.registro, rodapeX, rodapeY + Math.round(32 * escalaRodape));
    }
  } else {
    const lineY = H - pad - 8;
    ctx.strokeStyle = corTexto === "#FFFFFF" ? "rgba(255,255,255,0.25)" : "rgba(20,20,20,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, lineY);
    ctx.lineTo(W - pad, lineY);
    ctx.stroke();
    ctx.font = `600 ${Math.round(24 * escalaRodape)}px ${font}`;
    ctx.fillStyle = corTexto;
    ctx.fillText(opts.nomeEscritorio || "Seu Escritório", rodapeX, rodapeY);
  }
  ctx.textAlign = "left";

  if (opts.progresso && opts.progresso.total > 1) {
    const { atual, total } = opts.progresso;
    const dotR = 5;
    const gap = 16;
    const totalW = (total - 1) * gap;
    let dx = W - pad - totalW - dotR;
    for (let i = 0; i < total; i++) {
      ctx.beginPath();
      ctx.arc(dx, pad + dotR, dotR, 0, Math.PI * 2);
      ctx.fillStyle = i === atual - 1 ? corTexto : `${corTexto}55`;
      ctx.fill();
      dx += gap;
    }
  }

  return posicoesResultado;
}
