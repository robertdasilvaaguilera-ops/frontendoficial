import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, ShieldAlert, User } from "lucide-react";
import { AtlasLogo } from "@/components/AtlasLogo";
import { aceitarConvite, validarConvite, NIVEL_LABEL, type ConviteInfo } from "@/lib/auth-api";

export const Route = createFileRoute("/convite/$token")({
  head: () => ({
    meta: [{ title: "Aceitar convite — ATLAS" }],
  }),
  component: AceitarConvitePagina,
});

// Página pública (fora do AuthGate, ver routes/__root.tsx) que a pessoa
// convidada abre - ela escolhe o PRÓPRIO usuário e senha aqui, nunca o
// dono do ATLAS. Espelha o visual da tela de login (AuthGate.tsx), mas
// funciona sem sessão nenhuma.
function AceitarConvitePagina() {
  const { token } = Route.useParams();
  const [carregandoInfo, setCarregandoInfo] = useState(true);
  const [info, setInfo] = useState<ConviteInfo | null>(null);

  useEffect(() => {
    let ativo = true;
    validarConvite(token).then((r) => {
      if (ativo) {
        setInfo(r);
        setCarregandoInfo(false);
      }
    });
    return () => {
      ativo = false;
    };
  }, [token]);

  if (carregandoInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm surface rounded-lg p-6 flex flex-col items-center text-center gap-3">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-medium">Convite inválido ou já usado</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Esse link não vale mais - pode já ter sido aceito, revogado, ou ter passado dos 7 dias
            de validade. Peça um novo convite pra quem te chamou.
          </p>
        </div>
      </div>
    );
  }

  return <FormularioConvite token={token} info={info} />;
}

function FormularioConvite({ token, info }: { token: string; info: ConviteInfo }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }
    setCarregando(true);
    try {
      await aceitarConvite(token, usuario, senha);
      window.location.href = "/";
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui criar seu acesso agora.");
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <AtlasLogo size={38} tagline={null} className="flex-col text-center" />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Inteligência Jurídica
          </div>
        </div>

        <div className="surface rounded-lg p-6">
          <div className="text-sm font-medium">
            Você foi convidado como {NIVEL_LABEL[info.nivel] ?? info.nivel}
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Escolha um usuário e uma senha só seus - ninguém mais vai ver essa senha, nem quem te
            convidou.
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
              <p className="mt-1 text-[10px] text-muted-foreground">Pelo menos 3 caracteres.</p>
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
                  autoComplete="new-password"
                  className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">Pelo menos 8 caracteres.</p>
            </div>

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

            {erro && <p className="text-xs text-risk">{erro}</p>}

            <button
              type="submit"
              disabled={carregando || !usuario || !senha}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar meu acesso"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
