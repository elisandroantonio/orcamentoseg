import * as XLSX from "xlsx";

interface CompanyInfo {
  companyName: string;
  cnpj: string;
  responsibleName: string;
  responsibleTitle: string;
  phone: string;
  email: string;
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

// Função para formatar valores em reais com separador de milhares
function formatCurrency(value: number): number {
  // Retorna o valor como número, o Excel vai formatar
  return Math.round(value * 100) / 100;
}

export function generateBudgetExcel(
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
): void {
  const wb = XLSX.utils.book_new();
  
  // Criar dados do cabeçalho
  const headerData: any[][] = [
    ["ORÇAMENTO"],
    [""],
    ["PROPRIETÁRIO:", clientInfo.name, "", "EMPRESA:", companyInfo.companyName],
    ["LOCAL:", clientInfo.address || "N/A", "", "CNPJ:", companyInfo.cnpj],
    ["OBRA:", projectInfo.name, "", "CIDADE:", "XANXERÊ/SC"],
    ["RESPONSÁVEL:", companyInfo.responsibleName, "", "RESPONSÁVEL:", `${companyInfo.responsibleTitle} ${companyInfo.responsibleName}`],
    ["DATA:", new Date().toLocaleDateString("pt-BR"), "", "TELEFONE:", companyInfo.phone],
    ["ORÇAMENTO:", budgetTitle, "", "EMAIL:", companyInfo.email],
    ...(budgetCode ? [["CÓDIGO:", budgetCode, "", "", ""]] : []),
    [""],
    // Memória de cálculo do BDI (apenas quando exportando com BDI)
    ...(withBDI && bdiParams ? [
      ["PARÂMETROS DE BDI — Fórmula clássica: BDI = [(1+AC)×(1+G)×(1+R)] / (1−L−I) − 1"],
      ["Encargos Sociais", "Adm. Central (AC)", "Lucro (L)", "Impostos (I)", "Risco (R)", "Garantia (G)", "BDI Total"],
      [
        `${bdiParams.socialCharges.toFixed(2)}%`,
        `${bdiParams.adminCentral.toFixed(2)}%`,
        `${bdiParams.profit.toFixed(2)}%`,
        `${bdiParams.taxes.toFixed(2)}%`,
        `${bdiParams.risk.toFixed(2)}%`,
        `${bdiParams.warranty.toFixed(2)}%`,
        `${bdiParams.bdiRate.toFixed(2)}%`,
      ],
      ["Apenas em M.O.", "Numerador", "Denominador", "Denominador", "Numerador", "Numerador", ""],
      [""],
    ] : []),
  ];

  // Calcular totais
  let totalMaterial = 0;
  let totalLabor = 0;
  let grandTotal = 0;
  let itemNumber = 0;
  // Rastrear índices de linhas de Serviços Compostos para estilização
  const compositeHeaderRows: number[] = [];

  // Criar dados da tabela
  const tableHeader = [
    "ITEM",
    "DESCRIÇÃO",
    "QTDE",
    "UN",
    "VALOR UNIT. MAT",
    "VALOR UNIT. M.O.",
    "VALOR TOTAL MATERIAL",
    "VALOR TOTAL M.O.",
    "PREÇO TOTAL"
  ];

  const tableData = items.map((item: any, idx: number) => {
    if (item.isCompositeHeader) {
      // Rastrear índice da linha (offset: headerData.length + 1 para o cabeçalho da tabela + 1 para base-1)
      compositeHeaderRows.push(headerData.length + 1 + idx + 1); // +1 para linha do cabeçalho, +1 para base-1
    }
    if (item.isStageHeader) {
      // Etapa ou sub-etapa (linha de cabeçalho com total)
      return [
        "",
        item.description,
        "",
        "",
        "",
        "",
        "",
        "",
        formatCurrency(item.stageTotal),
      ];
    } else if (item.isInput) {
      const indent = "  ".repeat(item.level);
      return [
        item.itemNumber || "",
        indent + item.description,
        item.quantity || "",
        item.unit || "",
        item.coefficient ? `${item.coefficient}` : "",
        item.unitCost ? formatCurrency(item.unitCost) : "",
        "",
        "",
        "",
      ];
    } else {
      const qty = parseFloat(item.quantity);
      const materialUnit = includeMaterial ? item.materialCost : 0;
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
        formatCurrency(materialUnit),
        formatCurrency(laborUnit),
        formatCurrency(materialTotal),
        formatCurrency(laborTotal),
        formatCurrency(priceTotal),
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
    formatCurrency(totalMaterial),
    formatCurrency(totalLabor),
    formatCurrency(grandTotal),
  ]);

  // Adicionar observações se existirem
  const observationsData: any[][] = [];
  if (observations && observations.trim()) {
    observationsData.push(
      [""],
      ["OBSERVAÇÕES:"],
      [observations]
    );
  }

  // Combinar tudo
  const sheetData = [
    ...headerData,
    tableHeader,
    ...tableData,
    ...observationsData,
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  
  // Formatação
  const range = XLSX.utils.decode_range(ws['!ref'] || "A1");
  
  // Largura das colunas
  ws['!cols'] = [
    { wch: 8 },  // ITEM
    { wch: 50 }, // DESCRIÇÃO
    { wch: 10 }, // QTDE
    { wch: 8 },  // UN
    { wch: 18 }, // VALOR UNIT. MAT
    { wch: 18 }, // VALOR UNIT. M.O.
    { wch: 22 }, // VALOR TOTAL MATERIAL
    { wch: 20 }, // VALOR TOTAL M.O.
    { wch: 18 }, // PREÇO TOTAL
  ];

  // Estilizar linhas da memória de cálculo do BDI
  if (withBDI && bdiParams) {
    // O bloco BDI ocupa 5 linhas: título, cabeçalho, valores, notas, linha em branco
    // Linha base = índice da linha "" (vazia) antes do bloco BDI = headerData base sem BDI
    // headerData base (sem BDI) tem: 1(título) + 1("") + 6(dados) + (budgetCode?1:0) + 1("") = 9 ou 10 linhas
    const baseHeaderRows = 9 + (budgetCode ? 1 : 0); // linhas antes do bloco BDI
    const bdiTitleRow = baseHeaderRows + 1; // linha do título BDI (1-indexed)
    const bdiHeaderRow = baseHeaderRows + 2;
    const bdiValuesRow = baseHeaderRows + 3;
    const bdiNotesRow = baseHeaderRows + 4;

    // Título BDI
    const titleCell = `A${bdiTitleRow}`;
    if (ws[titleCell]) {
      ws[titleCell].s = {
        font: { bold: true, sz: 10 },
        fill: { fgColor: { rgb: "EFF6FF" } },
      };
    }

    // Cabeçalho da tabela BDI (fundo azul, texto branco)
    const bdiCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    bdiCols.forEach(col => {
      const cellRef = `${col}${bdiHeaderRow}`;
      if (ws[cellRef]) {
        ws[cellRef].s = {
          fill: { fgColor: { rgb: "2980B9" } },
          font: { color: { rgb: "FFFFFF" }, bold: true },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    });

    // Valores BDI (fundo azul claro, BDI Total em azul escuro)
    bdiCols.forEach((col, i) => {
      const cellRef = `${col}${bdiValuesRow}`;
      if (ws[cellRef]) {
        ws[cellRef].s = {
          fill: { fgColor: { rgb: "EBF5FF" } },
          font: { bold: true, color: { rgb: i === 6 ? "1E40AF" : "000000" } },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    });

    // Notas BDI (texto cinza itálico)
    bdiCols.forEach(col => {
      const cellRef = `${col}${bdiNotesRow}`;
      if (ws[cellRef]) {
        ws[cellRef].s = {
          font: { italic: true, color: { rgb: "888888" }, sz: 8 },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    });
  }

  // Estilizar linha de totais (azul com fonte branca)
  const totalRowIndex = headerData.length + tableData.length; // Índice da linha de totais
  const totalRowCells = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  totalRowCells.forEach(col => {
    const cellRef = `${col}${totalRowIndex}`;
    if (ws[cellRef]) {
      ws[cellRef].s = {
        fill: { fgColor: { rgb: "1E40AF" } }, // Azul
        font: { color: { rgb: "FFFFFF" }, bold: true }, // Branco e negrito
        alignment: { horizontal: "right", vertical: "center" },
      };
    }
  });

  // Estilizar linhas de Serviços Compostos (fundo azul bem claro #DBEAFE)
  compositeHeaderRows.forEach(rowIdx => {
    totalRowCells.forEach(col => {
      const cellRef = `${col}${rowIdx}`;
      if (ws[cellRef]) {
        ws[cellRef].s = {
          fill: { fgColor: { rgb: "DBEAFE" } }, // Azul bem claro
          font: { color: { rgb: "1E40AF" }, bold: true }, // Azul escuro e negrito
          alignment: { horizontal: col === 'B' ? 'left' : 'right', vertical: "center" },
        };
      }
    });
  });

  XLSX.utils.book_append_sheet(wb, ws, "Orçamento");
  
  const filename = `orcamento-${budgetTitle.replace(/\s+/g, "-").toLowerCase()}-${withBDI ? "com-bdi" : "preco-real"}.xlsx`;
  XLSX.writeFile(wb, filename);
}
