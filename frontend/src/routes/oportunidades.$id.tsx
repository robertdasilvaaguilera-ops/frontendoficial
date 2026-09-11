import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Instagram, Building2, Factory, MapPin } from "lucide-react";
import { impactoLabel, opportunityQuery, priorityLabel, clientsQuery } from "@/lib/atlas-api";
import { InstagramWorkspace } from "@/components/InstagramWorkspace";
import { ParecerPanel } from "@/components/ParecerPanel";

export const Route = createFileRoute("/oportunidades/$id")({
  head: () => ({
    meta: [
      { title: "Oportunidade — ATLAS" },
      {
        name: "description",
        content: "Dossiê técnico e comercial de oportunidade tributária.",
      },
    ],
  }),
  loader: async ({ params, context }) => {
    // No servidor (SSR) essa busca não leva o cookie de sessão do
    // navegador, então sempre voltaria vazia (dado exige login) - o que
    // faria uma oportunidade real parecer "não encontrada" só por causa do
    // 401. Deixa o servidor pular a busca; o cliente já autenticado busca
    // e resolve normalmente (ver useSuspenseQuery abaixo).
    if (typeof window === "undefined") return null;
    const o = await context.queryClient.ensureQueryData(opportunityQuery(params.id));
    if (!o) throw notFound();
    context.queryClient.ensureQueryData(clientsQuery);
    return o;
  },
  component: OpportunityPage,
});

function OpportunityPage() {
  const { id } = Route.useParams();
  const { data: o } = useSuspenseQuery(opportunityQuery(id));
  const { data: clients } = useSuspenseQuery(clientsQuery);
  if (!o) return null;

  const isRisk = o.tipo === "risco";
  const carteiraMatch = clients.filter(
    (c) =>
      o.setores.includes(c.setor) &&
      (o.ufs.length === 0 || o.ufs.includes(c.uf)) &&
      c.tributosRelevantes.some((t) => o.tributos.includes(t)),
  );

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Radar
      </Link>

      <header className="mt-4 flex items-start justify-between gap-6 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest">
            <span className={`ticker-dot ${isRisk ? "text-risk" : "text-opportunity"}`} />
            <span className={isRisk ? "text-risk" : "text-opportunity"}>
              {isRisk ? "Risco" : "Oportunidade"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-foreground">{o.tribunal}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{priorityLabel[o.prioridade]}</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight max-w-3xl">{o.titulo}</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-3xl">{o.resumoExecutivo}</p>
        </div>
      </header>

      {/* Setor(es) afetados + justificativa */}
      <section className="mt-6 surface-elevated rounded-lg p-5">
        <div className="flex items-start gap-3">
          <Factory className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Setor(es) afetados
            </div>
            <div className="mt-1 text-lg font-semibold">
              {o.setores.length > 0 ? o.setores.join(", ") : "Não identificado automaticamente"}
            </div>
            <p className="mt-1 text-sm text-muted-foreground max-w-3xl">{o.justificativaSetor}</p>
          </div>
        </div>
      </section>

      {/* Metric strip */}
      <section className="mt-6 grid grid-cols-2 gap-3 max-w-md">
        <Metric label="Impacto" value={impactoLabel[o.impactoFinanceiro]} accent />
        <Metric label="Sua carteira" value={String(carteiraMatch.length)} accent />
      </section>

      {/* 2-col grid */}
      <section className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — parecer + decisão */}
        <div className="lg:col-span-2 space-y-6">
          <Panel title="Decisão / Ato normativo">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm font-semibold">{o.decisao.numero}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {o.decisao.orgao}
                  {o.decisao.relator ? ` · ${o.decisao.relator}` : ""} ·{" "}
                  {new Date(o.decisao.data).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <a
                href={o.decisao.urlOficial}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                Abrir inteiro teor <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="mt-3 text-sm text-foreground/90 leading-relaxed">{o.decisao.ementa}</p>
          </Panel>

          <Panel title="Parecer técnico">
            <ParecerPanel opportunityId={o.id} />
          </Panel>
        </div>

        {/* Right — carteira + metadados */}
        <div className="space-y-6">
          <Panel title={`Sua carteira (${carteiraMatch.length})`} id="clientes">
            {carteiraMatch.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum cliente cadastrado casa com este perfil.
              </p>
            ) : (
              <ul className="space-y-2">
                {carteiraMatch.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-start justify-between gap-3 text-sm border-b border-border/60 pb-2 last:border-0"
                  >
                    <div>
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3" /> {c.setor} · {c.regime}
                        <MapPin className="h-3 w-3 ml-1" /> {c.cidade}/{c.uf}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Perfil">
            <MetaRow label="Tributos" value={o.tributos.join(" · ")} />
            <MetaRow label="Regimes" value={o.regimes.join(" · ")} />
            <MetaRow label="Setores" value={o.setores.join(" · ")} />
            <MetaRow label="CNAEs" value={o.cnaes.join(" · ")} />
            <MetaRow label="Estabilidade" value={cap(o.estabilidade)} />
            <MetaRow label="Novidade" value={cap(o.novidade)} />
            <MetaRow label="Tempo estimado" value={`${o.tempoEstimadoDias} dias`} />
          </Panel>
        </div>
      </section>

      {/* Workspace de criação para Instagram */}
      <section className="mt-8">
        <div className="surface rounded-lg p-5 lg:p-6">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-primary">
            <Instagram className="h-3.5 w-3.5" /> Conteúdo
          </div>
          <div className="mt-6">
            <InstagramWorkspace
              item={{
                id: o.id,
                kind: "opportunities",
                titulo: o.titulo,
                tribunal: o.tribunal,
                data: o.decisao.data,
                resumoExecutivo: o.resumoExecutivo,
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="surface rounded-lg p-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 tabular font-semibold ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function Panel({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="surface rounded-lg p-5">
      <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm border-b border-border/60 pb-2 last:border-0">
      <span className="text-muted-foreground text-xs uppercase tracking-wider font-mono">
        {label}
      </span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
