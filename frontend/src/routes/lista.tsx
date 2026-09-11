import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Filter } from "lucide-react";
import { z } from "zod";
import { opportunitiesByTipoQuery, noticiasLegislativasQuery } from "@/lib/atlas-api";
import { OpportunityCard } from "@/components/OpportunityCard";
import { cn } from "@/lib/utils";

const buscaSchema = z.object({
  tipo: z.enum(["oportunidade", "risco", "legislativa"]).catch("oportunidade"),
});

export const Route = createFileRoute("/lista")({
  validateSearch: buscaSchema,
  head: () => ({
    meta: [
      { title: "Lista completa — ATLAS" },
      {
        name: "description",
        content: "Lista completa de oportunidades, riscos ou alterações legislativas.",
      },
    ],
  }),
  loaderDeps: ({ search }) => ({ tipo: search.tipo }),
  loader: ({ context, deps }) => {
    if (typeof window === "undefined") return;
    if (deps.tipo === "legislativa") {
      context.queryClient.ensureQueryData(noticiasLegislativasQuery);
    } else {
      context.queryClient.ensureQueryData(opportunitiesByTipoQuery(deps.tipo));
    }
  },
  component: Lista,
});

const TITULOS: Record<"oportunidade" | "risco" | "legislativa", string> = {
  oportunidade: "Oportunidades",
  risco: "Riscos",
  legislativa: "Alterações legislativas",
};

function Lista() {
  const { tipo } = Route.useSearch();
  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Radar
      </Link>

      {tipo === "legislativa" ? <ListaLegislativa /> : <ListaOportunidades tipo={tipo} />}
    </div>
  );
}

function ListaOportunidades({ tipo }: { tipo: "oportunidade" | "risco" }) {
  const { data: itens } = useSuspenseQuery(opportunitiesByTipoQuery(tipo));
  const [setor, setSetor] = useState<string>("todos");

  const setores = useMemo(() => {
    const s = new Set<string>();
    for (const o of itens) for (const st of o.setores) s.add(st);
    return Array.from(s).sort();
  }, [itens]);

  const filtrados = setor === "todos" ? itens : itens.filter((o) => o.setores.includes(setor));
  const isRisk = tipo === "risco";

  return (
    <>
      <header className="mt-4 pb-6 border-b border-border">
        <div
          className={cn(
            "text-[11px] font-mono uppercase tracking-widest",
            isRisk ? "text-risk" : "text-opportunity",
          )}
        >
          {TITULOS[tipo]} · {itens.length}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Todas as {TITULOS[tipo].toLowerCase()} da base
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lista completa, não só o recorte que aparece na home.
        </p>
      </header>

      {setores.length > 1 && (
        <div className="mt-6 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Setor:
          <button
            onClick={() => setSetor("todos")}
            className={cn(
              "rounded px-2 py-0.5 border",
              setor === "todos"
                ? "border-primary text-primary"
                : "border-border hover:border-primary/50",
            )}
          >
            Todos
          </button>
          {setores.map((s) => (
            <button
              key={s}
              onClick={() => setSetor(s)}
              className={cn(
                "rounded px-2 py-0.5 border",
                setor === s
                  ? "border-primary text-primary"
                  : "border-border hover:border-primary/50",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {filtrados.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">Nada encontrado para esse filtro.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtrados.map((o) => (
            <OpportunityCard key={o.id} o={o} />
          ))}
        </div>
      )}
    </>
  );
}

function ListaLegislativa() {
  const { data: itens } = useSuspenseQuery(noticiasLegislativasQuery);

  return (
    <>
      <header className="mt-4 pb-6 border-b border-border">
        <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          Alterações legislativas · {itens.length}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Mudanças na legislação</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Publicações do Diário Oficial da União, Congresso e Medidas Provisórias. Ainda não temos
          um coletor de DOU/Congresso rodando — quando houver, aparece aqui automaticamente.
        </p>
      </header>

      {itens.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground max-w-md">
          Nenhuma alteração legislativa coletada até agora.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {itens.map((n) => (
            <li key={n.id} className="surface rounded-lg p-5">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span className="rounded px-1.5 py-0.5 border border-hi text-hi">{n.fonte}</span>
                <span>{new Date(n.publicadoEm).toLocaleDateString("pt-BR")}</span>
              </div>
              <h3 className="mt-2 text-lg font-semibold">{n.titulo}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{n.resumo}</p>
              <a
                href={n.urlOficial}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Fonte oficial <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
