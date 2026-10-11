import { useEffect, useState } from "react";
import { Loader2, Save, Trash2, Wand2 } from "lucide-react";
import {
  listarModelosVisuais,
  criarModeloVisual,
  removerModeloVisual,
  type ConfigModeloVisual,
  type ModeloVisual,
} from "@/lib/atlas-api";

interface ModelosVisuaisPainelProps {
  configAtual: ConfigModeloVisual;
  onAplicar: (config: ConfigModeloVisual) => void;
}

// Painel de "salvar estilo" reaproveitado no InstagramWorkspace e no Estúdio
// Visual - os dois têm exatamente as mesmas 9 variáveis de customização, só
// muda quem chama. Ideia: configurar a fonte/tamanho/cor uma vez, salvar com
// um nome, e nas próximas vezes só clicar em aplicar.
export function ModelosVisuaisPainel({ configAtual, onAplicar }: ModelosVisuaisPainelProps) {
  const [modelos, setModelos] = useState<ModeloVisual[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nomeNovo, setNomeNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true);
    try {
      setModelos(await listarModelosVisuais());
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const salvar = async () => {
    const nome = nomeNovo.trim();
    if (!nome) return;
    setSalvando(true);
    setErro(null);
    try {
      const criado = await criarModeloVisual(nome, configAtual);
      setModelos((atuais) => [criado, ...atuais]);
      setNomeNovo("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui salvar o modelo agora.");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (id: string) => {
    setModelos((atuais) => atuais.filter((m) => m.id !== id));
    await removerModeloVisual(id);
  };

  return (
    <div className="surface rounded-lg p-4 space-y-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        Modelos de estilo salvos
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando...
        </div>
      ) : modelos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum modelo salvo ainda. Configure o estilo abaixo e salve pra reaproveitar depois.
        </p>
      ) : (
        <div className="space-y-1.5">
          {modelos.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
            >
              <button
                onClick={() => onAplicar(m.config)}
                className="flex-1 inline-flex items-center gap-1.5 text-left text-xs font-medium hover:text-primary"
              >
                <Wand2 className="h-3.5 w-3.5 shrink-0" />
                {m.nome}
              </button>
              <button
                onClick={() => remover(m.id)}
                className="text-muted-foreground hover:text-risk"
                title="Remover modelo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <input
          value={nomeNovo}
          onChange={(e) => setNomeNovo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && salvar()}
          placeholder="Nome do estilo atual"
          className="flex-1 bg-background border border-border rounded-md px-2.5 py-1.5 text-xs"
        />
        <button
          onClick={salvar}
          disabled={salvando || !nomeNovo.trim()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {salvando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Salvar
        </button>
      </div>
      {erro && <p className="text-xs text-risk">{erro}</p>}
    </div>
  );
}
