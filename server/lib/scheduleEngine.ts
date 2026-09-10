// Motor de geração automática de cronograma (rascunho) — 100% baseado em
// regras, sem chamada a nenhuma IA externa (decisão da EG Construtora:
// evitar custo recorrente de API). Ver tarefa "Motor de geração automática
// de cronograma" no histórico do projeto.
//
// O que faz:
//   1. Classifica cada etapa raiz do orçamento numa fase típica de obra,
//      por palavra-chave no nome (fundação, estrutura, alvenaria, etc.).
//   2. Estima a duração de cada etapa: primeiro tenta o histórico de
//      orçamentos já cadastrados pela própria empresa (dias/unidade médio
//      observado em etapas do mesmo serviceUnit); se não houver amostra
//      suficiente, cai numa tabela fixa de duração padrão por fase.
//   3. Monta as dependências (predecessoras) automaticamente: cada fase
//      depende da fase anterior mais próxima que tenha etapa presente no
//      orçamento; dentro da mesma fase, as etapas ficam encadeadas na
//      ordem em que já aparecem na planilha.
//   4. Calcula startDate/endDate por "forward pass" a partir de uma data
//      de início informada pelo usuário — isso não existe hoje no sistema
//      (hoje a duração é sempre derivada de datas digitadas manualmente,
//      nunca o contrário).
//
// Isso é sempre um RASCUNHO: quem chama este motor decide se aplica ou
// não o resultado — nada aqui grava no banco.

export type PhaseId =
  | "mobilizacao"
  | "terraplanagem"
  | "fundacao"
  | "estrutura"
  | "alvenaria"
  | "cobertura"
  | "impermeabilizacao"
  | "instalacoes"
  | "esquadrias"
  | "revestimento_interno"
  | "revestimento_externo"
  | "pintura"
  | "acabamento"
  | "paisagismo"
  | "limpeza_final"
  | "outros";

interface PhaseDef {
  id: PhaseId;
  label: string;
  keywords: string[];
  // Duração padrão de mercado (dias corridos), usada só quando não há
  // histórico suficiente da própria empresa para essa fase. É uma
  // referência conservadora e genérica — sempre revisável no rascunho.
  fallbackDays: number;
}

// Ordem do array = ordem típica de execução de obra (usada como base de
// precedência). "outros" fica por último de propósito: quando o nome da
// etapa não bate com nenhuma palavra-chave, o mais seguro é tratá-la como
// um item de fechamento, pra não virar dependência de nada por engano.
const PHASES: PhaseDef[] = [
  { id: "mobilizacao", label: "Mobilização / Canteiro de Obras", fallbackDays: 5,
    keywords: ["mobilizacao", "canteiro de obra", "canteiro", "instalacao do canteiro", "tapume"] },
  { id: "terraplanagem", label: "Terraplenagem / Movimento de Terra", fallbackDays: 10,
    keywords: ["terraplenagem", "terraplanagem", "movimento de terra", "escavacao", "aterro", "corte e aterro", "locacao da obra"] },
  { id: "fundacao", label: "Fundação", fallbackDays: 15,
    keywords: ["fundacao", "sapata", "estaca", "radier", "baldrame", "bloco de fundacao", "broca"] },
  { id: "estrutura", label: "Estrutura", fallbackDays: 30,
    keywords: ["estrutura", "concreto armado", "pilar", "viga", "laje", "forma", "armacao", "estrutura metalica"] },
  { id: "alvenaria", label: "Alvenaria / Vedação", fallbackDays: 20,
    keywords: ["alvenaria", "vedacao", "parede", "bloco ceramico", "tijolo", "bloco de concreto"] },
  { id: "cobertura", label: "Cobertura", fallbackDays: 12,
    keywords: ["cobertura", "telhado", "telha", "madeiramento"] },
  { id: "impermeabilizacao", label: "Impermeabilização", fallbackDays: 7,
    keywords: ["impermeabilizacao", "manta asfaltica", "impermeabilizante"] },
  { id: "instalacoes", label: "Instalações (Elétrica/Hidráulica/etc.)", fallbackDays: 25,
    keywords: ["instalacao elet", "instalacao hidr", "instalacoes elet", "instalacoes hidr", "eletrica", "hidraulica",
      "hidrossanitari", "tubulacao", "fiacao", "sanitari", "combate a incendio", "ar condicionado", "climatizacao", "gas"] },
  { id: "esquadrias", label: "Esquadrias", fallbackDays: 10,
    keywords: ["esquadria", "porta", "janela", "vidro", "caixilho"] },
  { id: "revestimento_interno", label: "Revestimento Interno / Contrapiso / Forro", fallbackDays: 25,
    keywords: ["revestimento interno", "reboco", "chapisco", "emboco", "contrapiso", "piso interno", "forro", "gesso", "drywall"] },
  { id: "revestimento_externo", label: "Revestimento Externo / Fachada", fallbackDays: 15,
    keywords: ["revestimento externo", "fachada", "textura"] },
  { id: "pintura", label: "Pintura", fallbackDays: 15,
    keywords: ["pintura"] },
  { id: "acabamento", label: "Acabamentos Finais", fallbackDays: 15,
    keywords: ["acabamento", "bancada", "louca", "metais sanitarios", "marcenaria", "serralheria", "piso ceramico", "revestimento ceramico"] },
  { id: "paisagismo", label: "Paisagismo / Áreas Externas", fallbackDays: 10,
    keywords: ["paisagismo", "jardim", "area externa", "calcada", "muro"] },
  { id: "limpeza_final", label: "Limpeza Final / Entrega", fallbackDays: 5,
    keywords: ["limpeza final", "limpeza pos obra", "entrega da obra", "desmobilizacao"] },
  { id: "outros", label: "Não classificada", fallbackDays: 10, keywords: [] },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .trim();
}

export function classifyStagePhase(stageName: string): PhaseId {
  const normalized = normalize(stageName);
  for (const phase of PHASES) {
    if (phase.id === "outros") continue;
    if (phase.keywords.some((kw) => normalized.includes(kw))) {
      return phase.id;
    }
  }
  return "outros";
}

function phaseIndex(phaseId: PhaseId): number {
  return PHASES.findIndex((p) => p.id === phaseId);
}

function phaseFallbackDays(phaseId: PhaseId): number {
  return PHASES.find((p) => p.id === phaseId)?.fallbackDays ?? 10;
}

export function phaseLabel(phaseId: PhaseId): string {
  return PHASES.find((p) => p.id === phaseId)?.label ?? "Não classificada";
}

// Uma amostra histórica: quanto tempo (dias) uma etapa parecida levou por
// unidade de serviceQuantity, em orçamentos já cadastrados pela empresa.
export interface HistoricalSample {
  phase: PhaseId;
  serviceUnit: string;
  daysPerUnit: number;
}

// Exige pelo menos esse número de amostras históricas com a mesma
// fase+unidade antes de confiar na média — com menos que isso, é mais
// seguro cair no valor padrão de mercado.
const MIN_HISTORICAL_SAMPLES = 2;

export interface StageInput {
  id: number;
  name: string;
  order: number;
  serviceUnit: string | null;
  serviceQuantity: string | null; // decimal do banco vem como string
}

export interface StageDraft {
  id: number;
  name: string;
  phase: PhaseId;
  phaseLabel: string;
  durationDays: number;
  durationSource: "historico" | "mercado";
  predecessorIds: number[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

function estimateDuration(
  stage: StageInput,
  phase: PhaseId,
  historicalRates: Map<string, number> // chave: `${phase}|${serviceUnit normalizado}`
): { days: number; source: "historico" | "mercado" } {
  const qty = stage.serviceQuantity ? parseFloat(stage.serviceQuantity) : 0;
  const unit = stage.serviceUnit ? normalize(stage.serviceUnit) : "";

  if (qty > 0 && unit) {
    const rate = historicalRates.get(`${phase}|${unit}`);
    if (rate && rate > 0) {
      const days = Math.max(1, Math.round(rate * qty));
      return { days, source: "historico" };
    }
  }

  return { days: phaseFallbackDays(phase), source: "mercado" };
}

/**
 * Constrói, a partir de amostras cruas do banco (duration e serviceQuantity
 * de etapas já cadastradas em QUALQUER orçamento do usuário, de qualquer
 * status), a taxa média de dias/unidade por fase+unidade. Amostras com
 * menos de MIN_HISTORICAL_SAMPLES ocorrências são descartadas (fica pro
 * fallback de mercado).
 */
export function buildHistoricalRates(
  rows: { stageName: string; serviceUnit: string | null; serviceQuantity: string | null; duration: number | null }[]
): Map<string, number> {
  const grouped = new Map<string, number[]>();

  for (const row of rows) {
    if (!row.serviceUnit || !row.serviceQuantity || !row.duration) continue;
    const qty = parseFloat(row.serviceQuantity);
    if (!(qty > 0) || !(row.duration > 0)) continue;

    const phase = classifyStagePhase(row.stageName);
    const unit = normalize(row.serviceUnit);
    const key = `${phase}|${unit}`;
    const rate = row.duration / qty;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(rate);
  }

  const rates = new Map<string, number>();
  Array.from(grouped.entries()).forEach(([key, samples]) => {
    if (samples.length < MIN_HISTORICAL_SAMPLES) return;
    const avg = samples.reduce((a: number, b: number) => a + b, 0) / samples.length;
    rates.set(key, avg);
  });
  return rates;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Gera o rascunho completo de cronograma para as etapas raiz de um
 * orçamento (sub-etapas não entram nesta primeira versão — ficam com o
 * cronograma que o usuário já tiver definido manualmente, se houver).
 */
export function generateScheduleDraft(
  stages: StageInput[],
  projectStartDate: string,
  historicalRates: Map<string, number>
): StageDraft[] {
  const ordered = [...stages].sort((a, b) => a.order - b.order);

  // Classifica e agrupa por fase, preservando a ordem original dentro de
  // cada fase.
  const withPhase = ordered.map((s) => ({ stage: s, phase: classifyStagePhase(s.name) }));

  // Para cada fase presente no orçamento, guarda a lista de stageIds
  // naquela fase, na ordem em que aparecem.
  const stagesByPhase = new Map<PhaseId, number[]>();
  for (const { stage, phase } of withPhase) {
    if (!stagesByPhase.has(phase)) stagesByPhase.set(phase, []);
    stagesByPhase.get(phase)!.push(stage.id);
  }

  // Acha, pra cada fase presente, a fase anterior (na ordem canônica) que
  // também está presente no orçamento — é dela que vem a predecessora.
  function previousPresentPhase(phase: PhaseId): PhaseId | null {
    const idx = phaseIndex(phase);
    for (let i = idx - 1; i >= 0; i--) {
      const candidate = PHASES[i].id;
      if (stagesByPhase.has(candidate) && stagesByPhase.get(candidate)!.length > 0) {
        return candidate;
      }
    }
    return null;
  }

  const drafts = new Map<number, Omit<StageDraft, "startDate" | "endDate">>();

  for (const { stage, phase } of withPhase) {
    const { days, source } = estimateDuration(stage, phase, historicalRates);
    const idsInPhase = stagesByPhase.get(phase)!;
    const posInPhase = idsInPhase.indexOf(stage.id);

    const predecessorIds: number[] = [];
    if (posInPhase > 0) {
      // Encadeada com a etapa anterior da MESMA fase.
      predecessorIds.push(idsInPhase[posInPhase - 1]);
    } else {
      // Primeira etapa da fase: depende de TODAS as etapas da fase
      // anterior presente (garante que a fase só começa quando a
      // anterior estiver de fato concluída).
      const prevPhase = previousPresentPhase(phase);
      if (prevPhase) {
        predecessorIds.push(...stagesByPhase.get(prevPhase)!);
      }
    }

    drafts.set(stage.id, {
      id: stage.id,
      name: stage.name,
      phase,
      phaseLabel: phaseLabel(phase),
      durationDays: days,
      durationSource: source,
      predecessorIds,
    });
  }

  // Forward pass: como as fases seguem a ordem canônica e nunca há ciclo
  // (uma etapa só depende de etapas de fase igual ou anterior), basta
  // processar na ordem em que os stages foram percorridos acima.
  const computedEnd = new Map<number, string>();
  const result: StageDraft[] = [];

  for (const { stage } of withPhase) {
    const draft = drafts.get(stage.id)!;
    let start = projectStartDate;
    for (const predId of draft.predecessorIds) {
      const predEnd = computedEnd.get(predId);
      if (predEnd && predEnd > start) start = predEnd;
    }
    const end = addDays(start, draft.durationDays);
    computedEnd.set(stage.id, end);
    result.push({ ...draft, startDate: start, endDate: end });
  }

  return result;
}
