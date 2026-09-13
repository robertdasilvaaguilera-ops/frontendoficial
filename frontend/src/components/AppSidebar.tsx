import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  Radar,
  Users,
  Newspaper,
  Bot,
  Compass,
  Wand2,
  UserCog,
  Radio,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BotaoSair, useSessaoAtual } from "@/components/AuthGate";
import { NIVEL_LABEL } from "@/lib/auth-api";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Radar;
  exact?: boolean;
};
const nav: NavItem[] = [
  { to: "/", label: "Radar Comercial", icon: Radar, exact: true },
  { to: "/clientes", label: "Minha Carteira", icon: Users },
  { to: "/noticias", label: "Notícias", icon: Newspaper },
  { to: "/copilot", label: "Copiloto ATLAS", icon: Bot },
  { to: "/estudio-visual", label: "Estúdio Visual", icon: Wand2 },
  { to: "/midia-social", label: "Mídia Social", icon: Radio },
  { to: "/usuarios", label: "Usuários", icon: UserCog },
];

// Copiloto ATLAS (chat) some pro nível básico; Usuários é só do dono (admin,
// guarda logins da equipe) - o backend já bloqueia os dois de qualquer
// forma, isso aqui é só pra não oferecer um link que vai dar 403. Mídia
// Social é de toda a equipe, qualquer nível. Compartilhado entre a barra
// lateral (desktop) e o menu mobile pra não divergir os dois.
function useItensNavVisiveis() {
  const sessao = useSessaoAtual();
  return nav.filter((item) => {
    if (item.to === "/copilot") return sessao?.limites.chat !== false;
    if (item.to === "/usuarios") return sessao?.nivel === "admin";
    return true;
  });
}

export function AppSidebar() {
  const pathname = useRouterState({
    select: (r) => r.location.pathname,
  });
  const sessao = useSessaoAtual();
  const active = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname.startsWith(to);
  const itensVisiveis = useItensNavVisiveis();

  return (
    <aside className="hidden lg:flex h-screen w-60 shrink-0 flex-col bg-sidebar/95 backdrop-blur-xl text-sidebar-foreground border-r border-sidebar-border sticky top-0">
      <div className="px-5 py-5 flex items-center gap-2 border-b border-sidebar-border">
        <div className="relative h-7 w-7 shrink-0">
          <div className="absolute inset-0 rounded-md bg-primary/40 blur-md" aria-hidden="true" />
          <div className="relative h-7 w-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
            <Compass className="h-4 w-4" />
          </div>
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">ATLAS</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Inteligência Jurídica
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {itensVisiveis.map((item) => {
          const Icon = item.icon;
          const isActive = active(item.to, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-primary" />
              )}
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-sidebar-border text-[11px] text-muted-foreground leading-relaxed space-y-2">
        <div className="font-mono">v0.1 · pré-alpha</div>
        {sessao && (
          <>
            <div>
              Logado como{" "}
              <span className="text-sidebar-foreground font-medium">{sessao.usuario}</span>
              {" · "}
              {NIVEL_LABEL[sessao.nivel] ?? sessao.nivel}
            </div>
            {sessao.limites.pareceresPostsSemana != null && (
              <div>
                Pareceres/posts: {sessao.uso.pareceresPostsSemana}/
                {sessao.limites.pareceresPostsSemana} esta semana
              </div>
            )}
            {sessao.limites.chat && sessao.limites.chatUsdDia != null && (
              <div>
                Chat: US$ {sessao.uso.chatUsdHoje.toFixed(2)}/{sessao.limites.chatUsdDia.toFixed(2)}{" "}
                hoje
              </div>
            )}
          </>
        )}
        <BotaoSair />
      </div>
    </aside>
  );
}

// Abaixo do breakpoint lg (1024px) o AppSidebar inteiro vira `hidden` sem
// nenhum substituto - isso deixa a navegação inacessível não só em celular,
// mas em qualquer viewport estreita (janela redimensionada, painel lateral
// de extensão do navegador tomando espaço, etc). Este componente cobre esse
// caso: uma barra fixa no topo com botão de menu, que abre os mesmos links
// da barra lateral num painel deslizante.
export function MobileNav() {
  const [aberto, setAberto] = useState(false);
  const pathname = useRouterState({
    select: (r) => r.location.pathname,
  });
  const itensVisiveis = useItensNavVisiveis();
  const active = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname.startsWith(to);

  return (
    <>
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar/95 backdrop-blur-xl px-4 py-3 text-sidebar-foreground">
        <div className="flex items-center gap-2">
          <div className="relative h-6 w-6 shrink-0">
            <div className="absolute inset-0 rounded-md bg-primary/40 blur-md" aria-hidden="true" />
            <div className="relative h-6 w-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
              <Compass className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-sm font-semibold tracking-tight">ATLAS</span>
        </div>
        <button
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="inline-flex items-center justify-center rounded-md p-2 text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {aberto && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setAberto(false)}
            aria-hidden="true"
          />
          <nav className="absolute inset-y-0 left-0 w-64 max-w-[80vw] bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col overflow-y-auto">
            <div className="px-5 py-5 flex items-center justify-between border-b border-sidebar-border">
              <span className="text-sm font-semibold tracking-tight">ATLAS</span>
              <button
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="inline-flex items-center justify-center rounded-md p-1.5 text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 px-2 py-4 space-y-0.5">
              {itensVisiveis.map((item) => {
                const Icon = item.icon;
                const isActive = active(item.to, item.exact);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setAberto(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="px-4 py-4 border-t border-sidebar-border">
              <BotaoSair />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
