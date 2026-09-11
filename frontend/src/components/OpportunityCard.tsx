import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Factory } from "lucide-react";
import type { Opportunity } from "@/lib/atlas-types";
import { impactoLabel, priorityLabel } from "@/lib/atlas-api";
import { cn } from "@/lib/utils";

const prioDot: Record<string, string> = {
  maxima: "bg-risk",
  alta: "bg-hi",
  media: "bg-neutral-info",
  baixa: "bg-muted",
};

export function OpportunityCard({ o }: { o: Opportunity }) {
  const isRisk = o.tipo === "risco";
  return (
    <Link
      to="/oportunidades/$id"
      params={{ id: o.id }}
      className="group block surface rounded-lg p-5 transition-[color,background-color,border-color,box-shadow,transform] hover:border-primary/60 hover:shadow-[0_8px_24px_-12px_var(--color-primary)] hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-mono text-muted-foreground">
            <span className={cn("ticker-dot", isRisk ? "text-risk" : "text-opportunity")} />
            <span className={isRisk ? "text-risk" : "text-opportunity"}>
              {isRisk ? "Risco" : "Oportunidade"}
            </span>
            <span>·</span>
            <span className="text-foreground">{o.tribunal}</span>
            <span>·</span>
            <span>{o.mecanismo}</span>
          </div>
          <h3 className="mt-2 text-lg font-semibold leading-snug text-foreground">{o.titulo}</h3>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-sm">
        <Factory className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="font-medium text-foreground">
            {o.setores.length > 0 ? o.setores.join(", ") : "Setor não identificado"}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {o.justificativaSetor}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", prioDot[o.prioridade])} />
          <span className="font-medium text-foreground">{priorityLabel[o.prioridade]}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Impacto {impactoLabel[o.impactoFinanceiro]}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Êxito {o.probabilidadeExito}</span>
        </div>
        <span className="inline-flex items-center gap-1 text-primary font-medium group-hover:gap-1.5 transition-all">
          Abrir dossiê
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
