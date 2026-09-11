import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Compass, Loader2, Lock, LogOut, User } from "lucide-react";
import {
  getAuthStatus,
  loginAuth,
  logoutAuth,
  setupAuth,
  type LimitesNivel,
  type NivelAcesso,
  type UsoAtual,
} from "@/lib/auth-api";

export interface SessaoAtual {
  usuario: string;
  nivel: NivelAcesso;
  limites: LimitesNivel;
  uso: UsoAtual;
}

// Quem está logado agora (usuário, nível, limites e uso atual) - preenchido
// pelo AuthGate assim que confirma a sessão, lido pela barra lateral
// (rodapé, gating de menu) e pela tela Usuários (pra não deixar remover o
// próprio login). Não passa por prop-drilling porque __root.tsx só monta
// AppSidebar dentro do AuthGate mesmo.
const SessaoAtualContext = createContext<SessaoAtual | null>(null);
export function useSessaoAtual() {
  return useContext(SessaoAtualContext);
}
// Atalho pros lugares que só precisam do nome (a maioria) - fica óbvio que
// pode ser null durante o brevíssimo instante de carregamento.
export function useUsuarioLogado() {
  return useContext(SessaoAtualContext)?.usuario ?? null;
}

// Único gate de acesso ao app inteiro - sem isso, qualquer pessoa na mesma
// rede/máquina abre o ATLAS sem senha nenhuma. Cobre dois momentos:
// primeiro acesso (ainda não existe nenhum login - a pessoa que está
// abrindo pela primeira vez cria o dela, e vira a dona/admin) e acessos
// seguintes (login normal, com um usuário criado por quem já é dono). O
// `children` só é renderizado depois de autenticado - nem a barra lateral
// aparece antes disso.
export function AuthGate({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [configurado, setConfigurado] = useState(false);
  const [sessao, setSessao] = useState<SessaoAtual | null>(null);

  function carregarStatus() {
    return getAuthStatus().then((status) => {
      setConfigurado(status.configurado);
      if (status.autenticado && status.usuario && status.nivel && status.limites && status.uso) {
        setSessao({
          usuario: status.usuario,
          nivel: status.nivel,
          limites: status.limites,
          uso: status.uso,
        });
      } else {
        setSessao(null);
      }
      setCarregando(false);
    });
  }

  useEffect(() => {
    void carregarStatus();
  }, []);

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sessao) {
    return (
      <LoginScreen modo={configurado ? "login" : "setup"} onEntrou={() => void carregarStatus()} />
    );
  }

  return <SessaoAtualContext.Provider value={sessao}>{children}</SessaoAtualContext.Provider>;
}

// Botão de sair reaproveitado no rodapé da barra lateral (ver AppSidebar) -
// exportado separado pra não precisar levar o AuthGate inteiro lá.
export function BotaoSair() {
  return (
    <button
      onClick={() => {
        void logoutAuth().then(() => window.location.reload());
      }}
      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
    >
      <LogOut className="h-3 w-3" />
      Sair
    </button>
  );
}

function LoginScreen({ modo, onEntrou }: { modo: "login" | "setup"; onEntrou: () => void }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (modo === "setup" && senha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }
    setCarregando(true);
    try {
      if (modo === "setup") {
        await setupAuth(usuario, senha);
      } else {
        await loginAuth(usuario, senha);
      }
      onEntrou();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui entrar agora.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
            <Compass className="h-5 w-5" />
          </div>
          <div className="text-sm font-semibold tracking-tight">ATLAS</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Inteligência Jurídica
          </div>
        </div>

        <div className="surface rounded-lg p-6">
          <div className="text-sm font-medium">
            {modo === "setup" ? "Crie seu acesso" : "Entrar"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {modo === "setup"
              ? "Escolha um usuário e uma senha próprios — depois de entrar, você pode criar um login pra cada pessoa da sua equipe em Usuários."
              : "Entre com o usuário e a senha que foram criados pra você."}
          </p>

          <form onSubmit={enviar} className="mt-5 space-y-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                Usuário
              </div>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                Senha
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete={modo === "setup" ? "new-password" : "current-password"}
                  className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm"
                />
              </div>
              {modo === "setup" && (
                <p className="mt-1 text-[10px] text-muted-foreground">Pelo menos 8 caracteres.</p>
              )}
            </div>

            {modo === "setup" && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                  Confirmar senha
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="password"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    autoComplete="new-password"
                    className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {erro && <p className="text-xs text-risk">{erro}</p>}

            <button
              type="submit"
              disabled={carregando || !usuario || !senha}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {carregando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : modo === "setup" ? (
                "Criar acesso e entrar"
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
