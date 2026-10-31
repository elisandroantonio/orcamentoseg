import * as XLSX from "xlsx";

// Lê uma planilha orçamentária em Excel (capítulos + itens) e devolve etapas,
// itens e (se houver aba "Premissas") os parâmetros de BDI. Só lê — não grava nada.

export interface SheetItem {
  key: string;
  itemNo: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  matUnit: number;
  laborUnit: number;
  equipUnit: number;
  note: string;
  stageIdx: number;
}
export interface SheetStage { name: string; parentIndex: number | null; itemNo: string }
export interface SheetParams {
  socialCharges?: number; adminCentral?: number; risk?: number;
  warranty?: number; profit?: number; taxes?: number;
}
export interface ParsedSheet {
  title: string;
  stages: SheetStage[];
  items: SheetItem[];
  params: SheetParams;
  sheetName: string;
}

const norm = (s: any) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function num(v: any): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // aceita "1.234,56" e "1234.56"
  const t = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(t.replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
}

export function parseBudgetWorkbook(buf: ArrayBuffer): ParsedSheet {
  const wb = XLSX.read(buf, { type: "array" });

  // 1) aba do orçamento = primeira que tiver cabeçalho com "Descrição" e "Qtd"
  let sheetName = "";
  let headerRow = -1;
  let rows: any[][] = [];
  for (const name of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" });
    for (let i = 0; i < Math.min(r.length, 25); i++) {
      const cells = r[i].map(norm);
      const hasDesc = cells.some((c) => c.includes("descricao"));
      const hasQty = cells.some((c) => c === "qtd" || c === "qtde" || c === "quantidade");
      if (hasDesc && hasQty) { sheetName = name; headerRow = i; rows = r; break; }
    }
    if (headerRow >= 0) break;
  }
  if (headerRow < 0) throw new Error("Não encontrei uma tabela com as colunas Descrição e Qtd nesta planilha.");

  const head = rows[headerRow].map(norm);
  const find = (pred: (c: string) => boolean) => head.findIndex(pred);
  const cItem = find((c) => c === "item" || c === "it" || c === "n");
  const cCode = find((c) => c.startsWith("codigo") || c === "cod");
  const cDesc = find((c) => c.includes("descricao"));
  const cUnit = find((c) => c === "un" || c === "und" || c === "unid" || c === "unidade");
  const cQty = find((c) => c === "qtd" || c === "qtde" || c === "quantidade");
  const cMat = find((c) => c.includes("material") && c.includes("unit"));
  const cLab = find((c) => (c.includes("m o") || c.includes("mao de obra")) && c.includes("unit"));
  const cEqp = find((c) => c.includes("equip") && c.includes("unit"));
  const cNote = find((c) => c.includes("premissa") || c.includes("observ"));

  const stages: SheetStage[] = [];
  const items: SheetItem[] = [];
  const stack: { depth: number; idx: number }[] = [];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const itemNo = cItem >= 0 ? String(r[cItem] ?? "").trim() : "";
    const desc = String(r[cDesc] ?? "").trim();
    if (!desc) continue;
    const unit = cUnit >= 0 ? String(r[cUnit] ?? "").trim() : "";
    const qty = cQty >= 0 ? num(r[cQty]) : 0;
    const isItem = qty > 0 || unit !== "";
    if (!isItem) {
      if (!itemNo) continue; // linhas de total/observação sem número
      const depth = itemNo.split(".").length;
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      const parentIndex = stack.length ? stack[stack.length - 1].idx : null;
      stages.push({ name: desc, parentIndex, itemNo });
      stack.push({ depth, idx: stages.length - 1 });
      continue;
    }
    if (stages.length === 0) { stages.push({ name: "Itens importados", parentIndex: null, itemNo: "" }); stack.push({ depth: 1, idx: 0 }); }
    items.push({
      key: `r${i}`,
      itemNo,
      code: cCode >= 0 ? String(r[cCode] ?? "").trim().replace(/^[—–-]$/, "") : "",
      description: desc,
      unit,
      quantity: qty,
      matUnit: cMat >= 0 ? num(r[cMat]) : 0,
      laborUnit: cLab >= 0 ? num(r[cLab]) : 0,
      equipUnit: cEqp >= 0 ? num(r[cEqp]) : 0,
      note: cNote >= 0 ? String(r[cNote] ?? "").trim() : "",
      stageIdx: stack.length ? stack[stack.length - 1].idx : 0,
    });
  }

  // 2) parâmetros de BDI (aba "Premissas": rótulo na coluna A, valor na B)
  const params: SheetParams = {};
  const premName = wb.SheetNames.find((n) => norm(n).includes("premissa"));
  if (premName) {
    const pr = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[premName], { header: 1, raw: true, defval: "" });
    for (const row of pr) {
      const label = norm(row[0]);
      const v = row[1];
      if (typeof v !== "number") continue;
      if (label.includes("encargos") && params.socialCharges === undefined) params.socialCharges = v;
      else if ((label.includes("administracao central") || label.startsWith("ac ")) && params.adminCentral === undefined) params.adminCentral = v;
      else if (label.includes("risco") && params.risk === undefined) params.risk = v;
      else if (label.includes("garantia") && params.warranty === undefined) params.warranty = v;
      else if (label.startsWith("lucro") && params.profit === undefined) params.profit = v;
      else if (label.startsWith("impostos") && params.taxes === undefined) params.taxes = v;
    }
  }

  const firstCell = String(rows[0]?.[0] ?? "").trim();
  return { title: firstCell || "Orçamento importado", stages, items, params, sheetName };
}
