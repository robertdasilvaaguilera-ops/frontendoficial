import { useState } from "react";
import { X, Loader2, User, Lock } from "lucide-react";
import { criarUsuario, NIVEL_LABEL, type NivelAcesso } from "@/lib/auth-api";

const NIVEIS_CRIAVEIS: Exclude<NivelAcesso, "admin">[] = ["basico", "intermediario", "plus"];

export function UserFormModal({
  onClose,
  onCriado,
}: {
  onClose: () => void;
  onCriado: () => void;
}) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [nivel, setNivel] = useState<Exclude<NivelAcesso, "admin">>("basico");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    if (senha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }
    setCarregando(true);
    try {
      await criarUsuario(usuario, senha, nivel);
      onCriado();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui criar o login agora.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-10">
      <div className="w-full max-w-sm surface-elevated rounded-lg animate-panel-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">Adicionar usuário</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Escolha um usuário e uma senha pra essa pessoa entrar no ATLAS.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-md p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
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
                autoComplete="off"
                className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
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
                className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
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
                className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
              Nível de acesso
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {NIVEIS_CRIAVEIS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNivel(n)}
                  className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                    nivel === n
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {NIVEL_LABEL[n]}
                </button>
              ))}
            </div>
          </div>

          {erro && <p className="text-xs text-risk">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={carregando || !usuario || !senha}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar login
          </button>
        </div>
      </div>
    </div>
  );
}
