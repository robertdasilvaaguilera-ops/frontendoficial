import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import type { AlinhamentoTexto } from "@/lib/instagram-canvas";

const OPCOES: { id: AlinhamentoTexto; label: string; Icon: typeof AlignLeft }[] = [
  { id: "esquerda", label: "Esquerda", Icon: AlignLeft },
  { id: "centro", label: "Centro", Icon: AlignCenter },
  { id: "direita", label: "Direita", Icon: AlignRight },
];

// Botões de alinhamento, compartilhados pelas 3 telas de criação de post
// (Radar Comercial, Notícias, Estúdio Visual) - uma instância por texto
// (rótulo/título/corpo/rodapé, ver os 4 usos em cada tela), já que cada
// um pode ter seu próprio alinhamento agora. null = segue o padrão desse
// texto (do perfil visual ou "esquerda", ver renderPostComModelo).
export function SeletorAlinhamento({
  label = "Alinhamento do texto",
  valor,
  onChange,
}: {
  label?: string;
  valor: AlinhamentoTexto | null;
  onChange: (valor: AlinhamentoTexto | null) => void;
}) {
  return (
    <div className="surface rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        {valor && (
          <button onClick={() => onChange(null)} className="text-[10px] text-primary hover:underline">
            usar padrão
          </button>
        )}
      </div>
      <div className="flex gap-1.5">
        {OPCOES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            title={label}
            className={`flex-1 flex items-center justify-center rounded-md border py-1.5 transition-colors ${
              valor === id
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
