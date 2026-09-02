import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
  level: number; // 0 = etapa, 1 = composição
  stageId?: number;
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

// Função para formatar valores em reais com separador de milhares
function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface BDIParams {
  socialCharges: number;
  adminCentral: number;
  profit: number;
  taxes: number;
  risk: number;
  warranty: number;
  bdiRate: number; // taxa resultante em %
}

export async function generateBudgetPDF(
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
  // Criar PDF em formato A4 paisagem
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;

  // Cabeçalho: faixa de destaque + bloco de título (ORÇAMENTO / nome da
  // obra) + logo com selo do código + painel de dados do proprietário e da
  // empresa, num azul-marinho bem escuro e fechado.
  const PETROL_DARK: [number, number, number] = [8, 15, 38];
  const PETROL_LIGHT: [number, number, number] = [26, 42, 82];
  const PANEL_TINT: [number, number, number] = [233, 236, 243];
  const VALUE_COLOR: [number, number, number] = [55, 65, 81];
  const LINK_COLOR: [number, number, number] = [26, 42, 82];

  // Faixa de destaque no topo da página.
  doc.setFillColor(...PETROL_DARK);
  doc.rect(0, 0, pageWidth, 2.5, "F");

  const logoWidth = 40;
  const logoHeight = 32;
  const logoX = pageWidth - margin - logoWidth;
  const logoY = margin;
  const titleMaxWidth = logoX - 8 - margin;

  // Bloco de título: identifica o documento de cara — nome da obra em
  // destaque (é o que identifica o documento pro cliente) e o título do
  // orçamento específico logo abaixo, menor.
  let cursorY = margin + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PETROL_LIGHT);
  doc.text("O R Ç A M E N T O", margin, cursorY);
  cursorY += 7;

  doc.setFontSize(16);
  doc.setTextColor(...PETROL_DARK);
  const projectLines = doc.splitTextToSize(projectInfo.name || "N/A", titleMaxWidth);
  doc.text(projectLines, margin, cursorY);
  cursorY += Math.max(7, projectLines.length * 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...VALUE_COLOR);
  const titleLines = doc.splitTextToSize(budgetTitle || "Orçamento", titleMaxWidth);
  doc.text(titleLines, margin, cursorY);
  cursorY += Math.max(5, titleLines.length * 5);

  // Logo (direita). Tenta o logo cadastrado em Configurações da Empresa;
  // se não tiver ou falhar ao carregar (ex.: URL antiga que não existe
  // mais), cai pro logo padrão da EG Construtora — o PDF nunca sai sem
  // logo nenhuma por causa de um link quebrado.
  // Busca a imagem e CONFERE os bytes de verdade (assinatura PNG) antes de
  // aceitar — uma URL antiga/quebrada pode responder 200 OK com uma página
  // de erro em HTML em vez de 404, o que passaria batido só checando
  // "resp.ok". Sem essa checagem, o jsPDF recebe lixo e quebra o PDF
  // inteiro com "wrong PNG signature".
  async function loadImageAsPngDataUrl(url: string): Promise<string> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar ${url}`);
    const blob = await resp.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const isPng = bytes.length > 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
    if (!isPng) {
      throw new Error(`Resposta de ${url} não é um PNG válido (content-type: ${blob.type || "desconhecido"})`);
    }
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Ordem de tentativa: (1) logo cadastrada em Configurações da Empresa,
  // (2) logo padrão da EG dedicada a documentos, (3) logo padrão geral do
  // app. Cada etapa só entra em ação se a anterior falhar de verdade.
  let logoData: string | null = null;
  for (const candidate of [companyInfo.logoUrl, "/logo-eg-pdf.png", "/logo-eg.png"]) {
    if (!candidate) continue;
    try {
      logoData = await loadImageAsPngDataUrl(candidate);
      break;
    } catch (error) {
      console.warn(`Logo "${candidate}" não pôde ser usada, tentando a próxima opção:`, error);
    }
  }
  // Mesmo com os dados em mãos, desenhar a imagem pode falhar por outros
  // motivos (variante de PNG que o jsPDF não entende, por exemplo) — nunca
  // deixa isso derrubar o PDF inteiro.
  let logoBottom = logoY;
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", logoX, logoY, logoWidth, logoHeight);
      logoBottom = logoY + logoHeight;
    } catch (error) {
      console.warn("Não foi possível desenhar a logo no PDF, seguindo sem ela:", error);
    }
  }

  // Selo com o código do orçamento, logo abaixo da logo.
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

  // Linha divisória entre o bloco de título e o painel de dados.
  const dividerY = Math.max(cursorY + 3, logoBottom + 3);
  doc.setDrawColor(...PETROL_LIGHT);
  doc.setLineWidth(0.6);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  // Painel de dados (proprietário/obra à esquerda, empresa à direita),
  // sobre um fundo com leve tom petróleo pra agrupar visualmente as
  // informações. A altura depende de quanto texto cada valor ocupa (ex.:
  // endereço comprido quebra linha), então primeiro só MEDIMOS as duas
  // colunas (sem desenhar nada) pra saber a altura do painel, desenhamos o
  // fundo colorido, e só depois desenhamos o texto de verdade por cima.
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
    { label: "PROPRIETÁRIO:", value: clientInfo.name },
    { label: "LOCAL:", value: clientInfo.address || "N/A" },
    { label: "RESPONSÁVEL:", value: companyInfo.responsibleName },
    { label: "DATA:", value: new Date().toLocaleDateString("pt-BR") },
  ];
  const col2Fields: HeaderField[] = [
    { label: "EMPRESA:", value: companyInfo.companyName },
    { label: "CNPJ:", value: companyInfo.cnpj },
    // Cidade/UF não tem campo próprio no cadastro ainda — mostra o
    // endereço do cliente em vez de um valor fixo incorreto.
    ...(clientInfo.address ? [{ label: "LOCALIDADE:", value: clientInfo.address }] : []),
    { label: "RESPONSÁVEL:", value: `${companyInfo.responsibleTitle} ${companyInfo.responsibleName}` },
    { label: "TELEFONE:", value: companyInfo.phone },
    { label: "EMAIL:", value: companyInfo.email, isLink: true },
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

  // Tabela de composições
  const tableStartY = panelBottom + 5;
  
  // Calcular totais
  let totalMaterial = 0;
  let totalLabor = 0;
  let grandTotal = 0;
  let itemNumber = 0;

  const tableData = items.map((item: any) => {
    if (item.isStageHeader) {
      // Etapa ou sub-etapa (linha de cabeçalho com total)
      const bgColor = item.level === 0 ? [30, 64, 175] : [70, 100, 200]; // Azul mais escuro para etapas principais
      return [
        "",
        { content: item.description, colSpan: 7, styles: { fontStyle: "bold" as const, fillColor: bgColor as [number, number, number], textColor: 255, halign: "left" as const } },
        { content: `R$ ${formatCurrency(item.stageTotal)}`, styles: { fontStyle: "bold" as const, fillColor: bgColor as [number, number, number], textColor: 255, halign: "right" as const } },
      ];
    } else if (item.isInput) {
      // Insumo (indentado)
      const indent = "  ".repeat(item.level);
      const coeff = parseFloat(item.coefficient) || 0;
      const unitCost = parseFloat(item.unitCost) || 0;
      const inputTotal = coeff * unitCost;
      const isLabor = item.inputType === 'labor' || item.inputType === 'service';
      // materialIncluded (calculado por composição em export-handlers.ts, considera
      // includeMaterialOverride) tem prioridade sobre o includeMaterial geral quando presente.
      const materialAllowed = item.materialIncluded !== undefined ? item.materialIncluded : includeMaterial;
      const matUnit = (!isLabor && materialAllowed) ? unitCost : 0;
      const labUnit = isLabor ? unitCost : 0;
      const matTotal = matUnit * coeff;
      const labTotal = labUnit * coeff;
      return [
        item.itemNumber || "",
        indent + item.description,
        coeff ? coeff.toFixed(4) : "",
        item.unit || "",
        matUnit ? `R$ ${formatCurrency(matUnit)}` : "",
        labUnit ? `R$ ${formatCurrency(labUnit)}` : "",
        matTotal ? `R$ ${formatCurrency(matTotal)}` : "",
        labTotal ? `R$ ${formatCurrency(labTotal)}` : "",
        inputTotal ? `R$ ${formatCurrency(inputTotal)}` : "",
      ];
    } else {
      // Item (composição ou serviço)
      const qty = parseFloat(item.quantity);
      // materialCost desta linha já vem final (zerado ou não conforme includeMaterial +
      // includeMaterialOverride) do export-handlers.ts — materialIncluded=true nas linhas
      // de composição/composto sinaliza isso; só recai no includeMaterial geral se ausente.
      const materialUnit = (item.materialIncluded !== undefined ? item.materialIncluded : includeMaterial) ? item.materialCost : 0;
      const laborUnit = item.laborCost;
      const materialTotal = materialUnit * qty;
      const laborTotal = laborUnit * qty;
      const priceTotal = materialTotal + laborTotal;
      
      // Não acumular filhos de compostos no total geral (o pai já tem o total agregado)
      if (!item.isCompositeChild) {
        totalMaterial += materialTotal;
        totalLabor += laborTotal;
        grandTotal += priceTotal;
      }
      
      const indent = item.level > 0 ? "  " : "";
      return [
        item.itemNumber || "",
        indent + item.description,
        qty.toFixed(2),
        item.unit,
        `R$ ${formatCurrency(materialUnit)}`,
        `R$ ${formatCurrency(laborUnit)}`,
        `R$ ${formatCurrency(materialTotal)}`,
        `R$ ${formatCurrency(laborTotal)}`,
        `R$ ${formatCurrency(priceTotal)}`,
      ];
    }
  });

  // Adicionar linha de totais
  tableData.push([
    "",
    "TOTAL",
    "",
    "",
    "",
    "",
    `R$ ${formatCurrency(totalMaterial)}`,
    `R$ ${formatCurrency(totalLabor)}`,
    `R$ ${formatCurrency(grandTotal)}`,
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [[
      "ITEM",
      "DESCRIÇÃO",
      "QTDE",
      "UN",
      "VALOR UNIT. MAT",
      "VALOR UNIT. M.O.",
      "VALOR TOTAL MATERIAL",
      "VALOR TOTAL M.O.",
      "PREÇO TOTAL"
    ]],
    body: tableData,
    styles: {
      fontSize: 7,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [41, 128, 185] as [number, number, number],
      textColor: 255,
      fontStyle: "bold" as const,
      halign: "center" as const,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" as const }, // ITEM
      1: { cellWidth: 95 }, // Descrição (aumentado para acomodar textos longos)
      2: { cellWidth: 14, halign: "right" as const }, // QTDE
      3: { cellWidth: 11, halign: "center" as const }, // UN
      4: { cellWidth: 24, halign: "right" as const }, // VALOR UNIT. MAT
      5: { cellWidth: 24, halign: "right" as const }, // VALOR UNIT. M.O.
      6: { cellWidth: 28, halign: "right" as const }, // VALOR TOTAL MATERIAL
      7: { cellWidth: 28, halign: "right" as const }, // VALOR TOTAL M.O.
      8: { cellWidth: 28, halign: "right" as const }, // PREÇO TOTAL
    },
    didParseCell: function (data) {
      const item = items[data.row.index] as any;
      // Estilizar linha de totais (última linha)
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fillColor = [30, 64, 175] as [number, number, number]; // Azul #1e40af
        data.cell.styles.textColor = 255; // Branco
        data.cell.styles.fontStyle = "bold";
      } else if (item && item.isCompositeHeader) {
        // Serviço Composto pai: fundo azul bem claro (#DBEAFE)
        data.cell.styles.fillColor = [219, 234, 254] as [number, number, number];
        data.cell.styles.textColor = [30, 64, 175] as unknown as number; // Azul escuro
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: margin, right: margin },
  });

    // Resumo financeiro removido - totais já estão na última linha da tabela;

  // Adicionar observações no rodapé se existirem
  if (observations && observations.trim()) {
    const finalY = (doc as any).lastAutoTable.finalY || tableStartY + 50;
    const observationsY = finalY + 10;
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("OBSERVAÇÕES:", margin, observationsY);
    
    doc.setFont("helvetica", "normal");
    const splitObservations = doc.splitTextToSize(observations, pageWidth - 2 * margin);
    doc.text(splitObservations, margin, observationsY + 5);
  }

  // Salvar PDF
  const filename = `orcamento-${budgetTitle.replace(/\s+/g, "-").toLowerCase()}-${withBDI ? "com-bdi" : "preco-real"}.pdf`;
  doc.save(filename);
}
