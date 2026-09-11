import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Briefcase, FileText, Sparkles, TrendingUp } from "lucide-react";
import { opportunitiesQuery, summaryQuery, impactoLabel, priorityLabel } from "@/lib/atlas-api";
import { OpportunityCard } from "@/components/OpportunityCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Radar Comercial — ATLAS" },
      {
        name: "description",
        content:
          "Oportunidades e riscos tributários do dia, ordenados por impacto econômico. Saiba antes de todos o que fazer agora.",
      },
      { property: "og:title", content: "Radar Comercial — ATLAS" },
      {
        property: "og:description",
        content: "Decisões reais do CARF, organizadas por setor afetado e fundamentação.",
      },
    ],
  }),
  loader: ({ context }) => {
    // Dados exigem login (cookie de sessão) - no servidor (SSR) essa busca
    // não tem como levar o cookie do navegador, então ficaria presa numa
    // versão desatualizada/mock. Deixa pro cliente buscar, já autenticado.
    if (typeof window === "undefined") return;
    context.queryClient.ensureQueryData(opportunitiesQuery);
    context.queryClient.ensureQueryData(summaryQuery);
  },
  component: Radar,
});

function Radar() {
  const { data: opps } = useSuspenseQuery(opportunitiesQuery);
  const { data: sum } = useSuspenseQuery(summaryQuery);
  const router = useRouter();

  // O backend já devolve ordenado por relevância interna - aqui só
  // agrupamos por prioridade pra manter a hierarquia visual estável.
  const sorted = [...opps].sort((a, b) => {
    const rank = { maxima: 3, alta: 2, media: 1, baixa: 0 } as const;
    return rank[b.prioridade] - rank[a.prioridade];
  });

  const oportunidades = sorted.filter((o) => o.tipo === "oportunidade");
  const riscos = sorted.filter((o) => o.tipo === "risco");
  const top = sorted[0];

  const now = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Radar comercial · {now}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Oportunidades do dia</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            Decisões reais do CARF, priorizadas por setor e fundamentação — não um score genérico.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className="ticker-dot text-opportunity" />
          Ao vivo · última varredura há 4 min
        </div>
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
        <Kpi
          icon={TrendingUp}
          tone="opportunity"
          label="Oportunidades"
          value={String(sum.oportunidadesHoje)}
          to={{ to: "/lista", search: { tipo: "oportunidade" } }}
        />
        <Kpi
          icon={AlertTriangle}
          tone="risk"
          label="Riscos"
          value={String(sum.riscosHoje)}
          to={{ to: "/lista", search: { tipo: "risco" } }}
        />
        <Kpi
          icon={FileText}
          label="Alterações legislativas"
          value={String(sum.alteracoesLegislativas)}
          to={{ to: "/lista", search: { tipo: "legislativa" } }}
        />
        <Kpi icon={Activity} label="Decisões relevantes" value={String(sum.decisoesRelevantes)} />
        <Kpi icon={Briefcase} label="Clientes na carteira" value={String(sum.totalClientes)} />
      </section>

      {/* Top opportunity — hero */}
      {top && (
        <section className="mt-8 surface-elevated rounded-xl p-6 md:p-8 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background:
                "radial-gradient(600px circle at 100% 0%, color-mix(in oklch, var(--color-primary) 30%, transparent), transparent 60%)",
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Destaque · Prioridade {priorityLabel[top.prioridade]}
            </div>
            <h2 className="mt-2 text-2xl md:text-3xl font-semibold leading-tight max-w-3xl">
              {top.titulo}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-3xl">{top.resumoExecutivo}</p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <HeroStat
                label="Setor(es) afetados"
                value={top.setores.length > 0 ? top.setores.join(", ") : "Não identificado"}
                accent
              />
              <HeroStat label="Impacto financeiro" value={impactoLabel[top.impactoFinanceiro]} />
              <HeroStat label="Probabilidade de êxito" value={cap(top.probabilidadeExito)} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground max-w-2xl">{top.justificativaSetor}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() =>
                  router.navigate({
                    to: "/oportunidades/$id",
                    params: { id: top.id },
                  })
                }
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Abrir dossiê + gerar parecer
              </button>
              <button
                onClick={() =>
                  router.navigate({
                    to: "/oportunidades/$id",
                    params: { id: top.id },
                    hash: "clientes",
                  })
                }
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Ver clientes afetados
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Lists */}
      <section className="mt-10 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Column label="Oportunidades priorizadas" tone="opportunity" items={oportunidades} />
        <Column label="Riscos priorizados" tone="risk" items={riscos} />
      </section>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
  accent,
  to,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  tone?: "opportunity" | "risk";
  accent?: boolean;
  to?: { to: "/lista"; search: { tipo: "oportunidade" | "risco" | "legislativa" } };
}) {
  const toneClass =
    tone === "opportunity"
      ? "text-opportunity"
      : tone === "risk"
        ? "text-risk"
        : "text-muted-foreground";
  const content = (
    <>
      <div
        className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider ${toneClass}`}
      >
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div
        className={`mt-2 tabular text-2xl font-semibold ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </div>
    </>
  );

  if (to) {
    return (
      <Link
        to={to.to}
        search={to.search}
        className="surface rounded-lg p-4 block hover:border-primary/60 transition-colors"
      >
        {content}
      </Link>
    );
  }
  return <div className="surface rounded-lg p-4">{content}</div>;
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 tabular text-xl font-semibold ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function Column({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "opportunity" | "risk";
  items: import("@/lib/atlas-types").Opportunity[];
}) {
  const toneClass = tone === "opportunity" ? "text-opportunity" : "text-risk";
  return (
    <div>
      <h2 className={`text-xs font-mono uppercase tracking-widest mb-3 ${toneClass}`}>
        {label} · {items.length}
      </h2>
      <div className="space-y-3">
        {items.map((o) => (
          <OpportunityCard key={o.id} o={o} />
        ))}
      </div>
    </div>
  );
}
