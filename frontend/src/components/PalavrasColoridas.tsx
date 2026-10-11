import { calcularCoresPalavras, tokenizarPalavras } from "@/lib/instagram-canvas";

interface PalavrasColoridasProps {
  texto: string;
  destaques: string[];
  overrides: Record<number, string> | undefined;
  corDestaque: string;
  onMudarCor: (indice: number, cor: string) => void;
  onLimparCor: (indice: number) => void;
}

// Editor de cor por palavra, tipo Canva - cada palavra do título/corpo é
// clicável e abre o seletor de cor nativo do navegador. Palavras com
// destaque automático (número/dado real identificado pela IA - ver
// ai/carrossel.py) já nascem coloridas; clicar nelas troca pra uma cor
// manual, que sempre tem prioridade. O "×" só aparece em quem tem cor
// manual, pra voltar ao padrão (automático ou nenhum).
export function PalavrasColoridas({
  texto,
  destaques,
  overrides,
  corDestaque,
  onMudarCor,
  onLimparCor,
}: PalavrasColoridasProps) {
  const palavras = tokenizarPalavras(texto);
  if (palavras.length === 0) return null;
  const cores = calcularCoresPalavras(palavras, destaques, overrides, corDestaque);

  return (
    <div className="flex flex-wrap gap-1">
      {palavras.map((palavra, i) => {
        const corAtual = cores[i];
        const manual = overrides?.[i] !== undefined;
        return (
          <span key={i} className="inline-flex items-center">
            <label
              className={`cursor-pointer rounded px-1.5 py-0.5 text-xs border transition-colors ${
                manual
                  ? "border-primary/50"
                  : corAtual
                    ? "border-transparent"
                    : "border-transparent hover:border-border"
              }`}
              style={corAtual ? { color: corAtual } : undefined}
              title={
                manual
                  ? "Cor manual — clique pra trocar"
                  : "Clique pra escolher a cor dessa palavra"
              }
            >
              {palavra}
              <input
                type="color"
                value={corAtual ?? "#ffffff"}
                onChange={(e) => onMudarCor(i, e.target.value)}
                className="hidden"
              />
            </label>
            {manual && (
              <button
                type="button"
                onClick={() => onLimparCor(i)}
                className="text-[10px] text-muted-foreground hover:text-risk leading-none"
                title="Remover cor manual"
              >
                ×
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
