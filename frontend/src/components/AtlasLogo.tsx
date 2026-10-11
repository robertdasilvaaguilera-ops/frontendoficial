import { cn } from "@/lib/utils";

/**
 * Marca ATLAS: arco duplo (meridiano) + ponto de destaque, sempre na cor de
 * acento da marca (independe do tema — usa a mesma cor no claro e no escuro).
 */
export function AtlasMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 120 78"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8 66 A52 52 0 0 1 112 66"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.32"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M33 66 A27 27 0 0 1 87 66"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <line x1="3" y1="66" x2="117" y2="66" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <circle cx="100" cy="19" r="9" className="fill-primary" />
    </svg>
  );
}

export function AtlasLogo({
  className,
  markClassName = "text-current",
  size = 28,
  tagline = "Inteligência Jurídica",
}: {
  className?: string;
  markClassName?: string;
  size?: number;
  tagline?: string | null;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <AtlasMark size={size} className={cn("shrink-0", markClassName)} />
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-[0.2em]">ATLAS</div>
        {tagline && (
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {tagline}
          </div>
        )}
      </div>
    </div>
  );
}
