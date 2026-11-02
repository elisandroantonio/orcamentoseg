import ExcelJS from "exceljs";
import { bytesToBase64, resolveLogoBytes } from "./documentHeader";

// Exportação do orçamento para Excel com a mesma identidade visual do PDF
// (client/src/lib/pdf-export.ts): faixa azul-marinho no topo, bloco de título
// com logo e selo do código, painel de dados, tabela com cabeçalho azul, faixas
// de etapa, linhas zebradas, valores em R$ e linha de total.
//
// Usa ExcelJS (a biblioteca "xlsx" da versão gratuita ignora cores e estilos,
// por isso a planilha antiga saía "pobre").

interface CompanyInfo {
  companyName: string;
  cnpj: string;
  responsibleName: string;
  responsibleTitle: string;
  phone: string;
  email: string;
  logoUrl?: string | null;
}

interface ClientInfo {
  name: string;
  document: string;
  address?: string | null;
}

interface ProjectInfo {
  name: string;
  squareMeters?: string | null;
}

interface BudgetItem {
  description: string;
  unit: string;
  quantity: string;
  materialCost: number;
  laborCost: number;
  equipmentCost?: number;
  serviceCost?: number;
  otherCost?: number;
  level: number;
  materialIncluded?: boolean; // Se ausente, cai no includeMaterial geral
}

interface BudgetSummary {
  totalWithoutBDI: number;
  bdiValue: number;
  bdiPercentage: number;
  totalWithBDI: number;
  materialValue: number;
  laborValue: number;
  equipmentValue: number;
  serviceValue: number;
  otherValue: number;
}

interface BDIParams {
  socialCharges: number;
  adminCentral: number;
  profit: number;
  taxes: number;
  risk: number;
  warranty: number;
  bdiRate: number;
}

// Paleta idêntica à do PDF
const NAVY_DARK = "FF080F26";
const NAVY = "FF1A2A52";
const PANEL = "FFE9ECF3";
const TEXT_GRAY = "FF374151";
const HEAD_BLUE = "FF2980B9";
const STAGE_MAIN = "FF1E40AF";
const STAGE_SUB = "FF4664C8";
const COMPOSITE_BG = "FFDBEAFE";
const CREDIT_BG = "FFFEE2E2";
const CREDIT_FG = "FF991B1B";
const ZEBRA = "FFF5F5F5";
const WHITE = "FFFFFFFF";
const INPUT_FG = "FF6B7280";

const CURRENCY_FMT = '"R$" #,##0.00';
const QTY_FMT = "#,##0.00";
const COEF_FMT = "#,##0.0000";

const COL_WIDTHS = [9, 62, 11, 8, 17, 17, 19, 19, 19]; // ITEM, DESCRIÇÃO, QTDE, UN, MAT UN, MO UN, MAT TOT, MO TOT, TOTAL
const NCOLS = COL_WIDTHS.length;

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const pct = (v: number) => `${(v || 0).toFixed(2).replace(".", ",")}%`;

function fillRange(ws: ExcelJS.Worksheet, row: number, c1: number, c2: number, argb: string) {
  for (let c = c1; c <= c2; c++) {
    ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  }
}

// Estima a altura da linha pelo texto (Excel não auto-ajusta células mescladas).
function estimateHeight(text: string, widthChars: number, fontPt: number, minH = 18): number {
  const perLine = Math.max(10, Math.floor(widthChars * (10 / fontPt) * 1.05));
  const lines = String(text || "")
    .split("\n")
    .reduce((acc, ln) => acc + Math.max(1, Math.ceil(ln.length / perLine)), 0);
  return Math.max(minH, lines * (fontPt + 4) + 6);
}

export async function generateBudgetExcel(
  companyInfo: CompanyInfo,
  clientInfo: ClientInfo,
  projectInfo: ProjectInfo,
  budgetTitle: string,
  items: BudgetItem[],
  summary: BudgetSummary,
  withBDI: boolean,
  includeMaterial: boolean = true,
  budgetCode?: string,
  observations?: string,
  bdiParams?: BDIParams
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = companyInfo.companyName || "EG Construtora";
  const ws = wb.addWorksheet("Orçamento", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: { oddFooter: "&L&8" + (budgetCode || "") + "&R&8Página &P de &N" },
  });
  ws.columns = COL_WIDTHS.map((w) => ({ width: w }));

  // ------------------------------------------------------------------
  // Cabeçalho: faixa, título, logo + selo do código, divisória, painel
  // ------------------------------------------------------------------
  let r = 1;
  fillRange(ws, r, 1, NCOLS, NAVY_DARK);
  ws.getRow(r).height = 6;
  r++;

  ws.getRow(r).height = 8;
  r++;

  // "O R Ç A M E N T O"
  ws.mergeCells(r, 1, r, 6);
  const lblCell = ws.getCell(r, 1);
  lblCell.value = "O R Ç A M E N T O";
  lblCell.font = { bold: true, size: 9, color: { argb: NAVY } };
  lblCell.alignment = { vertical: "middle" };
  ws.getRow(r).height = 18;
  const logoTopRow = r; // logo começa aqui
  r++;

  // Nome da obra
  ws.mergeCells(r, 1, r, 6);
  const projCell = ws.getCell(r, 1);
  projCell.value = projectInfo.name || "N/A";
  projCell.font = { bold: true, size: 18, color: { argb: NAVY_DARK } };
  projCell.alignment = { vertical: "middle", wrapText: true };
  ws.getRow(r).height = 32;
  r++;

  // Título do orçamento (+ m² se houver)
  ws.mergeCells(r, 1, r, 6);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = budgetTitle || "Orçamento";
  titleCell.font = { size: 11, color: { argb: TEXT_GRAY } };
  titleCell.alignment = { vertical: "top", wrapText: true };
  ws.getRow(r).height = estimateHeight(budgetTitle || "", COL_WIDTHS.slice(0, 6).reduce((a, b) => a + b, 0), 11, 22);
  r++;

  // Espaço para o selo do código
  ws.getRow(r).height = 24;
  const badgeRow = r;
  r++;

  // Logo no canto direito (colunas H:I), sobre as linhas do título
  const logoBytes = await resolveLogoBytes(companyInfo.logoUrl);
  if (logoBytes) {
    try {
      const imageId = wb.addImage({ base64: bytesToBase64(logoBytes), extension: "png" });
      ws.addImage(imageId, {
        tl: { col: 7.55, row: logoTopRow - 1 + 0.05 } as any,
        ext: { width: 100, height: 80 },
        editAs: "absolute",
      } as any);
    } catch (e) {
      console.warn("Não foi possível inserir a logo no Excel, seguindo sem ela:", e);
    }
  }
  // Selo com o código do orçamento
  if (budgetCode) {
    ws.mergeCells(badgeRow, 8, badgeRow, 9);
    const b = ws.getCell(badgeRow, 8);
    b.value = budgetCode;
    b.font = { bold: true, size: 10, color: { argb: NAVY_DARK } };
    b.alignment = { horizontal: "center", vertical: "middle" };
    for (const c of [8, 9]) {
      const cell = ws.getCell(badgeRow, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PANEL } };
      cell.border = {
        top: { style: "thin", color: { argb: NAVY } },
        bottom: { style: "thin", color: { argb: NAVY } },
        left: c === 8 ? { style: "thin", color: { argb: NAVY } } : undefined,
        right: c === 9 ? { style: "thin", color: { argb: NAVY } } : undefined,
      };
    }
  }

  // Divisória
  fillRange(ws, r, 1, NCOLS, NAVY);
  ws.getRow(r).height = 2.5;
  r++;
  ws.getRow(r).height = 6;
  r++;

  // Painel de dados: esquerda (proprietário/obra) e direita (empresa)
  const left: [string, string][] = [
    ["PROPRIETÁRIO:", clientInfo.name || "N/A"],
    ["LOCAL:", clientInfo.address || "N/A"],
    ["RESPONSÁVEL:", companyInfo.responsibleName || "N/A"],
    ["DATA:", new Date().toLocaleDateString("pt-BR")],
  ];
  const right: [string, string][] = [
    ["EMPRESA:", companyInfo.companyName || "N/A"],
    ["CNPJ:", companyInfo.cnpj || "N/A"],
    ...(clientInfo.address ? ([["LOCALIDADE:", clientInfo.address]] as [string, string][]) : []),
    ["RESPONSÁVEL:", `${companyInfo.responsibleTitle || ""} ${companyInfo.responsibleName || ""}`.trim() || "N/A"],
    ["TELEFONE:", companyInfo.phone || "N/A"],
    ["EMAIL:", companyInfo.email || "N/A"],
  ];
  const panelRows = Math.max(left.length, right.length);
  const leftW = COL_WIDTHS.slice(0, 3).reduce((a, b) => a + b, 0);
  const rightW = COL_WIDTHS.slice(4).reduce((a, b) => a + b, 0);
  const richField = (label: string, value: string, isLink = false): ExcelJS.CellRichTextValue => ({
    richText: [
      { text: `${label}  `, font: { bold: true, size: 9, color: { argb: NAVY_DARK } } },
      { text: value, font: { size: 9, color: { argb: isLink ? NAVY : TEXT_GRAY } } },
    ],
  });
  for (let i = 0; i < panelRows; i++) {
    fillRange(ws, r, 1, NCOLS, PANEL);
    let h = 18;
    if (left[i]) {
      ws.mergeCells(r, 1, r, 3);
      const c = ws.getCell(r, 1);
      c.value = richField(left[i][0], left[i][1]);
      c.alignment = { vertical: "middle", wrapText: true, indent: 1 };
      h = Math.max(h, estimateHeight(left[i][0] + left[i][1], leftW, 9));
    }
    if (right[i]) {
      ws.mergeCells(r, 5, r, 9);
      const c = ws.getCell(r, 5);
      c.value = richField(right[i][0], right[i][1], right[i][0] === "EMAIL:");
      c.alignment = { vertical: "middle", wrapText: true };
      h = Math.max(h, estimateHeight(right[i][0] + right[i][1], rightW, 9));
    }
    ws.getRow(r).height = h;
    r++;
  }
  ws.getRow(r).height = 10;
  r++;

  // ------------------------------------------------------------------
  // Parâmetros de BDI (apenas quando exportando com BDI)
  // ------------------------------------------------------------------
  if (withBDI && bdiParams) {
    ws.mergeCells(r, 1, r, NCOLS);
    const t = ws.getCell(r, 1);
    t.value = "PARÂMETROS DE BDI — BDI = [(1+AC) × (1+G) × (1+R)] / (1−L−I) − 1";
    t.font = { bold: true, size: 9, color: { argb: NAVY_DARK } };
    t.alignment = { vertical: "middle", indent: 1 };
    fillRange(ws, r, 1, NCOLS, "FFEFF6FF");
    ws.getRow(r).height = 18;
    r++;

    ws.mergeCells(r, 1, r, NCOLS);
    const v = ws.getCell(r, 1);
    const part = (label: string, value: string, bold = false, color = TEXT_GRAY) => [
      { text: `${label} `, font: { size: 9, color: { argb: INPUT_FG } } },
      { text: value, font: { size: 9, bold: true, color: { argb: color } } },
      ...(bold ? [] : [{ text: "     ", font: { size: 9 } }]),
    ];
    v.value = {
      richText: [
        ...part("Encargos Sociais (só M.O.):", pct(bdiParams.socialCharges)),
        ...part("Adm. Central:", pct(bdiParams.adminCentral)),
        ...part("Lucro:", pct(bdiParams.profit)),
        ...part("Impostos:", pct(bdiParams.taxes)),
        ...part("Risco:", pct(bdiParams.risk)),
        ...part("Garantia:", pct(bdiParams.warranty)),
        ...part("BDI Total:", pct(bdiParams.bdiRate), true, "FF1E40AF"),
      ],
    };
    v.alignment = { vertical: "middle", wrapText: true, indent: 1 };
    fillRange(ws, r, 1, NCOLS, "FFEBF5FF");
    ws.getRow(r).height = 22;
    r++;
    ws.getRow(r).height = 10;
    r++;
  }

  // ------------------------------------------------------------------
  // Tabela
  // ------------------------------------------------------------------
  const headers = [
    "ITEM",
    "DESCRIÇÃO",
    "QTDE",
    "UN",
    "VALOR UNIT.\nMAT",
    "VALOR UNIT.\nM.O.",
    "VALOR TOTAL\nMATERIAL",
    "VALOR TOTAL\nM.O.",
    "PREÇO TOTAL",
  ];
  const headRow = r;
  headers.forEach((h, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: WHITE } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_BLUE } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ws.getRow(r).height = 34;
  ws.pageSetup.printTitlesRow = `${headRow}:${headRow}`;
  r++;

  const descW = COL_WIDTHS[1];
  let totalMaterial = 0;
  let totalLabor = 0;
  let grandTotal = 0;
  let bodyIdx = 0;

  const thinLine = { style: "hair" as const, color: { argb: "FFD1D5DB" } };

  for (const raw of items) {
    const item: any = raw;
    const row = ws.getRow(r);

    if (item.isStageHeader) {
      const bg = item.level === 0 ? STAGE_MAIN : STAGE_SUB;
      ws.mergeCells(r, 2, r, 8);
      for (let c = 1; c <= NCOLS; c++) {
        const cell = ws.getCell(r, c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.font = { bold: true, size: 9, color: { argb: WHITE } };
        cell.alignment = { vertical: "middle", horizontal: c === NCOLS ? "right" : "left", indent: c === 2 ? Math.min(item.level || 0, 4) : 0 };
      }
      ws.getCell(r, 2).value = item.description;
      const tot = ws.getCell(r, NCOLS);
      tot.value = round2(item.stageTotal || 0);
      tot.numFmt = CURRENCY_FMT;
      row.height = 24;
      r++;
      bodyIdx++;
      continue;
    }

    let vals: (string | number)[];
    let kind: "normal" | "input" | "composite" | "credit" = "normal";

    if (item.isInput) {
      kind = "input";
      const coeff = parseFloat(item.coefficient) || 0;
      const unitCost = parseFloat(item.unitCost) || 0;
      const inputTotal = coeff * unitCost;
      const isLabor = item.inputType === "labor" || item.inputType === "service";
      const materialAllowed = item.materialIncluded !== undefined ? item.materialIncluded : includeMaterial;
      const matUnit = !isLabor && materialAllowed ? unitCost : 0;
      const labUnit = isLabor ? unitCost : 0;
      vals = [
        item.itemNumber || "",
        item.description || "",
        coeff ? round2(coeff * 10000) / 10000 : "",
        item.unit || "",
        matUnit ? round2(matUnit) : "",
        labUnit ? round2(labUnit) : "",
        matUnit * coeff ? round2(matUnit * coeff) : "",
        labUnit * coeff ? round2(labUnit * coeff) : "",
        inputTotal ? round2(inputTotal) : "",
      ];
    } else {
      const qty = parseFloat(item.quantity);
      const materialUnit = (item.materialIncluded !== undefined ? item.materialIncluded : includeMaterial) ? item.materialCost : 0;
      const laborUnit = item.laborCost;
      const materialTotal = materialUnit * qty;
      const laborTotal = laborUnit * qty;
      const priceTotal = materialTotal + laborTotal;
      // Filhos de compostos não entram no total (o pai já tem o total agregado)
      if (!item.isCompositeChild) {
        totalMaterial += materialTotal;
        totalLabor += laborTotal;
        grandTotal += priceTotal;
      }
      if (item.isCompositeHeader) kind = "composite";
      else if (qty < 0) kind = "credit";
      vals = [
        item.itemNumber || "",
        item.description || "",
        round2(qty),
        item.unit || "",
        round2(materialUnit),
        round2(laborUnit),
        round2(materialTotal),
        round2(laborTotal),
        round2(priceTotal),
      ];
    }

    const zebra = bodyIdx % 2 === 1;
    let bg: string | null = zebra ? ZEBRA : null;
    let fg = TEXT_GRAY;
    let bold = false;
    let size = 9;
    if (kind === "composite") { bg = COMPOSITE_BG; fg = STAGE_MAIN; bold = true; }
    else if (kind === "credit") { bg = CREDIT_BG; fg = CREDIT_FG; bold = true; }
    else if (kind === "input") { fg = INPUT_FG; size = 8; }

    vals.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v === "" ? null : v;
      cell.font = { size, bold, color: { argb: fg } };
      if (bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.border = { bottom: thinLine };
      const horizontal = i === 0 || i === 3 ? "center" : i === 1 ? "left" : "right";
      cell.alignment = {
        vertical: "middle",
        horizontal,
        wrapText: i === 1,
        indent: i === 1 ? Math.min(item.level || 0, 6) : 0,
      };
      if (i === 2) cell.numFmt = kind === "input" ? COEF_FMT : QTY_FMT;
      if (i >= 4) cell.numFmt = CURRENCY_FMT;
    });
    row.height = estimateHeight(String(vals[1]), descW - (item.level || 0) * 1.5, size, 20);
    r++;
    bodyIdx++;
  }

  // Linha de totais
  for (let c = 1; c <= NCOLS; c++) {
    const cell = ws.getCell(r, c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STAGE_MAIN } };
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "right", indent: c === 2 ? 1 : 0 };
  }
  ws.getCell(r, 2).value = "TOTAL";
  ws.getCell(r, 7).value = round2(totalMaterial);
  ws.getCell(r, 8).value = round2(totalLabor);
  ws.getCell(r, 9).value = round2(grandTotal);
  for (const c of [7, 8, 9]) ws.getCell(r, c).numFmt = CURRENCY_FMT;
  ws.getRow(r).height = 26;
  r++;

  // Observações
  if (observations && observations.trim()) {
    r++;
    const o = ws.getCell(r, 1);
    o.value = "OBSERVAÇÕES:";
    o.font = { bold: true, size: 9, color: { argb: NAVY_DARK } };
    r++;
    ws.mergeCells(r, 1, r, NCOLS);
    const t = ws.getCell(r, 1);
    t.value = observations;
    t.font = { size: 9, color: { argb: TEXT_GRAY } };
    t.alignment = { vertical: "top", wrapText: true };
    ws.getRow(r).height = estimateHeight(observations, COL_WIDTHS.reduce((a, b) => a + b, 0), 9, 18);
  }

  // Download
  const filename = `orcamento-${budgetTitle.replace(/\s+/g, "-").toLowerCase()}-${withBDI ? "com-bdi" : "preco-real"}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
