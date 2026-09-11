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

export type FontScale = "pequena" | "media" | "grande";
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

const FONT_SCALES: Record<FontScale, number> = {
  pequena: 0.82,
  media: 1,
  grande: 1.2,
};

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

export interface RenderOptions {
  width: number;
  height: number;
  backgroundDataUrl: string | null;
  accentColor: string;
  logoDataUrl: string | null;
  nomeEscritorio: string;
  registro: string;
  kicker: string;
  headline: string;
  corpo: string;
  template?: TemplateId;
  fontScale?: FontScale;
  fontFamily?: FontFamilyId;
}

const PAD = 64;

export async function renderInstagramPost(
  canvas: HTMLCanvasElement,
  opts: RenderOptions,
): Promise<void> {
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const ctx2: Ctx2 = {
    ctx,
    W: opts.width,
    H: opts.height,
    font: FONT_FAMILIES[opts.fontFamily ?? "sans"],
    scale: FONT_SCALES[opts.fontScale ?? "media"],
    opts,
  };

  const template = opts.template ?? "editorial-escuro";
  switch (template) {
    case "minimal-claro":
      await drawMinimalClaro(ctx2);
      break;
    case "cartao-centralizado":
      await drawCartaoCentralizado(ctx2);
      break;
    case "diagonal":
      await drawDiagonal(ctx2);
      break;
    case "faixa-superior":
      await drawFaixaSuperior(ctx2);
      break;
    default:
      await drawEditorialEscuro(ctx2);
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

interface Ctx2 {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  font: string;
  scale: number;
  opts: RenderOptions;
}

// --- Template 1: editorial escuro (o original) --------------------------

async function drawEditorialEscuro(c: Ctx2) {
  const { ctx, W, H, font, scale, opts } = c;
  const FOOTER_H = 96;
  const KICKER_H = 48 * scale;
  const HEADLINE_LH = 64 * scale;
  const BODY_LH = 40 * scale;

  if (opts.backgroundDataUrl) {
    try {
      drawCover(ctx, await loadImage(opts.backgroundDataUrl), 0, 0, W, H);
    } catch {
      drawGradientBackground(ctx, W, H, opts.accentColor);
    }
  } else {
    drawGradientBackground(ctx, W, H, opts.accentColor);
  }

  const overlay = ctx.createLinearGradient(0, H * 0.32, 0, H);
  overlay.addColorStop(0, "rgba(8,8,10,0)");
  overlay.addColorStop(0.55, "rgba(8,8,10,0.74)");
  overlay.addColorStop(1, "rgba(8,8,10,0.95)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);

  const topOverlay = ctx.createLinearGradient(0, 0, 0, H * 0.24);
  topOverlay.addColorStop(0, "rgba(0,0,0,0.5)");
  topOverlay.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topOverlay;
  ctx.fillRect(0, 0, W, H * 0.24);

  await drawLogo(c, PAD, PAD, 60 * scale);

  const maxTextWidth = W - PAD * 2;
  ctx.font = `800 ${56 * scale}px ${font}`;
  const headlineLines = wrapLines(ctx, opts.headline, maxTextWidth).slice(0, 3);
  ctx.font = `400 ${32 * scale}px ${font}`;
  let bodyLines = wrapLines(ctx, opts.corpo, maxTextWidth);

  const minStartY = H * 0.4;
  const blockHeightOf = (hl: number, bl: number) =>
    KICKER_H + 40 * scale + hl * HEADLINE_LH + 16 * scale + bl * BODY_LH;
  let blockHeight = blockHeightOf(headlineLines.length, bodyLines.length);
  let startY = H - PAD - FOOTER_H - blockHeight;
  while (startY < minStartY && bodyLines.length > 1) {
    bodyLines = bodyLines.slice(0, -1);
    blockHeight = blockHeightOf(headlineLines.length, bodyLines.length);
    startY = H - PAD - FOOTER_H - blockHeight;
  }
  if (bodyLines.length < wrapLines(ctx, opts.corpo, maxTextWidth).length) {
    const last = bodyLines[bodyLines.length - 1];
    bodyLines = [...bodyLines.slice(0, -1), ensureEllipsis(ctx, last, maxTextWidth)];
  }

  let cursorY = Math.max(startY, H * 0.3);

  ctx.font = `700 ${24 * scale}px ${font}`;
  cursorY = drawKickerPill(ctx, opts.kicker, PAD, cursorY, KICKER_H, opts.accentColor, "#141414");
  cursorY += 40 * scale;

  ctx.font = `800 ${56 * scale}px ${font}`;
  ctx.fillStyle = "#FFFFFF";
  for (const line of headlineLines) {
    ctx.fillText(line, PAD, cursorY);
    cursorY += HEADLINE_LH;
  }
  cursorY += 16 * scale;

  ctx.font = `400 ${32 * scale}px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  for (const line of bodyLines) {
    ctx.fillText(line, PAD, cursorY);
    cursorY += BODY_LH;
  }

  drawFooter(
    c,
    H - PAD - FOOTER_H + 24,
    "#FFFFFF",
    "rgba(255,255,255,0.65)",
    "rgba(255,255,255,0.25)",
  );
}

// --- Template 2: minimalista claro --------------------------------------

async function drawMinimalClaro(c: Ctx2) {
  const { ctx, W, H, font, scale, opts } = c;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#FAFAF8");
  bg.addColorStop(1, shade(opts.accentColor, 85));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (opts.backgroundDataUrl) {
    try {
      const img = await loadImage(opts.backgroundDataUrl);
      const boxH = H * 0.42;
      drawCover(ctx, img, 0, 0, W, boxH);
      const fade = ctx.createLinearGradient(0, boxH * 0.55, 0, boxH);
      fade.addColorStop(0, "rgba(250,250,248,0)");
      fade.addColorStop(1, "#FAFAF8");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, W, boxH);
    } catch {
      // sem foto legível, segue só com o degradê
    }
  }

  await drawLogo(c, PAD, PAD, 56 * scale);

  const maxTextWidth = W - PAD * 2;
  let cursorY = H * 0.5;

  ctx.font = `700 ${22 * scale}px ${font}`;
  cursorY = drawKickerPill(ctx, opts.kicker, PAD, cursorY, 44 * scale, opts.accentColor, "#141414");
  cursorY += 36 * scale;

  ctx.font = `800 ${58 * scale}px ${font}`;
  ctx.fillStyle = "#17181C";
  const headlineLines = wrapLines(ctx, opts.headline, maxTextWidth).slice(0, 3);
  for (const line of headlineLines) {
    ctx.fillText(line, PAD, cursorY);
    cursorY += 66 * scale;
  }
  cursorY += 20 * scale;

  const footerLineY = H - PAD - 96 + 24;
  ctx.font = `400 ${32 * scale}px ${font}`;
  ctx.fillStyle = "rgba(23,24,28,0.72)";
  const bodyLH = 40 * scale;
  const bodyLines = fitBody(ctx, opts.corpo, maxTextWidth, bodyLH, cursorY, footerLineY - 16);
  for (const line of bodyLines) {
    ctx.fillText(line, PAD, cursorY);
    cursorY += bodyLH;
  }

  drawFooter(c, footerLineY, "#17181C", "rgba(23,24,28,0.55)", "rgba(23,24,28,0.18)");
}

// --- Template 3: cartão centralizado ------------------------------------

async function drawCartaoCentralizado(c: Ctx2) {
  const { ctx, W, H, font, scale, opts } = c;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, shade(opts.accentColor, -10));
  bg.addColorStop(1, shade(opts.accentColor, -45));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const midX = W / 2;
  const maxTextWidth = W - PAD * 2.4;

  ctx.textAlign = "center";
  ctx.font = `700 ${22 * scale}px ${font}`;
  const kickerText = opts.kicker.toUpperCase();
  const kW = ctx.measureText(kickerText).width + 36 * scale;
  const kH = 44 * scale;
  roundRect(ctx, midX - kW / 2, H * 0.3, kW, kH, kH / 2);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "middle";
  ctx.fillText(kickerText, midX, H * 0.3 + kH / 2 + 1);
  ctx.textBaseline = "alphabetic";

  let cursorY = H * 0.3 + kH + 64 * scale;
  ctx.font = `800 ${58 * scale}px ${font}`;
  ctx.fillStyle = "#FFFFFF";
  const headlineLines = wrapLines(ctx, opts.headline, maxTextWidth).slice(0, 3);
  for (const line of headlineLines) {
    ctx.fillText(line, midX, cursorY);
    cursorY += 66 * scale;
  }
  cursorY += 20 * scale;

  ctx.font = `400 ${30 * scale}px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const bodyLH = 40 * scale;
  const bodyLines = fitBody(ctx, opts.corpo, maxTextWidth, bodyLH, cursorY, H - PAD - 64);
  for (const line of bodyLines) {
    ctx.fillText(line, midX, cursorY);
    cursorY += bodyLH;
  }
  ctx.textAlign = "left";

  if (opts.logoDataUrl) {
    try {
      const logo = await loadImage(opts.logoDataUrl);
      const logoH = 56 * scale;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.drawImage(logo, midX - logoW / 2, PAD, logoW, logoH);
    } catch {
      // segue sem logo
    }
  }

  ctx.textAlign = "center";
  ctx.font = `600 ${26 * scale}px ${font}`;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(opts.nomeEscritorio || "Seu Escritório", midX, H - PAD - 24);
  if (opts.registro) {
    ctx.font = `400 ${20 * scale}px ${font}`;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText(opts.registro, midX, H - PAD + 8);
  }
  ctx.textAlign = "left";
}

// --- Template 4: diagonal ------------------------------------------------

async function drawDiagonal(c: Ctx2) {
  const { ctx, W, H, font, scale, opts } = c;
  const splitX = W * 0.42;
  const slant = 140;

  if (opts.backgroundDataUrl) {
    try {
      drawCover(ctx, await loadImage(opts.backgroundDataUrl), 0, 0, W, H);
    } catch {
      drawGradientBackground(ctx, W, H, opts.accentColor);
    }
  } else {
    drawGradientBackground(ctx, W, H, opts.accentColor);
  }
  const dim = ctx.createLinearGradient(0, 0, W, 0);
  dim.addColorStop(0, "rgba(0,0,0,0.25)");
  dim.addColorStop(1, "rgba(0,0,0,0.05)");
  ctx.fillStyle = dim;
  ctx.fillRect(0, 0, splitX + slant, H);

  ctx.beginPath();
  ctx.moveTo(splitX, 0);
  ctx.lineTo(splitX + slant, 0);
  ctx.lineTo(splitX + slant - slant, H);
  ctx.lineTo(splitX - slant, H);
  ctx.closePath();
  ctx.fillStyle = shade(opts.accentColor, -20);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(splitX + slant, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H);
  ctx.lineTo(splitX - slant, H);
  ctx.closePath();
  ctx.fillStyle = shade(opts.accentColor, -20);
  ctx.fill();

  await drawLogo(c, PAD, PAD, 52 * scale);

  const panelX = splitX + slant / 2 + 48;
  const maxTextWidth = W - panelX - PAD * 0.6;
  let cursorY = H * 0.32;

  ctx.font = `700 ${20 * scale}px ${font}`;
  cursorY = drawKickerPill(ctx, opts.kicker, panelX, cursorY, 40 * scale, "#FFFFFF", "#141414");
  cursorY += 36 * scale;

  ctx.font = `800 ${44 * scale}px ${font}`;
  ctx.fillStyle = "#FFFFFF";
  const headlineLines = wrapLines(ctx, opts.headline, maxTextWidth).slice(0, 4);
  for (const line of headlineLines) {
    ctx.fillText(line, panelX, cursorY);
    cursorY += 52 * scale;
  }
  cursorY += 16 * scale;

  const footerY = H - PAD - 96 + 24;
  ctx.font = `400 ${26 * scale}px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const bodyLH = 34 * scale;
  const bodyLines = fitBody(ctx, opts.corpo, maxTextWidth, bodyLH, cursorY, footerY - 16);
  for (const line of bodyLines) {
    ctx.fillText(line, panelX, cursorY);
    cursorY += bodyLH;
  }
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(panelX, footerY);
  ctx.lineTo(W - PAD, footerY);
  ctx.stroke();
  ctx.font = `600 ${24 * scale}px ${font}`;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(opts.nomeEscritorio || "Seu Escritório", panelX, footerY + 38);
}

// --- Template 5: faixa superior ------------------------------------------

async function drawFaixaSuperior(c: Ctx2) {
  const { ctx, W, H, font, scale, opts } = c;
  const splitY = H * 0.44;

  if (opts.backgroundDataUrl) {
    try {
      drawCover(ctx, await loadImage(opts.backgroundDataUrl), 0, 0, W, splitY);
    } catch {
      drawGradientBackground(ctx, W, splitY, opts.accentColor);
    }
  } else {
    drawGradientBackground(ctx, W, splitY, opts.accentColor);
  }
  const topDim = ctx.createLinearGradient(0, 0, 0, splitY);
  topDim.addColorStop(0, "rgba(0,0,0,0.35)");
  topDim.addColorStop(1, "rgba(0,0,0,0.05)");
  ctx.fillStyle = topDim;
  ctx.fillRect(0, 0, W, splitY);

  ctx.fillStyle = "#141518";
  ctx.fillRect(0, splitY, W, H - splitY);

  await drawLogo(c, PAD, PAD, 52 * scale);

  const maxTextWidth = W - PAD * 2;
  let cursorY = splitY - 40 * scale;
  ctx.font = `700 ${22 * scale}px ${font}`;
  drawKickerPill(ctx, opts.kicker, PAD, cursorY, 44 * scale, opts.accentColor, "#141414");

  cursorY = splitY + 64 * scale;
  ctx.font = `800 ${48 * scale}px ${font}`;
  ctx.fillStyle = "#FFFFFF";
  const headlineLines = wrapLines(ctx, opts.headline, maxTextWidth).slice(0, 2);
  for (const line of headlineLines) {
    ctx.fillText(line, PAD, cursorY);
    cursorY += 56 * scale;
  }
  cursorY += 16 * scale;

  const footerLineY = H - PAD - 96 + 24;
  ctx.font = `400 ${28 * scale}px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const bodyLH = 36 * scale;
  const bodyLines = fitBody(ctx, opts.corpo, maxTextWidth, bodyLH, cursorY, footerLineY - 16);
  for (const line of bodyLines) {
    ctx.fillText(line, PAD, cursorY);
    cursorY += bodyLH;
  }

  drawFooter(c, footerLineY, "#FFFFFF", "rgba(255,255,255,0.6)", "rgba(255,255,255,0.2)");
}

// --- helpers compartilhados ----------------------------------------------

async function drawLogo(c: Ctx2, x: number, y: number, logoH: number) {
  if (!c.opts.logoDataUrl) return;
  try {
    const logo = await loadImage(c.opts.logoDataUrl);
    const logoW = (logo.width / logo.height) * logoH;
    c.ctx.drawImage(logo, x, y, logoW, logoH);
  } catch {
    // logo corrompida/ilegível: segue sem travar o resto da arte
  }
}

// Estilos de destaque (rótulo, título e corpo) inspirados nos stickers de
// texto nativos do Instagram - "sólido" é o único que a ATLAS sempre teve
// no rótulo; os outros dão a mesma variedade que o próprio Instagram
// oferece na hora de escrever texto num Story/Reels, e agora qualquer um
// dos três textos do post pode usar qualquer estilo (o usuário escolhe
// onde aplicar, não é fixo no rótulo).
export type KickerEstiloId = "solido" | "contorno" | "grifado" | "sublinhado";
export type EstiloDestaqueId = KickerEstiloId | "nenhum";

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
): number {
  const padX = 18;
  const upper = text.toUpperCase();
  const w = ctx.measureText(upper).width + padX * 2;
  ctx.textBaseline = "middle";

  if (estilo === "contorno") {
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = bg;
    ctx.stroke();
    ctx.fillStyle = bg;
    ctx.fillText(upper, x + padX, y + h / 2 + 1);
  } else if (estilo === "grifado") {
    // "Marcador de texto": bloco reto (cantos quase retos, não pílula) bem
    // preenchido atrás do texto - o "grifado/preenchido" pedido.
    roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(upper, x + padX, y + h / 2 + 1);
  } else if (estilo === "sublinhado") {
    ctx.fillStyle = bg;
    ctx.fillText(upper, x, y + h / 2 + 1);
    const textW = ctx.measureText(upper).width;
    ctx.strokeStyle = bg;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + h - 2);
    ctx.lineTo(x + textW, y + h - 2);
    ctx.stroke();
  } else {
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(upper, x + padX, y + h / 2 + 1);
  }

  ctx.textBaseline = "alphabetic";
  return y + h;
}

function drawFooter(
  c: Ctx2,
  lineY: number,
  nameColor: string,
  regColor: string,
  lineColor: string,
) {
  const { ctx, W, opts, font, scale } = c;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, lineY);
  ctx.lineTo(W - PAD, lineY);
  ctx.stroke();

  ctx.font = `600 ${26 * scale}px ${font}`;
  ctx.fillStyle = nameColor;
  ctx.fillText(opts.nomeEscritorio || "Seu Escritório", PAD, lineY + 40);

  if (opts.registro) {
    ctx.font = `400 ${22 * scale}px ${font}`;
    ctx.fillStyle = regColor;
    const regW = ctx.measureText(opts.registro).width;
    ctx.fillText(opts.registro, W - PAD - regW, lineY + 40);
  }
}

function drawGradientBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  accent: string,
) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, shade(accent, -55));
  g.addColorStop(0.55, shade(accent, -75));
  g.addColorStop(1, "#0c0c0e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
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

// ===========================================================================
// Estúdio Visual: renderização dirigida por um perfil visual extraído das
// referências do cliente (ver ai/perfil_visual.py no backend), em vez de um
// dos 5 templates fixos acima. Bloco totalmente separado do resto do
// arquivo - não altera nem depende de renderInstagramPost/TemplateId, só
// reaproveita os helpers de desenho já existentes (wrapLines, drawCover,
// fitBody, shade, drawKickerPill etc.) pra não duplicar lógica.
// ===========================================================================

export interface PerfilVisual {
  logoPosicao:
    | "superior-esquerda"
    | "superior-direita"
    | "superior-centro"
    | "inferior-esquerda"
    | "inferior-direita"
    | "inferior-centro";
  tituloAlinhamento: "esquerda" | "centro" | "direita";
  tituloPosicaoVertical: "superior" | "centro" | "inferior";
  tituloCaixaAlta: boolean;
  corPrimaria: string;
  corSecundaria: string | null;
  corFundo: string | null;
  fundoTipo: "foto" | "cor_solida" | "gradiente";
  imagemProporcao: number;
  temFaixaRodape: boolean;
  estiloGeral: string;
  observacoes: string;
}

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
  // Tamanho do texto (rótulo/título/corpo, proporcional) - opcional, cai
  // em "media" (escala 1x, o tamanho de sempre) se não for informado.
  escalaFonte?: FontScale;
  // Cor usada nos destaques (fundo do rótulo e de título/corpo quando têm
  // estilo "sólido"/"grifado"/"contorno"/"sublinhado") - opcional, cai na
  // cor primária do perfil visual extraído das referências se não for
  // informada (comportamento de sempre).
  corDestaque?: string;
}

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
): Promise<void> {
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = opts.width;
  const H = opts.height;
  const pad = 64;
  const font = FONT_FAMILIES.sans;
  const fonteDestaqueId = opts.fonteDestaque ?? "inter";
  const fonteDestaque = FONTE_DESTAQUE_SPEC[fonteDestaqueId];
  await garantirFonteCarregada(fonteDestaqueId);
  const { perfil } = opts;
  const corFundoBase = perfil.corFundo || shade(perfil.corPrimaria, -70);

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
      const logoH = 64;
      const logoW = (logo.width / logo.height) * logoH;
      const { x, y } = logoAnchor(perfil.logoPosicao, W, H, logoW, logoH, pad);
      ctx.drawImage(logo, x, y, logoW, logoH);
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

  const alinhamentoCanvas: Record<PerfilVisual["tituloAlinhamento"], CanvasTextAlign> = {
    esquerda: "left",
    centro: "center",
    direita: "right",
  };
  const align = alinhamentoCanvas[perfil.tituloAlinhamento];
  const anchorX = align === "left" ? pad : align === "right" ? W - pad : W / 2;
  const maxTextWidth = W - pad * 2;

  const escala = FONT_SCALES[opts.escalaFonte ?? "media"];
  const corDestaqueFinal = opts.corDestaque || perfil.corPrimaria;
  const corSobreDestaque = corTextoSobre(corDestaqueFinal);
  const temFundo = (estilo: EstiloDestaqueId) => estilo === "solido" || estilo === "grifado";

  // Kicker fica sempre à esquerda (elemento secundário) - a identidade que
  // importa preservar é a do título/logo/rodapé, não a de um selinho de data.
  ctx.textAlign = "left";
  ctx.font = `700 ${Math.round(22 * escala)}px ${font}`;
  let cursorY = drawKickerPill(
    ctx,
    opts.kicker,
    pad,
    blocoY,
    Math.round(40 * escala),
    corDestaqueFinal,
    "#141414",
    opts.kickerEstilo ?? "solido",
  );
  cursorY += Math.round(52 * escala);

  ctx.textAlign = align;
  const headlineTexto = perfil.tituloCaixaAlta ? opts.headline.toUpperCase() : opts.headline;
  const tamanhoTitulo = Math.round(52 * escala);
  const lineHeightTitulo = Math.round(58 * escala);
  ctx.font = `${fonteDestaque.peso} ${tamanhoTitulo}px ${fonteDestaque.family}`;
  const headlineLines = wrapLines(ctx, headlineTexto, maxTextWidth).slice(0, 3);
  const estiloTitulo = opts.estiloTitulo ?? "nenhum";
  for (const line of headlineLines) {
    if (estiloTitulo !== "nenhum") {
      desenharFundoAtrasTexto(
        ctx,
        line,
        anchorX,
        cursorY,
        tamanhoTitulo,
        align,
        corDestaqueFinal,
        estiloTitulo,
      );
    }
    ctx.fillStyle = temFundo(estiloTitulo) ? corSobreDestaque : corTexto;
    ctx.fillText(line, anchorX, cursorY);
    cursorY += lineHeightTitulo;
  }
  cursorY += Math.round(40 * escala);

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
    escala,
  );
  const estiloCorpo = opts.estiloCorpo ?? "nenhum";
  const tamanhoCorpoEstimado = Math.round(bodyLines.lineHeight / 1.3);
  for (const line of bodyLines.linhas) {
    if (estiloCorpo !== "nenhum") {
      desenharFundoAtrasTexto(
        ctx,
        line,
        anchorX,
        cursorY,
        tamanhoCorpoEstimado,
        align,
        corDestaqueFinal,
        estiloCorpo,
      );
    }
    ctx.fillStyle = temFundo(estiloCorpo) ? corSobreDestaque : corTextoSecundario;
    ctx.fillText(line, anchorX, cursorY);
    cursorY += bodyLines.lineHeight;
  }
  ctx.textAlign = "left";

  if (perfil.temFaixaRodape) {
    const corFaixa = perfil.corSecundaria || perfil.corPrimaria;
    ctx.fillStyle = corFaixa;
    ctx.fillRect(0, H - 150, W, 150);
    ctx.font = `700 26px ${font}`;
    ctx.fillStyle = corTextoSobre(corFaixa);
    ctx.fillText(opts.nomeEscritorio || "Seu Escritório", pad, H - 84);
    if (opts.registro) {
      ctx.font = `400 20px ${font}`;
      ctx.fillStyle = corTextoSecundarioSobre(corFaixa);
      ctx.fillText(opts.registro, pad, H - 52);
    }
  } else {
    const lineY = H - pad - 8;
    ctx.strokeStyle = corTexto === "#FFFFFF" ? "rgba(255,255,255,0.25)" : "rgba(20,20,20,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, lineY);
    ctx.lineTo(W - pad, lineY);
    ctx.stroke();
    ctx.font = `600 24px ${font}`;
    ctx.fillStyle = corTexto;
    ctx.fillText(opts.nomeEscritorio || "Seu Escritório", pad, lineY + 34);
  }

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
}
