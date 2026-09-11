import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { opportunitiesForMatchingQuery } from "@/lib/atlas-api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopilotChat } from "@/components/CopilotChat";

export const Route = createFileRoute("/copilot")({
  head: () => ({
    meta: [
      { title: "Copiloto ATLAS — chat e cruzamento de dados da empresa" },
      {
        name: "description",
        content:
          "Pergunte ao Copiloto ATLAS e receba respostas fundamentadas nas decisões coletadas, ou alimente dados de um cliente real para receber as teses e oportunidades cabíveis.",
      },
      { property: "og:title", content: "Copiloto ATLAS" },
      {
        property: "og:description",
        content:
          "IA que cruza a pergunta do advogado (ou a empresa do cliente) com as decisões coletadas.",
      },
    ],
  }),
  loader: ({ context }) => {
    if (typeof window === "undefined") return;
    context.queryClient.ensureQueryData(opportunitiesForMatchingQuery);
  },
  component: Copilot,
});

interface Result {
  id: string;
  titulo: string;
  tipo: "oportunidade" | "risco";
  motivo: string;
}

function Copilot() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
      <header className="pb-6 border-b border-border">
        <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5" /> Copiloto
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Copiloto ATLAS</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Pergunte livremente sobre teses, riscos e oportunidades — a ATLAS responde com fundamento
          nas decisões coletadas, ou cruze o perfil de um cliente específico contra o radar.
        </p>
      </header>

      <Tabs defaultValue="chat" className="mt-6">
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="perfil">Cruzamento por perfil</TabsTrigger>
        </TabsList>
        <TabsContent value="chat">
          <CopilotChat />
        </TabsContent>
        <TabsContent value="perfil">
          <PerfilCross />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PerfilCross() {
  const { data: opps } = useSuspenseQuery(opportunitiesForMatchingQuery);
  const [regime, setRegime] = useState("Lucro Real");
  const [setor, setSetor] = useState("Indústria");
  const [uf, setUf] = useState("SP");
  const [tributos, setTributos] = useState("PIS, COFINS, ICMS, IRPJ");
  const [notas, setNotas] = useState(
    "Cliente do agronegócio, exporta 40% da produção, possui saldo credor de ICMS acumulado.",
  );
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);

  function analisar() {
    setLoading(true);
    // local cross — will be replaced by a real LLM call via the Python backend
    setTimeout(() => {
      const tribList = tributos.split(/[,;\n]/).map((t) => t.trim().toUpperCase());
      const out: Result[] = opps
        .filter(
          (o) =>
            o.regimes.map(String).includes(regime) &&
            o.setores.some((s) => s.toLowerCase() === setor.toLowerCase()) &&
            (o.ufs.length === 0 || o.ufs.includes(uf)) &&
            o.tributos.some((t) => tribList.includes(t.toUpperCase())),
        )
        .map((o) => ({
          id: o.id,
          titulo: o.titulo,
          tipo: o.tipo,
          motivo: `Perfil casa: ${o.tributos.join("/")} · ${o.setores.filter((s) => s.toLowerCase() === setor.toLowerCase()).join(", ")} · ${uf}`,
        }));
      setResults(out);
      setLoading(false);
    }, 400);
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Informe dados tributários, contábeis e empresariais do cliente. A ATLAS retorna as teses e
        oportunidades aplicáveis, com fundamento.
      </p>

      <section className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 surface rounded-lg p-5 space-y-4">
          <Field label="Regime">
            <select
              value={regime}
              onChange={(e) => setRegime(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
            >
              {["Lucro Real", "Lucro Presumido", "Simples Nacional", "MEI"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Setor">
            <input
              value={setor}
              onChange={(e) => setSetor(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
            />
          </Field>
          <Field label="UF">
            <input
              value={uf}
              maxLength={2}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
              className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm font-mono uppercase"
            />
          </Field>
          <Field label="Tributos relevantes">
            <input
              value={tributos}
              onChange={(e) => setTributos(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
            />
          </Field>
          <Field label="Notas contábeis / operacionais">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={5}
              className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
            />
          </Field>
          <button
            onClick={analisar}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "Cruzando..." : "Cruzar com decisões"}
          </button>
        </div>

        <div className="lg:col-span-2 space-y-3">
          {!results ? (
            <div className="surface rounded-lg p-8 text-center text-sm text-muted-foreground">
              Preencha o perfil da empresa para receber teses e oportunidades aplicáveis.
            </div>
          ) : results.length === 0 ? (
            <div className="surface rounded-lg p-8 text-center text-sm text-muted-foreground">
              Nenhuma tese aplicável identificada no radar atual. Continue monitorando.
            </div>
          ) : (
            results.map((r) => (
              <a
                key={r.id}
                href={`/oportunidades/${r.id}`}
                className="surface rounded-lg p-5 block hover:border-primary/60 transition-colors"
              >
                <div className="text-[10px] font-mono uppercase tracking-widest">
                  <span className={r.tipo === "risco" ? "text-risk" : "text-opportunity"}>
                    {r.tipo === "risco" ? "Risco aplicável" : "Oportunidade aplicável"}
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-semibold">{r.titulo}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{r.motivo}</p>
              </a>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
