import { generateBudgetPDF } from "./pdf-export";
import { generateBudgetExcel } from "./excel-export";
import { toast } from "sonner";

interface BudgetData {
  id: number;
  title: string;
  clientId: number | null;
  projectId?: number | null;
  squareMeters?: string | null;
  socialCharges: string;
  profit: string;
  taxes: string;
  risk: string;
  warranty: string;
}

interface StageData {
  id: number;
  name: string;
  order: number;
  parentStageId?: number | null;
}

interface ItemData {
  id: number;
  stageId: number | null;
  description: string;
  unit: string;
  quantity: string;
  materialCost: string;
  laborCost: string;
  equipmentCost?: string;
  serviceCost?: string;
  otherCost?: string;
  compositionId?: number;
  inputs?: any[];
  type?: string;
  parentItemId?: number | null;
  children?: ItemData[];
}

interface ClientData {
  id: number;
  name: string;
  document: string;
  address?: string | null;
}

interface ProjectData {
  id: number;
  name: string;
}

interface CompanySettings {
  companyName: string;
  cnpj: string;
  responsibleName: string;
  responsibleTitle: string;
  phone: string;
  email: string;
  logoUrl?: string | null;
}

export async function handleExportPDF(
  budget: BudgetData | undefined,
  stages: StageData[],
  items: ItemData[],
  client: ClientData | undefined,
  project: ProjectData | null | undefined,
  companySettings: CompanySettings | null | undefined,
  withBDI: boolean,
  includeMaterial: boolean = true,
  exportType: 'sintetico' | 'analitico' = 'sintetico'
) {
  if (!budget) {
    toast.error("Orçamento não encontrado");
    return;
  }

  try {
    toast.loading("Gerando PDF...");
    
    // Nota: Para orçamento analítico, os insumos devem ser passados já carregados
    // Esta função apenas renderiza os dados que recebe

    // Calcular totais
    const socialCharges = parseFloat(budget.socialCharges || "0");
    const adminCentral = parseFloat((budget as any).adminCentral || "0");
    const profit = parseFloat(budget.profit || "0");
    const taxes = parseFloat(budget.taxes || "0");
    const risk = parseFloat(budget.risk || "0");
    const warranty = parseFloat(budget.warranty || "0");
    // Fórmula composta TCU/SINAPI: BDI = [(1+AC)(1+G)(1+R)] / (1-L-I) - 1
    const _bdiDenominator = 1 - profit / 100 - taxes / 100;
    const bdiMultiplier = _bdiDenominator > 0
      ? (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100) / _bdiDenominator
      : 1;

    let totalMaterial = 0;
    let totalLabor = 0;
    let totalEquipment = 0;
    let totalService = 0;
    let totalOther = 0;

    items.forEach(item => {
      const qty = parseFloat(item.quantity || "0");
      totalMaterial += parseFloat(item.materialCost || "0") * qty;
      totalLabor += parseFloat(item.laborCost || "0") * qty;
      totalEquipment += parseFloat(item.equipmentCost || "0") * qty;
      totalService += parseFloat(item.serviceCost || "0") * qty;
      totalOther += parseFloat(item.otherCost || "0") * qty;
    });

    // O caller (BudgetForm.tsx) já monta `items` com o materialCost de cada
    // composição zerado ou não conforme includeMaterial + includeMaterialOverride
    // por item (buildItemsWithBDIForExport / itemsWithoutBDI) — não re-zerar
    // aqui em cima do total já agregado, senão o override por composição
    // (ex: escavação, tapume) seria anulado de novo neste passo.
    const effectiveMaterial = totalMaterial;
    // Incorporar equipment, service e other em labor
    const totalLaborWithOthers = totalLabor + totalEquipment + totalService + totalOther;
    const totalWithoutBDI = effectiveMaterial + totalLaborWithOthers;

    let materialWithBDI = effectiveMaterial;
    let laborWithBDI = totalLaborWithOthers;
    let totalWithBDI = totalWithoutBDI;
    let bdiValue = 0;

    if (withBDI) {
      // Os valores já chegam com BDI aplicado (de buildItemsWithBDIForExport)
      // Não reaplicar BDI — usar os valores diretamente
      materialWithBDI = effectiveMaterial;
      laborWithBDI = totalLaborWithOthers;
      totalWithBDI = materialWithBDI + laborWithBDI;
      bdiValue = 0; // BDI já está embutido nos valores
    }

    const bdiPercentage = 0; // BDI já embutido nos valores

    // Montar estrutura hierárquica com etapas, sub-etapas e totais parciais
    const pdfItems: any[] = [];
    
    // Função para calcular total de um conjunto de itens
    const calculateTotal = (itemsList: ItemData[]) => {
      let totalMat = 0;
      let totalLab = 0;
      itemsList.forEach(item => {
        const qty = parseFloat(item.quantity || "0");
        totalMat += parseFloat(item.materialCost || "0") * qty;
        totalLab += parseFloat(item.laborCost || "0") * qty;
      });
      return { totalMat, totalLab, total: totalMat + totalLab };
    };
    
    // Função recursiva para processar etapas e sub-etapas
    const processStage = (stage: StageData, level: number, numberPrefix: string) => {
      // Encontrar sub-etapas desta etapa
      const subStages = stages.filter(s => s.parentStageId === stage.id).sort((a, b) => a.order - b.order);
      
      // Encontrar itens diretos desta etapa (apenas itens sem parentItemId)
      // Nota: filhos de compostos ficam em item.children, não como itens separados no array
      const directItems = items.filter(i => Number(i.stageId) === Number(stage.id) && !i.parentItemId);
      
      // Calcular total desta etapa (incluindo sub-etapas)
      let stageTotalMat = 0;
      let stageTotalLab = 0;
      
      // Somar itens diretos (compostos: usar materialCost/laborCost já calculados pela função buildItemsWithBDIForExport)
      directItems.forEach(item => {
        const qty = parseFloat(item.quantity || "0");
        stageTotalMat += parseFloat(item.materialCost || "0") * qty;
        stageTotalLab += parseFloat(item.laborCost || "0") * qty;
      });
      
      // Somar sub-etapas recursivamente
      subStages.forEach((subStage, idx) => {
        const subTotal = calculateTotal(items.filter(i => {
          // Incluir itens da sub-etapa e de suas sub-etapas recursivamente
          const isDirectChild = i.stageId === subStage.id;
          const subSubStages = stages.filter(s => s.parentStageId === subStage.id);
          const isInSubSubStage = subSubStages.some(sss => i.stageId === sss.id);
          return isDirectChild || isInSubSubStage;
        }));
        stageTotalMat += subTotal.totalMat;
        stageTotalLab += subTotal.totalLab;
      });
      
      // Adicionar linha de cabeçalho da etapa com total
      pdfItems.push({
        description: `${numberPrefix} - ${stage.name}`,
        unit: "",
        quantity: "",
        materialCost: 0,
        laborCost: 0,
        equipmentCost: 0,
        serviceCost: 0,
        otherCost: 0,
        level: level,
        isStageHeader: true,
        stageTotal: stageTotalMat + stageTotalLab,
      });
      
      // Adicionar itens diretos
      directItems.forEach((item, idx) => {
        const itemNumber = `${numberPrefix}.${idx + 1}`;
        
        if (item.type === 'composite') {
          // Usar materialCost/laborCost já calculados (unitário) pela buildItemsWithBDIForExport
          const compositeQty = parseFloat(item.quantity || "1");
          const compositeUnitMat = parseFloat(item.materialCost || "0");
          const compositeUnitLab = parseFloat(item.laborCost || "0");
          const compositeTotalMat = compositeUnitMat * compositeQty;
          const compositeTotalLab = compositeUnitLab * compositeQty;
          // Filhos ficam em item.children (já com BDI aplicado)
          const compositeChildren: ItemData[] = (item.children || []) as ItemData[];
          
          // Linha do item composto (cabeçalho)
          pdfItems.push({
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            materialCost: compositeUnitMat,
            laborCost: compositeUnitLab,
            equipmentCost: 0,
            serviceCost: 0,
            otherCost: 0,
            level: level + 1,
            itemNumber: itemNumber,
            isCompositeHeader: true,
            compositeTotal: compositeTotalMat + compositeTotalLab,
            materialIncluded: true, // materialCost já vem zerado/não pela buildItemsWithBDIForExport
          });
          
          // Filhos do composto indentados
          compositeChildren.forEach((child: ItemData, childIdx: number) => {
            const childNumber = `${itemNumber}.${childIdx + 1}`;
            pdfItems.push({
              description: child.description,
              unit: child.unit,
              quantity: child.quantity,
              materialCost: parseFloat(child.materialCost || "0"),
              laborCost: parseFloat(child.laborCost || "0"),
              equipmentCost: 0,
              serviceCost: 0,
              otherCost: 0,
              level: level + 2,
              itemNumber: childNumber,
              isComposition: true,
              isCompositeChild: true,
              inputs: child.inputs || [],
              materialIncluded: true, // materialCost já vem zerado/não pela buildItemsWithBDIForExport
            });
            
            // Se analítico, mostrar insumos dos filhos do composto
            if (exportType === 'analitico' && child.inputs && child.inputs.length > 0) {
              // materialCost do filho já vem zerado ou não conforme includeMaterial +
              // includeMaterialOverride desta composição (buildItemsWithBDIForExport) —
              // usar o mesmo sinal aqui pros insumos de material não ficarem em
              // R$ 0,00 quando o override ligou o material desta composição.
              const childMaterialIncluded = parseFloat(child.materialCost || "0") > 0 || includeMaterial;
              child.inputs.forEach((input: any, inputIdx: number) => {
                pdfItems.push({
                  description: input.input?.description || input.description || "",
                  unit: input.input?.unit || input.unit || "",
                  quantity: input.quantity || "",
                  materialCost: 0,
                  laborCost: 0,
                  equipmentCost: 0,
                  serviceCost: 0,
                  otherCost: 0,
                  level: level + 3,
                  itemNumber: `${childNumber}.${inputIdx + 1}`,
                  isInput: true,
                  coefficient: input.coefficient,
                  unitCost: parseFloat(input.input?.unitCost || input.unitCost || "0"),
                  inputType: (input.input?.type || input.type || "").toLowerCase(),
                  materialIncluded: childMaterialIncluded,
                });
              });
            }
          });
        } else {
          pdfItems.push({
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            materialCost: parseFloat(item.materialCost || "0"),
            laborCost: parseFloat(item.laborCost || "0"),
            equipmentCost: 0,
            serviceCost: 0,
            otherCost: 0,
            level: level + 1,
            itemNumber: itemNumber,
            isComposition: true,
            inputs: item.inputs || [],
            materialIncluded: true, // materialCost já vem zerado/não pela buildItemsWithBDIForExport
          });
          
          // Se for orçamento analítico, adicionar insumos
          if (exportType === 'analitico' && item.inputs && item.inputs.length > 0) {
            // materialCost já vem zerado ou não conforme includeMaterial +
            // includeMaterialOverride desta composição — mesmo sinal pros insumos.
            const itemMaterialIncluded = parseFloat(item.materialCost || "0") > 0 || includeMaterial;
            item.inputs.forEach((input: any, inputIdx: number) => {
              pdfItems.push({
                description: input.input?.description || input.description || "",
                unit: input.input?.unit || input.unit || "",
                quantity: input.quantity || "",
                materialCost: 0,
                laborCost: 0,
                equipmentCost: 0,
                serviceCost: 0,
                otherCost: 0,
                level: level + 2,
                itemNumber: `${itemNumber}.${inputIdx + 1}`,
                isInput: true,
                coefficient: input.coefficient,
                unitCost: parseFloat(input.input?.unitCost || input.unitCost || "0"),
                inputType: (input.input?.type || input.type || "").toLowerCase(),
                materialIncluded: itemMaterialIncluded,
              });
            });
          }
        }
      });
      
      // Processar sub-etapas recursivamente
      subStages.forEach((subStage, idx) => {
        const subNumber = `${numberPrefix}.${directItems.length + idx + 1}`;
        processStage(subStage, level + 1, subNumber);
      });
    };
    
    // Processar etapas principais (sem parent)
    const mainStages = stages.filter(s => !s.parentStageId).sort((a, b) => a.order - b.order);
    mainStages.forEach((stage, idx) => {
      processStage(stage, 0, String(idx + 1));
    });

    await generateBudgetPDF(
      companySettings ? {
        companyName: companySettings.companyName,
        cnpj: companySettings.cnpj,
        responsibleName: companySettings.responsibleName,
        responsibleTitle: companySettings.responsibleTitle,
        phone: companySettings.phone,
        email: companySettings.email,
        logoUrl: companySettings.logoUrl
      } : {
        companyName: "",
        cnpj: "",
        responsibleName: "",
        responsibleTitle: "",
        phone: "",
        email: "",
        logoUrl: null
      },
      {
        name: client?.name || "Cliente não informado",
        document: client?.document || "",
        address: client?.address || "",
      },
      {
        name: project?.name || "Sem projeto vinculado",
        squareMeters: budget.squareMeters,
      },
      budget.title,
      pdfItems,
      {
        totalWithoutBDI,
        bdiValue,
        bdiPercentage,
        totalWithBDI,
        materialValue: effectiveMaterial,
        laborValue: totalLabor,
        equipmentValue: totalEquipment,
        serviceValue: totalService,
        otherValue: totalOther,
      },
      withBDI,
      includeMaterial,
      (budget as any).code,
      (budget as any).observations
    );

    toast.dismiss();
    toast.success("PDF gerado com sucesso!");
  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    toast.dismiss();
    toast.error("Erro ao gerar PDF: " + (error instanceof Error ? error.message : "Erro desconhecido"));
  }
}

export async function handleExportExcel(
  budget: BudgetData | undefined,
  stages: StageData[],
  items: ItemData[],
  client: ClientData | undefined,
  project: ProjectData | null | undefined,
  companySettings: CompanySettings | null | undefined,
  withBDI: boolean,
  includeMaterial: boolean = true,
  exportType: 'sintetico' | 'analitico' = 'sintetico'
) {
  if (!budget) {
    toast.error("Orçamento não encontrado");
    return;
  }

  try {
    toast.loading("Gerando Excel...");
    
    // Nota: Para orçamento analítico, os insumos devem ser passados já carregados
    // Esta função apenas renderiza os dados que recebe

    // Calcular totais (mesmo código do PDF)
    const socialCharges = parseFloat(budget.socialCharges || "0");
    const adminCentral = parseFloat((budget as any).adminCentral || "0");
    const profit = parseFloat(budget.profit || "0");
    const taxes = parseFloat(budget.taxes || "0");
    const risk = parseFloat(budget.risk || "0");
    const warranty = parseFloat(budget.warranty || "0");
    // Fórmula composta TCU/SINAPI: BDI = [(1+AC)(1+G)(1+R)] / (1-L-I) - 1
    const _bdiDenominator = 1 - profit / 100 - taxes / 100;
    const bdiMultiplier = _bdiDenominator > 0
      ? (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100) / _bdiDenominator
      : 1;

    let totalMaterial = 0;
    let totalLabor = 0;
    let totalEquipment = 0;
    let totalService = 0;
    let totalOther = 0;

    items.forEach(item => {
      const qty = parseFloat(item.quantity || "0");
      totalMaterial += parseFloat(item.materialCost || "0") * qty;
      totalLabor += parseFloat(item.laborCost || "0") * qty;
      totalEquipment += parseFloat(item.equipmentCost || "0") * qty;
      totalService += parseFloat(item.serviceCost || "0") * qty;
      totalOther += parseFloat(item.otherCost || "0") * qty;
    });

    // O caller (BudgetForm.tsx) já monta `items` com o materialCost de cada
    // composição zerado ou não conforme includeMaterial + includeMaterialOverride
    // por item (buildItemsWithBDIForExport / itemsWithoutBDI) — não re-zerar
    // aqui em cima do total já agregado, senão o override por composição
    // (ex: escavação, tapume) seria anulado de novo neste passo.
    const effectiveMaterial = totalMaterial;
    // Incorporar equipment, service e other em labor
    const totalLaborWithOthers = totalLabor + totalEquipment + totalService + totalOther;
    const totalWithoutBDI = effectiveMaterial + totalLaborWithOthers;

    let materialWithBDI = effectiveMaterial;
    let laborWithBDI = totalLaborWithOthers;
    let totalWithBDI = totalWithoutBDI;
    let bdiValue = 0;

    if (withBDI) {
      // Os valores já chegam com BDI aplicado (de buildItemsWithBDIForExport)
      // Não reaplicar BDI — usar os valores diretamente
      materialWithBDI = effectiveMaterial;
      laborWithBDI = totalLaborWithOthers;
      totalWithBDI = materialWithBDI + laborWithBDI;
      bdiValue = 0; // BDI já está embutido nos valores
    }

    const bdiPercentage = 0; // BDI já embutido nos valores

    // Montar estrutura hierárquica com etapas, sub-etapas e totais parciais (mesma lógica do PDF)
    const excelItems: any[] = [];
    
    // Função para calcular total de um conjunto de itens
    const calculateTotal = (itemsList: ItemData[]) => {
      let totalMat = 0;
      let totalLab = 0;
      itemsList.forEach(item => {
        const qty = parseFloat(item.quantity || "0");
        totalMat += parseFloat(item.materialCost || "0") * qty;
        totalLab += parseFloat(item.laborCost || "0") * qty;
      });
      return { totalMat, totalLab, total: totalMat + totalLab };
    };
    
    // Função recursiva para processar etapas e sub-etapas
    const processStage = (stage: StageData, level: number, numberPrefix: string) => {
      // Encontrar sub-etapas desta etapa
      const subStages = stages.filter(s => s.parentStageId === stage.id).sort((a, b) => a.order - b.order);
      
      // Encontrar itens diretos desta etapa (apenas itens sem parentItemId)
      // Nota: filhos de compostos ficam em item.children, não como itens separados no array
      const directItems = items.filter(i => Number(i.stageId) === Number(stage.id) && !i.parentItemId);
      
      // Calcular total desta etapa (incluindo sub-etapas)
      let stageTotalMat = 0;
      let stageTotalLab = 0;
      
      // Somar itens diretos (compostos: usar materialCost/laborCost já calculados)
      directItems.forEach(item => {
        const qty = parseFloat(item.quantity || "0");
        stageTotalMat += parseFloat(item.materialCost || "0") * qty;
        stageTotalLab += parseFloat(item.laborCost || "0") * qty;
      });
      
      // Somar sub-etapas recursivamente
      subStages.forEach((subStage, idx) => {
        const subTotal = calculateTotal(items.filter(i => {
          const isDirectChild = i.stageId === subStage.id;
          const subSubStages = stages.filter(s => s.parentStageId === subStage.id);
          const isInSubSubStage = subSubStages.some(sss => i.stageId === sss.id);
          return isDirectChild || isInSubSubStage;
        }));
        stageTotalMat += subTotal.totalMat;
        stageTotalLab += subTotal.totalLab;
      });
      
      // Adicionar linha de cabeçalho da etapa com total
      excelItems.push({
        description: `${numberPrefix} - ${stage.name}`,
        unit: "",
        quantity: "",
        materialCost: 0,
        laborCost: 0,
        equipmentCost: 0,
        serviceCost: 0,
        otherCost: 0,
        level: level,
        isStageHeader: true,
        stageTotal: stageTotalMat + stageTotalLab,
      });
      
      // Adicionar itens diretos
      directItems.forEach((item, idx) => {
        const itemNumber = `${numberPrefix}.${idx + 1}`;
        
        if (item.type === 'composite') {
          // Usar materialCost/laborCost já calculados (unitário) pela buildItemsWithBDIForExport
          const compositeQty = parseFloat(item.quantity || "1");
          const compositeUnitMat = parseFloat(item.materialCost || "0");
          const compositeUnitLab = parseFloat(item.laborCost || "0");
          const compositeTotalMat = compositeUnitMat * compositeQty;
          const compositeTotalLab = compositeUnitLab * compositeQty;
          // Filhos ficam em item.children (já com BDI aplicado)
          const compositeChildren: ItemData[] = (item.children || []) as ItemData[];
          
          excelItems.push({
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            materialCost: compositeUnitMat,
            laborCost: compositeUnitLab,
            equipmentCost: 0,
            serviceCost: 0,
            otherCost: 0,
            level: level + 1,
            itemNumber: itemNumber,
            isCompositeHeader: true,
            compositeTotal: compositeTotalMat + compositeTotalLab,
          });
          
          compositeChildren.forEach((child: ItemData, childIdx: number) => {
            const childNumber = `${itemNumber}.${childIdx + 1}`;
            excelItems.push({
              description: child.description,
              unit: child.unit,
              quantity: child.quantity,
              materialCost: parseFloat(child.materialCost || "0"),
              laborCost: parseFloat(child.laborCost || "0"),
              equipmentCost: 0,
              serviceCost: 0,
              otherCost: 0,
              level: level + 2,
              itemNumber: childNumber,
              isComposition: true,
              isCompositeChild: true,
              inputs: child.inputs || [],
            });
            
            if (exportType === 'analitico' && child.inputs && child.inputs.length > 0) {
              child.inputs.forEach((input: any, inputIdx: number) => {
                excelItems.push({
                  description: input.input?.description || input.description || "",
                  unit: input.input?.unit || "",
                  quantity: input.quantity || "",
                  materialCost: 0,
                  laborCost: 0,
                  equipmentCost: 0,
                  serviceCost: 0,
                  otherCost: 0,
                  level: level + 3,
                  itemNumber: `${childNumber}.${inputIdx + 1}`,
                  isInput: true,
                  coefficient: input.coefficient,
                  unitCost: input.input?.unitCost || 0,
                });
              });
            }
          });
        } else {
          excelItems.push({
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            materialCost: parseFloat(item.materialCost || "0"),
            laborCost: parseFloat(item.laborCost || "0"),
            equipmentCost: 0,
            serviceCost: 0,
            otherCost: 0,
            level: level + 1,
            itemNumber: itemNumber,
            isComposition: true,
            inputs: item.inputs || [],
          });
          
          if (exportType === 'analitico' && item.inputs && item.inputs.length > 0) {
            item.inputs.forEach((input: any, inputIdx: number) => {
              excelItems.push({
                description: input.input?.description || input.description || "",
                unit: input.input?.unit || "",
                quantity: input.quantity || "",
                materialCost: 0,
                laborCost: 0,
                equipmentCost: 0,
                serviceCost: 0,
                otherCost: 0,
                level: level + 2,
                itemNumber: `${itemNumber}.${inputIdx + 1}`,
                isInput: true,
                coefficient: input.coefficient,
                unitCost: input.input?.unitCost || 0,
              });
            });
          }
        }
      });
      
      // Processar sub-etapas recursivamente
      subStages.forEach((subStage, idx) => {
        const subNumber = `${numberPrefix}.${directItems.length + idx + 1}`;
        processStage(subStage, level + 1, subNumber);
      });
    };
    
    // Processar etapas principais (sem parent)
    const mainStages = stages.filter(s => !s.parentStageId).sort((a, b) => a.order - b.order);
    mainStages.forEach((stage, idx) => {
      processStage(stage, 0, String(idx + 1));
    });

    // Calcular taxa BDI resultante para a memória de cálculo
    const bdiRateExcel = (_bdiDenominator > 0)
      ? ((1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100) / _bdiDenominator - 1) * 100
      : 0;

    generateBudgetExcel(
      companySettings ? {
        companyName: companySettings.companyName,
        cnpj: companySettings.cnpj,
        responsibleName: companySettings.responsibleName,
        responsibleTitle: companySettings.responsibleTitle,
        phone: companySettings.phone,
        email: companySettings.email
      } : {
        companyName: "",
        cnpj: "",
        responsibleName: "",
        responsibleTitle: "",
        phone: "",
        email: ""
      },
      {
        name: client?.name || "Cliente não informado",
        document: client?.document || "",
        address: client?.address || "",
      },
      {
        name: project?.name || "Sem projeto vinculado",
        squareMeters: budget.squareMeters,
      },
      budget.title,
      excelItems,
      {
        totalWithoutBDI,
        bdiValue,
        bdiPercentage,
        totalWithBDI,
        materialValue: effectiveMaterial,
        laborValue: totalLabor,
        equipmentValue: totalEquipment,
        serviceValue: totalService,
        otherValue: totalOther,
      },
      withBDI,
      includeMaterial,
      (budget as any).code,
      (budget as any).observations,
      {
        socialCharges,
        adminCentral,
        profit,
        taxes,
        risk,
        warranty,
        bdiRate: bdiRateExcel,
      }
    );

    toast.dismiss();
    toast.success("Excel gerado com sucesso!");
  } catch (error) {
    console.error("Erro ao gerar Excel:", error);
    toast.dismiss();
    toast.error("Erro ao gerar Excel: " + (error instanceof Error ? error.message : "Erro desconhecido"));
  }
}
