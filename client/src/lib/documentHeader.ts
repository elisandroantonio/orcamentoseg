// Cabeçalho corporativo compartilhado (logo + faixa + painel de dados) usado
// nos documentos exportados fora do orçamento principal — Cronograma
// (Gantt) e Desembolso, em PDF e Excel. Mesma identidade visual do PDF do
// orçamento (client/src/lib/pdf-export.ts), só generalizada pra aceitar
// título/rótulo diferentes e reaproveitada em mais de um lugar em vez de
// duplicar o desenho do cabeçalho em cada exportador.
import type { jsPDF } from "jspdf";
import type ExcelJS from "exceljs";

export const PETROL_DARK: [number, number, number] = [8, 15, 38];
export const PETROL_LIGHT: [number, number, number] = [26, 42, 82];
export const PANEL_TINT: [number, number, number] = [233, 236, 243];
export const VALUE_COLOR: [number, number, number] = [55, 65, 81];
export const LINK_COLOR: [number, number, number] = [26, 42, 82];

const rgbToArgb = (rgb: [number, number, number]) =>
  `FF${rgb.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

export interface CorporateCompanyInfo {
  companyName: string;
  cnpj: string;
  responsibleName: string;
  responsibleTitle: string;
  phone: string;
  email: string;
  logoUrl?: string | null;
}

export interface CorporateClientInfo {
  name: string;
  address?: string | null;
}

export interface CorporateHeaderOptions {
  documentLabel: string; // rótulo pequeno em cima, ex.: "CRONOGRAMA — GRÁFICO DE GANTT"
  mainTitle: string; // título grande — nome da obra/projeto
  subtitle?: string; // linha menor abaixo do título — ex.: título do orçamento
  companyInfo: CorporateCompanyInfo;
  clientInfo?: CorporateClientInfo | null;
  budgetCode?: string;
}

// Busca a imagem e CONFERE os bytes de verdade (assinatura PNG) antes de
// aceitar — uma URL antiga/quebrada pode responder 200 OK com uma página de
// erro em HTML em vez de 404, o que passaria batido só checando "resp.ok".
async function fetchPngBytes(url: string): Promise<Uint8Array> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar ${url}`);
  const blob = await resp.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = bytes.length > 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
  if (!isPng) {
    throw new Error(`Resposta de ${url} não é um PNG válido (content-type: ${blob.type || "desconhecido"})`);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// Ordem de tentativa: (1) logo cadastrada em Configurações da Empresa, (2)
// logo padrão da EG dedicada a documentos, (3) logo padrão geral do app. Cada
// etapa só entra em ação se a anterior falhar de verdade — o documento nunca
// sai sem logo nenhuma por causa de um link quebrado.
async function resolveLogoBytes(logoUrl?: string | null): Promise<Uint8Array | null> {
  for (const candidate of [logoUrl, "/logo-eg-pdf.png", "/logo-eg.png"]) {
    if (!candidate) continue;
    try {
      return await fetchPngBytes(candidate);
    } catch (error) {
      console.warn(`Logo "${candidate}" não pôde ser usada, tentando a próxima opção:`, error);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// PDF (jsPDF) — reproduz o mesmo desenho do cabeçalho do PDF de orçamento:
// faixa no topo, bloco de título à esquerda, logo + selo do código à
// direita, divisória e painel de dados (proprietário/obra e empresa).
// Devolve o Y onde o conteúdo do documento (tabela etc.) deve começar.
// ---------------------------------------------------------------------------
export async function drawPdfCorporateHeader(doc: jsPDF, opts: CorporateHeaderOptions): Promise<number> {
  const { documentLabel, mainTitle, subtitle, companyInfo, clientInfo, budgetCode } = opts;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;

  doc.setFillColor(...PETROL_DARK);
  doc.rect(0, 0, pageWidth, 2.5, "F");

  const logoWidth = 34;
  const logoHeight = 27;
  const logoX = pageWidth - margin - logoWidth;
  const logoY = margin;
  const titleMaxWidth = logoX - 8 - margin;

  let cursorY = margin + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PETROL_LIGHT);
  doc.text(documentLabel, margin, cursorY);
  cursorY += 7;

  doc.setFontSize(15);
  doc.setTextColor(...PETROL_DARK);
  const titleLines = doc.splitTextToSize(mainTitle || "N/A", titleMaxWidth);
  doc.text(titleLines, margin, cursorY);
  cursorY += Math.max(7, titleLines.length * 7);

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...VALUE_COLOR);
    const subLines = doc.splitTextToSize(subtitle, titleMaxWidth);
    doc.text(subLines, margin, cursorY);
    cursorY += Math.max(5, subLines.length * 5);
  }

  let logoBottom = logoY;
  const logoBytes = await resolveLogoBytes(companyInfo.logoUrl);
  if (logoBytes) {
    try {
      const base64 = bytesToBase64(logoBytes);
      doc.addImage(`data:image/png;base64,${base64}`, "PNG", logoX, logoY, logoWidth, logoHeight);
      logoBottom = logoY + logoHeight;
    } catch (error) {
      console.warn("Não foi possível desenhar a logo no PDF, seguindo sem ela:", error);
    }
  }

  if (budgetCode) {
    const badgeY = logoBottom + 3;
    const badgeHeight = 6.5;
    doc.setDrawColor(...PETROL_LIGHT);
    doc.setFillColor(...PANEL_TINT);
    doc.setLineWidth(0.3);
    doc.roundedRect(logoX, badgeY, logoWidth, badgeHeight, 1.2, 1.2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...PETROL_DARK);
    doc.text(budgetCode, logoX + logoWidth / 2, badgeY + badgeHeight / 2 + 1.3, { align: "center" });
    logoBottom = badgeY + badgeHeight;
  }

  const dividerY = Math.max(cursorY + 3, logoBottom + 3);
  doc.setDrawColor(...PETROL_LIGHT);
  doc.setLineWidth(0.6);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  doc.setFontSize(8);
  const col1X = margin + 4;
  const col1LabelWidth = 30;
  const col2X = 156;
  const col2LabelWidth = 30;
  const col1MaxX = col2X - 6;
  const col2MaxX = logoX - 6;

  interface HeaderField {
    label: string;
    value: string;
    isLink?: boolean;
  }
  const col1Fields: HeaderField[] = [
    ...(clientInfo ? [{ label: "PROPRIETÁRIO:", value: clientInfo.name }] : []),
    ...(clientInfo?.address ? [{ label: "LOCAL:", value: clientInfo.address }] : []),
    { label: "DATA:", value: new Date().toLocaleDateString("pt-BR") },
  ];
  const col2Fields: HeaderField[] = [
    { label: "EMPRESA:", value: companyInfo.companyName || "N/A" },
    { label: "CNPJ:", value: companyInfo.cnpj || "N/A" },
    { label: "RESPONSÁVEL:", value: `${companyInfo.responsibleTitle || ""} ${companyInfo.responsibleName || ""}`.trim() || "N/A" },
    { label: "TELEFONE:", value: companyInfo.phone || "N/A" },
    { label: "EMAIL:", value: companyInfo.email || "N/A", isLink: true },
  ];

  function renderColumn(
    fields: HeaderField[],
    colX: number,
    labelWidth: number,
    maxX: number,
    startY: number,
    draw: boolean
  ): number {
    let y = startY;
    const maxWidth = Math.max(20, maxX - (colX + labelWidth));
    for (const field of fields) {
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(field.value || "N/A", maxWidth);
      if (draw) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...PETROL_DARK);
        doc.text(field.label, colX, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...(field.isLink ? LINK_COLOR : VALUE_COLOR));
        doc.text(lines, colX + labelWidth, y);
      }
      const lineHeight = 5;
      y += Math.max(lineHeight, lines.length * lineHeight);
    }
    return y;
  }

  const panelFillTop = dividerY + 3;
  const panelTextTop = panelFillTop + 4;
  const col1Bottom = renderColumn(col1Fields, col1X, col1LabelWidth, col1MaxX, panelTextTop, false);
  const col2Bottom = renderColumn(col2Fields, col2X, col2LabelWidth, col2MaxX, panelTextTop, false);
  const panelBottom = Math.max(col1Bottom, col2Bottom) + 4;

  doc.setFillColor(...PANEL_TINT);
  doc.rect(margin, panelFillTop, pageWidth - 2 * margin, panelBottom - panelFillTop, "F");

  renderColumn(col1Fields, col1X, col1LabelWidth, col1MaxX, panelTextTop, true);
  renderColumn(col2Fields, col2X, col2LabelWidth, col2MaxX, panelTextTop, true);
  doc.setTextColor(0, 0, 0);

  return panelBottom + 5;
}

// ---------------------------------------------------------------------------
// Excel (ExcelJS) — logo "flutuando" no canto superior esquerdo (não
// depende da largura das colunas, que varia de planilha pra planilha) +
// bloco de texto ao lado (rótulo, título, empresa, proprietário) + uma linha
// fina de divisória. Devolve a primeira linha livre pro conteúdo do
// caller (cabeçalho de tabela, dados etc.).
// ---------------------------------------------------------------------------
export async function addExcelCorporateHeader(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  opts: CorporateHeaderOptions & { fillWidthCols: number }
): Promise<number> {
  const { documentLabel, mainTitle, subtitle, companyInfo, clientInfo, budgetCode, fillWidthCols } = opts;
  const TEXT_COL = 4; // deixa as 3 primeiras colunas livres pro logo, mesmo em planilhas com coluna A larga

  const logoBytes = await resolveLogoBytes(companyInfo.logoUrl);
  if (logoBytes) {
    try {
      const imageId = workbook.addImage({ base64: bytesToBase64(logoBytes), extension: "png" });
      worksheet.addImage(imageId, {
        tl: { col: 0.15, row: 0.15 } as any,
        ext: { width: 120, height: 48 },
        editAs: "absolute",
      } as any);
    } catch (error) {
      console.warn("Não foi possível inserir a logo no Excel, seguindo sem ela:", error);
    }
  }

  let row = 1;
  const labelCell = worksheet.getCell(row, TEXT_COL);
  labelCell.value = budgetCode ? `${documentLabel}  ·  ${budgetCode}` : documentLabel;
  labelCell.font = { bold: true, size: 9, color: { argb: rgbToArgb(PETROL_LIGHT) } };
  row++;

  const titleCell = worksheet.getCell(row, TEXT_COL);
  titleCell.value = mainTitle || "N/A";
  titleCell.font = { bold: true, size: 14, color: { argb: rgbToArgb(PETROL_DARK) } };
  row++;

  if (subtitle) {
    const subtitleCell = worksheet.getCell(row, TEXT_COL);
    subtitleCell.value = subtitle;
    subtitleCell.font = { size: 9, color: { argb: rgbToArgb(VALUE_COLOR) } };
    row++;
  }

  row++; // linha em branco antes da linha de dados da empresa/proprietário

  const companyLine = [
    `Empresa: ${companyInfo.companyName || "N/A"}`,
    companyInfo.cnpj ? `CNPJ: ${companyInfo.cnpj}` : null,
    `Responsável: ${`${companyInfo.responsibleTitle || ""} ${companyInfo.responsibleName || ""}`.trim() || "N/A"}`,
    companyInfo.phone ? `Tel: ${companyInfo.phone}` : null,
    companyInfo.email ? `Email: ${companyInfo.email}` : null,
  ]
    .filter(Boolean)
    .join("   ·   ");
  const companyCell = worksheet.getCell(row, TEXT_COL);
  companyCell.value = companyLine;
  companyCell.font = { size: 8, color: { argb: rgbToArgb(VALUE_COLOR) } };
  row++;

  if (clientInfo) {
    const clientLine = [`Proprietário: ${clientInfo.name}`, clientInfo.address ? `Local: ${clientInfo.address}` : null]
      .filter(Boolean)
      .join("   ·   ");
    const clientCell = worksheet.getCell(row, TEXT_COL);
    clientCell.value = clientLine;
    clientCell.font = { size: 8, color: { argb: rgbToArgb(VALUE_COLOR) } };
    row++;
  }

  row++; // espaço antes da divisória

  // Divisória fina (linha inteira preenchida) até a última coluna usada pelo
  // conteúdo do documento.
  for (let c = 1; c <= Math.max(fillWidthCols, TEXT_COL); c++) {
    worksheet.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: rgbToArgb(PETROL_LIGHT) } };
  }
  worksheet.getRow(row).height = 2;
  row++;

  row++; // espaço depois da divisória, antes do conteúdo do caller

  return row;
}
