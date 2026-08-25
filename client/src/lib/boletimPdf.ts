import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface BoletimCompanyInfo {
  companyName: string;
  cnpj: string;
  responsibleName: string;
  responsibleTitle: string;
  phone: string;
  email: string;
  logoUrl?: string | null;
}

export interface BoletimClientInfo {
  name: string;
  document: string;
}

export interface BoletimPeriodSummary {
  periodNumber: number;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  status: "open" | "closed";
  totalMedidoPeriodo: number;
  totalMedidoAcumulado: number;
  percentAcumulado: number;
}

export interface BoletimItemRow {
  itemNumber: string;
  description: string;
  unit: string;
  quantity: number;
  unitCostWithBdi: number;
  totalWithBdi: number;
  percentMedidoPeriodo: number;
  valueMedidoPeriodo: number;
  percentAcumulado: number;
  valueAcumulado: number;
  saldo: number;
  isStage: boolean;
  depth: number;
}

export interface BoletimAdditiveSection {
  additiveName: string;
  additiveTotal: number;
  items: BoletimItemRow[];
  totalMedidoPeriodo: number;
  totalMedidoAcumulado: number;
}

export interface BoletimData {
  budgetTitle: string;
  budgetCode?: string | null;
  company: BoletimCompanyInfo | null;
  client: BoletimClientInfo | null;
  projectName?: string | null;
  selectedPeriod: {
    id: number;
    name: string;
    periodNumber: number;
    startDate?: string | null;
    endDate?: string | null;
  };
  allPeriods: BoletimPeriodSummary[];
  totalContrato: number;
  totalMedidoPeriodo: number;
  totalMedidoAcumulado: number;
  totalAditivos: number;
  items: BoletimItemRow[];
  additives: BoletimAdditiveSection[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
}

// ─── Função principal ────────────────────────────────────────────────────────
export async function exportBoletimPDF(data: BoletimData): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 297mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
  const margin = 10;
  const contentWidth = pageWidth - 2 * margin;

  // ─── Cores ───────────────────────────────────────────────────────────────
  // Hierarquia visual (mesma paleta da planilha de orçamento)
  const BLUE_DARK: [number, number, number]  = [30, 58, 138];   // depth=0 etapa mãe
  const BLUE_MED: [number, number, number]   = [37, 99, 235];   // depth=1 sub-etapa
  const BLUE_LIGHT: [number, number, number] = [96, 165, 250];  // depth=2 sub-sub-etapa
  const GREEN: [number, number, number]      = [22, 163, 74];
  const ORANGE: [number, number, number]     = [234, 88, 12];
  const GRAY_DARK: [number, number, number]  = [51, 65, 85];
  const GRAY_LIGHT: [number, number, number] = [241, 245, 249];
  const WHITE: [number, number, number]      = [255, 255, 255];
  // Cor do cabeçalho da tabela (cinza escuro)
  const HEADER_BG: [number, number, number]  = [30, 41, 59];

   // ─── Logo com remoção automática de fundo ────────────────────────────────────────────
  // Remove o fundo da logo usando flood-fill a partir dos 4 cantos com
  // tolerância de cor, gerando um PNG com fundo transparente para o PDF.
  const removeLogoBackground = (src: string, tolerance = 40): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width;
        const h = canvas.height;

        // Coleta a cor de fundo a partir dos 4 cantos
        const corners = [
          [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]
        ] as [number, number][];

        const colorDist = (i: number, r: number, g: number, b: number) =>
          Math.sqrt(
            (data[i] - r) ** 2 +
            (data[i + 1] - g) ** 2 +
            (data[i + 2] - b) ** 2
          );

        // Flood-fill BFS a partir de cada canto
        const visited = new Uint8Array(w * h);
        const queue: number[] = [];

        for (const [cx, cy] of corners) {
          const idx = (cy * w + cx) * 4;
          const br = data[idx], bg = data[idx + 1], bb = data[idx + 2];
          const startPx = cy * w + cx;
          if (!visited[startPx]) {
            visited[startPx] = 1;
            queue.push(startPx);
            while (queue.length > 0) {
              const px = queue.pop()!;
              const pi = px * 4;
              data[pi + 3] = 0; // torna transparente
              const x = px % w;
              const y = Math.floor(px / w);
              const neighbors = [
                x > 0 ? px - 1 : -1,
                x < w - 1 ? px + 1 : -1,
                y > 0 ? px - w : -1,
                y < h - 1 ? px + w : -1,
              ];
              for (const np of neighbors) {
                if (np >= 0 && !visited[np]) {
                  const ni = np * 4;
                  if (colorDist(ni, br, bg, bb) < tolerance) {
                    visited[np] = 1;
                    queue.push(np);
                  }
                }
              }
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(src); // fallback: usa original
      img.src = src;
    });

  let logoDataUrl: string | null = null;
  if (data.company?.logoUrl) {
    try {
      const resp = await fetch(data.company.logoUrl);
      const blob = await resp.blob();
      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      // Remove o fundo automaticamente antes de inserir no PDF
      logoDataUrl = await removeLogoBackground(rawDataUrl, 45);
    } catch {
      logoDataUrl = null;
     }
  }
  // ─── Cabeçalho reutilizável ───────────────────────────────────────────────
  // Altura do cabeçalho — DEVE ser usada como margin.top em todos os autoTable
  const HEADER_HEIGHT = 26; // mm (cabeçalho 22mm + linha separadora + margem)

  const drawHeader = (pageTitle: string) => {
    doc.setFillColor(...BLUE_DARK);
    doc.rect(0, 0, pageWidth, 22, "F");

    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", margin, 3, 30, 16);
      } catch { /* sem logo */ }
    }

    doc.setTextColor(...WHITE);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("BOLETIM DE MEDIÇÃO", pageWidth / 2, 9, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const titleText = data.budgetTitle.length > 80 ? data.budgetTitle.substring(0, 77) + "..." : data.budgetTitle;
    doc.text(titleText.toUpperCase(), pageWidth / 2, 14, { align: "center" });
    doc.setFontSize(7);
    doc.text(pageTitle, pageWidth / 2, 19, { align: "center" });

    if (data.company) {
      const cx = pageWidth - margin;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(data.company.companyName, cx, 7, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.text(`CNPJ: ${data.company.cnpj}`, cx, 11, { align: "right" });
      doc.text(`${data.company.responsibleName} — ${data.company.responsibleTitle}`, cx, 15, { align: "right" });
      doc.text(`${data.company.phone} | ${data.company.email}`, cx, 19, { align: "right" });
    }

    doc.setDrawColor(...BLUE_MED);
    doc.setLineWidth(0.5);
    doc.line(margin, 23, pageWidth - margin, 23);
    // Limpar área abaixo do cabeçalho para evitar sobreposição
    doc.setFillColor(...WHITE);
    doc.rect(0, 23.5, pageWidth, HEADER_HEIGHT - 23.5, "F");
  };

  // ─── Página 1: Capa ───────────────────────────────────────────────────────
  drawHeader(`Período: ${data.selectedPeriod.name}`);

  let y = 27;

  // Dados do cliente e período
  doc.setFillColor(...GRAY_LIGHT);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY_DARK);

  const col1 = margin + 4;
  const col2 = margin + contentWidth / 2 + 4;

  doc.text("PROPRIETÁRIO / CONTRATANTE:", col1, y + 5);
  doc.setFont("helvetica", "normal");
  doc.text(data.client?.name || "—", col1, y + 10);
  doc.text(`CPF/CNPJ: ${data.client?.document || "—"}`, col1, y + 15);

  doc.setFont("helvetica", "bold");
  doc.text("OBRA / PROJETO:", col2, y + 5);
  doc.setFont("helvetica", "normal");
  doc.text(data.projectName || data.budgetTitle, col2, y + 10);
  if (data.budgetCode) {
    doc.text(`Código: ${data.budgetCode}`, col2, y + 15);
  }

  y += 22;

  // Cards resumo
  const cardW = (contentWidth - 12) / 4;
  const cardH = 18;
  const totalContratoComAditivos = data.totalContrato + data.totalAditivos;
  const cards = [
    { label: "VALOR DO CONTRATO", value: `R$ ${fmtBRL(totalContratoComAditivos)}`, color: BLUE_DARK },
    { label: "MEDIDO NO PERÍODO", value: `R$ ${fmtBRL(data.totalMedidoPeriodo)}`, color: BLUE_MED },
    { label: "ACUMULADO MEDIDO", value: `R$ ${fmtBRL(data.totalMedidoAcumulado)} (${fmtPct(totalContratoComAditivos > 0 ? (data.totalMedidoAcumulado / totalContratoComAditivos) * 100 : 0)})`, color: ORANGE },
    { label: "SALDO A MEDIR", value: `R$ ${fmtBRL(totalContratoComAditivos - data.totalMedidoAcumulado)}`, color: GREEN },
  ];

  cards.forEach((card, i) => {
    const cx = margin + i * (cardW + 4);
    doc.setFillColor(...card.color);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text(card.label, cx + cardW / 2, y + 6, { align: "center" });
    doc.setFontSize(8);
    doc.text(card.value, cx + cardW / 2, y + 13, { align: "center" });
  });

  y += cardH + 5;

  // Detalhes do período
  doc.setTextColor(...GRAY_DARK);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Período: ${data.selectedPeriod.name}  |  Início: ${fmtDate(data.selectedPeriod.startDate)}  |  Término: ${fmtDate(data.selectedPeriod.endDate)}`,
    margin, y
  );
  y += 5;

  // Título da tabela histórico
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE_DARK);
  doc.text("HISTÓRICO DE MEDIÇÕES", margin, y);
  y += 3;

  const periodTableHead = [["Nº", "PERÍODO", "INÍCIO", "FIM", "MEDIDO NO PERÍODO (R$)", "ACUMULADO (R$)", "% ACUM.", "STATUS"]];
  const periodTableBody = data.allPeriods.map(p => [
    String(p.periodNumber),
    p.name,
    fmtDate(p.startDate),
    fmtDate(p.endDate),
    `R$ ${fmtBRL(p.totalMedidoPeriodo)}`,
    `R$ ${fmtBRL(p.totalMedidoAcumulado)}`,
    fmtPct(p.percentAcumulado),
    p.status === "closed" ? "Fechado" : "Aberto",
  ]);

  autoTable(doc, {
    startY: y,
    head: periodTableHead,
    body: periodTableBody,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: BLUE_DARK, textColor: WHITE, fontStyle: "bold" },
    alternateRowStyles: { fillColor: GRAY_LIGHT },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 38, halign: "right" },
      5: { cellWidth: 38, halign: "right" },
      6: { cellWidth: 18, halign: "center" },
      7: { cellWidth: 16, halign: "center" },
    },
    margin: { top: HEADER_HEIGHT, left: margin, right: margin, bottom: 8 },
    didDrawPage: () => { drawHeader(`Período: ${data.selectedPeriod.name}`); },
  });

  // ─── Páginas 2+: Planilha do Orçamento Original ───────────────────────────
  doc.addPage();
  drawHeader(`Orçamento Original — ${data.selectedPeriod.name}`);

  const tableHead = [["ITEM", "DESCRIÇÃO", "UN", "QTDE", "VL UNIT (c/BDI)", "VL TOTAL (c/BDI)", "% MED.", "VL MEDIDO", "% ACUM.", "VL ACUM.", "SALDO"]];

  // ─── Monta corpo da tabela ────────────────────────────────────────────────
  // Padrão visual da planilha de orçamento:
  //   depth=0 (etapa mãe)      → fundo azul escuro, texto branco, negrito
  //   depth=1 (sub-etapa)      → fundo azul médio, texto branco, negrito
  //   depth=2 (sub-sub-etapa)  → fundo azul claro, texto branco, negrito
  //   itens                    → fundo branco/alternado, texto escuro
  const buildTableBody = (items: BoletimItemRow[]) =>
    items.map(item => {
      if (item.isStage) {
        // Etapas: mostrar apenas número, descrição em maiúsculas e totais
        return [
          item.itemNumber,
          item.description.toUpperCase(),
          "", "", "",
          item.totalWithBdi > 0 ? `R$ ${fmtBRL(item.totalWithBdi)}` : "",
          item.percentMedidoPeriodo > 0 ? fmtPct(item.percentMedidoPeriodo) : "",
          item.valueMedidoPeriodo > 0 ? `R$ ${fmtBRL(item.valueMedidoPeriodo)}` : "",
          item.percentAcumulado > 0 ? fmtPct(item.percentAcumulado) : "",
          item.valueAcumulado > 0 ? `R$ ${fmtBRL(item.valueAcumulado)}` : "",
          item.saldo > 0 ? `R$ ${fmtBRL(item.saldo)}` : "",
        ];
      }
      return [
        item.itemNumber,
        item.description,
        item.unit,
        item.quantity.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
        `R$ ${fmtBRL(item.unitCostWithBdi)}`,
        `R$ ${fmtBRL(item.totalWithBdi)}`,
        fmtPct(item.percentMedidoPeriodo),
        `R$ ${fmtBRL(item.valueMedidoPeriodo)}`,
        fmtPct(item.percentAcumulado),
        `R$ ${fmtBRL(item.valueAcumulado)}`,
        `R$ ${fmtBRL(item.saldo)}`,
      ];
    });

  // ─── Estilos por linha (hierarquia visual) ───────────────────────────────
  const getRowStyles = (items: BoletimItemRow[]) => {
    const styles: Record<number, any> = {};
    items.forEach((item, idx) => {
      if (item.isStage) {
        if (item.depth === 0) {
          // Etapa mãe (1, 2, 3...): azul escuro, fonte 6.5pt, padding compacto
          styles[idx] = {
            fillColor: BLUE_DARK,
            textColor: WHITE,
            fontStyle: "bold",
            fontSize: 6.5,
            cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 2 },
          };
        } else if (item.depth === 1) {
          // Sub-etapa (1.1, 1.2...): azul médio, fonte 6.5pt
          styles[idx] = {
            fillColor: BLUE_MED,
            textColor: WHITE,
            fontStyle: "bold",
            fontSize: 6.5,
            cellPadding: { top: 2, bottom: 2, left: 5, right: 2 },
          };
        } else {
          // Sub-sub-etapa (1.1.1...): azul claro, fonte 6.5pt
          styles[idx] = {
            fillColor: BLUE_LIGHT,
            textColor: WHITE,
            fontStyle: "bold",
            fontSize: 6.5,
            cellPadding: { top: 2, bottom: 2, left: 7, right: 2 },
          };
        }
      }
    });
    return styles;
  };

  const tableBody = buildTableBody(data.items);
  const rowStyles = getRowStyles(data.items);

  // Linha total geral
  tableBody.push([
    "", "TOTAL GERAL DO ORÇAMENTO ORIGINAL", "", "", "",
    `R$ ${fmtBRL(data.totalContrato)}`,
    "",
    `R$ ${fmtBRL(data.totalMedidoPeriodo)}`,
    fmtPct(data.totalContrato > 0 ? (data.totalMedidoAcumulado / data.totalContrato) * 100 : 0),
    `R$ ${fmtBRL(data.totalMedidoAcumulado)}`,
    `R$ ${fmtBRL(data.totalContrato - data.totalMedidoAcumulado)}`,
  ]);
  rowStyles[tableBody.length - 1] = { fillColor: GREEN, textColor: WHITE, fontStyle: "bold" };

  const colStyles = {
    0: { cellWidth: 12, halign: "center" as const },
    1: { cellWidth: "auto" as const },
    2: { cellWidth: 10, halign: "center" as const },
    3: { cellWidth: 14, halign: "right" as const },
    4: { cellWidth: 24, halign: "right" as const },
    5: { cellWidth: 26, halign: "right" as const },
    6: { cellWidth: 14, halign: "center" as const },
    7: { cellWidth: 24, halign: "right" as const },
    8: { cellWidth: 14, halign: "center" as const },
    9: { cellWidth: 24, halign: "right" as const },
    10: { cellWidth: 24, halign: "right" as const },
  };

  autoTable(doc, {
    startY: HEADER_HEIGHT,
    head: tableHead,
    body: tableBody,
    styles: { fontSize: 6.5, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: HEADER_BG, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    bodyStyles: { textColor: GRAY_DARK },
    columnStyles: colStyles,
    didParseCell: (hookData) => {
      const style = rowStyles[hookData.row.index];
      if (style && hookData.row.section === "body") {
        hookData.cell.styles.fillColor = style.fillColor;
        hookData.cell.styles.textColor = style.textColor;
        hookData.cell.styles.fontStyle = style.fontStyle;
        if (style.fontSize) hookData.cell.styles.fontSize = style.fontSize;
        if (style.cellPadding) hookData.cell.styles.cellPadding = style.cellPadding;
      }
    },
    margin: { top: HEADER_HEIGHT, left: margin, right: margin, bottom: 8 },
    didDrawPage: () => { drawHeader(`Orçamento Original — ${data.selectedPeriod.name}`); },
  });

  // ─── Páginas de Aditivos ──────────────────────────────────────────────────
  for (const additive of data.additives) {
    doc.addPage();
    drawHeader(`Aditivo: ${additive.additiveName} — ${data.selectedPeriod.name}`);

    const addBody = buildTableBody(additive.items);
    const addRowStyles = getRowStyles(additive.items);

    addBody.push([
      "", `TOTAL DO ADITIVO: ${additive.additiveName.toUpperCase()}`, "", "", "",
      `R$ ${fmtBRL(additive.additiveTotal)}`,
      "",
      `R$ ${fmtBRL(additive.totalMedidoPeriodo)}`,
      fmtPct(additive.additiveTotal > 0 ? (additive.totalMedidoAcumulado / additive.additiveTotal) * 100 : 0),
      `R$ ${fmtBRL(additive.totalMedidoAcumulado)}`,
      `R$ ${fmtBRL(additive.additiveTotal - additive.totalMedidoAcumulado)}`,
    ]);
    addRowStyles[addBody.length - 1] = { fillColor: GREEN, textColor: WHITE, fontStyle: "bold" };

    autoTable(doc, {
      startY: HEADER_HEIGHT,
      head: tableHead,
      body: addBody,
      styles: { fontSize: 6.5, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: HEADER_BG, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
      bodyStyles: { textColor: GRAY_DARK },
      columnStyles: colStyles,
      didParseCell: (hookData) => {
        const style = addRowStyles[hookData.row.index];
        if (style && hookData.row.section === "body") {
          hookData.cell.styles.fillColor = style.fillColor;
          hookData.cell.styles.textColor = style.textColor;
          hookData.cell.styles.fontStyle = style.fontStyle;
          if (style.fontSize) hookData.cell.styles.fontSize = style.fontSize;
          if (style.cellPadding) hookData.cell.styles.cellPadding = style.cellPadding;
        }
      },
      margin: { top: HEADER_HEIGHT, left: margin, right: margin, bottom: 8 },
      didDrawPage: () => { drawHeader(`Aditivo: ${additive.additiveName} — ${data.selectedPeriod.name}`); },
    });
  }

  // ─── Rodapé em todas as páginas ───────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    const footerY = pageHeight - 4;
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, margin, footerY);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, footerY, { align: "right" });
    doc.text(data.company?.companyName || "", pageWidth / 2, footerY, { align: "center" });
  }

  // ─── Salvar ───────────────────────────────────────────────────────────────
  const safeName = (s: string) => s.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, "_").substring(0, 40);
  const filename = `boletim-medicao_${safeName(data.budgetTitle)}_${safeName(data.selectedPeriod.name)}.pdf`;
  doc.save(filename);
}
