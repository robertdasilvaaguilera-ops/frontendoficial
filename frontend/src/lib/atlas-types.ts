// ATLAS domain types. Kept flat and serializable so they can be swapped
// 1:1 with the Python backend response.

export type OppKind = "oportunidade" | "risco";

export type Priority = "maxima" | "alta" | "media" | "baixa";

export type Regime = "Simples Nacional" | "Lucro Presumido" | "Lucro Real" | "MEI";

export type Tribunal =
  | "STF"
  | "STJ"
  | "CARF"
  | "TRF1"
  | "TRF2"
  | "TRF3"
  | "TRF4"
  | "TRF5"
  | "TRF6"
  | "PGFN"
  | "DOU"
  | "Congresso";

export interface Opportunity {
  id: string;
  titulo: string;
  tipo: OppKind;
  prioridade: Priority;
  novidade: "inedito" | "reforco" | "consolidado";
  estabilidade: "vinculante" | "majoritaria" | "divergente" | "isolada";
  mecanismo: string; // e.g. "Recuperação de crédito de PIS/COFINS"
  tributos: string[]; // ["PIS", "COFINS"]
  regimes: Regime[];
  setores: string[]; // setor(es) afetados, quando identificáveis
  justificativaSetor: string; // por que esses setores/tributos são afetados
  cnaes: string[]; // codes
  ufs: string[]; // ["SP", "RJ", ...]
  impactoFinanceiro: "muito_alto" | "alto" | "medio" | "baixo";
  complexidade: "baixa" | "media" | "alta";
  tempoEstimadoDias: number;
  probabilidadeExito: "alta" | "media" | "baixa";
  tribunal: Tribunal;
  decisao: {
    numero: string;
    orgao: string;
    relator?: string;
    data: string; // ISO
    ementa: string;
    urlOficial: string;
  };
  resumoExecutivo: string;
}

export interface NewsItem {
  id: string;
  titulo: string;
  fonte: "MP" | "DOU" | "Tribunal" | "Congresso";
  tribunal?: Tribunal;
  publicadoEm: string;
  tributario: boolean; // se envolve direito tributário
  resumo: string;
  urlOficial: string;
  // Only present when tributario === true
  tipo?: OppKind;
  prioridade?: Priority;
  mecanismo?: string;
}

// Faixas de faturamento anual - alinhadas aos limites que definem regime
// tributário (Simples Nacional até R$ 4.8M, Presumido até R$ 78M) - é o
// dado que mais interessa a um economista pra avaliar elegibilidade e
// planejamento de regime.
export type FaixaFaturamento = "ate_360k" | "360k_a_4_8mi" | "4_8mi_a_78mi" | "acima_78mi";

export type PrioridadeCliente =
  "seguranca_juridica" | "reducao_carga" | "recuperacao_credito" | "compliance";

export interface ClientCase {
  id: string;
  nome: string;
  cnpj: string;
  regime: Regime;
  setor: string;
  cnae: string;
  uf: string;
  cidade: string;
  tributosRelevantes: string[];
  matches: number;
  // Perfil estendido - o que um especialista tributário/empresarial e um
  // economista da área precisam saber pra cruzar o cliente com decisões
  // reais (não só bater setor/tributo, mas entender estrutura, contencioso
  // e prioridade do cliente). Todos opcionais porque nem todo cadastro
  // (principalmente o mock/legado) tem esse detalhe.
  faturamentoAnual?: FaixaFaturamento | "";
  grupoEconomico?: boolean;
  comercioExterior?: boolean;
  folhaRelevante?: boolean;
  ufsAtuacao?: string[];
  contenciosoAtivo?: boolean;
  contenciosoDescricao?: string;
  teseInteresse?: string;
  prioridade?: PrioridadeCliente | "";
  observacoes?: string;
}

export interface CarteiraSummary {
  totalClientes: number;
  oportunidadesHoje: number;
  riscosHoje: number;
  economiaPotencial: number;
  alteracoesLegislativas: number;
  decisoesRelevantes: number;
}
