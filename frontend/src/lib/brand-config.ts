// Configuração da marca do escritório (logo, nome, registro, cor) para o
// estúdio de imagens de Instagram. Guardada no localStorage do navegador —
// o advogado configura uma vez e ela é reaproveitada em todas as decisões.

export interface BrandConfig {
  nomeEscritorio: string;
  registro: string; // ex: "OAB/RS 140.082"
  corDestaque: string; // hex, usada nos detalhes da arte
  logoDataUrl: string | null; // PNG/JPG em base64
}

const STORAGE_KEY = "atlas:brand-config";

export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  nomeEscritorio: "",
  registro: "",
  corDestaque: "#D9A544",
  logoDataUrl: null,
};

export function getBrandConfig(): BrandConfig {
  if (typeof window === "undefined") return DEFAULT_BRAND_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRAND_CONFIG;
    return { ...DEFAULT_BRAND_CONFIG, ...(JSON.parse(raw) as Partial<BrandConfig>) };
  } catch {
    return DEFAULT_BRAND_CONFIG;
  }
}

export function saveBrandConfig(config: BrandConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function isBrandConfigured(config: BrandConfig): boolean {
  // Logo é opcional (o profissional pode preferir ficar sem nenhuma, ver
  // botão de remover no estúdio) - só o nome do escritório é obrigatório.
  return Boolean(config.nomeEscritorio.trim());
}

// Nem todo item (sobretudo notícia de fonte externa) vem com uma data
// válida - sem essa checagem, new Date("").toLocaleDateString() desenha o
// literal "Invalid Date" na arte. Compartilhada entre InstagramPostStudio
// e InstagramWorkspace (mesmo fallback de kicker nos dois).
export function formatarKicker(tribunal: string, data: string): string {
  // new Date(null) vira epoch (01/01/1970) em vez de Invalid Date - por
  // isso o "sem valor" precisa ser barrado explicitamente, não só via
  // Number.isNaN(getTime()).
  if (!data) return tribunal;
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return tribunal;
  return `${tribunal} · ${d.toLocaleDateString("pt-BR")}`;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
