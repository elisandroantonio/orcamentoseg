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
  parentStageId: number | null;
  serviceUnit: string | null;
  serviceQuantity: string | null; // decimal do banco vem como string
}

export interface StageDraft {
  id: number;
  name: string;
  // Profundidade na árvore, só pra indentação visual na prévia (0 = etapa
  // raiz solta ou raiz sem sub-etapas; 1+ = sub-etapa, quanto mais fundo
  // maior o número).
  depth: number;
  phase: PhaseId;
  phaseLabel: string;
  durationDays: number;
  durationSource: "historico" | "mercado";
  predecessorIds: number[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

interface LeafEntry {
  stage: StageInput;
  depth: number;
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
 * Roda o encadeamento por fase + forward-pass de datas pra um grupo
 * FECHADO de etapas-folha (ou seja: as predecessoras só são buscadas
 * dentro do próprio grupo). Usada tanto pro encadeamento global das
 * etapas-raiz soltas quanto pro encadeamento local de cada "frente de
 * obra" (etapa-raiz com sub-etapas) — ver generateScheduleDraft.
 */
function scheduleLeafGroup(
  leaves: LeafEntry[],
  projectStartDate: string,
  historicalRates: Map<string, number>
): StageDraft[] {
  // Classifica e agrupa por fase, preservando a ordem original dentro de
  // cada fase.
  const withPhase = leaves.map((entry) => ({ entry, phase: classifyStagePhase(entry.stage.name) }));

  // Para cada fase presente no grupo, guarda a lista de stageIds naquela
  // fase, na ordem em que aparecem.
  const stagesByPhase = new Map<PhaseId, number[]>();
  for (const { entry, phase } of withPhase) {
    if (!stagesByPhase.has(phase)) stagesByPhase.set(phase, []);
    stagesByPhase.get(phase)!.push(entry.stage.id);
  }

  // Acha, pra cada fase presente, a fase anterior (na ordem canônica) que
  // também está presente no grupo — é dela que vem a predecessora.
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

  for (const { entry, phase } of withPhase) {
    const { days, source } = estimateDuration(entry.stage, phase, historicalRates);
    const idsInPhase = stagesByPhase.get(phase)!;
    const posInPhase = idsInPhase.indexOf(entry.stage.id);

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

    drafts.set(entry.stage.id, {
      id: entry.stage.id,
      name: entry.stage.name,
      depth: entry.depth,
      phase,
      phaseLabel: phaseLabel(phase),
      durationDays: days,
      durationSource: source,
      predecessorIds,
    });
  }

  // Forward pass: como as fases seguem a ordem canônica e nunca há ciclo
  // dentro do grupo, basta processar na ordem em que os stages foram
  // percorridos acima.
  const computedEnd = new Map<number, string>();
  const result: StageDraft[] = [];

  for (const { entry } of withPhase) {
    const draft = drafts.get(entry.stage.id)!;
    let start = projectStartDate;
    for (const predId of draft.predecessorIds) {
      const predEnd = computedEnd.get(predId);
      if (predEnd && predEnd > start) start = predEnd;
    }
    const end = addDays(start, draft.durationDays);
    computedEnd.set(entry.stage.id, end);
    result.push({ ...draft, startDate: start, endDate: end });
  }

  return result;
}

/**
 * Gera o rascunho completo de cronograma pra um orçamento, cobrindo
 * etapas-raiz E sub-etapas (em qualquer profundidade):
 *
 *  - Etapas-raiz SEM sub-etapas entram todas juntas num único encadeamento
 *    global de fases (mesmo comportamento de antes desta função existir
 *    com hierarquia).
 *  - Etapas-raiz COM sub-etapas viram sua própria "frente de obra"
 *    independente: as sub-etapas-folha (netos, bisnetos etc. também
 *    contam — só quem realmente não tem filho vira uma linha do
 *    cronograma) são classificadas e encadeadas só entre si, a partir da
 *    MESMA data de início do projeto — cada área/bloco roda seu próprio
 *    cronograma, em paralelo aos demais. Isso evita tratar o container
 *    (ex: "CLUBE SOCIAL") como se fosse uma única etapa "Não
 *    classificada", que é o bug relatado.
 *
 * A etapa-container em si (a que tem sub-etapas) não recebe uma linha de
 * cronograma própria — quem tem data são só as folhas, exatamente como já
 * era feito manualmente antes deste motor existir.
 */
export function generateScheduleDraft(
  stages: StageInput[],
  projectStartDate: string,
  historicalRates: Map<string, number>
): StageDraft[] {
  const childrenByParent = new Map<number | null, StageInput[]>();
  for (const s of stages) {
    const key = s.parentStageId;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(s);
  }
  for (const arr of Array.from(childrenByParent.values())) {
    arr.sort((a, b) => a.order - b.order);
  }

  const rootStages = childrenByParent.get(null) || [];

  function collectLeaves(node: StageInput, depth: number, acc: LeafEntry[]) {
    const kids = childrenByParent.get(node.id) || [];
    if (kids.length === 0) {
      acc.push({ stage: node, depth });
      return;
    }
    for (const kid of kids) collectLeaves(kid, depth + 1, acc);
  }

  const flatLeaves: LeafEntry[] = [];
  const groupedRootIds = new Set<number>();
  for (const root of rootStages) {
    if ((childrenByParent.get(root.id) || []).length > 0) {
      groupedRootIds.add(root.id);
    } else {
      flatLeaves.push({ stage: root, depth: 0 });
    }
  }

  // Encadeamento global de todas as etapas-raiz soltas (sem sub-etapas),
  // numa única passada — preserva 100% o comportamento anterior pra
  // orçamentos sem hierarquia.
  const flatResults = flatLeaves.length > 0
    ? scheduleLeafGroup(flatLeaves, projectStartDate, historicalRates)
    : [];
  const flatResultById = new Map(flatResults.map((r) => [r.id, r]));

  // Monta o resultado final na ordem original de aparição das etapas-raiz
  // na planilha: raiz solta -> sua linha calculada acima; raiz com
  // sub-etapas -> bloco local (suas folhas, encadeadas só entre si).
  const result: StageDraft[] = [];
  for (const root of rootStages) {
    if (groupedRootIds.has(root.id)) {
      const acc: LeafEntry[] = [];
      collectLeaves(root, 1, acc);
      result.push(...scheduleLeafGroup(acc, projectStartDate, historicalRates));
    } else {
      const r = flatResultById.get(root.id);
      if (r) result.push(r);
    }
  }

  return result;
}
