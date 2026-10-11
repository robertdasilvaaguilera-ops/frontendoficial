import { useState } from "react";
import { Check, Copy, Loader2, Send, X } from "lucide-react";
import { criarConvite, NIVEL_LABEL, type NivelAcesso } from "@/lib/auth-api";

const NIVEIS_CRIAVEIS: Exclude<NivelAcesso, "admin">[] = ["basico", "intermediario", "plus"];

// Gera um link de convite (nível já embutido) em vez de o dono escolher
// usuário/senha de alguém - é a pessoa convidada quem escolhe o próprio
// login ao abrir o link (ver rota /convite/$token), então ninguém, nem o
// dono, fica sabendo o login de mais ninguém. O link em si é o segredo:
// enviar por fora da plataforma (WhatsApp, e-mail etc) é responsabilidade
// de quem convida, não desse modal.
export function InviteFormModal({
  onClose,
  onCriado,
}: {
  onClose: () => void;
  onCriado: () => void;
}) {
  const [nivel, setNivel] = useState<Exclude<NivelAcesso, "admin">>("basico");
  const [rotulo, setRotulo] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function gerar() {
    setErro(null);
    setCarregando(true);
    try {
      const { token } = await criarConvite(nivel, rotulo);
      setLink(`${window.location.origin}/convite/${token}`);
      onCriado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui gerar o convite agora.");
    } finally {
      setCarregando(false);
    }
  }

  function copiar() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-10">
      <div className="w-full max-w-sm surface-elevated rounded-lg animate-panel-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">
              {link ? "Convite pronto" : "Convidar pra equipe"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {link
                ? "Envie esse link pra pessoa fora do ATLAS - ela escolhe o próprio usuário e senha."
                : "Escolha o nível de acesso - a pessoa convidada escolhe o próprio login."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-md p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {link ? (
          <div className="px-6 py-5 space-y-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 bg-background border border-border rounded-md px-2.5 py-2 text-xs font-mono truncate"
              />
              <button
                onClick={copiar}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent"
              >
                {copiado ? (
                  <Check className="h-3.5 w-3.5 text-opportunity" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Vale por 7 dias e só funciona uma vez. Você pode revogar depois na lista de convites,
              se precisar.
            </p>
            <button
              onClick={onClose}
              className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Concluir
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
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

            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                Anotação pra você lembrar (opcional)
              </div>
              <input
                value={rotulo}
                onChange={(e) => setRotulo(e.target.value)}
                placeholder="Ex: João, do jurídico"
                className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm outline-none focus:border-primary"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Só aparece pra você na lista de convites - nunca vira usuário nem senha de ninguém.
              </p>
            </div>

            {erro && <p className="text-xs text-risk">{erro}</p>}

            <button
              onClick={gerar}
              disabled={carregando}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {carregando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Gerar link de convite
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
