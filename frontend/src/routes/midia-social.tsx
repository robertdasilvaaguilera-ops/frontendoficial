import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState, type RefObject } from "react";
import {
  CheckCircle2,
  Eye,
  ExternalLink,
  Loader2,
  Plus,
  Radio,
  Sparkles,
  Trash2,
  UploadCloud,
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
  subirLogo,
  removerLogo,
  subirFundo,
  removerFundo,
  gerarIdentidadeIA,
  gerarPreview,
  ESTILO_LABEL,
  POSICAO_VERTICAL_LABEL,
  ALINHAMENTO_LABEL,
  type SocialConfig,
  type SocialPost,
  type EstiloTipografico,
  type PosicaoVertical,
  type AlinhamentoHorizontal,
} from "@/lib/social-api";

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
  // Aberta pra toda a equipe, independente do nível (o backend também não
  // exige mais admin aqui - só sessão válida, ver _exigir_sessao). Fica só
  // "Usuários" restrito ao dono.
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

  const [marcaNome, setMarcaNome] = useState(config.marcaNome);
  const [marcaHandle, setMarcaHandle] = useState(config.marcaHandle);
  const [corFundoClaro, setCorFundoClaro] = useState(config.corFundoClaro);
  const [corFundoEscuro, setCorFundoEscuro] = useState(config.corFundoEscuro);
  const [corDestaque, setCorDestaque] = useState(config.corDestaque);
  const [logoPath, setLogoPath] = useState(config.logoPath);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [preview, setPreview] = useState<{ img1: string; img2: string } | null>(null);

  const [estilo, setEstilo] = useState<EstiloTipografico>(config.estilo);
  const [textoClaro, setTextoClaro] = useState(config.textoClaro);
  const [posicaoVertical, setPosicaoVertical] = useState<PosicaoVertical>(config.posicaoVertical);
  const [alinhamento, setAlinhamento] = useState<AlinhamentoHorizontal>(config.alinhamento);
  const [fundo1Path, setFundo1Path] = useState(config.fundo1Path);
  const [fundo2Path, setFundo2Path] = useState(config.fundo2Path);
  const fundo1InputRef = useRef<HTMLInputElement>(null);
  const fundo2InputRef = useRef<HTMLInputElement>(null);
  const [enviandoFundo, setEnviandoFundo] = useState<1 | 2 | null>(null);
  const [descricaoIA, setDescricaoIA] = useState("");
  const [gerandoIA, setGerandoIA] = useState(false);

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
        marcaNome: marcaNome.trim() || "ATLAS",
        marcaHandle: marcaHandle.trim() || "@atlas.tributos",
        corFundoClaro,
        corFundoEscuro,
        corDestaque,
        estilo,
        textoClaro,
        posicaoVertical,
        alinhamento,
      });
      setIgToken("");
      setIgContaId(salvo.igBusinessAccountId);
      setMarcaNome(salvo.marcaNome);
      setMarcaHandle(salvo.marcaHandle);
      setCorFundoClaro(salvo.corFundoClaro);
      setCorFundoEscuro(salvo.corFundoEscuro);
      setCorDestaque(salvo.corDestaque);
      setEstilo(salvo.estilo);
      setTextoClaro(salvo.textoClaro);
      setPosicaoVertical(salvo.posicaoVertical);
      setAlinhamento(salvo.alinhamento);
      await queryClient.invalidateQueries({ queryKey: ["social", "config"] });
      setSucesso("Configuração salva.");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui salvar a configuração agora.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarLogo() {
    const arquivo = logoInputRef.current?.files?.[0];
    if (!arquivo) return;
    setEnviandoLogo(true);
    setErro(null);
    try {
      const r = await subirLogo(arquivo);
      setLogoPath(r.logoPath);
      await queryClient.invalidateQueries({ queryKey: ["social", "config"] });
      if (logoInputRef.current) logoInputRef.current.value = "";
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui enviar o logo agora.");
    } finally {
      setEnviandoLogo(false);
    }
  }

  async function apagarLogo() {
    setEnviandoLogo(true);
    setErro(null);
    try {
      await removerLogo();
      setLogoPath("");
      await queryClient.invalidateQueries({ queryKey: ["social", "config"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui remover o logo agora.");
    } finally {
      setEnviandoLogo(false);
    }
  }

  async function visualizarPreview() {
    setGerandoPreview(true);
    setErro(null);
    try {
      const r = await gerarPreview({
        marcaNome, marcaHandle, corFundoClaro, corFundoEscuro, corDestaque, estilo, textoClaro,
        posicaoVertical, alinhamento,
      });
      const cacheBuster = `?t=${Date.now()}`;
      setPreview({
        img1: `${imagemSocialUrl(r.imagem1Path)}${cacheBuster}`,
        img2: `${imagemSocialUrl(r.imagem2Path)}${cacheBuster}`,
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui gerar a prévia agora.");
    } finally {
      setGerandoPreview(false);
    }
  }

  async function enviarFundo(slide: 1 | 2) {
    const ref = slide === 1 ? fundo1InputRef : fundo2InputRef;
    const arquivo = ref.current?.files?.[0];
    if (!arquivo) return;
    setEnviandoFundo(slide);
    setErro(null);
    try {
      const caminho = await subirFundo(slide, arquivo);
      if (slide === 1) setFundo1Path(caminho);
      else setFundo2Path(caminho);
      await queryClient.invalidateQueries({ queryKey: ["social", "config"] });
      if (ref.current) ref.current.value = "";
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui enviar o fundo agora.");
    } finally {
      setEnviandoFundo(null);
    }
  }

  async function apagarFundo(slide: 1 | 2) {
    setEnviandoFundo(slide);
    setErro(null);
    try {
      await removerFundo(slide);
      if (slide === 1) setFundo1Path("");
      else setFundo2Path("");
      await queryClient.invalidateQueries({ queryKey: ["social", "config"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui remover o fundo agora.");
    } finally {
      setEnviandoFundo(null);
    }
  }

  async function gerarComIA() {
    if (!descricaoIA.trim()) return;
    setGerandoIA(true);
    setErro(null);
    try {
      const sugestao = await gerarIdentidadeIA(descricaoIA.trim());
      setCorFundoClaro(sugestao.corFundoClaro);
      setCorFundoEscuro(sugestao.corFundoEscuro);
      setCorDestaque(sugestao.corDestaque);
      setEstilo(sugestao.estilo);
      setTextoClaro(sugestao.textoClaro);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui gerar a identidade agora.");
    } finally {
      setGerandoIA(false);
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

      {/* Identidade visual */}
      <section className="mt-6 surface rounded-lg p-5">
        <h2 className="text-sm font-semibold">Identidade visual do post</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Nome, @handle, cores, fonte e fundo que aparecem nas imagens geradas - personalize pra
          usar com outro escritório ou marca além do perfil original da Atlas.
        </p>

        <div className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
          <label className="text-[10px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Não sabe por onde começar? Descreva e a IA sugere
          </label>
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <input
              value={descricaoIA}
              onChange={(e) => setDescricaoIA(e.target.value)}
              placeholder='Ex: "algo elegante, tons de vinho e dourado" ou "moderno, azul e branco, minimalista"'
              className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={gerarComIA}
              disabled={gerandoIA || !descricaoIA.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
            >
              {gerandoIA ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Gerar com IA
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Preenche cores e fonte abaixo (você ainda revisa, gera prévia e só depois salva - não
            aplica nada sozinho).
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Nome da marca
            </label>
            <input
              value={marcaNome}
              onChange={(e) => setMarcaNome(e.target.value)}
              placeholder="Ex: Silva & Associados"
              className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              @ do Instagram (exibido na imagem)
            </label>
            <input
              value={marcaHandle}
              onChange={(e) => setMarcaHandle(e.target.value)}
              placeholder="Ex: @silva.tributario"
              className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Cor de destaque (grifo)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={corDestaque}
                onChange={(e) => setCorDestaque(e.target.value)}
                className="h-9 w-11 rounded-md border border-border bg-background cursor-pointer"
              />
              <input
                value={corDestaque}
                onChange={(e) => setCorDestaque(e.target.value)}
                className="w-full rounded-md bg-background border border-border px-2.5 py-2 text-xs font-mono outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Fundo (claro do degradê)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={corFundoClaro}
                onChange={(e) => setCorFundoClaro(e.target.value)}
                className="h-9 w-11 rounded-md border border-border bg-background cursor-pointer"
              />
              <input
                value={corFundoClaro}
                onChange={(e) => setCorFundoClaro(e.target.value)}
                className="w-full rounded-md bg-background border border-border px-2.5 py-2 text-xs font-mono outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Fundo (escuro do degradê)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={corFundoEscuro}
                onChange={(e) => setCorFundoEscuro(e.target.value)}
                className="h-9 w-11 rounded-md border border-border bg-background cursor-pointer"
              />
              <input
                value={corFundoEscuro}
                onChange={(e) => setCorFundoEscuro(e.target.value)}
                className="w-full rounded-md bg-background border border-border px-2.5 py-2 text-xs font-mono outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Estilo tipográfico
          </label>
          <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(Object.keys(ESTILO_LABEL) as EstiloTipografico[]).map((opcao) => (
              <button
                key={opcao}
                onClick={() => setEstilo(opcao)}
                className={`rounded-md border px-3 py-2 text-xs font-medium text-left transition-colors ${
                  estilo === opcao
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent/40"
                }`}
              >
                {ESTILO_LABEL[opcao]}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-4 inline-flex items-center gap-2.5">
          <button
            role="switch"
            aria-checked={!textoClaro}
            onClick={() => setTextoClaro((v) => !v)}
            className={`relative h-5 w-9 rounded-full transition-colors ${!textoClaro ? "bg-primary" : "bg-border"}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                !textoClaro ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-xs font-medium">Texto escuro (use com fundo claro)</span>
        </label>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FundoUploadField
            titulo="Fundo próprio - imagem 1"
            fundoPath={fundo1Path}
            inputRef={fundo1InputRef}
            enviando={enviandoFundo === 1}
            onEnviar={() => enviarFundo(1)}
            onRemover={() => apagarFundo(1)}
          />
          <FundoUploadField
            titulo="Fundo próprio - imagem 2"
            fundoPath={fundo2Path}
            inputRef={fundo2InputRef}
            enviando={enviandoFundo === 2}
            onEnviar={() => enviarFundo(2)}
            onRemover={() => apagarFundo(2)}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Já tem uma arte pronta pro post? Suba aqui - o texto gerado é escrito por cima dela, no
          lugar do degradê. Sem upload, usa as cores de fundo configuradas acima.
        </p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Posição vertical do texto
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(Object.keys(POSICAO_VERTICAL_LABEL) as PosicaoVertical[]).map((opcao) => (
                <button
                  key={opcao}
                  onClick={() => setPosicaoVertical(opcao)}
                  className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                    posicaoVertical === opcao
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent/40"
                  }`}
                >
                  {POSICAO_VERTICAL_LABEL[opcao]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Alinhamento do texto
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(Object.keys(ALINHAMENTO_LABEL) as AlinhamentoHorizontal[]).map((opcao) => (
                <button
                  key={opcao}
                  onClick={() => setAlinhamento(opcao)}
                  className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                    alinhamento === opcao
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent/40"
                  }`}
                >
                  {ALINHAMENTO_LABEL[opcao]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Útil pra encaixar o texto no espaço em branco do seu fundo próprio - ex: modelo com foto
          em cima e área livre embaixo à esquerda.
        </p>

        <div className="mt-4">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Logo (opcional - substitui o nome em texto no rodapé da imagem)
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {logoPath && (
              <img
                src={`${imagemSocialUrl(logoPath)}?v=${logoPath}`}
                alt="Logo atual"
                className="h-10 max-w-[140px] object-contain rounded border border-border bg-black/20 px-2"
              />
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={enviandoLogo}
              className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
            <button
              onClick={enviarLogo}
              disabled={enviandoLogo}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/40 disabled:opacity-50"
            >
              {enviandoLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
              Enviar
            </button>
            {logoPath && (
              <button
                onClick={apagarLogo}
                disabled={enviandoLogo}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-risk hover:bg-risk/10 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={visualizarPreview}
            disabled={gerandoPreview}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/40 disabled:opacity-50"
          >
            {gerandoPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            Gerar prévia
          </button>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Renderiza as duas imagens com um texto de exemplo e a identidade acima (mesmo sem
            salvar ainda) - não usa Claude nem publica nada.
          </p>
          {preview && (
            <div className="mt-3 flex flex-wrap gap-4">
              <img src={preview.img1} alt="Prévia imagem 1" className="w-40 rounded-md border border-border" />
              <img src={preview.img2} alt="Prévia imagem 2" className="w-40 rounded-md border border-border" />
            </div>
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

function FundoUploadField({
  titulo,
  fundoPath,
  inputRef,
  enviando,
  onEnviar,
  onRemover,
}: {
  titulo: string;
  fundoPath: string;
  inputRef: RefObject<HTMLInputElement | null>;
  enviando: boolean;
  onEnviar: () => void;
  onRemover: () => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {titulo}
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {fundoPath && (
          <img
            src={`${imagemSocialUrl(fundoPath)}?v=${fundoPath}`}
            alt="Fundo atual"
            className="h-10 w-8 object-cover rounded border border-border"
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={enviando}
          className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-accent file:px-2.5 file:py-1.5 file:text-xs file:font-medium max-w-[220px]"
        />
        <button
          onClick={onEnviar}
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/40 disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
        </button>
        {fundoPath && (
          <button
            onClick={onRemover}
            disabled={enviando}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-risk hover:bg-risk/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

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
