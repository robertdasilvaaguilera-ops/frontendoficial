import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Radio,
  ShieldAlert,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";
import {
  socialConfigQuery,
  socialPostsQuery,
  salvarSocialConfig,
  testarConexaoInstagram,
  publicarAgora,
  imagemSocialUrl,
  type SocialConfig,
  type SocialPost,
} from "@/lib/social-api";
import { useSessaoAtual } from "@/components/AuthGate";

export const Route = createFileRoute("/midia-social")({
  head: () => ({
    meta: [
      { title: "Mídia Social — ATLAS" },
      {
        name: "description",
        content:
          "Configure a automação de posts de Instagram: temas, horários, objetivos e a conexão com a conta.",
      },
    ],
  }),
  loader: ({ context }) => {
    if (typeof window === "undefined") return;
    context.queryClient.ensureQueryData(socialConfigQuery);
    context.queryClient.ensureQueryData(socialPostsQuery);
  },
  component: MidiaSocial,
});

function MidiaSocial() {
  const sessao = useSessaoAtual();

  // Guarda o token de acesso da conta do Instagram - mesmo critério de
  // "Usuários" (só o dono configura), o backend também já bloqueia (403).
  if (sessao?.nivel !== "admin") {
    return (
      <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-8">
        <div className="surface rounded-lg p-8 flex flex-col items-center text-center gap-3">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-medium">Área restrita ao administrador</div>
          <p className="text-xs text-muted-foreground max-w-sm">
            Só quem criou o ATLAS pode configurar a automação de Mídia Social (ela guarda o
            acesso à conta do Instagram).
          </p>
        </div>
      </div>
    );
  }

  return <MidiaSocialAdmin />;
}

function MidiaSocialAdmin() {
  const { data: config } = useSuspenseQuery(socialConfigQuery);
  const { data: posts } = useSuspenseQuery(socialPostsQuery);
  const queryClient = useQueryClient();

  const [temas, setTemas] = useState<string[]>(config.temas);
  const [novoTema, setNovoTema] = useState("");
  const [objetivos, setObjetivos] = useState(config.objetivos);
  const [tom, setTom] = useState(config.tom);
  const [horarios, setHorarios] = useState<string[]>(config.horarios);
  const [novoHorario, setNovoHorario] = useState("");
  const [ativo, setAtivo] = useState(config.ativo);
  const [igToken, setIgToken] = useState("");
  const [igContaId, setIgContaId] = useState(config.igBusinessAccountId);

  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [testeResultado, setTesteResultado] = useState<
    { ok: true; username: string | null } | { ok: false; mensagem: string } | null
  >(null);

  function adicionarTema() {
    const t = novoTema.trim();
    if (t && !temas.includes(t)) setTemas((prev) => [...prev, t]);
    setNovoTema("");
  }

  function adicionarHorario() {
    if (novoHorario && !horarios.includes(novoHorario)) {
      setHorarios((prev) => [...prev, novoHorario].sort());
    }
    setNovoHorario("");
  }

  async function testarConexao() {
    setTestando(true);
    setTesteResultado(null);
    try {
      const r = await testarConexaoInstagram(igToken || undefined, igContaId || undefined);
      setTesteResultado({ ok: true, username: r.username });
    } catch (err) {
      setTesteResultado({
        ok: false,
        mensagem: err instanceof Error ? err.message : "Não consegui testar a conexão agora.",
      });
    } finally {
      setTestando(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setSucesso(null);
    try {
      const salvo = await salvarSocialConfig({
        temas,
        objetivos: objetivos.trim(),
        tom: tom.trim(),
        horarios,
        ativo,
        igAccessToken: igToken.trim() || undefined,
        igBusinessAccountId: igContaId.trim(),
      });
      setIgToken("");
      setIgContaId(salvo.igBusinessAccountId);
      await queryClient.invalidateQueries({ queryKey: ["social", "config"] });
      setSucesso("Configuração salva.");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui salvar a configuração agora.");
    } finally {
      setSalvando(false);
    }
  }

  async function rodarAgora() {
    setPublicando(true);
    setErro(null);
    setSucesso(null);
    try {
      const resultado = await publicarAgora();
      await queryClient.invalidateQueries({ queryKey: ["social", "posts"] });
      if (resultado.status === "publicado") {
        setSucesso(`Publicado com sucesso: ${resultado.titulo}`);
      } else {
        setErro(resultado.erroDetalhe || `Não publicou (status: ${resultado.status})`);
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui rodar a publicação agora.");
    } finally {
      setPublicando(false);
    }
  }

  return (
    <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5" /> Mídia Social
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Automação de posts no Instagram
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            A ATLAS escolhe, escreve e publica sozinha um post por horário configurado, a
            partir de decisões tributárias reais coletadas pelo sistema — sem precisar de
            aprovação manual a cada vez.
          </p>
        </div>
        <label className="inline-flex items-center gap-2.5 shrink-0">
          <span className="text-sm font-medium">{ativo ? "Ativa" : "Desativada"}</span>
          <button
            role="switch"
            aria-checked={ativo}
            onClick={() => setAtivo((v) => !v)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              ativo ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                ativo ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
      </header>

      {/* Conexão com o Instagram */}
      <section className="mt-8 surface rounded-lg p-5">
        <h2 className="text-sm font-semibold">Conexão com o Instagram</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Token de acesso e ID da conta profissional (Business) do Instagram - gerados no
          Meta for Developers, na conta que vai publicar os posts.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Token de acesso
            </label>
            <input
              type="password"
              value={igToken}
              onChange={(e) => setIgToken(e.target.value)}
              placeholder={config.temToken ? config.igAccessToken : "Cole o token aqui"}
              className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-sm outline-none focus:border-primary font-mono"
            />
            {config.temToken && !igToken && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Já configurado - deixe em branco para manter.
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              ID da conta profissional
            </label>
            <input
              value={igContaId}
              onChange={(e) => setIgContaId(e.target.value)}
              placeholder="Ex: 17841435036831545"
              className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-sm outline-none focus:border-primary font-mono"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={testarConexao}
            disabled={testando || (!igToken && !config.temToken) || !igContaId}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/40 disabled:opacity-50"
          >
            {testando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Testar conexão
          </button>
          {testeResultado?.ok && (
            <span className="inline-flex items-center gap-1.5 text-xs text-opportunity">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Conectado{testeResultado.username ? ` como @${testeResultado.username}` : ""}
            </span>
          )}
          {testeResultado && !testeResultado.ok && (
            <span className="inline-flex items-center gap-1.5 text-xs text-risk">
              <XCircle className="h-3.5 w-3.5" />
              {testeResultado.mensagem}
            </span>
          )}
        </div>
      </section>

      {/* Conteúdo */}
      <section className="mt-6 surface rounded-lg p-5">
        <h2 className="text-sm font-semibold">Conteúdo</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Temas preferidos, objetivo e tom - a ATLAS usa isso pra escolher a decisão e
          escrever o post; sem nenhum tema, ela escolhe pela relevância geral.
        </p>

        <div className="mt-4">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Temas preferidos
          </label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {temas.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2.5 py-1 text-xs"
              >
                {t}
                <button onClick={() => setTemas((prev) => prev.filter((x) => x !== t))}>
                  <XCircle className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={novoTema}
              onChange={(e) => setNovoTema(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionarTema();
                }
              }}
              placeholder="Ex: PIS/COFINS, CARF… (Enter)"
              className="rounded-md bg-background border border-border px-2.5 py-1 text-xs outline-none focus:border-primary min-w-[160px]"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Objetivos/metas
            </label>
            <textarea
              value={objetivos}
              onChange={(e) => setObjetivos(e.target.value)}
              rows={3}
              placeholder="Ex: atrair leads de escritórios de médio porte"
              className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Tom/registro
            </label>
            <textarea
              value={tom}
              onChange={(e) => setTom(e.target.value)}
              rows={3}
              placeholder="Ex: técnico, para advogados tributaristas"
              className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
      </section>

      {/* Horários */}
      <section className="mt-6 surface rounded-lg p-5">
        <h2 className="text-sm font-semibold">Horários de publicação</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Um post por horário (fuso America/São_Paulo). A quantidade diária é o número de
          horários abaixo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {horarios.map((h) => (
            <span
              key={h}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm font-mono"
            >
              {h}
              <button onClick={() => setHorarios((prev) => prev.filter((x) => x !== h))}>
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-risk" />
              </button>
            </span>
          ))}
          <div className="inline-flex items-center gap-1.5">
            <input
              type="time"
              value={novoHorario}
              onChange={(e) => setNovoHorario(e.target.value)}
              className="rounded-md bg-background border border-border px-2.5 py-1 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={adicionarHorario}
              disabled={!novoHorario}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border hover:bg-accent/40 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar configuração
        </button>
        <button
          onClick={rodarAgora}
          disabled={publicando}
          className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-accent/40 disabled:opacity-50"
        >
          {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Publicar agora
        </button>
      </div>
      {erro && <p className="mt-3 text-sm text-risk">{erro}</p>}
      {sucesso && <p className="mt-3 text-sm text-opportunity">{sucesso}</p>}
      <p className="mt-2 text-xs text-muted-foreground max-w-xl">
        "Publicar agora" roda o ciclo completo na hora (mesmo com a automação desativada) e
        publica de verdade se as credenciais estiverem corretas - use pra testar a
        configuração de ponta a ponta.
      </p>

      {/* Histórico */}
      <section className="mt-10 pt-8 border-t border-border">
        <h2 className="text-sm font-semibold">Histórico</h2>
        <div className="mt-4 space-y-3">
          {posts.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum post gerado ainda.</p>
          )}
          {posts.map((p) => (
            <PostHistoricoItem key={p.id} post={p} />
          ))}
        </div>
      </section>
    </div>
  );
}

const STATUS_LABEL: Record<SocialPost["status"], string> = {
  publicado: "Publicado",
  erro: "Erro",
  sem_decisao: "Sem decisão nova",
  inativo: "Automação desativada",
};

const STATUS_CLASSE: Record<SocialPost["status"], string> = {
  publicado: "bg-opportunity/15 text-opportunity",
  erro: "bg-risk/15 text-risk",
  sem_decisao: "bg-muted text-muted-foreground",
  inativo: "bg-muted text-muted-foreground",
};

function PostHistoricoItem({ post }: { post: SocialPost }) {
  const img1 = imagemSocialUrl(post.imagem1Path);
  return (
    <div className="surface rounded-lg p-4 flex items-start gap-4">
      {img1 && (
        <img src={img1} alt="" className="h-20 w-16 object-cover rounded-md border border-border shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASSE[post.status]}`}
          >
            {STATUS_LABEL[post.status]}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {new Date(post.criadoEm).toLocaleString("pt-BR")}
          </span>
        </div>
        <div className="mt-1 text-sm font-medium truncate">
          {post.titulo || "—"}
        </div>
        {post.status === "publicado" && post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Ver post <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {post.status !== "publicado" && post.erroDetalhe && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{post.erroDetalhe}</p>
        )}
      </div>
    </div>
  );
}
