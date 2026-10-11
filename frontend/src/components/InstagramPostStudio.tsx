import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Download,
  ImagePlus,
  Loader2,
  Paperclip,
  Pencil,
  Send,
  Upload,
  User,
  X,
} from "lucide-react";
import { gerarPostInstagram, type ElementoVisualSlideResposta } from "@/lib/atlas-api";
import {
  DEFAULT_BRAND_CONFIG,
  fileToDataUrl,
  formatarKicker,
  getBrandConfig,
  isBrandConfigured,
  saveBrandConfig,
  type BrandConfig,
} from "@/lib/brand-config";
import {
  renderPostComModelo,
  PERFIS_NOTICIAS,
  templatePadraoPara,
  TEMPLATES,
  TAMANHOS_FONTE,
  TAMANHO_FONTE_PADRAO,
  type TemplateId,
  type PapelTexto,
  type ChaveArrasto,
  type PosicoesTexto,
  type AlinhamentoTexto,
  removerFundoLogo,
} from "@/lib/instagram-canvas";
import { PosicionadorTexto } from "@/components/PosicionadorTexto";
import { SeletorAlinhamento } from "@/components/SeletorAlinhamento";
import { PalavrasColoridas } from "@/components/PalavrasColoridas";

// A IA (ai/social_post.py) ainda sugere tamanho em "pequena"/"media"/
// "grande" quando o advogado pede "letra maior" no chat - convertido pro
// tamanho numérico equivalente aqui, sem precisar mudar o backend.
const TAMANHO_LEGADO: Record<string, number> = { pequena: 6, media: 10, grande: 14 };

const CANVAS_W = 1080;
const CANVAS_H = 1350;

// Só mostra alça de arrastar pra texto que a arte realmente tem - rótulo e
// título sempre têm algo (kicker formatado, ou o próprio título do item),
// corpo também sempre cai num fallback (resumoExecutivo do item), rodapé
// sempre desenha nome do escritório (ou "Seu Escritório"). A logo só
// entra quando o escritório tem uma configurada.
function papeisAtivosDoPost(
  corpo: string,
  temLogo: boolean,
  temElementoVisual: boolean,
): ChaveArrasto[] {
  const papeis: ChaveArrasto[] = ["rotulo", "titulo", "rodape"];
  if (corpo.trim()) papeis.push("corpo");
  if (temElementoVisual) papeis.push("grafico");
  if (temLogo) papeis.push("logo");
  return papeis;
}

interface PostText {
  headline: string;
  corpo: string;
  legenda: string;
  elementoVisual?: ElementoVisualSlideResposta | null;
  destaquesTitulo?: string[];
  destaquesCorpo?: string[];
  coresPalavrasTitulo?: Record<number, string>;
  coresPalavrasCorpo?: Record<number, string>;
}

export interface PostableItem {
  id: string;
  kind: "opportunities" | "news";
  titulo: string;
  tribunal: string;
  data: string;
  resumoExecutivo: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imagemPreview?: string;
  erro?: boolean;
}

export function InstagramPostStudio({ item }: { item: PostableItem }) {
  const [brand, setBrand] = useState<BrandConfig>(() => getBrandConfig());
  const [editingBrand, setEditingBrand] = useState(() => !isBrandConfigured(getBrandConfig()));
  const [bgDataUrl, setBgDataUrl] = useState<string | null>(null);
  const [text, setText] = useState<PostText | null>(null);
  const [historico, setHistorico] = useState<Array<{ role: string; content: string }>>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<{
    base64: string;
    tipo: string;
    preview: string;
  } | null>(null);
  const [copiedLegenda, setCopiedLegenda] = useState(false);
  // Estilo visual da arte - varia por caso por padrão (não é sempre o mesmo
  // template pra todo mundo), e pode ser trocado na mão ou pelo chat
  // ("fundo azul", "letra maior", "mais moderno" etc - ver ai/social_post.py).
  // Cada template é um perfil do Sistema de Design (ver
  // instagram-canvas.ts::PERFIS_NOTICIAS) desenhado pelo mesmo motor do
  // carrossel/Estúdio Visual (renderPostComModelo) - fase 5 do plano de
  // arquitetura, motor legado aposentado.
  const [template, setTemplate] = useState<TemplateId>(() => templatePadraoPara(item.id));
  const [accentColor, setAccentColor] = useState<string>(
    () => getBrandConfig().corDestaque || DEFAULT_BRAND_CONFIG.corDestaque,
  );
  const [fontScale, setFontScale] = useState<number>(TAMANHO_FONTE_PADRAO);
  // Um por texto (não mais um único botão pro post inteiro) - null =
  // segue o padrão do template escolhido pra esse texto.
  const [alinhamentoRotulo, setAlinhamentoRotulo] = useState<AlinhamentoTexto | null>(null);
  const [alinhamentoTitulo, setAlinhamentoTitulo] = useState<AlinhamentoTexto | null>(null);
  const [alinhamentoCorpo, setAlinhamentoCorpo] = useState<AlinhamentoTexto | null>(null);
  const [alinhamentoRodape, setAlinhamentoRodape] = useState<AlinhamentoTexto | null>(null);
  // Posição livre - vazio = ninguém foi arrastado ainda, cada texto fica no
  // lugar calculado pelo template escolhido (comportamento de sempre).
  const [posicoesEscolhidas, setPosicoesEscolhidas] = useState<PosicoesTexto>({});
  // Posição EFETIVA (arrastada ou padrão) devolvida pelo desenho do canvas -
  // usada só pra saber onde colocar a alça de arrastar.
  const [posicoesAtuais, setPosicoesAtuais] = useState<PosicoesTexto>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const pronto = isBrandConfigured(brand);

  function updateBrand(patch: Partial<BrandConfig>) {
    const next = { ...brand, ...patch };
    setBrand(next);
    saveBrandConfig(next);
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const bruta = await fileToDataUrl(file);
    updateBrand({ logoDataUrl: await removerFundoLogo(bruta) });
  }

  async function onBgChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgDataUrl(await fileToDataUrl(file));
  }

  async function onAnexarImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const base64 = dataUrl.split(",")[1] ?? "";
    setPendingImage({ base64, tipo: file.type || "image/jpeg", preview: dataUrl });
    e.target.value = "";
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function enviar(mensagemTexto: string) {
    const texto = mensagemTexto.trim();
    if (!texto && !pendingImage) return;
    if (loading) return;

    const jaGerou = messages.length > 0;
    const imagemAnexada = pendingImage;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: texto || "(imagem anexada)", imagemPreview: imagemAnexada?.preview },
    ]);
    setInput("");
    setPendingImage(null);
    setLoading(true);

    try {
      const r = await gerarPostInstagram({
        kind: item.kind,
        id: item.id,
        mensagem: texto || undefined,
        historico: jaGerou ? historico : [],
        imagemBase64: imagemAnexada?.base64,
        imagemTipo: imagemAnexada?.tipo,
      });
      setText({
        headline: r.headline,
        corpo: r.corpo,
        legenda: r.legenda,
        elementoVisual: r.elementoVisual ?? null,
        destaquesTitulo: r.destaquesTitulo ?? [],
        destaquesCorpo: r.destaquesCorpo ?? [],
        coresPalavrasTitulo: {},
        coresPalavrasCorpo: {},
      });
      setHistorico(r.historico);
      if (r.estilo?.template) setTemplate(r.estilo.template as TemplateId);
      if (r.estilo?.corDestaque) setAccentColor(r.estilo.corDestaque);
      if (r.estilo?.tamanhoFonte) {
        const tamanho = TAMANHO_LEGADO[r.estilo.tamanhoFonte];
        if (tamanho) setFontScale(tamanho);
      }
      // Foto contextual escolhida pela ATLAS a partir do setor/tema da
      // decisão - só aplica se o advogado ainda não tiver subido a própria
      // foto de fundo (nunca sobrescreve escolha manual dele).
      if (r.imagemFundoDataUrl && !bgDataUrl) setBgDataUrl(r.imagemFundoDataUrl);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `${r.headline}\n\n${r.corpo}` },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Não consegui gerar o post agora.",
          erro: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function gerarAutomatico() {
    void enviar("Gere um post a partir desta decisão.");
  }

  // Cor manual por palavra (título/corpo) - sempre ganha do destaque
  // automático da IA (mesmo recurso do carrossel, ver InstagramWorkspace).
  function mudarCorPalavra(campo: "titulo" | "corpo", indicePalavra: number, cor: string) {
    const chave = campo === "titulo" ? "coresPalavrasTitulo" : "coresPalavrasCorpo";
    setText((prev) => (prev ? { ...prev, [chave]: { ...prev[chave], [indicePalavra]: cor } } : prev));
  }

  function limparCorPalavra(campo: "titulo" | "corpo", indicePalavra: number) {
    const chave = campo === "titulo" ? "coresPalavrasTitulo" : "coresPalavrasCorpo";
    setText((prev) => {
      if (!prev) return prev;
      const atual = { ...prev[chave] };
      delete atual[indicePalavra];
      return { ...prev, [chave]: atual };
    });
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderPostComModelo(canvas, {
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundDataUrl: bgDataUrl,
      corDestaque: accentColor,
      logoDataUrl: brand.logoDataUrl,
      nomeEscritorio: brand.nomeEscritorio,
      registro: brand.registro,
      kicker: formatarKicker(item.tribunal, item.data),
      headline: text?.headline || item.titulo,
      corpo: text?.corpo || item.resumoExecutivo,
      perfil: PERFIS_NOTICIAS[template],
      // Post único (não carrossel) - é sempre "a peça final", então ganha
      // a mesma linha de ícones (enviar/compartilhar/salvar) que o slide
      // de fechamento do carrossel usa, pra parecer pronto pra publicar
      // igual em qualquer área (ver renderPostComModelo::iconesAcao).
      iconesAcao: true,
      // Um único controle de tamanho pro post inteiro (sempre foi assim
      // aqui, diferente do carrossel/Estúdio Visual que têm um slider por
      // texto) - mesma unidade (ver TAMANHOS_FONTE/escalaDoTamanho), só
      // aplicada nos quatro papéis de uma vez.
      tamanhoRotulo: fontScale,
      tamanhoTitulo: fontScale,
      tamanhoCorpo: fontScale,
      tamanhoRodape: fontScale,
      posicoes: posicoesEscolhidas,
      alinhamentoRotulo: alinhamentoRotulo ?? undefined,
      alinhamentoTitulo: alinhamentoTitulo ?? undefined,
      alinhamentoCorpo: alinhamentoCorpo ?? undefined,
      alinhamentoRodape: alinhamentoRodape ?? undefined,
      elementoVisual: text?.elementoVisual,
      destaquesTitulo: text?.destaquesTitulo,
      destaquesCorpo: text?.destaquesCorpo,
      coresPalavrasTitulo: text?.coresPalavrasTitulo,
      coresPalavrasCorpo: text?.coresPalavrasCorpo,
    })
      .then(setPosicoesAtuais)
      .catch(() => {
        // falha ao carregar imagem (logo/fundo corrompidos) - a arte segue sem travar
      });
  }, [
    bgDataUrl,
    brand,
    text,
    item,
    accentColor,
    template,
    fontScale,
    posicoesEscolhidas,
    alinhamentoRotulo,
    alinhamentoTitulo,
    alinhamentoCorpo,
    alinhamentoRodape,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  function baixar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `atlas-instagram-${item.id}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function copiarLegenda() {
    if (!text) return;
    navigator.clipboard.writeText(text.legenda);
    setCopiedLegenda(true);
    setTimeout(() => setCopiedLegenda(false), 1200);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
      {/* Coluna de controles */}
      <div className="space-y-4 order-2 lg:order-1">
        {editingBrand ? (
          <div className="surface rounded-lg p-5 space-y-4">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-primary">
                Antes de gerar sua primeira arte
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Preciso de 3 coisas do seu escritório — uso isso em toda arte que você gerar daqui
                pra frente, não precisa repetir depois.
              </p>
            </div>

            <BrandField label="1. Me manda a logo do escritório (opcional, PNG de preferência com fundo transparente)">
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center gap-2 text-xs rounded-md border border-dashed border-border px-3 py-3 cursor-pointer hover:border-primary/60 transition-colors">
                  <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {brand.logoDataUrl ? (
                    <span className="flex items-center gap-2">
                      <img
                        src={brand.logoDataUrl}
                        alt="Logo"
                        className="h-6 max-w-[80px] object-contain"
                      />
                      Trocar logo
                    </span>
                  ) : (
                    "Escolher arquivo (ou deixe em branco pra ficar sem logo)"
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={onLogoChange} />
                </label>
                {brand.logoDataUrl && (
                  <button
                    onClick={() => updateBrand({ logoDataUrl: null })}
                    title="Remover logo"
                    className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-risk hover:border-risk/50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </BrandField>

            <BrandField label="2. Nome do escritório, como deve aparecer na arte">
              <input
                value={brand.nomeEscritorio}
                onChange={(e) => updateBrand({ nomeEscritorio: e.target.value })}
                placeholder="Ex: Fontoura & Schmidt Advogados"
                className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
              />
            </BrandField>

            <BrandField label="3. Registro (OAB) — opcional, mas passa mais credibilidade">
              <input
                value={brand.registro}
                onChange={(e) => updateBrand({ registro: e.target.value })}
                placeholder="Ex: OAB/RS 140.082"
                className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
              />
            </BrandField>

            <BrandField label="Cor de destaque do escritório">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brand.corDestaque}
                  onChange={(e) => updateBrand({ corDestaque: e.target.value })}
                  className="h-9 w-12 rounded-md border border-border bg-background cursor-pointer"
                />
                <span className="text-xs text-muted-foreground font-mono">{brand.corDestaque}</span>
              </div>
            </BrandField>

            <button
              onClick={() => setEditingBrand(false)}
              disabled={!isBrandConfigured(brand)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Salvar e continuar
            </button>
          </div>
        ) : (
          <div className="surface rounded-lg p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {brand.logoDataUrl && (
                <img
                  src={brand.logoDataUrl}
                  alt="Logo"
                  className="h-8 w-8 object-contain shrink-0 rounded bg-background/60 p-0.5"
                />
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{brand.nomeEscritorio}</div>
                {brand.registro && (
                  <div className="text-xs text-muted-foreground truncate">{brand.registro}</div>
                )}
              </div>
            </div>
            <button
              onClick={() => setEditingBrand(true)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          </div>
        )}

        <div className="surface rounded-lg p-5 space-y-4">
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Foto de fundo (opcional)
          </div>
          <label className="flex items-center gap-2 text-xs rounded-md border border-dashed border-border px-3 py-3 cursor-pointer hover:border-primary/60 transition-colors">
            <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
            {bgDataUrl
              ? "Trocar foto"
              : "Escolher uma foto (ou deixe em branco pro fundo em degradê)"}
            <input type="file" accept="image/*" className="hidden" onChange={onBgChange} />
          </label>
          {bgDataUrl && (
            <button
              onClick={() => setBgDataUrl(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Remover foto e usar degradê
            </button>
          )}
        </div>

        <div className="surface rounded-lg p-5 space-y-4">
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Estilo da arte
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
              Template
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`text-left rounded-md border px-3 py-2 text-xs transition-colors ${
                    template === t.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-[10px] opacity-70">{t.descricao}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
              Tamanho da letra
            </div>
            <select
              value={fontScale}
              onChange={(e) => setFontScale(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
            >
              {TAMANHOS_FONTE.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
              Cor de destaque desta arte
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-8 w-11 rounded-md border border-border bg-background cursor-pointer"
              />
              <span className="text-xs text-muted-foreground font-mono">{accentColor}</span>
              {accentColor !== brand.corDestaque && (
                <button
                  onClick={() =>
                    setAccentColor(brand.corDestaque || DEFAULT_BRAND_CONFIG.corDestaque)
                  }
                  className="text-[10px] text-primary hover:underline ml-auto"
                >
                  usar cor da marca
                </button>
              )}
            </div>
          </div>
        </div>

        <SeletorAlinhamento label="Alinhamento do rótulo" valor={alinhamentoRotulo} onChange={setAlinhamentoRotulo} />
        <SeletorAlinhamento label="Alinhamento do título" valor={alinhamentoTitulo} onChange={setAlinhamentoTitulo} />
        <SeletorAlinhamento label="Alinhamento do corpo" valor={alinhamentoCorpo} onChange={setAlinhamentoCorpo} />
        <SeletorAlinhamento label="Alinhamento do rodapé" valor={alinhamentoRodape} onChange={setAlinhamentoRodape} />

        {text && (
          <>
            <div className="surface rounded-lg p-5 space-y-3">
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                Texto da arte (editável)
              </div>
              <EditableField
                label="Título (headline)"
                value={text.headline}
                onChange={(v) => setText({ ...text, headline: v })}
              />
              <EditableField
                label="Corpo"
                value={text.corpo}
                onChange={(v) => setText({ ...text, corpo: v })}
                textarea
              />
            </div>

            <div className="surface rounded-lg p-4">
              {text.elementoVisual && (
                <div className="pb-3 mb-3 border-b border-border flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    Este post tem um número/gráfico em destaque
                  </div>
                  <button
                    onClick={() => setText((prev) => (prev ? { ...prev, elementoVisual: null } : prev))}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-risk"
                  >
                    <X className="h-3.5 w-3.5" />
                    Remover
                  </button>
                </div>
              )}
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Cor por palavra
              </div>
              <div className="space-y-2">
                <PalavrasColoridas
                  texto={text.headline}
                  destaques={text.destaquesTitulo ?? []}
                  overrides={text.coresPalavrasTitulo}
                  corDestaque={accentColor}
                  onMudarCor={(i, cor) => mudarCorPalavra("titulo", i, cor)}
                  onLimparCor={(i) => limparCorPalavra("titulo", i)}
                />
                {text.corpo && (
                  <PalavrasColoridas
                    texto={text.corpo}
                    destaques={text.destaquesCorpo ?? []}
                    overrides={text.coresPalavrasCorpo}
                    corDestaque={accentColor}
                    onMudarCor={(i, cor) => mudarCorPalavra("corpo", i, cor)}
                    onLimparCor={(i) => limparCorPalavra("corpo", i)}
                  />
                )}
              </div>
            </div>

            <div className="surface rounded-lg p-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  Legenda para o post
                </div>
                <button onClick={copiarLegenda} className="text-xs text-primary hover:underline">
                  {copiedLegenda ? "Copiado" : "Copiar"}
                </button>
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
                {text.legenda}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Preview + chat */}
      <div className="order-1 lg:order-2 flex flex-col gap-4">
        <div className="w-full max-w-[420px] mx-auto">
          <PosicionadorTexto
            posicoes={posicoesAtuais}
            papeisAtivos={papeisAtivosDoPost(
              text?.corpo || item.resumoExecutivo,
              !!brand.logoDataUrl,
              !!text?.elementoVisual,
            )}
            onMover={(papel, xPct, yPct) =>
              setPosicoesEscolhidas((prev) => ({
                ...prev,
                [papel]: { ...prev[papel], xPct, yPct },
              }))
            }
            onRedimensionarLogo={(escala) =>
              setPosicoesEscolhidas((prev) => ({
                ...prev,
                logo: {
                  xPct: prev.logo?.xPct ?? posicoesAtuais.logo?.xPct ?? 0,
                  yPct: prev.logo?.yPct ?? posicoesAtuais.logo?.yPct ?? 0,
                  escala,
                },
              }))
            }
            onRedimensionarGrafico={(escala) =>
              setPosicoesEscolhidas((prev) => ({
                ...prev,
                grafico: {
                  xPct: prev.grafico?.xPct ?? posicoesAtuais.grafico?.xPct ?? 0,
                  yPct: prev.grafico?.yPct ?? posicoesAtuais.grafico?.yPct ?? 0,
                  escala,
                },
              }))
            }
          >
            <div className="surface rounded-lg overflow-hidden">
              <canvas ref={canvasRef} className="w-full h-auto block" />
            </div>
          </PosicionadorTexto>
          <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <span>Arraste as etiquetas na imagem pra mover cada texto</span>
            {Object.keys(posicoesEscolhidas).length > 0 && (
              <button
                onClick={() => setPosicoesEscolhidas({})}
                className="text-primary hover:underline"
              >
                Redefinir posições
              </button>
            )}
          </div>
        </div>
        {text && (
          <button
            onClick={baixar}
            className="mx-auto inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            Baixar imagem (PNG)
          </button>
        )}

        {/* Chat livre */}
        <div className="surface rounded-lg flex flex-col h-[420px]">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-4">
                <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Bot className="h-4.5 w-4.5" />
                </div>
                <p className="text-sm font-medium">Diga o que você quer nesta arte</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Explique em texto, cole um link de referência, ou anexe uma imagem — eu escrevo do
                  jeito que você pedir, sempre com base na decisão real. Também dá pra pedir estilo
                  ("fundo azul", "letra maior", "mais moderno") ou trocar pelos controles ao lado.
                </p>
                <button
                  onClick={gerarAutomatico}
                  disabled={loading || !pronto}
                  className="mt-1 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Gerar automaticamente
                </button>
              </div>
            )}

            {messages.map((m, i) => (
              <ChatBubble key={i} message={m} />
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Escrevendo…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-border p-3">
            {pendingImage && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5">
                <img src={pendingImage.preview} alt="" className="h-8 w-8 object-cover rounded" />
                <span className="text-[11px] text-muted-foreground">imagem anexada</span>
                <button
                  onClick={() => setPendingImage(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <label className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-md border border-border hover:bg-accent cursor-pointer">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <input type="file" accept="image/*" className="hidden" onChange={onAnexarImagem} />
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar(input);
                  }
                }}
                rows={1}
                placeholder="Ex: deixe mais direto, fundo azul, letra maior, cole um link…"
                disabled={!pronto}
                className="flex-1 resize-none bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <button
                onClick={() => enviar(input)}
                disabled={loading || !pronto || (!input.trim() && !pendingImage)}
                className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            {!pronto && (
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Complete a logo e o nome do escritório acima para usar o chat.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center ${
          isUser ? "bg-primary text-primary-foreground" : "bg-surface-elevated text-foreground"
        }`}
      >
        {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
      </div>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground"
            : message.erro
              ? "bg-risk/10 text-risk border border-risk/30"
              : "bg-surface-elevated text-foreground"
        }`}
      >
        {message.imagemPreview && (
          <img
            src={message.imagemPreview}
            alt=""
            className="mb-1.5 max-h-24 rounded object-cover"
          />
        )}
        {message.content}
      </div>
    </div>
  );
}

function BrandField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 normal-case leading-relaxed">
        {label}
      </div>
      {children}
    </label>
  );
}

function EditableField({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </div>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-xs leading-relaxed"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm font-medium"
        />
      )}
    </label>
  );
}
