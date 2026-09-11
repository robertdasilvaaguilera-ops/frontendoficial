import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, UserRound, Loader2, ShieldAlert } from "lucide-react";
import { usersQuery, removerUsuario, NIVEL_LABEL } from "@/lib/auth-api";
import { useSessaoAtual } from "@/components/AuthGate";
import { UserFormModal } from "@/components/UserFormModal";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — ATLAS" },
      {
        name: "description",
        content: "Crie e remova os logins de acesso ao ATLAS da sua equipe.",
      },
    ],
  }),
  component: Usuarios,
});

function Usuarios() {
  const sessao = useSessaoAtual();

  // Só o dono (admin) gerencia usuários - o backend já bloqueia (403) quem
  // não é admin, isso aqui evita nem tentar buscar a lista pra quem não
  // pode ver de qualquer forma.
  if (sessao?.nivel !== "admin") {
    return (
      <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-8">
        <div className="surface rounded-lg p-8 flex flex-col items-center text-center gap-3">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-medium">Área restrita ao administrador</div>
          <p className="text-xs text-muted-foreground max-w-sm">
            Só quem criou o ATLAS pode gerenciar os logins da equipe.
          </p>
        </div>
      </div>
    );
  }

  return <UsuariosAdmin usuarioLogado={sessao.usuario} />;
}

function UsuariosAdmin({ usuarioLogado }: { usuarioLogado: string }) {
  const { data: usuarios } = useSuspenseQuery(usersQuery);
  const [formAberto, setFormAberto] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function remover(usuario: string) {
    if (!confirm(`Remover o login de "${usuario}"? Essa pessoa não vai mais conseguir entrar.`)) {
      return;
    }
    setRemovendo(usuario);
    setErro(null);
    try {
      await removerUsuario(usuario);
      await queryClient.invalidateQueries({ queryKey: ["auth", "users"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui remover esse login agora.");
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Usuários
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {usuarios.length} {usuarios.length === 1 ? "login ativo" : "logins ativos"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie um usuário, uma senha e um nível de acesso pra cada pessoa da sua equipe.
          </p>
        </div>
        <button
          onClick={() => setFormAberto(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Adicionar usuário
        </button>
      </header>

      {formAberto && (
        <UserFormModal
          onClose={() => setFormAberto(false)}
          onCriado={() => queryClient.invalidateQueries({ queryKey: ["auth", "users"] })}
        />
      )}

      {erro && <p className="mt-4 text-sm text-risk">{erro}</p>}

      <div className="mt-6 surface rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-surface-elevated">
            <tr>
              <th className="text-left px-4 py-2.5 font-normal">Usuário</th>
              <th className="text-left px-4 py-2.5 font-normal">Nível</th>
              <th className="text-left px-4 py-2.5 font-normal">Criado em</th>
              <th className="text-right px-4 py-2.5 font-normal">Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const souEu = u.usuario === usuarioLogado;
              return (
                <tr key={u.usuario} className="border-t border-border/60 hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{u.usuario}</span>
                      {souEu && (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Você
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {NIVEL_LABEL[u.nivel] ?? u.nivel}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(u.criadoEm).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remover(u.usuario)}
                      disabled={souEu || removendo === u.usuario}
                      title={souEu ? "Você não pode remover o próprio login" : "Remover login"}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-risk hover:bg-risk/10 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      {removendo === u.usuario ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Remover
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
