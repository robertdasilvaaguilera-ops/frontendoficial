// ATLAS data access layer.
// Swap the mock functions for `fetch(`${API_URL}/...`)` calls once your
// Python backend is deployed and VITE_ATLAS_API_URL is set.

import { queryOptions } from "@tanstack/react-query";
import { CLIENTS, NEWS, OPPORTUNITIES, computeSummary } from "./atlas-data";
import type { ClientCase, NewsItem, Opportunity, CarteiraSummary } from "./atlas-types";

const API_URL = import.meta.env.VITE_ATLAS_API_URL as string | undefined;

async function tryFetch<T>(path: string): Promise<T | null> {
  if (!API_URL) return null;
  try {
    const r = await fetch(`${API_URL}${path}`, { credentials: "include" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function getOpportunities(
  limit?: number,
  tipo?: "oportunidade" | "risco",
): Promise<Opportunity[]> {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (tipo) params.set("tipo", tipo);
  const qs = params.toString();
  const remote = await tryFetch<Opportunity[]>(`/opportunities${qs ? `?${qs}` : ""}`);
  if (remote) return remote;
  const base = tipo ? OPPORTUNITIES.filter((o) => o.tipo === tipo) : OPPORTUNITIES;
  return limit ? base.slice(0, limit) : base;
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  const remote = await tryFetch<Opportunity>(`/opportunities/${id}`);
  if (remote) return remote;
  return OPPORTUNITIES.find((o) => o.id === id) ?? null;
}

export async function getNews(): Promise<NewsItem[]> {
  return (await tryFetch<NewsItem[]>("/news")) ?? NEWS;
}

// Notícias de fonte legislativa (DOU, Congresso, MP) - hoje tende a vir
// vazio porque ainda não existe um coletor real de DOU/Congresso rodando;
// fica pronto pra quando existir, sem mock (não faz sentido inventar
// alteração legislativa fake).
export async function getNoticiasLegislativas(): Promise<NewsItem[]> {
  return (await tryFetch<NewsItem[]>("/news?categoria=legislativa&limit=500")) ?? [];
}

export async function getClients(): Promise<ClientCase[]> {
  return (await tryFetch<ClientCase[]>("/clients")) ?? CLIENTS;
}

export type NovoClienteInput = Omit<ClientCase, "id" | "matches">;

export async function criarCliente(input: NovoClienteInput): Promise<ClientCase> {
  if (!API_URL) {
    throw new Error(
      "VITE_ATLAS_API_URL não configurada — conecte o backend Python para cadastrar clientes.",
    );
  }
  const r = await fetch(`${API_URL}/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao cadastrar cliente (HTTP ${r.status})`);
  }
  return (await r.json()) as ClientCase;
}

export async function removerCliente(id: string): Promise<void> {
  if (!API_URL) {
    throw new Error("VITE_ATLAS_API_URL não configurada.");
  }
  const r = await fetch(`${API_URL}/clients/${id}`, { method: "DELETE", credentials: "include" });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao remover cliente (HTTP ${r.status})`);
  }
}

export async function getSummary(): Promise<CarteiraSummary> {
  return (await tryFetch<CarteiraSummary>("/summary")) ?? computeSummary();
}

export const opportunitiesQuery = queryOptions({
  queryKey: ["opportunities"],
  queryFn: () => getOpportunities(),
});
// Usada pelo Cruzamento por perfil (copilot.tsx), que filtra client-side e
// se beneficia de um pool maior do que os 60 do Radar (limite padrão do
// backend) - ainda paginado, só que com mais margem.
export const opportunitiesForMatchingQuery = queryOptions({
  queryKey: ["opportunities", "matching"],
  queryFn: () => getOpportunities(500),
});
export const opportunityQuery = (id: string) =>
  queryOptions({
    queryKey: ["opportunity", id],
    queryFn: () => getOpportunity(id),
  });
export const newsQuery = queryOptions({
  queryKey: ["news"],
  queryFn: getNews,
});
export const opportunitiesByTipoQuery = (tipo: "oportunidade" | "risco") =>
  queryOptions({
    queryKey: ["opportunities", "tipo", tipo],
    queryFn: () => getOpportunities(500, tipo),
  });
export const noticiasLegislativasQuery = queryOptions({
  queryKey: ["news", "legislativa"],
  queryFn: getNoticiasLegislativas,
});
export const clientsQuery = queryOptions({
  queryKey: ["clients"],
  queryFn: getClients,
});
export const summaryQuery = queryOptions({
  queryKey: ["summary"],
  queryFn: getSummary,
});

// Copiloto ATLAS — chat com Claude cruzando as decisões coletadas.
export interface CopilotChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotSource {
  id: string;
  tipo: "decisao" | "noticia";
  titulo: string;
  tribunal: string;
  data: string;
  url: string;
}

export interface CopilotChatResponse {
  resposta: string;
  fontes: CopilotSource[];
  conversaId: string;
}

export async function askCopilot(
  pergunta: string,
  historico: CopilotChatMessage[],
  conversaId?: string | null,
): Promise<CopilotChatResponse> {
  if (!API_URL) {
    throw new Error(
      "VITE_ATLAS_API_URL não configurada — conecte o backend Python para usar o chat.",
    );
  }
  const r = await fetch(`${API_URL}/copilot/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta, historico, conversaId: conversaId ?? null }),
    credentials: "include",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao consultar o Copiloto (HTTP ${r.status})`);
  }
  return (await r.json()) as CopilotChatResponse;
}

// Histórico de conversas do Copiloto — salvo pelo backend a cada troca de
// mensagem (ver /copilot/chat), pra o advogado poder retomar depois.
export interface ConversaSummary {
  id: string;
  titulo: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ConversaMensagemSalva {
  role: "user" | "assistant";
  content: string;
  fontes?: CopilotSource[];
}

export interface ConversaCompleta extends ConversaSummary {
  mensagens: ConversaMensagemSalva[];
}

export async function listarConversas(): Promise<ConversaSummary[]> {
  return (await tryFetch<ConversaSummary[]>("/copilot/conversas")) ?? [];
}

export async function obterConversa(id: string): Promise<ConversaCompleta | null> {
  return await tryFetch<ConversaCompleta>(`/copilot/conversas/${id}`);
}

export async function removerConversa(id: string): Promise<void> {
  if (!API_URL) {
    throw new Error("VITE_ATLAS_API_URL não configurada.");
  }
  const r = await fetch(`${API_URL}/copilot/conversas/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) {
    throw new Error(`Falha ao remover conversa (HTTP ${r.status})`);
  }
}

// Estúdio de imagem para Instagram — textos gerados por Claude a partir da
// decisão ou notícia. O advogado conversa livremente: mensagem de texto
// (pode incluir um link, buscado automaticamente) e/ou uma imagem de
// referência.
export interface InstagramPostEstilo {
  template: string | null;
  corDestaque: string | null;
  tamanhoFonte: string | null;
}

export interface InstagramPostText {
  headline: string;
  corpo: string;
  legenda: string;
  historico: Array<{ role: string; content: string }>;
  estilo?: InstagramPostEstilo;
  // Foto de fundo escolhida automaticamente a partir do setor/tema da
  // decisão (banco de imagens Pexels) - null se não foi possível (sem
  // PEXELS_API_KEY configurada no backend, sem internet, sem resultado).
  imagemFundoDataUrl?: string | null;
  contextoVisual?: string | null;
  // Número/gráfico em destaque e trechos com cor automática (psicologia
  // da atenção) - mesmo recurso do carrossel (ver SlideCarrossel), agora
  // também no post único (Notícias e Estúdio Visual).
  elementoVisual?: ElementoVisualSlideResposta | null;
  destaquesTitulo?: string[];
  destaquesCorpo?: string[];
}

export interface GerarPostInstagramParams {
  kind: "opportunities" | "news";
  id: string;
  mensagem?: string;
  historico?: Array<{ role: string; content: string }>;
  imagemBase64?: string;
  imagemTipo?: string;
}

export async function gerarPostInstagram({
  kind,
  id,
  mensagem,
  historico,
  imagemBase64,
  imagemTipo,
}: GerarPostInstagramParams): Promise<InstagramPostText> {
  if (!API_URL) {
    throw new Error(
      "VITE_ATLAS_API_URL não configurada — conecte o backend Python para gerar o post.",
    );
  }
  const r = await fetch(`${API_URL}/${kind}/${id}/post-instagram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mensagem: mensagem ?? null,
      historico: historico ?? [],
      imagemBase64: imagemBase64 ?? null,
      imagemTipo: imagemTipo ?? null,
    }),
    credentials: "include",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao gerar o post (HTTP ${r.status})`);
  }
  return (await r.json()) as InstagramPostText;
}

// Estúdio Visual — gera um post preservando o modelo visual que o cliente
// já usa (imagens de referência), contextualizado pela decisão/notícia.
// Endpoint isolado do estúdio padrão acima (/post-com-modelo), não altera
// nada da geração existente.
export interface PerfilVisualResposta {
  logoPosicao: string;
  logoEscala: number;
  // Só o carrossel manda esses dois (ver ai/carrossel.py) - o Estúdio
  // Visual (/post-com-modelo) ainda não calcula um Sistema de Design (fase
  // 5 do plano de arquitetura), então fica undefined lá e o renderer cai
  // no padrão seguro "auto" (ver instagram-canvas.ts::PerfilVisual).
  logoContraste?: string;
  logoAreaSeguraPx?: number;
  tituloAlinhamento: string;
  tituloPosicaoVertical: string;
  tituloCaixaAlta: boolean;
  corPrimaria: string;
  corSecundaria: string | null;
  corFundo: string | null;
  fundoTipo: string;
  imagemProporcao: number;
  temFaixaRodape: boolean;
  fonteDestaque: string;
  kickerEstilo: string;
  estiloTitulo: string;
  estiloCorpo: string;
  estiloGeral: string;
  observacoes: string;
}

export interface PostComModeloResposta {
  headline: string;
  corpo: string;
  legenda: string;
  perfilVisual: PerfilVisualResposta;
  imagemFundoDataUrl: string | null;
  contextoVisual: string | null;
  elementoVisual?: ElementoVisualSlideResposta | null;
  destaquesTitulo?: string[];
  destaquesCorpo?: string[];
}

export interface GerarPostComModeloParams {
  kind: "opportunities" | "news";
  id: string;
  referencias: Array<{ base64: string; mediaType: string }>;
  mensagem?: string;
}

export async function gerarPostComModelo({
  kind,
  id,
  referencias,
  mensagem,
}: GerarPostComModeloParams): Promise<PostComModeloResposta> {
  if (!API_URL) {
    throw new Error(
      "VITE_ATLAS_API_URL não configurada — conecte o backend Python para usar o Estúdio Visual.",
    );
  }
  const r = await fetch(`${API_URL}/${kind}/${id}/post-com-modelo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referencias, mensagem: mensagem ?? null }),
    credentials: "include",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao gerar o post (HTTP ${r.status})`);
  }
  return (await r.json()) as PostComModeloResposta;
}

// Carrossel "Intelligence Brief" — a evolução premium do estúdio de
// Instagram: 5 slides fixos (capa/por que importa/quem é afetado/impacto/
// recomendação), pensados para autoridade e prospecção comercial, não só
// "informar que uma decisão aconteceu". Endpoint isolado, não altera nada
// do post único acima.
export type TomCarrossel =
  "tecnico" | "empresarial" | "comercial" | "informativo" | "sofisticado" | "minimalista";

export type ElementoVisualSlideResposta =
  | { tipo: "numero_destaque"; valor: string; rotulo: string }
  | { tipo: "grafico_barra"; itens: { rotulo: string; valor: number }[] }
  | { tipo: "grafico_rosca"; rotulo: string; percentual: number }
  | {
      tipo: "comparacao";
      antes: { rotulo: string; valor: string };
      depois: { rotulo: string; valor: string };
    };

export interface SlideCarrossel {
  tipo: "capa" | "porque_importa" | "quem_afetado" | "impacto" | "recomendacao" | "fechamento";
  kicker: string;
  headline: string;
  corpo: string;
  elementoVisual: ElementoVisualSlideResposta | null;
  // Qual componente da biblioteca do Sistema de Design este slide usa (ex:
  // "bloco_risco", "destaque_numerico", "chamada_salvar") - decidido pelo
  // estágio de Direção de Arte no backend (ver ai/direcao_arte.py), nunca
  // pelo usuário. null nos carrosséis de prospecção (angulo_prospeccao),
  // que ainda não passam por essa etapa.
  componente: string | null;
  // Trechos do título/corpo com número/dado real que a IA já marca pra
  // ganhar a cor de destaque automaticamente (psicologia da atenção).
  destaquesTitulo: string[];
  destaquesCorpo: string[];
  // Cor manual por palavra (índice da palavra no texto completo) - só
  // existe no front, nunca vem nem volta pro backend; editado clicando
  // na palavra (ver InstagramWorkspace). Sempre ganha do destaque acima.
  coresPalavrasTitulo?: Record<number, string>;
  coresPalavrasCorpo?: Record<number, string>;
}

export interface CarrosselResposta {
  slides: SlideCarrossel[];
  legenda: string;
  cta: string;
  hashtags: string[];
  publicoAlvo: string;
  perfilVisual: PerfilVisualResposta;
  imagemFundoDataUrl: string | null;
  contextoVisual: string | null;
  historico: Array<{ role: string; content: string }>;
}

export interface GerarCarrosselParams {
  kind: "opportunities" | "news";
  id: string;
  identidade: "atlas" | "propria";
  referencias?: Array<{ base64: string; mediaType: string }>;
  tom?: TomCarrossel | null;
  mensagem?: string;
  historico?: Array<{ role: string; content: string }>;
  imagemId?: number | null;
  // Ângulo já decidido na análise de conteúdo B2B (ver Prospecção) - quando
  // vem, o carrossel inteiro usa esse ângulo como fio condutor em vez de
  // um resumo genérico da decisão.
  anguloProspeccao?: string | null;
}

export async function gerarCarrossel({
  kind,
  id,
  identidade,
  referencias,
  tom,
  mensagem,
  historico,
  imagemId,
  anguloProspeccao,
}: GerarCarrosselParams): Promise<CarrosselResposta> {
  if (!API_URL) {
    throw new Error(
      "VITE_ATLAS_API_URL não configurada — conecte o backend Python para criar o carrossel.",
    );
  }
  const r = await fetch(`${API_URL}/${kind}/${id}/carrossel-instagram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identidade,
      referencias: referencias ?? [],
      tom: tom ?? null,
      mensagem: mensagem ?? null,
      historico: historico ?? [],
      imagemId: imagemId ?? null,
      anguloProspeccao: anguloProspeccao ?? null,
    }),
    credentials: "include",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao gerar o carrossel (HTTP ${r.status})`);
  }
  return (await r.json()) as CarrosselResposta;
}

// Prospecção B2B — motor que decide QUAIS decisões do dia têm potencial
// real de virar conteúdo de aquisição pra advogado/contador (não é todo
// item juridicamente relevante que serve pra isso, ver
// backend/ai/analise_conteudo.py). Índice determinístico (grátis, roda em
// tudo) escolhe uma shortlist; só ela passa pela análise de público-alvo/
// ângulo via Claude, cacheada por item.
export type NivelPotencial = "alto" | "medio" | "baixo";

export interface IndiceProspeccao {
  indiceProspeccao: number;
  subscores: {
    alcanceEmpresas: number;
    impactoEconomico: number;
    setorDefinido: number;
    novidade: number;
    autoridadeFonte: number;
    mecanismoIdentificado: number;
  };
}

export interface PotencialComMotivo {
  nivel: NivelPotencial;
  motivo: string;
}

export interface AnaliseConteudo {
  recomendado: boolean;
  porQueRelevante: string;
  quemEAfetado: string;
  classificacao: "oportunidade" | "risco" | "informativo";
  publicoAlvo: {
    advogado: string;
    contador: string;
    empresario: string;
  };
  anguloProspeccao: string;
  potencialCompartilhamento: PotencialComMotivo;
  potencialSalvamento: PotencialComMotivo;
  potencialConversaComercial: PotencialComMotivo;
}

export interface ItemProspeccao {
  id: string;
  tipo: "opportunities" | "news";
  titulo: string;
  tribunal: string;
  data: string;
  indice: IndiceProspeccao;
  analise: AnaliseConteudo;
}

export async function buscarProspeccaoPrioritarias(
  tipo: "opportunities" | "news",
  limit = 5,
): Promise<ItemProspeccao[]> {
  if (!API_URL) return [];
  const r = await fetch(`${API_URL}/prospeccao/prioritarias?tipo=${tipo}&limit=${limit}`, {
    credentials: "include",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao buscar decisões prioritárias (HTTP ${r.status})`);
  }
  return (await r.json()) as ItemProspeccao[];
}

export async function buscarAnaliseConteudo(
  kind: "opportunities" | "news",
  id: string,
): Promise<{ indice: IndiceProspeccao; analise: AnaliseConteudo }> {
  if (!API_URL) {
    throw new Error(
      "VITE_ATLAS_API_URL não configurada — conecte o backend Python para analisar o conteúdo.",
    );
  }
  const r = await fetch(`${API_URL}/${kind}/${id}/analise-conteudo`, { credentials: "include" });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao gerar a análise (HTTP ${r.status})`);
  }
  return (await r.json()) as { indice: IndiceProspeccao; analise: AnaliseConteudo };
}

export interface ImagemSugerida {
  id: number;
  preview: string;
}

export interface ImagensSugeridasResposta {
  contexto: string;
  imagens: ImagemSugerida[];
}

export async function buscarImagensSugeridas(
  kind: "opportunities" | "news",
  id: string,
): Promise<ImagensSugeridasResposta> {
  if (!API_URL) {
    throw new Error(
      "VITE_ATLAS_API_URL não configurada — conecte o backend Python pra buscar imagens.",
    );
  }
  const r = await fetch(`${API_URL}/${kind}/${id}/imagens-sugeridas`, {
    credentials: "include",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao buscar imagens sugeridas (HTTP ${r.status})`);
  }
  return (await r.json()) as ImagensSugeridasResposta;
}

// Modelo de estilo visual salvo — pra não reconfigurar fonte/tamanhos/cor
// toda vez que for criar um post. Compartilhado entre a equipe.
export interface ConfigModeloVisual {
  fonte: string;
  kickerEstilo: string;
  estiloTitulo: string;
  estiloCorpo: string;
  tamanhoRotulo: number;
  tamanhoTitulo: number;
  tamanhoCorpo: number;
  tamanhoRodape: number;
  corDestaque: string | null;
  // alinhamentoTexto: campo antigo (um só alinhamento pro post inteiro) -
  // mantido só pra modelos salvos antes da troca pra alinhamento por
  // texto continuarem carregando sem erro; nunca mais escrito. Os 4 de
  // baixo são os que valem de verdade agora (ver SeletorAlinhamento).
  alinhamentoTexto?: string | null;
  alinhamentoRotulo?: string | null;
  alinhamentoTitulo?: string | null;
  alinhamentoCorpo?: string | null;
  alinhamentoRodape?: string | null;
}

export interface ModeloVisual {
  id: string;
  nome: string;
  config: ConfigModeloVisual;
  criadoPor: string;
  criadoEm: string;
}

export async function listarModelosVisuais(): Promise<ModeloVisual[]> {
  if (!API_URL) return [];
  const r = await fetch(`${API_URL}/modelos-visuais`, { credentials: "include" });
  if (!r.ok) return [];
  return (await r.json()) as ModeloVisual[];
}

export async function criarModeloVisual(
  nome: string,
  config: ConfigModeloVisual,
): Promise<ModeloVisual> {
  if (!API_URL) throw new Error("VITE_ATLAS_API_URL não configurada.");
  const r = await fetch(`${API_URL}/modelos-visuais`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, config }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao salvar o modelo (HTTP ${r.status})`);
  }
  return (await r.json()) as ModeloVisual;
}

export async function removerModeloVisual(id: string): Promise<void> {
  if (!API_URL) return;
  await fetch(`${API_URL}/modelos-visuais/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
}

// Parecer técnico estruturado — gerado sob demanda pela Claude.
export interface ParecerTecnico {
  fatos: string;
  arguido: string;
  defendido: string;
  contestado: string;
  fundamentacao: string;
  dispositivo: string;
  aplicacaoPratica: string;
  historico: Array<{ role: string; content: string }>;
}

export async function gerarParecer(
  opportunityId: string,
  ajuste?: string,
  historico?: Array<{ role: string; content: string }>,
): Promise<ParecerTecnico> {
  if (!API_URL) {
    throw new Error(
      "VITE_ATLAS_API_URL não configurada — conecte o backend Python para gerar o parecer.",
    );
  }
  const r = await fetch(`${API_URL}/opportunities/${opportunityId}/parecer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ajuste: ajuste ?? null, historico: historico ?? [] }),
    credentials: "include",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao gerar o parecer (HTTP ${r.status})`);
  }
  return (await r.json()) as ParecerTecnico;
}

// Formatters
export const brl = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

export const compactBrl = (n: number) => {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`;
  return `R$ ${n}`;
};

export const priorityLabel: Record<string, string> = {
  maxima: "Prioridade Máxima",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const impactoLabel: Record<string, string> = {
  muito_alto: "Muito Alto",
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
};
