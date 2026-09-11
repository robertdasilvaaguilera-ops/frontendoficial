import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search, Sparkles } from "lucide-react";
import { clientsQuery, opportunitiesQuery } from "@/lib/atlas-api";
import { ClientFormModal } from "@/components/ClientFormModal";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Minha Carteira — ATLAS" },
      {
        name: "description",
        content:
          "Cadastre seus clientes por regime, setor, tributo e UF. A ATLAS cruza automaticamente com oportunidades tributárias do dia.",
      },
      { property: "og:title", content: "Minha Carteira — ATLAS" },
      {
        property: "og:description",
        content: "Match automático entre carteira e oportunidades.",
      },
    ],
  }),
  loader: ({ context }) => {
    if (typeof window === "undefined") return;
    context.queryClient.ensureQueryData(clientsQuery);
    context.queryClient.ensureQueryData(opportunitiesQuery);
  },
  component: Clientes,
});

function Clientes() {
  const { data: clients } = useSuspenseQuery(clientsQuery);
  const { data: opps } = useSuspenseQuery(opportunitiesQuery);
  const [q, setQ] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const queryClient = useQueryClient();

  const rows = useMemo(() => {
    return clients
      .map((c) => {
        const matches = opps.filter(
          (o) =>
            o.setores.includes(c.setor) &&
            (o.ufs.length === 0 || o.ufs.includes(c.uf)) &&
            c.tributosRelevantes.some((t) => o.tributos.includes(t)),
        );
        return { c, matches };
      })
      .filter(({ c }) =>
        [c.nome, c.setor, c.uf, c.cnpj, c.regime].join(" ").toLowerCase().includes(q.toLowerCase()),
      );
  }, [clients, opps, q]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Minha carteira
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {clients.length} clientes ativos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Match automático com oportunidades e riscos do dia.
          </p>
        </div>
        <button
          onClick={() => setFormAberto(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Adicionar cliente
        </button>
      </header>

      {formAberto && (
        <ClientFormModal
          onClose={() => setFormAberto(false)}
          onCriado={() => queryClient.invalidateQueries({ queryKey: ["clients"] })}
        />
      )}

      <div className="mt-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, CNPJ, setor, UF..."
          className="w-full rounded-md bg-surface border border-border pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="mt-6 surface rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-surface-elevated">
            <tr>
              <Th>Cliente</Th>
              <Th>CNPJ</Th>
              <Th>Regime</Th>
              <Th>Setor</Th>
              <Th>UF</Th>
              <Th>Tributos</Th>
              <Th className="text-right">Matches hoje</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, matches }) => (
              <tr key={c.id} className="border-t border-border/60 hover:bg-accent/30">
                <Td>
                  <div className="font-medium">{c.nome}</div>
                  <div className="text-xs text-muted-foreground">{c.cidade}</div>
                </Td>
                <Td className="font-mono text-xs">{c.cnpj}</Td>
                <Td>{c.regime}</Td>
                <Td>{c.setor}</Td>
                <Td className="font-mono">{c.uf}</Td>
                <Td className="text-xs">{c.tributosRelevantes.join(", ")}</Td>
                <Td className="text-right">
                  {matches.length > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                      <Sparkles className="h-3 w-3" />
                      {matches.length}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left px-4 py-2.5 font-normal ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
