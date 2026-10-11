import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bookmark,
  Building2,
  MessageCircle,
  Scale,
  Share2,
  ShieldAlert,
  Sparkles,
  Target,
  Loader2,
  ArrowLeft,
  Wand2,
} from "lucide-react";
import {
  buscarProspeccaoPrioritarias,
  type ItemProspeccao,
  type NivelPotencial,
} from "@/lib/atlas-api";
import { useSessaoAtual } from "@/components/AuthGate";
import { InstagramWorkspace } from "@/components/InstagramWorkspace";
import type { PostableItem } from "@/components/InstagramPostStudio";

export const Route = createFileRoute("/prospeccao")({
  head: () => ({
    meta: [
      { title: "Prospecção B2B — ATLAS" },
      {
        name: "description",
        content:
          "A ATLAS identifica quais decisões do dia têm potencial real de virar conteúdo de autoridade e prospecção para advogados e contadores.",
      },
    ],
  }),
  component: Prospeccao,
});

const CLASSIFICACAO_LABEL: Record<string, string> = {
  oportunidade: "Oportunidade",
  risco: "Risco",
  informativo: "Informativo",
};

const CLASSIFICACAO_CLASSE: Record<string, string> = {
  oportunidade: "text-opportunity border-opportunity/40 bg-opportunity/10",
  risco: "text-risk border-risk/40 bg-risk/10",
  informativo: "text-neutral-info border-neutral-info/40 bg-neutral-info/10",
};

const NIVEL_LABEL: Record<NivelPotencial, string> = {
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
};
const NIVEL_CLASSE: Record<NivelPotencial, string> = {
  alto: "text-opportunity",
  medio: "text-hi",
  baixo: "text-muted-foreground",
};

function Prospeccao() {
  const sessao = useSessaoAtual();

  // Prospecção B2B é um recurso avançado - básico só tem Radar e Notícias.
  // O backend já bloqueia (403) quem não tem acesso, isso aqui evita nem
  // tentar buscar os dados pra quem não pode ver de qualquer forma.
  if (sessao?.limites.recursosAvancados === false) {
    return (
      <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-8">
        <div className="surface rounded-lg p-8 flex flex-col items-center text-center gap-3">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-medium">Prospecção B2B não está no seu nível de acesso</div>
          <p className="text-xs text-muted-foreground max-w-sm">
            Seu nível de acesso é limitado a Radar Comercial e Notícias.
          </p>
        </div>
      </div>
    );
  }

  return <ProspeccaoConteudo />;
}

function ProspeccaoConteudo() {
  const [tipo, setTipo] = useState<"opportunities" | "news">("opportunities");
  const [itens, setItens] = useState<ItemProspeccao[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<ItemProspeccao | null>(null);

  async function buscar() {
    setCarregando(true);
    setErro(null);
    setItens(null);
    try {
      const r = await buscarProspeccaoPrioritarias(tipo, 5);
      setItens(r);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui buscar as decisões agora.");
    } finally {
      setCarregando(false);
    }
  }

  if (selecionado) {
    return <DossieProspeccao item={selecionado} onVoltar={() => setSelecionado(null)} />;
  }

  return (
    <div className="max-w-[900px] mx-auto px-6 lg:px-10 py-8">
      <header className="pb-6 border-b border-border">
        <div className="text-[11px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" /> Prospecção B2B
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">O que virar conteúdo hoje</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          A ATLAS não sugere toda decisão relevante — só as que têm potencial real de atrair cliente
          pra um advogado ou contador. Cada uma vem com público-alvo, ângulo de prospecção e o
          carrossel pronto pra publicar.
        </p>
      </header>

      <div className="mt-6 inline-flex rounded-md border border-border overflow-hidden">
        {(["opportunities", "news"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTipo(t);
              setItens(null);
            }}
            className={`px-4 py-2 text-xs font-medium ${
              tipo === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t === "opportunities" ? "Decisões" : "Notícias"}
          </button>
        ))}
      </div>

      {itens === null && !carregando && (
        <div className="mt-6 surface rounded-lg p-8 flex flex-col items-center text-center gap-3">
          <Sparkles className="h-6 w-6 text-primary" />
          <p className="text-sm text-muted-foreground max-w-md">
            A análise cruza potencial econômico, alcance e ângulo de prospecção de cada decisão do
            dia. Na primeira vez pode levar até 2 minutos — depois disso fica salvo.
          </p>
          <button
            onClick={buscar}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className="h-4 w-4" /> Analisar{" "}
            {tipo === "opportunities" ? "decisões" : "notícias"} de hoje
          </button>
        </div>
      )}

      {carregando && (
        <div className="mt-6 surface rounded-lg p-8 flex flex-col items-center text-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Cruzando potencial econômico, público-alvo e ângulo de prospecção…
          </p>
        </div>
      )}

      {erro && <p className="mt-4 text-sm text-risk">{erro}</p>}

      {itens && itens.length === 0 && !carregando && (
        <div className="mt-6 surface rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nada com potencial de prospecção suficiente hoje. Tente de novo mais tarde ou olhe{" "}
            {tipo === "opportunities" ? "notícias" : "decisões"}.
          </p>
        </div>
      )}

      {itens && itens.length > 0 && (
        <div className="mt-6">
          <div className="text-sm text-muted-foreground mb-3">
            {itens.length} {itens.length === 1 ? "item identificado" : "itens identificados"} hoje
            com alto potencial de conteúdo
          </div>
          <div className="space-y-3">
            {itens.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelecionado(item)}
                className="w-full text-left surface rounded-lg p-4 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CLASSIFICACAO_CLASSE[item.analise.classificacao]}`}
                      >
                        {CLASSIFICACAO_LABEL[item.analise.classificacao]}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        {item.tribunal} · índice {Math.round(item.indice.indiceProspeccao)}
                      </span>
                    </div>
                    <div className="mt-1.5 text-sm font-medium line-clamp-2">{item.titulo}</div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {item.analise.quemEAfetado}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Secao({
  numero,
  titulo,
  icone: Icone,
  children,
}: {
  numero: number;
  titulo: string;
  icone: typeof Target;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
          {numero}
        </span>
        <Icone className="h-3.5 w-3.5 text-muted-foreground" />
        {titulo}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CardPotencial({
  icone: Icone,
  label,
  potencial,
}: {
  icone: typeof Share2;
  label: string;
  potencial: { nivel: NivelPotencial; motivo: string };
}) {
  return (
    <div className="surface rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icone className="h-3.5 w-3.5" /> {label}
        </div>
        <span className={`text-xs font-semibold ${NIVEL_CLASSE[potencial.nivel]}`}>
          {NIVEL_LABEL[potencial.nivel]}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{potencial.motivo}</p>
    </div>
  );
}

function DossieProspeccao({ item, onVoltar }: { item: ItemProspeccao; onVoltar: () => void }) {
  const [gerarCarrossel, setGerarCarrossel] = useState(false);
  const { analise } = item;

  const postableItem: PostableItem = {
    id: item.id,
    kind: item.tipo,
    titulo: item.titulo,
    tribunal: item.tribunal,
    data: item.data,
    resumoExecutivo: analise.porQueRelevante,
  };

  return (
    <div className="max-w-[900px] mx-auto px-6 lg:px-10 py-8">
      <button
        onClick={onVoltar}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar pra lista
      </button>

      <Secao numero={1} titulo="Decisão" icone={Scale}>
        <div className="surface rounded-lg p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CLASSIFICACAO_CLASSE[analise.classificacao]}`}
            >
              {CLASSIFICACAO_LABEL[analise.classificacao]}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {item.tribunal} · {new Date(item.data).toLocaleDateString("pt-BR")} · índice de
              potencial {Math.round(item.indice.indiceProspeccao)}/100
            </span>
          </div>
          <div className="mt-2 text-sm font-medium">{item.titulo}</div>
        </div>
      </Secao>

      <Secao numero={2} titulo="Por que é relevante" icone={Sparkles}>
        <p className="text-sm text-foreground/90 leading-relaxed">{analise.porQueRelevante}</p>
      </Secao>

      <Secao numero={3} titulo="Quem é afetado" icone={Building2}>
        <p className="text-sm text-foreground/90 leading-relaxed">{analise.quemEAfetado}</p>
      </Secao>

      <Secao numero={4} titulo="Público-alvo" icone={Target}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="surface rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Advogado
            </div>
            <p className="mt-1.5 text-xs text-foreground/90 leading-relaxed">
              {analise.publicoAlvo.advogado}
            </p>
          </div>
          <div className="surface rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Contador
            </div>
            <p className="mt-1.5 text-xs text-foreground/90 leading-relaxed">
              {analise.publicoAlvo.contador}
            </p>
          </div>
          <div className="surface rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Empresário
            </div>
            <p className="mt-1.5 text-xs text-foreground/90 leading-relaxed">
              {analise.publicoAlvo.empresario}
            </p>
          </div>
        </div>
      </Secao>

      <Secao numero={5} titulo="Ângulo de prospecção" icone={Wand2}>
        <p className="text-sm text-foreground/90 leading-relaxed">{analise.anguloProspeccao}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CardPotencial
            icone={Share2}
            label="Compartilhamento"
            potencial={analise.potencialCompartilhamento}
          />
          <CardPotencial
            icone={Bookmark}
            label="Salvamento"
            potencial={analise.potencialSalvamento}
          />
          <CardPotencial
            icone={MessageCircle}
            label="Conversa comercial"
            potencial={analise.potencialConversaComercial}
          />
        </div>
        {!gerarCarrossel && (
          <button
            onClick={() => setGerarCarrossel(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className="h-4 w-4" /> Gerar carrossel com esse ângulo
          </button>
        )}
      </Secao>

      {gerarCarrossel && (
        <Secao numero={6} titulo="Carrossel, imagem e legenda" icone={Sparkles}>
          <InstagramWorkspace
            item={postableItem}
            anguloProspeccaoInicial={analise.anguloProspeccao}
          />
        </Secao>
      )}
    </div>
  );
}
