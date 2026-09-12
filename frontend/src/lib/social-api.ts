// Mídia Social — configuração e histórico da automação de posts de
// Instagram (ver backend/social/*.py e as rotas /social/* em api_server.py).
// Mesmo padrão de atlas-api.ts / auth-api.ts: cookie de sessão via
// `credentials: "include"`, erro lançado com a mensagem que o backend deu.

import { queryOptions } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_ATLAS_API_URL as string | undefined;

function precisaDeApi(): never {
  throw new Error("VITE_ATLAS_API_URL não configurada — conecte o backend Python.");
}

export interface SocialConfig {
  ativo: boolean;
  temas: string[];
  objetivos: string;
  tom: string;
  horarios: string[];
  igAccessToken: string; // sempre mascarado quando vem do backend (ex: "EAAB••••6789")
  igBusinessAccountId: string;
  temToken: boolean;
  // Identidade visual do post (ver social/render.py) - cada perfil define a
  // própria, ao comercializar o ATLAS pra outros escritórios/advogados.
  marcaNome: string;
  marcaHandle: string;
  corFundoClaro: string; // hex #RRGGBB
  corFundoEscuro: string; // hex #RRGGBB
  corDestaque: string; // hex #RRGGBB - cor do grifo/detalhes
  logoPath: string; // nome do arquivo em /social/imagem/{logoPath}, ou "" sem logo
}

export interface SocialConfigInput {
  ativo?: boolean;
  temas?: string[];
  objetivos?: string;
  tom?: string;
  horarios?: string[];
  igAccessToken?: string; // deixe vazio para manter o token já salvo
  igBusinessAccountId?: string;
  marcaNome?: string;
  marcaHandle?: string;
  corFundoClaro?: string;
  corFundoEscuro?: string;
  corDestaque?: string;
}

export async function getSocialConfig(): Promise<SocialConfig> {
  if (!API_URL) precisaDeApi();
  const r = await fetch(`${API_URL}/social/config`, { credentials: "include" });
  if (!r.ok) {
    const erro = await r.json().catch(() => null);
    throw new Error(erro?.detail || `Falha ao buscar configuração (HTTP ${r.status})`);
  }
  return (await r.json()) as SocialConfig;
}

export async function salvarSocialConfig(input: SocialConfigInput): Promise<SocialConfig> {
  if (!API_URL) precisaDeApi();
  const r = await fetch(`${API_URL}/social/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!r.ok) {
    const erro = await r.json().catch(() => null);
    throw new Error(erro?.detail || `Falha ao salvar configuração (HTTP ${r.status})`);
  }
  return (await r.json()) as SocialConfig;
}

export interface TestarConexaoResultado {
  ok: boolean;
  username: string | null;
  nome: string | null;
}

export async function testarConexaoInstagram(
  igAccessToken?: string,
  igBusinessAccountId?: string,
): Promise<TestarConexaoResultado> {
  if (!API_URL) precisaDeApi();
  const r = await fetch(`${API_URL}/social/test-connection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ igAccessToken: igAccessToken || null, igBusinessAccountId: igBusinessAccountId || null }),
    credentials: "include",
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(body?.detail || `Falha ao testar conexão (HTTP ${r.status})`);
  }
  return body as TestarConexaoResultado;
}

export type SocialPostStatus = "publicado" | "erro" | "sem_decisao" | "inativo";

export interface SocialPost {
  id: string;
  criadoEm: string;
  decisaoId: string | null;
  titulo: string;
  paragrafoDestaque: string;
  headline2: string;
  sub2: string;
  legenda: string;
  gancho: string;
  imagem1Path: string | null;
  imagem2Path: string | null;
  status: SocialPostStatus;
  postId: string | null;
  permalink: string | null;
  erroDetalhe: string | null;
}

export async function getSocialPosts(limit = 30): Promise<SocialPost[]> {
  if (!API_URL) return [];
  const r = await fetch(`${API_URL}/social/posts?limit=${limit}`, { credentials: "include" });
  if (!r.ok) throw new Error(`Falha ao buscar histórico (HTTP ${r.status})`);
  return (await r.json()) as SocialPost[];
}

export async function publicarAgora(): Promise<SocialPost> {
  if (!API_URL) precisaDeApi();
  const r = await fetch(`${API_URL}/social/run-now`, { method: "POST", credentials: "include" });
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(body?.detail || `Falha ao publicar agora (HTTP ${r.status})`);
  }
  return body as SocialPost;
}

export function imagemSocialUrl(nome: string | null): string | null {
  if (!API_URL || !nome) return null;
  return `${API_URL}/social/imagem/${nome}`;
}

export async function subirLogo(arquivo: File): Promise<{ logoPath: string }> {
  if (!API_URL) precisaDeApi();
  const form = new FormData();
  form.append("arquivo", arquivo);
  const r = await fetch(`${API_URL}/social/logo`, { method: "POST", body: form, credentials: "include" });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.detail || `Falha ao enviar logo (HTTP ${r.status})`);
  return body as { logoPath: string };
}

export async function removerLogo(): Promise<void> {
  if (!API_URL) precisaDeApi();
  const r = await fetch(`${API_URL}/social/logo`, { method: "DELETE", credentials: "include" });
  if (!r.ok) throw new Error(`Falha ao remover logo (HTTP ${r.status})`);
}

export interface SocialPreviewInput {
  marcaNome?: string;
  marcaHandle?: string;
  corFundoClaro?: string;
  corFundoEscuro?: string;
  corDestaque?: string;
}

export interface SocialPreviewResultado {
  imagem1Path: string;
  imagem2Path: string;
}

export async function gerarPreview(input: SocialPreviewInput): Promise<SocialPreviewResultado> {
  if (!API_URL) precisaDeApi();
  const r = await fetch(`${API_URL}/social/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.detail || `Falha ao gerar preview (HTTP ${r.status})`);
  return body as SocialPreviewResultado;
}

export const socialConfigQuery = queryOptions({
  queryKey: ["social", "config"],
  queryFn: getSocialConfig,
});

export const socialPostsQuery = queryOptions({
  queryKey: ["social", "posts"],
  queryFn: () => getSocialPosts(30),
});
