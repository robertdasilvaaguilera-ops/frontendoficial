import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExternalLink, Filter, Instagram } from "lucide-react";
import { newsQuery } from "@/lib/atlas-api";
import { cn } from "@/lib/utils";
import type { NewsItem } from "@/lib/atlas-types";
import { InstagramPostStudio } from "@/components/InstagramPostStudio";

export const Route = createFileRoute("/noticias")({
  head: () => ({
    meta: [
      { title: "Notícias — ATLAS" },
      {
        name: "description",
        content:
          "Notícias, MPs e publicações oficiais dos tribunais. Só notícias, não são decisões com fundamento jurídico.",
      },
      { property: "og:title", content: "Notícias — ATLAS" },
      {
        property: "og:description",
        content: "MP, DOU, tribunais e Congresso em um só radar.",
      },
    ],
  }),
  loader: ({ context }) => {
    if (typeof window === "undefined") return;
    context.queryClient.ensureQueryData(newsQuery);
  },
  component: Noticias,
});

function Noticias() {
  const { data: news } = useSuspenseQuery(newsQuery);
  const [fonte, setFonte] = useState<"todas" | "MP" | "DOU" | "Tribunal" | "Congresso">("todas");

  const filtered = useMemo(
    () => news.filter((n) => fonte === "todas" || n.fonte === fonte),
    [news, fonte],
  );

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8">
      <header className="pb-6 border-b border-border">
        <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          Notícias
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Atualizações do ecossistema jurídico
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Notícias são apenas notícias — não são decisões com fundamento jurídico (essas ficam no
          Radar).
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        Fonte:
        {(["todas", "MP", "DOU", "Tribunal", "Congresso"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFonte(f)}
            className={cn(
              "rounded px-2 py-0.5 border",
              fonte === f ? "border-primary text-primary" : "border-border hover:border-primary/50",
            )}
          >
            {f === "todas" ? "Todas" : f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          Nenhuma notícia para os filtros atuais.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {filtered.map((n) => (
            <NewsRow key={n.id} n={n} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewsRow({ n }: { n: NewsItem }) {
  const [postAberto, setPostAberto] = useState(false);

  return (
    <li className="surface rounded-lg p-5 hover:border-primary/60 transition-colors">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex-wrap">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 border",
            n.fonte === "MP" && "border-hi text-hi",
            n.fonte === "DOU" && "border-neutral-info text-neutral-info",
            n.fonte === "Tribunal" && "border-primary text-primary",
            n.fonte === "Congresso" && "border-hi text-hi",
          )}
        >
          {n.fonte}
        </span>
        {n.tribunal && <span>{n.tribunal}</span>}
        <span>·</span>
        <span>{new Date(n.publicadoEm).toLocaleDateString("pt-BR")}</span>
      </div>
      <h3 className="mt-2 text-lg font-semibold">{n.titulo}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{n.resumo}</p>
      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          {n.tributario && n.tipo && n.mecanismo ? (
            <span>
              <span
                className={cn("font-medium", n.tipo === "risco" ? "text-risk" : "text-opportunity")}
              >
                {n.tipo === "risco" ? "Risco" : "Oportunidade"}
              </span>{" "}
              · {n.mecanismo}
            </span>
          ) : (
            <span>Sem classificação tributária</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPostAberto((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Instagram className="h-3 w-3" />
            {postAberto ? "Fechar estúdio" : "Post para Instagram"}
          </button>
          <a
            href={n.urlOficial}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Fonte oficial <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {postAberto && (
        <div className="mt-5 pt-5 border-t border-border">
          <InstagramPostStudio
            item={{
              id: n.id,
              kind: "news",
              titulo: n.titulo,
              tribunal: n.tribunal ?? n.fonte,
              data: n.publicadoEm,
              resumoExecutivo: n.resumo,
            }}
          />
        </div>
      )}
    </li>
  );
}
