import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { gerarParecer, type ParecerTecnico } from "@/lib/atlas-api";

type Campos = Omit<ParecerTecnico, "historico">;

const LABELS: Record<keyof Campos, string> = {
  fatos: "Fatos",
  arguido: "Arguido (Fazenda)",
  defendido: "Defendido (Contribuinte)",
  contestado: "Contestado",
  fundamentacao: "Fundamentação jurídica",
  dispositivo: "Dispositivo",
  aplicacaoPratica: "Aplicação prática",
};

export function ParecerPanel({ opportunityId }: { opportunityId: string }) {
  const [parecer, setParecer] = useState<Campos | null>(null);
  const [historico, setHistorico] = useState<Array<{ role: string; content: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [ajuste, setAjuste] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function gerar(ajusteTexto?: string) {
    setLoading(true);
    setErro(null);
    try {
      const usaHistorico = Boolean(ajusteTexto);
      const r = await gerarParecer(opportunityId, ajusteTexto, usaHistorico ? historico : []);
      const { historico: novoHistorico, ...campos } = r;
      setParecer(campos);
      setHistorico(novoHistorico);
      setAjuste("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui gerar o parecer agora.");
    } finally {
      setLoading(false);
    }
  }

  if (!parecer) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Gere um parecer técnico completo desta decisão — fatos, argumentos, fundamentação e
          aplicação prática, direto do texto oficial.
        </p>
        <button
          onClick={() => gerar()}
          disabled={loading}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading ? "Gerando…" : "Gerar parecer"}
        </button>
        {erro && <p className="mt-3 text-xs text-risk">{erro}</p>}
      </div>
    );
  }

  const camposPreenchidos = (Object.keys(LABELS) as (keyof Campos)[]).filter((campo) =>
    parecer[campo]?.trim(),
  );

  return (
    <div className="space-y-3">
      {camposPreenchidos.map((campo) => (
        <div key={campo}>
          <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
            {LABELS[campo]}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">{parecer[campo]}</p>
        </div>
      ))}

      <div className="pt-2 border-t border-border/60">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 mt-2">
          Peça um ajuste
        </div>
        <div className="flex gap-2">
          <input
            value={ajuste}
            onChange={(e) => setAjuste(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ajuste.trim()) gerar(ajuste);
            }}
            placeholder="Ex: seja mais cauteloso na aplicação prática…"
            className="flex-1 bg-background border border-border rounded-md px-2.5 py-2 text-xs"
          />
          <button
            onClick={() => ajuste.trim() && gerar(ajuste)}
            disabled={loading || !ajuste.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            Ajustar
          </button>
        </div>
        {erro && <p className="mt-2 text-xs text-risk">{erro}</p>}
      </div>
    </div>
  );
}
