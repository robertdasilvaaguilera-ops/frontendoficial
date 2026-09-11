import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ImageIcon,
  Images,
  Loader2,
  Pencil,
  RotateCcw,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  gerarCarrossel,
  buscarImagensSugeridas,
  type CarrosselResposta,
  type ImagemSugerida,
  type SlideCarrossel,
  type TomCarrossel,
} from "@/lib/atlas-api";
import { fileToDataUrl, formatarKicker, getBrandConfig, saveBrandConfig } from "@/lib/brand-config";
import {
  renderPostComModelo,
  FONTES_DESTAQUE,
  KICKER_ESTILOS,
  ESTILOS_DESTAQUE_TEXTO,
  type FonteDestaqueId,
  type KickerEstiloId,
  type EstiloDestaqueId,
  type FontScale,
  type PerfilVisual,
} from "@/lib/instagram-canvas";
import type { PostableItem } from "@/components/InstagramPostStudio";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const CANVAS_W = 1080;
const CANVAS_H = 1350;

const TONS: { id: TomCarrossel; label: string }[] = [
  { id: "sofisticado", label: "Mais sofisticado" },
  { id: "empresarial", label: "Mais empresarial" },
  { id: "comercial", label: "Mais comercial" },
  { id: "tecnico", label: "Mais técnico" },
  { id: "informativo", label: "Mais informativo" },
  { id: "minimalista", label: "Mais minimalista" },
];

const SLIDE_LABELS: Record<SlideCarrossel["tipo"], string> = {
  capa: "O que aconteceu",
  porque_importa: "Por que importa",
  quem_afetado: "Quem é afetado",
  impacto: "Impacto",
  recomendacao: "O que fazer",
};

interface Referencia {
  base64: string;
  mediaType: string;
  preview: string;
}

export function InstagramWorkspace({ item }: { item: PostableItem }) {
  const [identidade, setIdentidade] = useState<"atlas" | "propria">("atlas");
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [tom, setTom] = useState<TomCarrossel | null>(null);
  const [instrucao, setInstrucao] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [marca, setMarca] = useState(() => getBrandConfig());
  const [fonte, setFonte] = useState<FonteDestaqueId>("inter");
  const [kickerEstilo, setKickerEstilo] = useState<KickerEstiloId>("solido");
  const [escalaFonte, setEscalaFonte] = useState<FontScale>("media");
  // null = usa a cor do perfil visual extraído das referências (o padrão
  // de sempre) - só vira um hex fixo quando o usuário troca manualmente.
  const [corDestaque, setCorDestaque] = useState<string | null>(null);
  const [estiloTitulo, setEstiloTitulo] = useState<EstiloDestaqueId>("nenhum");
  const [estiloCorpo, setEstiloCorpo] = useState<EstiloDestaqueId>("nenhum");

  const [imagemEscolhidaId, setImagemEscolhidaId] = useState<number | null>(null);
  const [galeriaAberta, setGaleriaAberta] = useState(false);
  const [imagensSugeridas, setImagensSugeridas] = useState<ImagemSugerida[] | null>(null);
  const [carregandoImagens, setCarregandoImagens] = useState(false);

  const [resultado, setResultado] = useState<CarrosselResposta | null>(null);
  const [slides, setSlides] = useState<SlideCarrossel[]>([]);
  const [legenda, setLegenda] = useState("");
  const [cta, setCta] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [ativo, setAtivo] = useState(0);
  const [editando, setEditando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const thumbRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  async function onAdicionarReferencias(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const novas = await Promise.all(
      files.map(async (file) => {
        const dataUrl = await fileToDataUrl(file);
        const base64 = dataUrl.split(",")[1] ?? "";
        return { base64, mediaType: file.type || "image/jpeg", preview: dataUrl };
      }),
    );
    setReferencias((prev) => [...prev, ...novas]);
    e.target.value = "";
  }

  function removerReferencia(idx: number) {
    setReferencias((prev) => prev.filter((_, i) => i !== idx));
  }

  function atualizarMarca(patch: Partial<typeof marca>) {
    setMarca((prev) => {
      const next = { ...prev, ...patch };
      saveBrandConfig(next);
      return next;
    });
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    atualizarMarca({ logoDataUrl: await fileToDataUrl(file) });
    e.target.value = "";
  }

  const pronto = identidade === "atlas" || referencias.length > 0;

  async function criar(opts?: {
    tomNovo?: TomCarrossel | null;
    manterTextos?: boolean;
    imagemIdNovo?: number;
  }) {
    if (!pronto) return;
    setLoading(true);
    setErro(null);
    try {
      const manterTextos = opts?.manterTextos ?? false;
      const r = await gerarCarrossel({
        kind: item.kind,
        id: item.id,
        identidade,
        referencias: referencias.map((ref) => ({ base64: ref.base64, mediaType: ref.mediaType })),
        tom: opts?.tomNovo !== undefined ? opts.tomNovo : tom,
        mensagem: manterTextos
          ? "Troque só a sugestão de imagem de fundo. Mantenha exatamente os mesmos textos dos slides, legenda, CTA e hashtags."
          : instrucao.trim() || undefined,
        historico: manterTextos ? resultado?.historico : [],
        imagemId: opts?.imagemIdNovo ?? imagemEscolhidaId,
      });
      setResultado(r);
      setSlides(r.slides);
      setLegenda(r.legenda);
      setCta(r.cta);
      setHashtags(r.hashtags);
      setAtivo(0);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui gerar o carrossel agora.");
    } finally {
      setLoading(false);
    }
  }

  function aplicarTom(novoTom: TomCarrossel) {
    setTom(novoTom);
    void criar({ tomNovo: novoTom });
  }

  function trocarImagem() {
    setImagemEscolhidaId(null);
    void criar({ manterTextos: true });
  }

  async function abrirGaleria() {
    setGaleriaAberta(true);
    if (imagensSugeridas !== null) return;
    setCarregandoImagens(true);
    try {
      const r = await buscarImagensSugeridas(item.kind, item.id);
      setImagensSugeridas(r.imagens);
    } catch {
      setImagensSugeridas([]);
    } finally {
      setCarregandoImagens(false);
    }
  }

  function escolherImagem(id: number) {
    setImagemEscolhidaId(id);
    setGaleriaAberta(false);
    if (resultado) void criar({ manterTextos: true, imagemIdNovo: id });
  }

  function recomecar() {
    setResultado(null);
    setSlides([]);
    setTom(null);
    setInstrucao("");
    setImagemEscolhidaId(null);
  }

  function atualizarSlide(idx: number, patch: Partial<SlideCarrossel>) {
    setSlides((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function moverSlide(idx: number, direcao: -1 | 1) {
    setSlides((prev) => {
      const alvo = idx + direcao;
      if (alvo < 0 || alvo >= prev.length) return prev;
      const copia = [...prev];
      [copia[idx], copia[alvo]] = [copia[alvo], copia[idx]];
      return copia;
    });
    setAtivo((a) => (a === idx ? idx + direcao : a === idx + direcao ? idx : a));
  }

  const desenharSlide = useCallback(
    async (idx: number) => {
      const slide = slides[idx];
      if (!slide || !resultado) return;
      const opts = {
        width: CANVAS_W,
        height: CANVAS_H,
        // Mesma foto contextual em todos os slides (não só na capa) - dá
        // consistência visual ao carrossel inteiro, não só à primeira tela.
        backgroundDataUrl: resultado.imagemFundoDataUrl,
        logoDataUrl: marca.logoDataUrl,
        nomeEscritorio: marca.nomeEscritorio || "Seu Escritório",
        registro: marca.registro,
        kicker: slide.kicker || formatarKicker(item.tribunal, item.data),
        headline: slide.headline,
        corpo: slide.corpo,
        perfil: resultado.perfilVisual as PerfilVisual,
        progresso: { atual: idx + 1, total: slides.length },
        fonteDestaque: fonte,
        kickerEstilo,
        estiloTitulo,
        estiloCorpo,
        escalaFonte,
        corDestaque: corDestaque ?? undefined,
      };
      // Desenha no canvas principal e na miniatura separadamente (são
      // elementos <canvas> distintos, não dá pra reaproveitar um só) -
      // ambos ficam sempre em sincronia com o mesmo estado do slide.
      const principal = canvasRefs.current[idx];
      const miniatura = thumbRefs.current[idx];
      await Promise.all([
        principal ? renderPostComModelo(principal, opts).catch(() => {}) : null,
        miniatura ? renderPostComModelo(miniatura, opts).catch(() => {}) : null,
      ]);
    },
    [
      slides,
      resultado,
      item,
      marca,
      fonte,
      kickerEstilo,
      estiloTitulo,
      estiloCorpo,
      escalaFonte,
      corDestaque,
    ],
  );

  useEffect(() => {
    slides.forEach((_, idx) => {
      void desenharSlide(idx);
    });
  }, [slides, desenharSlide]);

  function baixarSlide(idx: number) {
    const canvas = canvasRefs.current[idx];
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `atlas-carrossel-${item.id}-slide${idx + 1}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function baixarTodos() {
    slides.forEach((_, idx) => setTimeout(() => baixarSlide(idx), idx * 250));
  }

  function copiarLegenda() {
    const texto = [legenda, "", cta, "", hashtags.join(" ")].join("\n");
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1200);
  }

  // ---------- Tela inicial: escolha de identidade + criação ----------
  if (!resultado) {
    return (
      <div className="max-w-2xl mx-auto text-center py-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Criar para Instagram</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          A ATLAS já sabe tudo sobre esta decisão. Em poucos segundos você recebe um carrossel
          pronto — pensado para gerar autoridade e trazer conversas comerciais, não só informar.
        </p>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
          <button
            onClick={() => setIdentidade("atlas")}
            className={`rounded-lg border p-4 transition-colors ${
              identidade === "atlas"
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="text-sm font-medium">Identidade ATLAS</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Visual premium padrão da plataforma — pronto, sem configurar nada.
            </p>
          </button>
          <button
            onClick={() => setIdentidade("propria")}
            className={`rounded-lg border p-4 transition-colors ${
              identidade === "propria"
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="text-sm font-medium">Minha identidade visual</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Envie posts que você já usa — a ATLAS mantém seu padrão e só alimenta com conteúdo.
            </p>
          </button>
        </div>

        {identidade === "propria" && (
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {referencias.map((ref, i) => (
              <div key={i} className="relative group">
                <img
                  src={ref.preview}
                  alt={`Referência ${i + 1}`}
                  className="h-24 w-[76px] object-cover rounded-md border border-border"
                />
                <button
                  onClick={() => removerReferencia(i)}
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-risk text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="h-24 w-[76px] rounded-md border-2 border-dashed border-border hover:border-primary/60 flex flex-col items-center justify-center gap-1 cursor-pointer text-muted-foreground transition-colors">
              <Upload className="h-4 w-4" />
              <span className="text-[9px] text-center px-1">Enviar post</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onAdicionarReferencias}
              />
            </label>
          </div>
        )}

        <div className="mt-6 max-w-md mx-auto text-left">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Assinatura do post
          </div>
          <div className="flex items-center gap-3">
            <label className="shrink-0 h-14 w-14 rounded-md border border-dashed border-border hover:border-primary/60 flex items-center justify-center cursor-pointer overflow-hidden text-muted-foreground transition-colors">
              {marca.logoDataUrl ? (
                <img
                  src={marca.logoDataUrl}
                  alt="Sua logo"
                  className="h-full w-full object-contain"
                />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <input type="file" accept="image/*" className="hidden" onChange={onLogoChange} />
            </label>
            <div className="flex-1 space-y-1.5">
              <input
                value={marca.nomeEscritorio}
                onChange={(e) => atualizarMarca({ nomeEscritorio: e.target.value })}
                placeholder="Nome do seu escritório"
                className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-sm"
              />
              <input
                value={marca.registro}
                onChange={(e) => atualizarMarca({ registro: e.target.value })}
                placeholder="Registro (opcional) — ex: OAB/SP 123.456"
                className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs"
              />
            </div>
            {marca.logoDataUrl && (
              <button
                onClick={() => atualizarMarca({ logoDataUrl: null })}
                className="shrink-0 text-muted-foreground hover:text-risk"
                title="Remover logo"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Aparece no rodapé de cada slide. Deixe em branco se não quiser mostrar nome ou logo.
          </p>
        </div>

        <div className="mt-6 max-w-md mx-auto">
          <textarea
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            placeholder="Instrução opcional — ex: foque no impacto para o produtor rural…"
            rows={2}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <button
          onClick={() => criar()}
          disabled={!pronto || loading}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {loading ? "Criando…" : "Criar para Instagram"}
        </button>
        {identidade === "propria" && referencias.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Envie ao menos 1 post de referência pra usar sua identidade visual.
          </p>
        )}
        {erro && <p className="mt-3 text-xs text-risk">{erro}</p>}
      </div>
    );
  }

  // ---------- Resultado: workspace de revisão ----------
  const slideAtivo = slides[ativo];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          {resultado.publicoAlvo}
        </div>
        <button
          onClick={recomecar}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Recomeçar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Preview principal */}
        <div>
          <div className="relative w-full max-w-[380px] mx-auto">
            <div className="surface rounded-lg overflow-hidden">
              {slides.map((_, idx) => (
                <canvas
                  key={idx}
                  ref={(el) => {
                    canvasRefs.current[idx] = el;
                  }}
                  className={`w-full h-auto block ${idx === ativo ? "" : "hidden"}`}
                />
              ))}
            </div>
            <button
              onClick={() => setAtivo((a) => Math.max(0, a - 1))}
              disabled={ativo === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setAtivo((a) => Math.min(slides.length - 1, a + 1))}
              disabled={ativo === slides.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Miniaturas + reordenar */}
          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
            {slides.map((s, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1">
                <button
                  onClick={() => setAtivo(idx)}
                  className={`h-14 w-11 rounded border overflow-hidden ${
                    idx === ativo ? "border-primary" : "border-border"
                  }`}
                >
                  <canvas
                    ref={(el) => {
                      thumbRefs.current[idx] = el;
                    }}
                    className="w-full h-full object-cover"
                  />
                </button>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => moverSlide(idx, -1)}
                    disabled={idx === 0}
                    className="text-[9px] text-muted-foreground hover:text-foreground disabled:opacity-20"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => moverSlide(idx, 1)}
                    disabled={idx === slides.length - 1}
                    className="text-[9px] text-muted-foreground hover:text-foreground disabled:opacity-20"
                  >
                    ▶
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={() => baixarSlide(ativo)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar este slide
            </button>
            <button
              onClick={baixarTodos}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar carrossel completo
            </button>
          </div>
        </div>

        {/* Painel lateral: tom, edição, imagem */}
        <div className="space-y-4">
          <div className="surface rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Regenerar abordagem
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TONS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => aplicarTom(t.id)}
                  disabled={loading}
                  className={`rounded-full px-2.5 py-1 text-xs border transition-colors disabled:opacity-50 ${
                    tom === t.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => criar()}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Gerar novamente
              </button>
              <button
                onClick={trocarImagem}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Sortear imagem
              </button>
            </div>
            <button
              onClick={abrirGaleria}
              disabled={loading}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              <Images className="h-3.5 w-3.5" />
              Escolher imagem do banco
            </button>
            {erro && <p className="mt-2 text-xs text-risk">{erro}</p>}
          </div>

          <div className="surface rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Fonte do título
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FONTES_DESTAQUE.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFonte(f.id)}
                  className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
                    fonte === f.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="surface rounded-lg p-4 space-y-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                Tamanho da fonte
              </div>
              <div className="inline-flex rounded-md border border-border overflow-hidden w-full">
                {(["pequena", "media", "grande"] as FontScale[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setEscalaFonte(s)}
                    className={`flex-1 py-1.5 text-xs font-medium ${
                      escalaFonte === s
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {s === "pequena" ? "P" : s === "media" ? "M" : "G"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                Cor de destaque
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={corDestaque ?? resultado.perfilVisual.corPrimaria}
                  onChange={(e) => setCorDestaque(e.target.value)}
                  className="h-8 w-11 rounded-md border border-border bg-background cursor-pointer"
                />
                <span className="text-xs text-muted-foreground font-mono">
                  {corDestaque ?? resultado.perfilVisual.corPrimaria}
                </span>
                {corDestaque && (
                  <button
                    onClick={() => setCorDestaque(null)}
                    className="text-[10px] text-primary hover:underline ml-auto"
                  >
                    usar cor do perfil
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="surface rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Estilo do rótulo
            </div>
            <div className="flex flex-wrap gap-1.5">
              {KICKER_ESTILOS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKickerEstilo(k.id)}
                  className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
                    kickerEstilo === k.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div className="surface rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Estilo do título
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ESTILOS_DESTAQUE_TEXTO.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setEstiloTitulo(e.id)}
                  className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
                    estiloTitulo === e.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <div className="surface rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Estilo do corpo
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ESTILOS_DESTAQUE_TEXTO.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setEstiloCorpo(e.id)}
                  className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
                    estiloCorpo === e.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {slideAtivo && (
            <div className="surface rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Slide {ativo + 1} · {SLIDE_LABELS[slideAtivo.tipo]}
                </div>
                <button
                  onClick={() => setEditando((v) => !v)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              {editando ? (
                <div className="space-y-2">
                  <input
                    value={slideAtivo.kicker}
                    onChange={(e) => atualizarSlide(ativo, { kicker: e.target.value })}
                    placeholder="Rótulo"
                    className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs"
                  />
                  <textarea
                    value={slideAtivo.headline}
                    onChange={(e) => atualizarSlide(ativo, { headline: e.target.value })}
                    placeholder="Título"
                    rows={2}
                    className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-sm font-medium"
                  />
                  <textarea
                    value={slideAtivo.corpo}
                    onChange={(e) => atualizarSlide(ativo, { corpo: e.target.value })}
                    placeholder="Texto de apoio (opcional)"
                    rows={2}
                    className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs"
                  />
                </div>
              ) : (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-primary">
                    {slideAtivo.kicker}
                  </div>
                  <div className="mt-1 text-sm font-medium">{slideAtivo.headline}</div>
                  {slideAtivo.corpo && (
                    <p className="mt-1 text-xs text-muted-foreground">{slideAtivo.corpo}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Legenda */}
      <div className="surface rounded-lg p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Legenda para o post
          </div>
          <button
            onClick={copiarLegenda}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Copy className="h-3 w-3" />
            {copiado ? "Copiado" : "Copiar tudo"}
          </button>
        </div>
        <textarea
          value={legenda}
          onChange={(e) => setLegenda(e.target.value)}
          rows={6}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm leading-relaxed"
        />
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              CTA
            </div>
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              Hashtags
            </div>
            <input
              value={hashtags.join(" ")}
              onChange={(e) => setHashtags(e.target.value.split(/\s+/).filter(Boolean))}
              className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <Dialog open={galeriaAberta} onOpenChange={setGaleriaAberta}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Escolher imagem de fundo</DialogTitle>
            <DialogDescription>
              {imagensSugeridas && imagensSugeridas.length > 0
                ? `Fotos reais sobre "${resultado?.contextoVisual ?? "o assunto desta decisão"}" — escolha uma pra usar em todos os slides.`
                : "Fotos reais coerentes com o assunto desta decisão."}
            </DialogDescription>
          </DialogHeader>
          {carregandoImagens ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : imagensSugeridas && imagensSugeridas.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
              {imagensSugeridas.map((img) => (
                <button
                  key={img.id}
                  onClick={() => escolherImagem(img.id)}
                  className={`aspect-[4/5] rounded-md overflow-hidden border-2 transition-colors ${
                    imagemEscolhidaId === img.id
                      ? "border-primary"
                      : "border-transparent hover:border-primary/50"
                  }`}
                >
                  <img
                    src={img.preview}
                    alt="Sugestão de imagem de fundo"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Não encontrei fotos sugeridas agora. Você pode seguir com a imagem automática.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
