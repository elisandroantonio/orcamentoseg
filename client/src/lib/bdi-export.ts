import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

// =============================================================================
// Demonstrativo de Composição da Taxa de BDI — documento avulso (anexo),
// separado do orçamento em si. Pensado para anexar em editais de licitação
// pública (Lei 14.133/2021), que costumam pedir esse demonstrativo como
// documento próprio, não só embutido na planilha orçamentária.
//
// IMPORTANTE: não existe um modelo único oficial de planilha de BDI — cada
// órgão publica seu próprio anexo. Este documento segue os componentes do
// Acórdão TCU nº 2622/2013-Plenário (AC, G, R, L, I) combinados pela mesma
// "fórmula clássica" que o sistema já usa em todo o resto do cálculo de BDI
// — não inventa nem recalcula nada, só reformata os mesmos números.
// =============================================================================

interface CompanyInfo {
  companyName: string;
  cnpj: string;
  responsibleName: string;
  responsibleTitle: string;
  phone: string;
  email: string;
  logoUrl?: string | null;
}

export interface BDIDemonstrativoParams {
  socialCharges: number;
  adminCentral: number;
  profit: number;
  taxes: number;
  risk: number;
  warranty: number;
  bdiRate: number;
}

const fmtPct = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;

const COMPONENT_ROWS = (p: BDIDemonstrativoParams) => [
  ["1", "Administração Central", "AC", fmtPct(p.adminCentral), "Numerador"],
  ["2", "Garantia", "G", fmtPct(p.warranty), "Numerador"],
  ["3", "Risco", "R", fmtPct(p.risk), "Numerador"],
  ["4", "Lucro", "L", fmtPct(p.profit), "Denominador"],
  ["5", "Impostos", "I", fmtPct(p.taxes), "Denominador"],
];

const FORMULA_TEXT = "BDI = [(1+AC) × (1+G) × (1+R)] / (1 − L − I) − 1";
const NOTE_TEXT =
  "Componentes conforme Acórdão TCU nº 2622/2013-Plenário (AC, G, R, L, I), combinados pela fórmula " +
  "clássica adotada pela empresa. Encargos Sociais incidem apenas sobre mão de obra e ficam fora da " +
  "fórmula do BDI. Cada órgão licitante pode exigir modelo próprio de anexo — confira o edital antes de anexar.";

export function generateBDIExcel(
  companyInfo: CompanyInfo,
  context: string,
  params: BDIDemonstrativoParams
): void {
  const wb = XLSX.utils.book_new();

  const headerData: any[][] = [
    ["DEMONSTRATIVO DE COMPOSIÇÃO DA TAXA DE BDI"],
    [""],
    ["EMPRESA:", companyInfo.companyName, "", "CNPJ:", companyInfo.cnpj],
    ["RESPONSÁVEL:", `${companyInfo.responsibleTitle} ${companyInfo.responsibleName}`, "", "DATA:", new Date().toLocaleDateString("pt-BR")],
    ["REFERENTE A:", context],
    [""],
  ];

  const tableHeader = ["ITEM", "COMPONENTE", "SIGLA", "PERCENTUAL ADOTADO", "INCIDÊNCIA NA FÓRMULA"];
  const tableRows = COMPONENT_ROWS(params);
  const encargosRow = ["—", "Encargos Sociais (apenas sobre mão de obra, fora da fórmula do BDI)", "ES", fmtPct(params.socialCharges), "—"];

  const footerData: any[][] = [
    [""],
    ["FÓRMULA ADOTADA:", FORMULA_TEXT],
    ["BDI RESULTANTE:", fmtPct(params.bdiRate)],
    [""],
    [NOTE_TEXT],
  ];

  const sheetData = [
    ...headerData,
    tableHeader,
    ...tableRows,
    encargosRow,
    ...footerData,
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  ws["!cols"] = [
    { wch: 8 },
    { wch: 46 },
    { wch: 10 },
    { wch: 20 },
    { wch: 22 },
  ];

  // Título
  if (ws["A1"]) {
    ws["A1"].s = { font: { bold: true, sz: 13 } };
  }

  const tableHeaderRow = headerData.length + 1; // 1-indexed
  ["A", "B", "C", "D", "E"].forEach((col) => {
    const cellRef = `${col}${tableHeaderRow}`;
    if (ws[cellRef]) {
      ws[cellRef].s = {
        fill: { fgColor: { rgb: "2980B9" } },
        font: { color: { rgb: "FFFFFF" }, bold: true },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }
  });

  const bdiResultRowIndex = headerData.length + 1 + tableRows.length + 1 + 1 + 1; // header+tableHeader+rows+encargos+blank+formula
  const bdiResultCell = `B${bdiResultRowIndex}`;
  if (ws[bdiResultCell]) {
    ws[bdiResultCell].s = {
      font: { bold: true, sz: 12, color: { rgb: "1E40AF" } },
    };
  }

  XLSX.utils.book_append_sheet(wb, ws, "Demonstrativo BDI");

  const filename = `demonstrativo-bdi-${context.replace(/\s+/g, "-").toLowerCase()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export async function generateBDIPDF(
  companyInfo: CompanyInfo,
  context: string,
  params: BDIDemonstrativoParams
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("DEMONSTRATIVO DE COMPOSIÇÃO DA TAXA DE BDI", pageWidth / 2, margin, { align: "center" });

  let yPos = margin + 10;
  doc.setFontSize(9);

  const renderRow = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 30, yPos);
    yPos += 5;
  };

  renderRow("EMPRESA:", companyInfo.companyName);
  renderRow("CNPJ:", companyInfo.cnpj);
  renderRow("RESPONSÁVEL:", `${companyInfo.responsibleTitle} ${companyInfo.responsibleName}`);
  renderRow("DATA:", new Date().toLocaleDateString("pt-BR"));
  renderRow("REFERENTE A:", context);

  yPos += 3;
  doc.setLineWidth(0.3);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 5;

  const tableRows = [...COMPONENT_ROWS(params), ["—", "Encargos Sociais (apenas sobre mão de obra, fora da fórmula do BDI)", "ES", fmtPct(params.socialCharges), "—"]];

  autoTable(doc, {
    startY: yPos,
    head: [["ITEM", "COMPONENTE", "SIGLA", "PERCENTUAL", "INCIDÊNCIA"]],
    body: tableRows,
    theme: "grid",
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold", halign: "center" },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: {
      0: { halign: "center", cellWidth: 15 },
      2: { halign: "center", cellWidth: 20 },
      3: { halign: "center", cellWidth: 30 },
      4: { halign: "center", cellWidth: 30 },
    },
    margin: { left: margin, right: margin },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Fórmula adotada:", margin, finalY);
  doc.setFont("helvetica", "normal");
  doc.text(FORMULA_TEXT, margin, finalY + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 64, 175);
  doc.text(`BDI resultante: ${fmtPct(params.bdiRate)}`, margin, finalY + 16);
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  const noteLines = doc.splitTextToSize(NOTE_TEXT, pageWidth - margin * 2);
  doc.text(noteLines, margin, finalY + 26);

  const filename = `demonstrativo-bdi-${context.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  doc.save(filename);
}
