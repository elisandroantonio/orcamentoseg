// Correspondência entre linhas de uma planilha externa e as composições da
// plataforma — por código (quando existe) ou por semelhança de descrição.
// Função pura (sem banco), testada em server/budgetImportMatch.test.ts.

const STOP = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "com", "para", "a", "o", "as", "os", "no", "na",
  "nos", "nas", "ao", "ou", "por", "um", "uma", "tipo", "inclusive", "incluso", "inclusa",
  "af", "sinapi",
]);

export function normText(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normText(s).split(" ")) {
    if (!raw || STOP.has(raw)) continue;
    // plural simples: "blocos" -> "bloco"
    const t = raw.length > 3 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
    out.add(t);
  }
  return out;
}

export function normCode(c: string | null | undefined): string {
  return String(c ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/^sinapi/, "");
}

export interface CompLite {
  id: number;
  code: string | null;
  description: string;
  unit: string;
}

export interface MatchCandidate {
  compositionId: number;
  score: number; // 0..1
  byCode: boolean;
}

export interface PreparedComp extends CompLite {
  tokens: Set<string>;
  nCode: string;
  nUnit: string;
}

export function prepareComps(comps: CompLite[]): PreparedComp[] {
  return comps.map((c) => ({
    ...c,
    tokens: tokenize(c.description),
    nCode: normCode(c.code),
    nUnit: normText(c.unit),
  }));
}

/** Melhores candidatas para uma linha da planilha (até `limit`, score >= minScore). */
export function matchRow(
  row: { code?: string | null; description: string; unit?: string | null },
  comps: PreparedComp[],
  limit = 5,
  minScore = 0.4
): MatchCandidate[] {
  const rowCode = normCode(row.code);
  const hasCode = rowCode.length >= 3 && rowCode !== "";
  const rt = tokenize(row.description);
  const ru = normText(row.unit ?? "");
  const out: MatchCandidate[] = [];

  for (const c of comps) {
    if (hasCode && c.nCode && c.nCode === rowCode) {
      out.push({ compositionId: c.id, score: 1, byCode: true });
      continue;
    }
    if (rt.size === 0 || c.tokens.size === 0) continue;
    let inter = 0;
    rt.forEach((t) => { if (c.tokens.has(t)) inter++; });
    if (inter === 0) continue;
    const recall = inter / rt.size;               // quanto da linha da planilha a composição cobre
    const dice = (2 * inter) / (rt.size + c.tokens.size);
    let score = 0.65 * recall + 0.35 * dice;
    if (ru && c.nUnit === ru) score += 0.05;
    else if (ru && c.nUnit && c.nUnit !== ru) score -= 0.1; // unidade diferente é suspeito
    score = Math.max(0, Math.min(0.99, score));
    if (score >= minScore) out.push({ compositionId: c.id, score, byCode: false });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
