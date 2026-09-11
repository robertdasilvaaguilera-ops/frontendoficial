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
  tituloAlinhamento: string;
  tituloPosicaoVertical: string;
  tituloCaixaAlta: boolean;
  corPrimaria: string;
  corSecundaria: string | null;
  corFundo: string | null;
  fundoTipo: string;
  imagemProporcao: number;
  temFaixaRodape: boolean;
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

export interface SlideCarrossel {
  tipo: "capa" | "porque_importa" | "quem_afetado" | "impacto" | "recomendacao";
  kicker: string;
  headline: string;
  corpo: string;
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
    }),
    credentials: "include",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail || `Falha ao gerar o carrossel (HTTP ${r.status})`);
  }
  return (await r.json()) as CarrosselResposta;
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
