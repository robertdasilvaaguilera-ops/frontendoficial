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

async function postAuth(path: string, body: Record<string, string>): Promise<void> {
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

export function criarUsuario(
  usuario: string,
  senha: string,
  nivel: Exclude<NivelAcesso, "admin">,
): Promise<void> {
  return postAuth("/auth/users", { usuario, senha, nivel });
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

export interface RestauracaoBackup {
  ok: boolean;
  linhasRestauradas: number;
  linksMarcadosVistos: number;
}

// Restauração pontual do Excel de decisões perdido nos redeploys anteriores
// ao volume persistente entrar em vigor - ver /admin/restaurar-decisoes-backup
// em api_server.py. Uso único (backup local pré-migração).
export async function restaurarDecisoesBackup(arquivo: File): Promise<RestauracaoBackup> {
  if (!API_URL) precisaDeApi();
  const form = new FormData();
  form.append("arquivo", arquivo);
  const r = await fetch(`${API_URL}/admin/restaurar-decisoes-backup`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!r.ok) {
    const erro = await r.json().catch(() => null);
    throw new Error(erro?.detail || `Falha ao restaurar (HTTP ${r.status})`);
  }
  const dados = await r.json();
  return {
    ok: dados.ok,
    linhasRestauradas: dados.linhas_restauradas,
    linksMarcadosVistos: dados.links_marcados_vistos,
  };
}
