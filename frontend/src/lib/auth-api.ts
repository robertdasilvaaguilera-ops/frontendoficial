// Login local do ATLAS - multiusuário, mas sem cadastro aberto: o dono cria
// um login (usuário/senha/nível) pra cada pessoa da equipe na tela
// "Usuários". O front nunca lida com o token de sessão diretamente: ele
// vive num cookie HttpOnly, então basta sempre mandar `credentials:
// "include"` nas chamadas (já feito em atlas-api.ts) que o navegador
// cuida do resto.

import { queryOptions } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_ATLAS_API_URL as string | undefined;

export type NivelAcesso = "admin" | "basico" | "intermediario" | "plus";

export const NIVEL_LABEL: Record<NivelAcesso, string> = {
  admin: "Administrador",
  basico: "Básico",
  intermediario: "Intermediário",
  plus: "Plus",
};

export interface LimitesNivel {
  chat: boolean;
  chatUsdDia: number | null;
  pareceresPostsSemana: number | null;
  recursosAvancados: boolean;
}

export interface UsoAtual {
  pareceresPostsSemana: number;
  chatUsdHoje: number;
}

export interface AuthStatus {
  configurado: boolean;
  autenticado: boolean;
  usuario: string | null;
  nivel: NivelAcesso | null;
  limites: LimitesNivel | null;
  uso: UsoAtual | null;
}

export interface UsuarioLogin {
  usuario: string;
  nivel: NivelAcesso;
  criadoEm: string;
}

export interface Convite {
  token: string;
  nivel: NivelAcesso;
  rotulo: string | null;
  criadoPor: string;
  criadoEm: string;
  expiraEm: string;
  usadoEm: string | null;
  usuarioCriado: string | null;
}

export interface ConviteInfo {
  nivel: NivelAcesso;
  rotulo: string | null;
}

const STATUS_DESLOGADO: AuthStatus = {
  configurado: false,
  autenticado: false,
  usuario: null,
  nivel: null,
  limites: null,
  uso: null,
};

function precisaDeApi(): never {
  throw new Error("VITE_ATLAS_API_URL não configurada — conecte o backend Python para entrar.");
}

export async function getAuthStatus(): Promise<AuthStatus> {
  if (!API_URL) return STATUS_DESLOGADO;
  try {
    const r = await fetch(`${API_URL}/auth/status`, { credentials: "include" });
    if (!r.ok) return STATUS_DESLOGADO;
    return (await r.json()) as AuthStatus;
  } catch {
    return STATUS_DESLOGADO;
  }
}

async function postAuth(path: string, body: Record<string, string | boolean>): Promise<void> {
  if (!API_URL) precisaDeApi();
  const r = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!r.ok) {
    const erro = await r.json().catch(() => null);
    throw new Error(erro?.detail || `Falha (HTTP ${r.status})`);
  }
}

export function setupAuth(usuario: string, senha: string): Promise<void> {
  return postAuth("/auth/setup", { usuario, senha });
}

export function loginAuth(usuario: string, senha: string): Promise<void> {
  return postAuth("/auth/login", { usuario, senha });
}

// Cadastro aberto: qualquer pessoa cria a própria conta (nível básico),
// sem precisar que o admin crie o login antes - ver /auth/registro no
// backend. Diferente de setupAuth (só existe uma vez, cria o dono/admin).
export function registrarAuth(usuario: string, senha: string, aceitouTermos: boolean): Promise<void> {
  return postAuth("/auth/registro", { usuario, senha, aceitouTermos });
}

export async function logoutAuth(): Promise<void> {
  if (!API_URL) return;
  await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
}

export async function listarUsuarios(): Promise<UsuarioLogin[]> {
  if (!API_URL) return [];
  const r = await fetch(`${API_URL}/auth/users`, { credentials: "include" });
  if (!r.ok) throw new Error(`Falha ao listar usuários (HTTP ${r.status})`);
  return (await r.json()) as UsuarioLogin[];
}

export async function removerUsuario(usuario: string): Promise<void> {
  if (!API_URL) precisaDeApi();
  const r = await fetch(`${API_URL}/auth/users/${encodeURIComponent(usuario)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) {
    const erro = await r.json().catch(() => null);
    throw new Error(erro?.detail || `Falha ao remover usuário (HTTP ${r.status})`);
  }
}

export const usersQuery = queryOptions({
  queryKey: ["auth", "users"],
  queryFn: listarUsuarios,
});

// Convite: o dono nunca escolhe usuário/senha de ninguém - gera um link de
// uso único com o nível já embutido, manda pra pessoa por fora da
// plataforma (WhatsApp, e-mail etc), e é ela quem escolhe o próprio login
// ao abrir o link (ver /convite/$token). "rotulo" é só uma anotação livre
// do dono pra lembrar pra quem mandou cada convite.
export async function listarConvites(): Promise<Convite[]> {
  if (!API_URL) return [];
  const r = await fetch(`${API_URL}/auth/invites`, { credentials: "include" });
  if (!r.ok) throw new Error(`Falha ao listar convites (HTTP ${r.status})`);
  return (await r.json()) as Convite[];
}

export async function criarConvite(
  nivel: Exclude<NivelAcesso, "admin">,
  rotulo: string,
): Promise<{ token: string }> {
  if (!API_URL) precisaDeApi();
  const r = await fetch(`${API_URL}/auth/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nivel, rotulo }),
    credentials: "include",
  });
  if (!r.ok) {
    const erro = await r.json().catch(() => null);
    throw new Error(erro?.detail || `Falha ao gerar convite (HTTP ${r.status})`);
  }
  return (await r.json()) as { token: string };
}

export async function removerConvite(token: string): Promise<void> {
  if (!API_URL) precisaDeApi();
  const r = await fetch(`${API_URL}/auth/invites/${encodeURIComponent(token)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) {
    const erro = await r.json().catch(() => null);
    throw new Error(erro?.detail || `Falha ao revogar convite (HTTP ${r.status})`);
  }
}

export const convitesQuery = queryOptions({
  queryKey: ["auth", "invites"],
  queryFn: listarConvites,
});

export async function validarConvite(token: string): Promise<ConviteInfo | null> {
  if (!API_URL) return null;
  const r = await fetch(`${API_URL}/convites/${encodeURIComponent(token)}`, {
    credentials: "include",
  });
  if (!r.ok) return null;
  return (await r.json()) as ConviteInfo;
}

export async function aceitarConvite(token: string, usuario: string, senha: string): Promise<void> {
  if (!API_URL) precisaDeApi();
  const r = await fetch(`${API_URL}/convites/${encodeURIComponent(token)}/aceitar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, senha }),
    credentials: "include",
  });
  if (!r.ok) {
    const erro = await r.json().catch(() => null);
    throw new Error(erro?.detail || `Falha ao aceitar convite (HTTP ${r.status})`);
  }
}
