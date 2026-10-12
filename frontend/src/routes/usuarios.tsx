import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  Ban,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
  UploadCloud,
  UserRound,
} from "lucide-react";
import {
  usersQuery,
  convitesQuery,
  removerUsuario,
  removerConvite,
  coletarDecisoesAgora,
  restaurarDecisoesBackup,
  NIVEL_LABEL,
  type Convite,
} from "@/lib/auth-api";
import { useSessaoAtual } from "@/components/AuthGate";
import { InviteFormModal } from "@/components/InviteFormModal";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — ATLAS" },
      {
        name: "description",
        content: "Convide sua equipe e gerencie os logins de acesso ao ATLAS.",
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

function statusConvite(c: Convite): "aceito" | "expirado" | "pendente" {
  if (c.usadoEm) return "aceito";
  if (c.expiraEm <= new Date().toISOString().slice(0, 19)) return "expirado";
  return "pendente";
}

function UsuariosAdmin({ usuarioLogado }: { usuarioLogado: string }) {
  const { data: usuarios } = useSuspenseQuery(usersQuery);
  const { data: convites } = useSuspenseQuery(convitesQuery);
  const [formAberto, setFormAberto] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [revogando, setRevogando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const convitesPendentes = convites.filter((c) => statusConvite(c) === "pendente");

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

  async function revogar(token: string) {
    setRevogando(token);
    setErro(null);
    try {
      await removerConvite(token);
      await queryClient.invalidateQueries({ queryKey: ["auth", "invites"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui revogar esse convite agora.");
    } finally {
      setRevogando(null);
    }
  }

  function copiarLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/convite/${token}`);
    setCopiado(token);
    setTimeout(() => setCopiado(null), 1500);
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
          <p className="mt-1 text-sm text-muted-foreground max-w-lg">
            Gere um link de convite pra cada pessoa da equipe - ela escolhe o próprio usuário e
            senha ao abrir. Você nunca vê a senha de ninguém, e ninguém vê a de outra pessoa.
          </p>
        </div>
        <button
          onClick={() => setFormAberto(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Send className="h-4 w-4" /> Convidar pra equipe
        </button>
      </header>

      {formAberto && (
        <InviteFormModal
          onClose={() => setFormAberto(false)}
          onCriado={() => queryClient.invalidateQueries({ queryKey: ["auth", "invites"] })}
        />
      )}

      {erro && <p className="mt-4 text-sm text-risk">{erro}</p>}

      {convitesPendentes.length > 0 && (
        <div className="mt-6">
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Convites pendentes
          </div>
          <div className="surface rounded-lg divide-y divide-border/60">
            {convitesPendentes.map((c) => (
              <div key={c.token} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {NIVEL_LABEL[c.nivel] ?? c.nivel}
                    {c.rotulo && (
                      <span className="text-muted-foreground font-normal"> · {c.rotulo}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Vale até {new Date(c.expiraEm).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => copiarLink(c.token)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    {copiado === c.token ? (
                      <Check className="h-3.5 w-3.5 text-opportunity" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiado === c.token ? "Copiado" : "Copiar link"}
                  </button>
                  <button
                    onClick={() => revogar(c.token)}
                    disabled={revogando === c.token}
                    title="Revogar convite"
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-risk hover:bg-risk/10 disabled:opacity-30"
                  >
                    {revogando === c.token ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Ban className="h-3.5 w-3.5" />
                    )}
                    Revogar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      <ColetarDecisoesAgora />
      <RestaurarBackupDecisoes />
    </div>
  );
}

// Força uma rodada de coleta na hora, sem esperar o próximo horário agendado
// (10:30/14:30/22:30 UTC) - útil pra conferir logo depois de mudar algo nos
// coletores (ex: configurar um proxy) em vez de esperar horas.
function ColetarDecisoesAgora() {
  const [coletando, setColetando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function coletar() {
    setColetando(true);
    setErro(null);
    setResultado(null);
    try {
      await coletarDecisoesAgora();
      setResultado(
        "Coleta iniciada em segundo plano - pode levar vários minutos (STJ/DJEN com retentativas). " +
          "Confira o resultado daqui a pouco na tela de Decisões/Oportunidades.",
      );
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui iniciar a coleta agora.");
    } finally {
      setColetando(false);
    }
  }

  return (
    <div className="mt-8 surface rounded-lg p-6">
      <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        Coletar decisões agora
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-xl">
        Força uma rodada de coleta (CARF, STJ, PGFN, Receita, TRF4, DJEN...) na hora, em vez de
        esperar o próximo horário agendado. Roda em segundo plano no servidor - pode levar vários
        minutos até aparecer algo novo nas Decisões/Oportunidades.
      </p>
      <div className="mt-4">
        <button
          onClick={coletar}
          disabled={coletando}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {coletando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {coletando ? "Iniciando..." : "Coletar agora"}
        </button>
      </div>
      {resultado && <p className="mt-3 text-sm text-emerald-600">{resultado}</p>}
      {erro && <p className="mt-3 text-sm text-risk">{erro}</p>}
    </div>
  );
}

// Recuperação pontual do Excel de decisões perdido nos redeploys anteriores
// ao volume persistente (ATLAS_DATA_DIR) entrar em vigor - restaura a partir
// de um backup local pré-migração. Uso único; remover depois de restaurado.
function RestaurarBackupDecisoes() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    const arquivo = inputRef.current?.files?.[0];
    if (!arquivo) return;
    setEnviando(true);
    setErro(null);
    setResultado(null);
    try {
      const r = await restaurarDecisoesBackup(arquivo);
      setResultado(
        `${r.linhasRestauradas} decisões restauradas (${r.linksMarcadosVistos} links marcados como já vistos).`,
      );
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui restaurar o backup agora.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-8 surface rounded-lg p-6">
      <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        Restaurar backup de decisões
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-xl">
        Recuperação pontual do Excel de decisões perdido em redeploys anteriores à correção de
        persistência. Selecione o arquivo .xlsx de backup e confirme.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          disabled={enviando}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
        <button
          onClick={enviar}
          disabled={enviando}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Restaurar
        </button>
      </div>
      {resultado && <p className="mt-3 text-sm text-emerald-600">{resultado}</p>}
      {erro && <p className="mt-3 text-sm text-risk">{erro}</p>}
    </div>
  );
}
