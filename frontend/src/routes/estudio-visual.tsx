import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  opportunitiesQuery,
  newsQuery,
  gerarPostComModelo,
  type ConfigModeloVisual,
  type ElementoVisualSlideResposta,
} from "@/lib/atlas-api";
import { fileToDataUrl, getBrandConfig } from "@/lib/brand-config";
import { ModelosVisuaisPainel } from "@/components/ModelosVisuaisPainel";
import {
  renderPostComModelo,
  FONTES_DESTAQUE,
  KICKER_ESTILOS,
  ESTILOS_DESTAQUE_TEXTO,
  TAMANHOS_FONTE,
  TAMANHO_FONTE_PADRAO,
  type FonteDestaqueId,
  type KickerEstiloId,
  type EstiloDestaqueId,
  type PapelTexto,
  type ChaveArrasto,
  type PosicoesTexto,
  type PerfilVisual,
  type AlinhamentoTexto,
} from "@/lib/instagram-canvas";
import { PosicionadorTexto } from "@/components/PosicionadorTexto";
import { SeletorAlinhamento } from "@/components/SeletorAlinhamento";
import { PalavrasColoridas } from "@/components/PalavrasColoridas";
import { useSessaoAtual } from "@/components/AuthGate";
import type { Opportunity, NewsItem } from "@/lib/atlas-types";

export const Route = createFileRoute("/estudio-visual")({
  head: () => ({
    meta: [
      { title: "Estúdio Visual — ATLAS" },
      {
        name: "description",
        content:
          "Ensine a ATLAS a falar a linguagem visual da sua empresa: envie posts que você já usa e gere novos conteúdos no mesmo padrão visual.",
      },
    ],
  }),
  loader: ({ context }) => {
    if (typeof window === "undefined") return;
    context.queryClient.ensureQueryData(opportunitiesQuery);
    context.queryClient.ensureQueryData(newsQuery);
  },
  component: EstudioVisual,
});

interface Referencia {
  base64: string;
  mediaType: string;
  preview: string;
}

type ItemBase = {
  id: string;
  kind: "opportunities" | "news";
  titulo: string;
  tribunal: string;
  data: string;
  resumoExecutivo: string;
};

function paraItem(o: Opportunity): ItemBase {
  return {
    id: o.id,
    kind: "opportunities",
    titulo: o.titulo,
    tribunal: o.tribunal,
    data: o.decisao.data,
    resumoExecutivo: o.resumoExecutivo,
  };
}

function noticiaParaItem(n: NewsItem): ItemBase {
  return {
    id: n.id,
    kind: "news",
    titulo: n.titulo,
    tribunal: n.tribunal ?? n.fonte,
    data: n.publicadoEm,
    resumoExecutivo: n.resumo,
  };
}

const CANVAS_W = 1080;
const CANVAS_H = 1350;

// Só mostra alça de arrastar pra texto que o post realmente tem - rótulo
// e título sempre vêm da IA, corpo é opcional, rodapé sempre desenha
// algo (nome real ou "Seu Escritório"). A logo só entra quando o
// escritório tem uma configurada.
function papeisAtivosDoResultado(
  resultado: { corpo: string; elementoVisual?: unknown } | null,
): ChaveArrasto[] {
  const papeis: ChaveArrasto[] = ["rotulo", "titulo", "rodape"];
  if (resultado?.corpo?.trim()) papeis.push("corpo");
  if (resultado?.elementoVisual) papeis.push("grafico");
  if (getBrandConfig().logoDataUrl) papeis.push("logo");
  return papeis;
}

function EstudioVisual() {
  const sessao = useSessaoAtual();

  // Estúdio Visual é um recurso avançado - básico só tem Radar e Notícias.
  // O backend já bloqueia (403) quem não tem acesso, isso aqui evita nem
  // tentar buscar os dados pra quem não pode ver de qualquer forma.
  if (sessao?.limites.recursosAvancados === false) {
    return (
      <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-8">
        <div className="surface rounded-lg p-8 flex flex-col items-center text-center gap-3">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-medium">Estúdio Visual não está no seu nível de acesso</div>
          <p className="text-xs text-muted-foreground max-w-sm">
            Seu nível de acesso é limitado a Radar Comercial e Notícias.
          </p>
        </div>
      </div>
    );
  }

  return <EstudioVisualConteudo />;
}

function EstudioVisualConteudo() {
  const { data: opps } = useSuspenseQuery(opportunitiesQuery);
  const { data: news } = useSuspenseQuery(newsQuery);

  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [busca, setBusca] = useState("");
  const [itemEscolhido, setItemEscolhido] = useState<ItemBase | null>(null);
  const [instrucao, setInstrucao] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    headline: string;
    corpo: string;
    legenda: string;
    perfil: PerfilVisual;
    imagemFundoDataUrl: string | null;
    elementoVisual: ElementoVisualSlideResposta | null;
    destaquesTitulo: string[];
    destaquesCorpo: string[];
    coresPalavrasTitulo: Record<number, string>;
    coresPalavrasCorpo: Record<number, string>;
  } | null>(null);

  // Personalização - puramente de desenho (não chama a IA de novo), então
  // qualquer mudança aqui só redesenha o canvas com o mesmo texto/perfil já
  // gerado. Mesmo conjunto de controles do carrossel (InstagramWorkspace).
  const [fonte, setFonte] = useState<FonteDestaqueId>("inter");
  const [kickerEstilo, setKickerEstilo] = useState<KickerEstiloId>("solido");
  const [tamanhoRotulo, setTamanhoRotulo] = useState(TAMANHO_FONTE_PADRAO);
  const [tamanhoTitulo, setTamanhoTitulo] = useState(TAMANHO_FONTE_PADRAO);
  const [tamanhoCorpo, setTamanhoCorpo] = useState(TAMANHO_FONTE_PADRAO);
  const [tamanhoRodape, setTamanhoRodape] = useState(TAMANHO_FONTE_PADRAO);
  const [corDestaque, setCorDestaque] = useState<string | null>(null);
  const [estiloTitulo, setEstiloTitulo] = useState<EstiloDestaqueId>("nenhum");
  const [estiloCorpo, setEstiloCorpo] = useState<EstiloDestaqueId>("nenhum");
  // Um por texto (não mais um único botão pro post inteiro) - null =
  // segue o próprio padrão desse texto (perfil visual pro título/corpo,
  // esquerda pro rótulo/rodapé).
  const [alinhamentoRotulo, setAlinhamentoRotulo] = useState<AlinhamentoTexto | null>(null);
  const [alinhamentoTitulo, setAlinhamentoTitulo] = useState<AlinhamentoTexto | null>(null);
  const [alinhamentoCorpo, setAlinhamentoCorpo] = useState<AlinhamentoTexto | null>(null);
  const [alinhamentoRodape, setAlinhamentoRodape] = useState<AlinhamentoTexto | null>(null);
  // Posição livre - vazio = ninguém foi arrastado ainda (posição do
  // layout padrão). posicoesAtuais é a posição EFETIVA devolvida pelo
  // último desenho, usada só pra colocar a alça de arrastar no lugar certo.
  const [posicoesEscolhidas, setPosicoesEscolhidas] = useState<PosicoesTexto>({});
  const [posicoesAtuais, setPosicoesAtuais] = useState<PosicoesTexto>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const itens = useMemo<ItemBase[]>(() => {
    const base = [...opps.map(paraItem), ...news.map(noticiaParaItem)];
    if (!busca.trim()) return base.slice(0, 30);
    const q = busca.toLowerCase();
    return base.filter((i) => i.titulo.toLowerCase().includes(q)).slice(0, 30);
  }, [opps, news, busca]);

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

  async function gerar() {
    if (referencias.length === 0 || !itemEscolhido) return;
    setLoading(true);
    setErro(null);
    setResultado(null);
    setPosicoesEscolhidas({});
    try {
      const r = await gerarPostComModelo({
        kind: itemEscolhido.kind,
        id: itemEscolhido.id,
        referencias: referencias.map((ref) => ({ base64: ref.base64, mediaType: ref.mediaType })),
        mensagem: instrucao.trim() || undefined,
      });
      setResultado({
        headline: r.headline,
        corpo: r.corpo,
        legenda: r.legenda,
        perfil: r.perfilVisual as PerfilVisual,
        imagemFundoDataUrl: r.imagemFundoDataUrl,
        elementoVisual: r.elementoVisual ?? null,
        destaquesTitulo: r.destaquesTitulo ?? [],
        destaquesCorpo: r.destaquesCorpo ?? [],
        coresPalavrasTitulo: {},
        coresPalavrasCorpo: {},
      });
      // Réplica fiel: os controles de estilo partem exatamente do que foi
      // extraído das referências, não do padrão hardcoded - cada "Gerar"
      // já reseta o resto do estado (posicoesEscolhidas etc), então faz
      // sentido também resetar o estilo pro que veio da identidade.
      setFonte(r.perfilVisual.fonteDestaque as FonteDestaqueId);
      setKickerEstilo(r.perfilVisual.kickerEstilo as KickerEstiloId);
      setEstiloTitulo(r.perfilVisual.estiloTitulo as EstiloDestaqueId);
      setEstiloCorpo(r.perfilVisual.estiloCorpo as EstiloDestaqueId);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui gerar o post agora.");
    } finally {
      setLoading(false);
    }
  }

  // Cor manual por palavra (título/corpo) - sempre ganha do destaque
  // automático da IA. Igual ao carrossel (InstagramWorkspace), só que sem
  // array de slides - aqui é um resultado único.
  function mudarCorPalavra(campo: "titulo" | "corpo", indicePalavra: number, cor: string) {
    const chave = campo === "titulo" ? "coresPalavrasTitulo" : "coresPalavrasCorpo";
    setResultado((prev) =>
      prev ? { ...prev, [chave]: { ...prev[chave], [indicePalavra]: cor } } : prev,
    );
  }

  function limparCorPalavra(campo: "titulo" | "corpo", indicePalavra: number) {
    const chave = campo === "titulo" ? "coresPalavrasTitulo" : "coresPalavrasCorpo";
    setResultado((prev) => {
      if (!prev) return prev;
      const atual = { ...prev[chave] };
      delete atual[indicePalavra];
      return { ...prev, [chave]: atual };
    });
  }

  const desenhar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !resultado || !itemEscolhido) return;
    renderPostComModelo(canvas, {
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundDataUrl: resultado.imagemFundoDataUrl,
      logoDataUrl: getBrandConfig().logoDataUrl,
      nomeEscritorio: getBrandConfig().nomeEscritorio || "Seu Escritório",
      registro: getBrandConfig().registro,
      kicker: `${itemEscolhido.tribunal} · ${new Date(itemEscolhido.data).toLocaleDateString("pt-BR")}`,
      headline: resultado.headline,
      corpo: resultado.corpo,
      perfil: resultado.perfil,
      // Post único (não carrossel) - é sempre "a peça final", então ganha
      // a mesma linha de ícones (enviar/compartilhar/salvar) que o slide
      // de fechamento do carrossel usa, pra parecer pronto pra publicar
      // igual em qualquer área (ver renderPostComModelo::iconesAcao).
      iconesAcao: true,
      fonteDestaque: fonte,
      kickerEstilo,
      estiloTitulo,
      estiloCorpo,
      tamanhoRotulo,
      tamanhoTitulo,
      tamanhoCorpo,
      tamanhoRodape,
      corDestaque: corDestaque ?? undefined,
      alinhamentoRotulo: alinhamentoRotulo ?? undefined,
      alinhamentoTitulo: alinhamentoTitulo ?? undefined,
      alinhamentoCorpo: alinhamentoCorpo ?? undefined,
      alinhamentoRodape: alinhamentoRodape ?? undefined,
      posicoes: posicoesEscolhidas,
      elementoVisual: resultado.elementoVisual,
      destaquesTitulo: resultado.destaquesTitulo,
      destaquesCorpo: resultado.destaquesCorpo,
      coresPalavrasTitulo: resultado.coresPalavrasTitulo,
      coresPalavrasCorpo: resultado.coresPalavrasCorpo,
    })
      .then(setPosicoesAtuais)
      .catch(() => {
        // fundo/logo ilegível - a arte segue sem travar
      });
  }, [
    resultado,
    itemEscolhido,
    fonte,
    kickerEstilo,
    estiloTitulo,
    estiloCorpo,
    tamanhoRotulo,
    tamanhoTitulo,
    tamanhoCorpo,
    tamanhoRodape,
    corDestaque,
    alinhamentoRotulo,
    alinhamentoTitulo,
    alinhamentoCorpo,
    alinhamentoRodape,
    posicoesEscolhidas,
  ]);

  useEffect(() => {
    desenhar();
  }, [desenhar]);

  function baixar() {
    const canvas = canvasRef.current;
    if (!canvas || !itemEscolhido) return;
    const link = document.createElement("a");
    link.download = `atlas-modelo-visual-${itemEscolhido.id}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  const pronto = referencias.length > 0 && !!itemEscolhido;

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
      <header className="pb-6 border-b border-border">
        <div className="text-[11px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1.5">
          <Wand2 className="h-3.5 w-3.5" /> Estúdio Visual
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Ensine a ATLAS a falar a linguagem visual da sua empresa
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Envie posts que vocês já usam. A ATLAS identifica o padrão visual — posição da logo,
          alinhamento do título, cores, rodapé — e gera o próximo post sobre uma decisão real
          seguindo esse mesmo padrão. Você não precisa abandonar o modelo que já existe.
        </p>
      </header>

      {/* Passo 1: referências */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
            1
          </span>
          Arraste seus posts aqui
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Quanto mais exemplos (2 a 5), melhor a ATLAS reconhece o que é padrão de verdade.
        </p>

        <div className="mt-3 flex flex-wrap gap-3">
          {referencias.map((ref, i) => (
            <div key={i} className="relative group">
              <img
                src={ref.preview}
                alt={`Referência ${i + 1}`}
                className="h-32 w-[102px] object-cover rounded-md border border-border"
              />
              <button
                onClick={() => removerReferencia(i)}
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-risk text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <label className="h-32 w-[102px] rounded-md border-2 border-dashed border-border hover:border-primary/60 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-muted-foreground transition-colors">
            <Upload className="h-5 w-5" />
            <span className="text-[10px] text-center px-1">Adicionar post</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onAdicionarReferencias}
            />
          </label>
        </div>
      </section>

      {/* Passo 2: escolher decisão */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
            2
          </span>
          Escolha uma decisão ou notícia da ATLAS
        </h2>

        {itemEscolhido ? (
          <div className="mt-3 surface rounded-lg p-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                {itemEscolhido.tribunal} ·{" "}
                {new Date(itemEscolhido.data).toLocaleDateString("pt-BR")}
              </div>
              <div className="mt-1 text-sm font-medium">{itemEscolhido.titulo}</div>
            </div>
            <button
              onClick={() => setItemEscolhido(null)}
              className="text-xs text-muted-foreground hover:text-foreground shrink-0"
            >
              Trocar
            </button>
          </div>
        ) : (
          <>
            <div className="mt-3 relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por título…"
                className="w-full rounded-md bg-surface border border-border pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="mt-3 max-h-64 overflow-y-auto surface rounded-lg divide-y divide-border/60">
              {itens.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => setItemEscolhido(item)}
                  className="w-full text-left px-4 py-2.5 hover:bg-accent/40 transition-colors"
                >
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {item.kind === "news" ? "Notícia" : "Decisão"} · {item.tribunal}
                  </div>
                  <div className="text-sm">{item.titulo}</div>
                </button>
              ))}
              {itens.length === 0 && (
                <p className="px-4 py-3 text-sm text-muted-foreground">Nada encontrado.</p>
              )}
            </div>
          </>
        )}
      </section>

      {/* Passo 3: instrução opcional */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
            3
          </span>
          Instruções adicionais (opcional)
        </h2>
        <textarea
          value={instrucao}
          onChange={(e) => setInstrucao(e.target.value)}
          placeholder="Ex: foque no impacto para o produtor rural, tom mais direto…"
          rows={2}
          className="mt-3 w-full max-w-xl bg-background border border-border rounded-md px-3 py-2 text-sm"
        />
      </section>

      <button
        onClick={gerar}
        disabled={!pronto || loading}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Gerando…" : "Gerar mantendo meu modelo visual"}
      </button>
      {!pronto && (
        <p className="mt-2 text-xs text-muted-foreground">
          Envie ao menos 1 post de referência e escolha uma decisão/notícia para gerar.
        </p>
      )}
      {erro && <p className="mt-2 text-xs text-risk">{erro}</p>}

      {/* Antes / Depois */}
      {resultado && (
        <section className="mt-10 pt-8 border-t border-border">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-opportunity/15 text-opportunity px-3 py-1 text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Modelo visual preservado
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_1fr_320px] gap-8">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
                Antes — seus posts originais
              </div>
              <div className="flex flex-wrap gap-3">
                {referencias.map((ref, i) => (
                  <img
                    key={i}
                    src={ref.preview}
                    alt={`Original ${i + 1}`}
                    className="h-48 w-[154px] object-cover rounded-md border border-border"
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-primary mb-3">
                Depois — novo post ATLAS
              </div>
              <div className="max-w-[320px]">
                <PosicionadorTexto
                  posicoes={posicoesAtuais}
                  papeisAtivos={papeisAtivosDoResultado(resultado)}
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
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
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
              <button
                onClick={baixar}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Download className="h-4 w-4" />
                Baixar imagem (PNG)
              </button>
            </div>

            {/* Personalizar - só desenha de novo, não chama a IA */}
            <div className="space-y-4">
              <ModelosVisuaisPainel
                configAtual={{
                  fonte,
                  kickerEstilo,
                  estiloTitulo,
                  estiloCorpo,
                  tamanhoRotulo,
                  tamanhoTitulo,
                  tamanhoCorpo,
                  tamanhoRodape,
                  corDestaque,
                  alinhamentoRotulo,
                  alinhamentoTitulo,
                  alinhamentoCorpo,
                  alinhamentoRodape,
                }}
                onAplicar={(c: ConfigModeloVisual) => {
                  setFonte(c.fonte as FonteDestaqueId);
                  setKickerEstilo(c.kickerEstilo as KickerEstiloId);
                  setEstiloTitulo(c.estiloTitulo as EstiloDestaqueId);
                  setEstiloCorpo(c.estiloCorpo as EstiloDestaqueId);
                  setTamanhoRotulo(c.tamanhoRotulo);
                  setTamanhoTitulo(c.tamanhoTitulo);
                  setTamanhoCorpo(c.tamanhoCorpo);
                  setTamanhoRodape(c.tamanhoRodape);
                  setCorDestaque(c.corDestaque);
                  setAlinhamentoRotulo((c.alinhamentoRotulo as AlinhamentoTexto) ?? null);
                  setAlinhamentoTitulo((c.alinhamentoTitulo as AlinhamentoTexto) ?? null);
                  setAlinhamentoCorpo((c.alinhamentoCorpo as AlinhamentoTexto) ?? null);
                  setAlinhamentoRodape((c.alinhamentoRodape as AlinhamentoTexto) ?? null);
                }}
              />

              <SeletorAlinhamento label="Alinhamento do rótulo" valor={alinhamentoRotulo} onChange={setAlinhamentoRotulo} />
              <SeletorAlinhamento label="Alinhamento do título" valor={alinhamentoTitulo} onChange={setAlinhamentoTitulo} />
              <SeletorAlinhamento label="Alinhamento do corpo" valor={alinhamentoCorpo} onChange={setAlinhamentoCorpo} />
              <SeletorAlinhamento label="Alinhamento do rodapé" valor={alinhamentoRodape} onChange={setAlinhamentoRodape} />

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
                  <div className="grid grid-cols-2 gap-2">
                    <SeletorTamanho
                      label="Rótulo"
                      valor={tamanhoRotulo}
                      onChange={setTamanhoRotulo}
                    />
                    <SeletorTamanho
                      label="Título"
                      valor={tamanhoTitulo}
                      onChange={setTamanhoTitulo}
                    />
                    <SeletorTamanho label="Corpo" valor={tamanhoCorpo} onChange={setTamanhoCorpo} />
                    <SeletorTamanho
                      label="Rodapé"
                      valor={tamanhoRodape}
                      onChange={setTamanhoRodape}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                    Cor de destaque
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={corDestaque ?? resultado.perfil.corPrimaria}
                      onChange={(e) => setCorDestaque(e.target.value)}
                      className="h-8 w-11 rounded-md border border-border bg-background cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono">
                      {corDestaque ?? resultado.perfil.corPrimaria}
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

              <div className="surface rounded-lg p-4">
                {resultado.elementoVisual && (
                  <div className="pb-3 mb-3 border-b border-border flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Este post tem um número/gráfico em destaque
                    </div>
                    <button
                      onClick={() => setResultado((prev) => (prev ? { ...prev, elementoVisual: null } : prev))}
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
                    texto={resultado.headline}
                    destaques={resultado.destaquesTitulo}
                    overrides={resultado.coresPalavrasTitulo}
                    corDestaque={corDestaque ?? resultado.perfil.corPrimaria}
                    onMudarCor={(i, cor) => mudarCorPalavra("titulo", i, cor)}
                    onLimparCor={(i) => limparCorPalavra("titulo", i)}
                  />
                  {resultado.corpo && (
                    <PalavrasColoridas
                      texto={resultado.corpo}
                      destaques={resultado.destaquesCorpo}
                      overrides={resultado.coresPalavrasCorpo}
                      corDestaque={corDestaque ?? resultado.perfil.corPrimaria}
                      onMudarCor={(i, cor) => mudarCorPalavra("corpo", i, cor)}
                      onLimparCor={(i) => limparCorPalavra("corpo", i)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 surface rounded-lg p-5">
            <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Legenda para o post
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {resultado.legenda}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function SeletorTamanho({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="text-[9px] text-muted-foreground mb-1">{label}</div>
      <select
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-xs"
      >
        {TAMANHOS_FONTE.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
