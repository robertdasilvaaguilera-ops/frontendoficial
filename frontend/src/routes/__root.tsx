import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppSidebar, MobileNav } from "@/components/AppSidebar";
import { AuthGate } from "@/components/AuthGate";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Página não encontrada.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Voltar ao radar
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Falha ao carregar</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo saiu do esperado. Tente novamente.
        </p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ATLAS — Inteligência Econômico-Jurídica" },
      {
        name: "description",
        content:
          "Radar comercial para escritórios tributários: oportunidades, riscos, carteira de clientes e monitoramento de tribunais em tempo real.",
      },
      { property: "og:title", content: "ATLAS — Inteligência Econômico-Jurídica" },
      {
        property: "og:description",
        content:
          "Decisões tributárias reais, organizadas por setor, com fundamento — para o seu escritório agir.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      // Inter e JetBrains Mono são auto-hospedadas (ver src/fonts.css,
      // importada por styles.css) - chegaram a ser carregadas via
      // fonts.googleapis.com, mas isso deixava o carregamento da página
      // inteira refém da rede até esse host externo (numa rede lenta,
      // bloqueada ou instável, o evento de "página carregada" do navegador
      // podia travar muitos segundos, mesmo se o conteúdo já estivesse
      // visível). appCss já inclui essas @font-face, então não precisa de
      // link nem preconnect externo aqui pras fontes centrais do app.
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Ativa o stylesheet de fonte (carregado com media="print", ver head() acima)
// assim que ele terminar de baixar, sem ter bloqueado o primeiro render.
const ATIVAR_FONTE_SCRIPT = `
(function () {
  var links = document.querySelectorAll('link[rel="stylesheet"][media="print"]');
  links.forEach(function (l) {
    if (l.sheet) { l.media = "all"; return; }
    l.addEventListener("load", function () { l.media = "all"; });
  });
})();
`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: ATIVAR_FONTE_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar />
          <div className="flex-1 min-w-0 flex flex-col">
            <MobileNav />
            <main className="flex-1 min-w-0">
              <Outlet />
            </main>
          </div>
        </div>
      </AuthGate>
    </QueryClientProvider>
  );
}
