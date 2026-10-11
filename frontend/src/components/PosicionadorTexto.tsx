import { useCallback, useRef, useState, type ReactNode } from "react";
import { Move, Maximize2 } from "lucide-react";
import {
  ESCALA_GRAFICO_MAX,
  ESCALA_GRAFICO_MIN,
  ESCALA_GRAFICO_PADRAO,
  ESCALA_LOGO_MAX,
  ESCALA_LOGO_MIN,
  ESCALA_LOGO_PADRAO,
  type ChaveArrasto,
  type PosicoesTexto,
} from "@/lib/instagram-canvas";

const PAPEL_LABEL: Record<Exclude<ChaveArrasto, "logo">, string> = {
  rotulo: "Rótulo",
  titulo: "Título",
  corpo: "Corpo",
  rodape: "Rodapé",
  grafico: "Gráfico",
};

// Papéis que ganham alça de redimensionar (além da de mover) - cada um
// com seus próprios limites e valor padrão, ver ESCALA_LOGO_*/
// ESCALA_GRAFICO_* em instagram-canvas.ts.
const LIMITES_REDIMENSIONAR: Partial<Record<ChaveArrasto, { min: number; max: number; padrao: number }>> = {
  logo: { min: ESCALA_LOGO_MIN, max: ESCALA_LOGO_MAX, padrao: ESCALA_LOGO_PADRAO },
  grafico: { min: ESCALA_GRAFICO_MIN, max: ESCALA_GRAFICO_MAX, padrao: ESCALA_GRAFICO_PADRAO },
};

// Limiar de "encaixou" (fração do canvas) pras guias de alinhamento -
// centro do canvas ou posição de outro elemento ativo. ~1.2% dá uma
// margem generosa o bastante pra sentir o "click" do encaixe sem exigir
// precisão de pixel do usuário.
const LIMIAR_ENCAIXE = 0.012;

// Overlay de arrastar por cima de um <canvas> (passado como children) -
// uma alça por texto ativo (e, pra logo/gráfico, uma alça de mover + uma
// de redimensionar), que o usuário arrasta pra qualquer ponto da imagem.
// `posicoes` vem do valor devolvido por renderPostComModelo (a posição
// EFETIVA de cada elemento, arrastado ou padrão), então a alça sempre
// nasce exatamente em cima do elemento de verdade, nunca desalinhada.
// Usa % (não pixel) pra funcionar em qualquer tamanho de exibição do
// canvas, já que ele escala via CSS mas desenha numa resolução fixa.
//
// Durante o arrasto, mostra guias tipo Canva: uma linha quando o elemento
// fica centralizado no canvas (vertical/horizontal), ou alinhado com
// outro elemento ativo - com pequeno "encaixe" (snap) nesses pontos.
export function PosicionadorTexto({
  posicoes,
  papeisAtivos,
  onMover,
  onRedimensionarLogo,
  onRedimensionarGrafico,
  children,
}: {
  posicoes: PosicoesTexto;
  papeisAtivos: ChaveArrasto[];
  onMover: (papel: ChaveArrasto, xPct: number, yPct: number) => void;
  onRedimensionarLogo?: (escala: number) => void;
  onRedimensionarGrafico?: (escala: number) => void;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState<ChaveArrasto | null>(null);
  const [redimensionando, setRedimensionando] = useState<ChaveArrasto | null>(null);
  const redimRef = useRef<{ x: number; y: number; escalaInicial: number } | null>(null);
  const [guias, setGuias] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });

  const onRedimensionarPorPapel: Partial<Record<ChaveArrasto, (escala: number) => void>> = {
    logo: onRedimensionarLogo,
    grafico: onRedimensionarGrafico,
  };

  const candidatosDeEncaixe = useCallback(
    (papelAtual: ChaveArrasto) => {
      const xs = [0.5];
      const ys = [0.5];
      for (const papel of papeisAtivos) {
        if (papel === papelAtual) continue;
        const pos = posicoes[papel];
        if (!pos) continue;
        xs.push(pos.xPct);
        ys.push(pos.yPct);
      }
      return { xs, ys };
    },
    [papeisAtivos, posicoes],
  );

  const moverPara = useCallback(
    (clientX: number, clientY: number, papel: ChaveArrasto) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      let xPct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      let yPct = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));

      const { xs, ys } = candidatosDeEncaixe(papel);
      const guiasX: number[] = [];
      const guiasY: number[] = [];
      for (const cx of xs) {
        if (Math.abs(xPct - cx) < LIMIAR_ENCAIXE) {
          xPct = cx;
          guiasX.push(cx);
        }
      }
      for (const cy of ys) {
        if (Math.abs(yPct - cy) < LIMIAR_ENCAIXE) {
          yPct = cy;
          guiasY.push(cy);
        }
      }
      setGuias({ x: guiasX, y: guiasY });
      onMover(papel, xPct, yPct);
    },
    [candidatosDeEncaixe, onMover],
  );

  function iniciarArrasto(papel: ChaveArrasto) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setArrastando(papel);
      moverPara(e.clientX, e.clientY, papel);
    };
  }

  function iniciarRedimensionamento(papel: ChaveArrasto) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const limites = LIMITES_REDIMENSIONAR[papel];
      redimRef.current = {
        x: e.clientX,
        y: e.clientY,
        escalaInicial: posicoes[papel]?.escala ?? limites?.padrao ?? 1,
      };
      setRedimensionando(papel);
    };
  }

  function aoMover(e: React.PointerEvent) {
    if (redimensionando && redimRef.current) {
      const aplicar = onRedimensionarPorPapel[redimensionando];
      const limites = LIMITES_REDIMENSIONAR[redimensionando];
      if (aplicar && limites) {
        const delta = e.clientX - redimRef.current.x + (e.clientY - redimRef.current.y);
        const novaEscala = Math.min(
          limites.max,
          Math.max(limites.min, redimRef.current.escalaInicial + delta / 140),
        );
        aplicar(novaEscala);
      }
      return;
    }
    if (!arrastando) return;
    moverPara(e.clientX, e.clientY, arrastando);
  }

  function pararArrasto() {
    setArrastando(null);
    setRedimensionando(null);
    redimRef.current = null;
    setGuias({ x: [], y: [] });
  }

  return (
    <div
      ref={containerRef}
      className="relative select-none touch-none"
      onPointerMove={aoMover}
      onPointerUp={pararArrasto}
      onPointerCancel={pararArrasto}
    >
      {children}

      {/* Guias de alinhamento (estilo Canva) - só aparecem durante o
          arrasto, quando o elemento encaixa no centro do canvas ou na
          posição de outro elemento ativo. */}
      {guias.x.map((gx) => (
        <div
          key={`gx-${gx}`}
          className="absolute top-0 bottom-0 w-px bg-pink-500 pointer-events-none z-20"
          style={{ left: `${gx * 100}%` }}
        />
      ))}
      {guias.y.map((gy) => (
        <div
          key={`gy-${gy}`}
          className="absolute left-0 right-0 h-px bg-pink-500 pointer-events-none z-20"
          style={{ top: `${gy * 100}%` }}
        />
      ))}

      {papeisAtivos.map((papel) => {
        const pos = posicoes[papel];
        if (!pos) return null;
        const ativo = arrastando === papel;
        const onRedimensionar = onRedimensionarPorPapel[papel];

        if (papel === "logo" || papel === "grafico") {
          const larguraPct = pos.larguraPct ?? 0.08;
          const alturaPct = pos.alturaPct ?? 0.08;
          const label = papel === "logo" ? "logo" : "gráfico";
          return (
            <div key={papel}>
              <button
                type="button"
                onPointerDown={iniciarArrasto(papel)}
                title={`Arrastar ${label}`}
                className={`absolute z-10 flex items-center justify-center h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-lg cursor-move transition-colors ${
                  ativo
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-primary/70 bg-black/70 text-white hover:border-primary hover:bg-black/85"
                }`}
                style={{ left: `${pos.xPct * 100}%`, top: `${pos.yPct * 100}%` }}
              >
                <Move className="h-3.5 w-3.5" />
              </button>
              {onRedimensionar && (
                <button
                  type="button"
                  onPointerDown={iniciarRedimensionamento(papel)}
                  title={`Redimensionar ${label}`}
                  className={`absolute z-10 flex items-center justify-center h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-lg cursor-nwse-resize transition-colors ${
                    redimensionando === papel
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-primary/70 bg-black/70 text-white hover:border-primary"
                  }`}
                  style={{
                    left: `${(pos.xPct + larguraPct) * 100}%`,
                    top: `${(pos.yPct + alturaPct) * 100}%`,
                  }}
                >
                  <Maximize2 className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          );
        }

        // O rótulo fica afastado do ponto real do texto (não em cima
        // dele) - só um pontinho discreto marca a posição exata; assim dá
        // pra ver o resultado de verdade enquanto arrasta, em vez do
        // texto ficar tampado pela própria etiqueta.
        return (
          <div
            key={papel}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.xPct * 100}%`, top: `${pos.yPct * 100}%` }}
          >
            <div
              className={`h-1.5 w-1.5 rounded-full ${ativo ? "bg-primary" : "bg-primary/70"}`}
            />
            <button
              type="button"
              onPointerDown={iniciarArrasto(papel)}
              title={`Arrastar ${PAPEL_LABEL[papel].toLowerCase()}`}
              className={`absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full rounded-full border-2 px-2 py-1 text-[9px] font-mono uppercase tracking-wider whitespace-nowrap shadow-lg cursor-move transition-colors ${
                ativo
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary/70 bg-black/70 text-white hover:border-primary hover:bg-black/85"
              }`}
            >
              {PAPEL_LABEL[papel]}
            </button>
          </div>
        );
      })}
    </div>
  );
}
