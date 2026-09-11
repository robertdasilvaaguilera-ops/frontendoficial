import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  Loader2,
  MessageSquarePlus,
  Newspaper,
  Scale,
  Send,
  Trash2,
  User,
} from "lucide-react";
import {
  askCopilot,
  listarConversas,
  obterConversa,
  removerConversa,
  type ConversaSummary,
  type CopilotChatMessage,
  type CopilotSource,
} from "@/lib/atlas-api";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  fontes?: CopilotSource[];
  erro?: boolean;
}

const SUGESTOES = [
  "Cliente do Simples Nacional pode excluir ICMS da base do PIS/COFINS?",
  "Há risco de responsabilização de sócio em execução fiscal?",
  "Quais decisões recentes tratam de crédito de PIS/COFINS sobre insumos?",
];

export function CopilotChat() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [conversas, setConversas] = useState<ConversaSummary[]>([]);
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const recarregarConversas = useCallback(() => {
    listarConversas().then(setConversas);
  }, []);

  useEffect(() => {
    recarregarConversas();
  }, [recarregarConversas]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function enviar(pergunta: string) {
    const texto = pergunta.trim();
    if (!texto || loading) return;

    const historico: CopilotChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, { role: "user", content: texto }]);
    setInput("");
    setLoading(true);

    try {
      const {
        resposta,
        fontes,
        conversaId: novoId,
      } = await askCopilot(texto, historico, conversaId);
      setMessages((prev) => [...prev, { role: "assistant", content: resposta, fontes }]);
      setConversaId(novoId);
      recarregarConversas();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Não consegui consultar o Copiloto agora.",
          erro: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function novaConversa() {
    setConversaId(null);
    setMessages([]);
    setInput("");
  }

  async function abrirConversa(id: string) {
    if (id === conversaId) return;
    setCarregandoConversa(true);
    try {
      const conversa = await obterConversa(id);
      if (conversa) {
        setConversaId(conversa.id);
        setMessages(
          conversa.mensagens.map((m) => ({ role: m.role, content: m.content, fontes: m.fontes })),
        );
      }
    } finally {
      setCarregandoConversa(false);
    }
  }

  async function excluirConversa(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await removerConversa(id).catch(() => null);
    if (id === conversaId) novaConversa();
    recarregarConversas();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar(input);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 h-[70vh] min-h-[480px]">
      {/* Histórico de conversas */}
      <div className="surface rounded-lg flex flex-col overflow-hidden">
        <div className="p-2.5 border-b border-border">
          <button
            onClick={novaConversa}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium hover:bg-accent"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Nova conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {conversas.length === 0 ? (
            <p className="px-2 py-3 text-[11px] text-muted-foreground">
              Suas conversas salvas aparecem aqui.
            </p>
          ) : (
            conversas.map((c) => (
              <button
                key={c.id}
                onClick={() => abrirConversa(c.id)}
                className={`group w-full text-left rounded-md px-2.5 py-2 text-xs flex items-center justify-between gap-1.5 transition-colors ${
                  c.id === conversaId
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <span className="truncate">{c.titulo || "Nova conversa"}</span>
                <Trash2
                  className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 hover:text-risk"
                  onClick={(e) => excluirConversa(c.id, e)}
                />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="surface rounded-lg flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {carregandoConversa ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-6">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Pergunte ao Copiloto ATLAS</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                  As respostas priorizam as decisões que a ATLAS coletou — cada afirmação com
                  fundamento vem com a decisão citada.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-md">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    className="text-left text-xs rounded-md border border-border px-3 py-2 hover:border-primary/60 hover:bg-surface-elevated transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <ChatBubble key={i} message={m} />)
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Cruzando com as decisões coletadas…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder="Pergunte sobre uma tese, risco ou oportunidade…"
              className="flex-1 resize-none bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => enviar(input)}
              disabled={loading || !input.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Enter envia · Shift+Enter quebra linha · conversas ficam salvas no histórico à esquerda
          </p>
        </div>
      </div>
    </div>
  );
}

function formatarData(data: string): string {
  if (!data) return "";
  const d = new Date(data);
  return Number.isNaN(d.getTime()) ? data : d.toLocaleDateString("pt-BR");
}

function ChatBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center ${
          isUser ? "bg-primary text-primary-foreground" : "bg-surface-elevated text-foreground"
        }`}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-2`}>
        <div
          className={`rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground"
              : message.erro
                ? "bg-risk/10 text-risk border border-risk/30"
                : "bg-surface-elevated text-foreground"
          }`}
        >
          {message.content}
        </div>
        {message.fontes && message.fontes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.fontes.map((f, i) => {
              const isNoticia = f.tipo === "noticia";
              const numero = message
                .fontes!.slice(0, i + 1)
                .filter((x) => x.tipo === f.tipo).length;
              return (
                <a
                  key={f.id}
                  href={isNoticia ? f.url : `/oportunidades/${f.id}`}
                  target={isNoticia ? "_blank" : undefined}
                  rel={isNoticia ? "noreferrer" : undefined}
                  title={f.titulo}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/60 hover:text-foreground transition-colors"
                >
                  {isNoticia ? <Newspaper className="h-3 w-3" /> : <Scale className="h-3 w-3" />}
                  {isNoticia ? "Notícia" : "Decisão"} {numero} · {f.tribunal}{" "}
                  {f.data ? `· ${formatarData(f.data)}` : ""}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
