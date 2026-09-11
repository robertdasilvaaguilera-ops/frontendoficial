import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { criarCliente, type NovoClienteInput } from "@/lib/atlas-api";
import type { ClientCase, Regime } from "@/lib/atlas-types";

// Mesma lista de setores usada pela classificação real das decisões no
// backend (setor_identificado) - cadastrar o cliente com um setor fora
// dessa lista significa que ele nunca vai casar com nenhuma decisão.
const SETORES = [
  "Agronegócio",
  "Escritórios de serviços",
  "Cooperativas",
  "Indústria de alimentos",
  "Distribuidoras",
  "Construção civil",
  "Hospitais",
  "Incorporação imobiliária",
  "Revenda de veículos",
  "Transportadoras",
  "Atacado",
  "Supermercados",
  "Software / TI",
  "Clínicas odontológicas",
  "Varejo em geral",
  "Farmácias",
  "Clínicas médicas",
  "Postos de combustíveis",
  "Autopeças",
  "Indústria metalúrgica",
];

const TRIBUTOS = [
  "ICMS",
  "ISS",
  "PIS",
  "COFINS",
  "IRPJ",
  "CSLL",
  "IPI",
  "Contribuições Previdenciárias",
  "ITR",
  "II",
  "IE",
  "Simples Nacional (DAS)",
];

const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

const REGIMES: Regime[] = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"];

const FAIXAS_FATURAMENTO: { value: string; label: string }[] = [
  { value: "ate_360k", label: "Até R$ 360 mil/ano" },
  { value: "360k_a_4_8mi", label: "R$ 360 mil a R$ 4,8 milhões/ano" },
  { value: "4_8mi_a_78mi", label: "R$ 4,8 milhões a R$ 78 milhões/ano" },
  { value: "acima_78mi", label: "Acima de R$ 78 milhões/ano" },
];

const PRIORIDADES: { value: string; label: string }[] = [
  { value: "seguranca_juridica", label: "Segurança jurídica" },
  { value: "reducao_carga", label: "Redução de carga tributária" },
  { value: "recuperacao_credito", label: "Recuperação de crédito" },
  { value: "compliance", label: "Compliance / prevenção de risco" },
];

const VAZIO: NovoClienteInput = {
  nome: "",
  cnpj: "",
  regime: "Simples Nacional",
  setor: "",
  cnae: "",
  uf: "",
  cidade: "",
  tributosRelevantes: [],
  faturamentoAnual: "",
  grupoEconomico: false,
  comercioExterior: false,
  folhaRelevante: false,
  ufsAtuacao: [],
  contenciosoAtivo: false,
  contenciosoDescricao: "",
  teseInteresse: "",
  prioridade: "",
  observacoes: "",
};

export function ClientFormModal({
  onClose,
  onCriado,
}: {
  onClose: () => void;
  onCriado: (c: ClientCase) => void;
}) {
  const [form, setForm] = useState<NovoClienteInput>(VAZIO);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function set<K extends keyof NovoClienteInput>(campo: K, valor: NovoClienteInput[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function toggleArrayItem(campo: "tributosRelevantes" | "ufsAtuacao", item: string) {
    setForm((f) => {
      const atual = f[campo] ?? [];
      const proximo = atual.includes(item) ? atual.filter((x) => x !== item) : [...atual, item];
      return { ...f, [campo]: proximo };
    });
  }

  async function salvar() {
    if (!form.nome.trim()) {
      setErro("Nome (ou razão social) é obrigatório.");
      return;
    }
    setLoading(true);
    setErro(null);
    try {
      const cliente = await criarCliente(form);
      onCriado(cliente);
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui cadastrar o cliente agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-10">
      <div className="w-full max-w-2xl surface-elevated rounded-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-inherit rounded-t-lg">
          <div>
            <h2 className="text-lg font-semibold">Adicionar cliente</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Quanto mais completo, melhor o cruzamento com as decisões da base.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-md p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <Secao titulo="Identificação">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Campo label="Nome / Razão social *" className="md:col-span-2">
                <input
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                  placeholder="Ex: Agropecuária Vale Verde Ltda"
                  className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
                />
              </Campo>
              <Campo label="CNPJ">
                <input
                  value={form.cnpj}
                  onChange={(e) => set("cnpj", e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
                />
              </Campo>
              <Campo label="Cidade (sede)">
                <input
                  value={form.cidade}
                  onChange={(e) => set("cidade", e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
                />
              </Campo>
              <Campo label="UF (sede)">
                <select
                  value={form.uf}
                  onChange={(e) => set("uf", e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
                >
                  <option value="">Selecione…</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
          </Secao>

          <Secao titulo="Perfil tributário">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Campo label="Regime tributário">
                <select
                  value={form.regime}
                  onChange={(e) => set("regime", e.target.value as Regime)}
                  className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
                >
                  {REGIMES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Setor de atuação">
                <select
                  value={form.setor}
                  onChange={(e) => set("setor", e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
                >
                  <option value="">Selecione…</option>
                  {SETORES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="CNAE principal">
                <input
                  value={form.cnae}
                  onChange={(e) => set("cnae", e.target.value)}
                  placeholder="Ex: 0151-2/01"
                  className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
                />
              </Campo>
              <Campo label="Faturamento anual">
                <select
                  value={form.faturamentoAnual}
                  onChange={(e) => set("faturamentoAnual", e.target.value as never)}
                  className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
                >
                  <option value="">Selecione…</option>
                  {FAIXAS_FATURAMENTO.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <Campo label="Tributos de maior relevância para este cliente" className="mt-3">
              <div className="flex flex-wrap gap-2">
                {TRIBUTOS.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    ativo={form.tributosRelevantes.includes(t)}
                    onClick={() => toggleArrayItem("tributosRelevantes", t)}
                  />
                ))}
              </div>
            </Campo>
          </Secao>

          <Secao titulo="Estrutura e operação">
            <div className="space-y-2.5">
              <Toggle
                label="Faz parte de grupo econômico / holding"
                checked={!!form.grupoEconomico}
                onChange={(v) => set("grupoEconomico", v)}
              />
              <Toggle
                label="Tem operação de comércio exterior (importa e/ou exporta)"
                checked={!!form.comercioExterior}
                onChange={(v) => set("comercioExterior", v)}
              />
              <Toggle
                label="Folha de pagamento é componente relevante do custo (mão de obra intensiva)"
                checked={!!form.folhaRelevante}
                onChange={(v) => set("folhaRelevante", v)}
              />
            </div>
            <Campo label="UFs onde tem operação/filiais (além da sede)" className="mt-3">
              <div className="flex flex-wrap gap-2">
                {UFS.map((uf) => (
                  <Chip
                    key={uf}
                    label={uf}
                    ativo={(form.ufsAtuacao ?? []).includes(uf)}
                    onClick={() => toggleArrayItem("ufsAtuacao", uf)}
                  />
                ))}
              </div>
            </Campo>
          </Secao>

          <Secao titulo="Contencioso e prioridades">
            <Toggle
              label="Possui contencioso administrativo ou judicial em andamento"
              checked={!!form.contenciosoAtivo}
              onChange={(v) => set("contenciosoAtivo", v)}
            />
            {form.contenciosoAtivo && (
              <Campo label="Descreva brevemente (tese, tributo, instância)" className="mt-2">
                <textarea
                  value={form.contenciosoDescricao}
                  onChange={(e) => set("contenciosoDescricao", e.target.value)}
                  rows={2}
                  className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
                />
              </Campo>
            )}
            <Campo label="Teses ou temas de interesse específico" className="mt-3">
              <textarea
                value={form.teseInteresse}
                onChange={(e) => set("teseInteresse", e.target.value)}
                placeholder="Ex: exclusão do ICMS da base do PIS/COFINS, créditos de insumos, ITR de área de preservação..."
                rows={2}
                className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
              />
            </Campo>
            <Campo label="Prioridade principal do cliente" className="mt-3">
              <select
                value={form.prioridade}
                onChange={(e) => set("prioridade", e.target.value as never)}
                className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
              >
                <option value="">Selecione…</option>
                {PRIORIDADES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Campo>
          </Secao>

          <Secao titulo="Observações">
            <textarea
              value={form.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
              placeholder="Qualquer outro contexto relevante sobre o cliente..."
              rows={3}
              className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm"
            />
          </Secao>

          {erro && <p className="text-xs text-risk">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border sticky bottom-0 bg-inherit rounded-b-lg">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Salvando…" : "Salvar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-mono uppercase tracking-widest text-primary mb-3">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function Campo({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 normal-case leading-relaxed">
        {label}
      </div>
      {children}
    </label>
  );
}

function Chip({ label, ativo, onClick }: { label: string; ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
        ativo
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:border-primary/50"
      }`}
    >
      {label}
    </button>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border accent-primary"
      />
      {label}
    </label>
  );
}
