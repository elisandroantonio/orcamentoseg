import { useState, useEffect, useRef } from "react";
import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronRight, Plus, Settings, Upload, Copy, ArrowUp, ArrowDown, Pencil, Trash2, RotateCcw, Save, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BudgetStage {
  id: number;
  name: string;
  parentStageId: number | null;
  order: number;
  serviceUnit?: string | null;
  serviceQuantity?: string | null;
}

interface BudgetItem {
  id: number;
  stageId: number | null;
  type: "composition" | "input" | "service" | "composite";
  description: string;
  code?: string;
  unit: string;
  quantity: string;
  materialCost: string;
  laborCost: string;
  equipmentCost?: string;
  serviceCost?: string;
  otherCost?: string;
  unitCost: string;
  totalCost: string;
  compositionId?: number;
  parentItemId?: number | null;
}

interface CompositionInput {
  id: number;
  code: string;
  description: string;
  type: string;
  unit: string;
  coefficient: number;
  unitCost: number;
}

interface HierarchicalBudgetViewProps {
  stages: BudgetStage[];
  items: BudgetItem[];
  onAddSubStage: (parentStageId: number) => void;
  onAddComposition: (stageId: number) => void;
  onAddInput: (stageId: number) => void;
  onAddService: (stageId: number) => void;
  onAddCompositeService?: (stageId: number) => void;
  onCreateCompositeItem?: (stageId: number, description: string, unit: string, quantity: number) => Promise<void>;
  onAddCompositionToComposite?: (compositeItemId: number) => void;
  onAddInputToComposite?: (compositeItemId: number) => void;
  onAddServiceToComposite?: (compositeItemId: number) => void;
  onEditCompositeChild?: (item: BudgetItem) => void;
  onEditCompositeItem?: (item: BudgetItem) => void;
  onDeleteCompositeItem?: (itemId: number) => void;
  onImportEAP?: (stageId: number) => void;
  onDuplicateStage?: (stageId: number) => void;
  onMoveStageUp?: (stageId: number) => void;
  onMoveStageDown?: (stageId: number) => void;
  onEditStage: (stage: BudgetStage) => void;
  onDeleteStage: (stageId: number) => void;
  onDeleteItem: (itemId: number) => void;
  onEditItem?: (item: BudgetItem) => void;
  onUpdateItemQuantity?: (itemId: number, quantity: number) => void;
  onLoadCompositionInputs?: (compositionId: number, budgetItemId?: number) => Promise<CompositionInput[]>;
  onUpdateCompositionCosts?: (itemId: number, materialCost: number, laborCost: number, equipmentCost?: number) => void;
  onSaveInputToBase?: (inputId: number, unitCost: number, compositionId?: number, coefficient?: number) => Promise<void>;
  onUpdateCompositionToBase?: (compositionId: number, budgetItemId: number | undefined, inputs: Array<{ inputId: number; coefficient: number; unitCost: number }>) => Promise<void>;
  onSaveCompositionForBudget?: (compositionId: number, budgetItemId: number, inputs: CompositionInput[]) => Promise<void>;
  showBdiConfig?: boolean;
  bdiConfigs?: Record<number, { applyBdiToMaterial: boolean; applyBdiToLabor: boolean; additionalIncrement: number; discount?: number; aplicarEncargosSociais?: boolean; laborAdjustment?: number; materialAdjustment?: number }>;
  onUpdateBdiConfig?: (itemId: number, config: { applyBdiToMaterial: boolean; applyBdiToLabor: boolean; additionalIncrement: number; discount?: number; aplicarEncargosSociais?: boolean; laborAdjustment?: number; materialAdjustment?: number }) => void;
  onMoveItemUp?: (itemId: number) => void; // Melhoria 17
  onMoveItemDown?: (itemId: number) => void; // Melhoria 17
  includeMaterial?: boolean; // Controle de exibição de material (desabilitar = apenas mão de obra)
  // Expõe o total calculado de cada etapa (mesmo valor mostrado no cabeçalho
  // azul da etapa) pro componente pai — usado pelo Cronograma de Desembolso
  // (aba Gantt) pra mostrar exatamente o mesmo valor desta tabela, em vez de
  // recalcular BDI de novo num lugar separado e correr o risco de divergir.
  onStageTotals?: (totals: Record<number, number>) => void;
}

// Interface para o componente de tabela de insumos
interface CompositionInputsTableProps {
  item: BudgetItem;
  compositionInputs: Record<number, CompositionInput[]>;
  setCompositionInputs: React.Dispatch<React.SetStateAction<Record<number, CompositionInput[]>>>;
  onLoadCompositionInputs?: (compositionId: number, budgetItemId?: number) => Promise<CompositionInput[]>;
  onInputChange?: (compositionId: number, inputs: CompositionInput[]) => void;
  onSaveToBase?: (inputId: number, unitCost: number, compositionId?: number, coefficient?: number) => Promise<void>;
  onSaveCompositionForBudget?: (compositionId: number, budgetItemId: number, inputs: CompositionInput[]) => Promise<void>;
  onUpdateCompositionToBase?: (compositionId: number, budgetItemId: number | undefined, inputs: Array<{ inputId: number; coefficient: number; unitCost: number }>) => Promise<void>;
  setPendingSave: React.Dispatch<React.SetStateAction<{ inputId: number; unitCost: number; inputDescription: string; compositionId?: number; coefficient?: number } | null>>;
  setSaveDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

// Componente EXTERNO para exibir insumos da composição
// IMPORTANTE: Definido fora do HierarchicalBudgetView para evitar remontagem e perda de estado
function CompositionInputsTableComponent({
  item,
  compositionInputs,
  setCompositionInputs,
  onLoadCompositionInputs,
  onInputChange,
  onSaveToBase,
  onSaveCompositionForBudget,
  onUpdateCompositionToBase,
  setPendingSave,
  setSaveDialogOpen,
}: CompositionInputsTableProps) {
  const compositionId = item.compositionId;
  const inputs = compositionId ? compositionInputs[compositionId] : undefined;
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});

  const formatBRL = (value: number): string => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Se inputs é undefined, ainda está carregando
  if (inputs === undefined) {
    return <div className="text-sm text-slate-600">Carregando insumos...</div>;
  }

  // Se inputs é um array vazio, não há insumos cadastrados
  if (inputs.length === 0) {
    return <div className="text-sm text-slate-600">Nenhum insumo encontrado para esta composição</div>;
  }

  return (
    <div className="space-y-2 w-full">
      <h4 className="text-sm font-semibold text-slate-700">Insumos da Composição</h4>
      <div className="w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px] text-xs">Cód.</TableHead>
              <TableHead className="text-xs">Descrição</TableHead>
              <TableHead className="w-[60px] text-xs">Tipo</TableHead>
              <TableHead className="w-[50px] text-xs">UN</TableHead>
              <TableHead className="w-[80px] text-right text-xs">Coef.</TableHead>
              <TableHead className="w-[90px] text-right text-xs">Vlr. Unit.</TableHead>
              <TableHead className="w-[90px] text-right text-xs">Total</TableHead>
              <TableHead className="w-[120px] text-center text-xs">Ações</TableHead>
            </TableRow>
          </TableHeader>
        <TableBody>
          {inputs.map((input) => {
            const totalCost = input.coefficient * input.unitCost;
            return (
              <TableRow key={input.id}>
                <TableCell className="font-mono text-xs">{input.code}</TableCell>
                <TableCell className="text-sm max-w-[300px] break-words whitespace-normal">{input.description}</TableCell>
                <TableCell>
                  <Badge variant={input.type === "Material" ? "default" : input.type === "Mão de Obra" ? "secondary" : "outline"}>
                    {input.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{input.unit}</TableCell>
                <TableCell className="text-right">
                  <input
                    type="number"
                    step="0.01"
                    value={editingValues[`coef-${input.id}`] ?? input.coefficient}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditingValues(prev => ({ ...prev, [`coef-${input.id}`]: value }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={(e) => {
                      const newCoef = parseFloat(e.target.value) || 0;
                      const updatedInputs = inputs.map(inp =>
                        inp.id === input.id ? { ...inp, coefficient: newCoef } : inp
                      );
                      setCompositionInputs(prev => ({
                        ...prev,
                        [compositionId!]: updatedInputs
                      }));
                      if (onInputChange) {
                        onInputChange(compositionId!, updatedInputs);
                      }
                      setEditingValues(prev => {
                        const newVals = { ...prev };
                        delete newVals[`coef-${input.id}`];
                        return newVals;
                      });
                    }}
                    className={cn(
                      "w-20 px-1 py-1 text-right text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500",
                      editingValues[`coef-${input.id}`] ? "border-blue-500 bg-blue-50" : "border-slate-300"
                    )}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <input
                    type="number"
                    step="0.01"
                    value={editingValues[`cost-${input.id}`] ?? input.unitCost}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditingValues(prev => ({ ...prev, [`cost-${input.id}`]: value }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={(e) => {
                      const newCost = parseFloat(e.target.value) || 0;
                      const updatedInputs = inputs.map(inp =>
                        inp.id === input.id ? { ...inp, unitCost: newCost } : inp
                      );
                      setCompositionInputs(prev => ({
                        ...prev,
                        [compositionId!]: updatedInputs
                      }));
                      if (onInputChange) {
                        onInputChange(compositionId!, updatedInputs);
                      }
                      setEditingValues(prev => {
                        const newVals = { ...prev };
                        delete newVals[`cost-${input.id}`];
                        return newVals;
                      });
                    }}
                    className={cn(
                      "w-24 px-1 py-1 text-right text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500",
                      editingValues[`cost-${input.id}`] ? "border-blue-500 bg-blue-50" : "border-slate-300"
                    )}
                  />
                </TableCell>
                <TableCell className="text-right font-semibold">R$ {formatBRL(totalCost)}</TableCell>
                <TableCell className="text-center">
                  <div className="flex gap-1 justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="Desfazer alterações"
                      onClick={async () => {
                        if (compositionId && onLoadCompositionInputs) {
                          // Recarregar insumos originais da composição
                          const originalInputs = await onLoadCompositionInputs(compositionId, item.id);
                          setCompositionInputs(prev => ({
                            ...prev,
                            [compositionId]: originalInputs
                          }));
                          // Limpar valores em edição
                          setEditingValues({});
                          // Recalcular custos da composição
                          if (onInputChange) {
                            onInputChange(compositionId, originalInputs);
                          }
                        }
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="Salvar na base (atualiza todas as composições)"
                      onClick={() => {
                        const currentUnitCost = editingValues[`cost-${input.id}`]
                          ? parseFloat(editingValues[`cost-${input.id}`])
                          : input.unitCost;
                        const currentCoef = editingValues[`coef-${input.id}`]
                          ? parseFloat(editingValues[`coef-${input.id}`])
                          : input.coefficient;
                        setPendingSave({
                          inputId: input.id,
                          unitCost: currentUnitCost,
                          inputDescription: input.description,
                          compositionId: compositionId ?? undefined,
                          coefficient: currentCoef,
                        });
                        setSaveDialogOpen(true);
                      }}
                    >
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        </Table>
      </div>
      {compositionId && (onSaveCompositionForBudget || onUpdateCompositionToBase) && (
        <div className="mt-3 flex justify-end gap-2">
          {onSaveCompositionForBudget && (
            <Button
              variant="outline"
              size="sm"
              title="Atualiza os valores apenas neste orçamento, sem alterar a base global"
              onClick={async () => {
                if (compositionId) {
                  // Aplicar editingValues pendentes ao estado antes de salvar
                  // (o usuário pode ter editado sem sair do campo, sem disparar onBlur)
                  const currentInputs = compositionInputs[compositionId] || [];
                  const mergedInputs = currentInputs.map(inp => {
                    const coefKey = `coef-${inp.id}`;
                    const costKey = `cost-${inp.id}`;
                    const newCoef = editingValues[coefKey] !== undefined
                      ? (parseFloat(editingValues[coefKey]) || inp.coefficient)
                      : inp.coefficient;
                    const newCost = editingValues[costKey] !== undefined
                      ? (parseFloat(editingValues[costKey]) || inp.unitCost)
                      : inp.unitCost;
                    return { ...inp, coefficient: newCoef, unitCost: newCost };
                  });
                  // Atualizar o estado com os valores mesclados
                  setCompositionInputs(prev => ({ ...prev, [compositionId]: mergedInputs }));
                  setEditingValues({});
                  // Salvar no backend com os valores mesclados
                  await onSaveCompositionForBudget(compositionId, item.id, mergedInputs);
                  // Limpar cache local para forçar recarregamento com valores atualizados do banco
                  setCompositionInputs(prev => {
                    const updated = { ...prev };
                    delete updated[compositionId];
                    return updated;
                  });
                  // Recarregar insumos do banco (agora com valores customizados)
                  if (onLoadCompositionInputs) {
                    const freshInputs = await onLoadCompositionInputs(compositionId, item.id);
                    setCompositionInputs(prev => ({ ...prev, [compositionId]: freshInputs }));
                  }
                }
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          )}
          {onUpdateCompositionToBase && (
            <Button
              variant="default"
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              title="Atualiza a composição na base global — afeta todos os orçamentos"
              onClick={async () => {
                // Aplicar editingValues pendentes antes de salvar
                const currentInputs = compositionInputs[compositionId] || [];
                const mergedInputs = currentInputs.map(inp => {
                  const coefKey = `coef-${inp.id}`;
                  const costKey = `cost-${inp.id}`;
                  const newCoef = editingValues[coefKey] !== undefined
                    ? (parseFloat(editingValues[coefKey]) || inp.coefficient)
                    : inp.coefficient;
                  const newCost = editingValues[costKey] !== undefined
                    ? (parseFloat(editingValues[costKey]) || inp.unitCost)
                    : inp.unitCost;
                  return { ...inp, coefficient: newCoef, unitCost: newCost };
                });
                setEditingValues({});
                const inputsToUpdate = mergedInputs.map(inp => ({
                  inputId: inp.id,
                  coefficient: inp.coefficient,
                  unitCost: inp.unitCost,
                }));
                await onUpdateCompositionToBase(compositionId, item.id, inputsToUpdate);
              }}
            >
              <Save className="h-4 w-4 mr-2" />
              Atualizar Composição na Base
            </Button>
          )}
        </div>
      )}
    </div>
  );
}


export default function HierarchicalBudgetView({
  stages,
  items,
  onAddSubStage,
  onAddComposition,
  onAddInput,
  onAddService,
  onAddCompositeService,
  onCreateCompositeItem,
  onAddCompositionToComposite,
  onAddInputToComposite,
  onAddServiceToComposite,
  onEditCompositeChild,
  onEditCompositeItem,
  onDeleteCompositeItem,
  onImportEAP,
  onDuplicateStage,
  onMoveStageUp,
  onMoveStageDown,
  onEditStage,
  onDeleteStage,
  onDeleteItem,
  onEditItem,
  onUpdateItemQuantity,
  onLoadCompositionInputs,
  onUpdateCompositionCosts,
  onSaveInputToBase,
  onUpdateCompositionToBase,
  onSaveCompositionForBudget,
  showBdiConfig = false,
  bdiConfigs = {},
  onUpdateBdiConfig,
  onMoveItemUp,
  onMoveItemDown,
  includeMaterial = true,
  onStageTotals,
}: HierarchicalBudgetViewProps) {
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [compositionInputs, setCompositionInputs] = useState<Record<number, CompositionInput[]>>({});
  const [customCosts, setCustomCosts] = useState<Record<number, { materialCost: number; laborCost: number; equipmentCost: number }>>({});
  const [editingQuantities, setEditingQuantities] = useState<Record<number, string>>({});
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<{ inputId: number; unitCost: number; inputDescription: string; compositionId?: number; coefficient?: number } | null>(null);
  
  // Estado local para edição dos campos de incremento/desconto/laborAdjustment
  // Separado do bdiConfigs (prop) para evitar conflito com re-fetches do backend durante a digitação
  const [localBdiValues, setLocalBdiValues] = useState<Record<string, string>>({});

  // Estados para o formulário inline de Serviço Composto
  const [inlineCompositeStageId, setInlineCompositeStageId] = useState<number | null>(null);
  const [inlineCompositeName, setInlineCompositeName] = useState("");
  const [inlineCompositeUnit, setInlineCompositeUnit] = useState("m³");
  const [inlineCompositeQty, setInlineCompositeQty] = useState("");
  const [isSavingInlineComposite, setIsSavingInlineComposite] = useState(false);



  const toggleStage = (stageId: number) => {
    const newExpanded = new Set(expandedStages);
    if (newExpanded.has(stageId)) {
      newExpanded.delete(stageId);
    } else {
      newExpanded.add(stageId);
    }
    setExpandedStages(newExpanded);
  };

  // Construir árvore de etapas
  const rootStages = stages.filter(s => !s.parentStageId).sort((a, b) => a.order - b.order);
  const getSubStages = (parentId: number) => 
    stages.filter(s => s.parentStageId === parentId).sort((a, b) => a.order - b.order);
  const getStageItems = (stageId: number) => 
    items.filter(item => Number(item.stageId) === Number(stageId) && !item.parentItemId);
  const getCompositeChildren = (parentItemId: number) =>
    items.filter(item => Number(item.parentItemId) === Number(parentItemId)).sort((a, b) => (a as any).order - (b as any).order);

  // Gerar numeração hierárquica
  const generateNumber = (indices: number[]) => indices.map(i => i + 1).join(".");

  // Renderizar item composto (Serviço Composto)
  const renderCompositeItem = (item: BudgetItem, itemNumber: string, level: number) => {
    const qty = Number(item.quantity);
    const children = getCompositeChildren(item.id);
    const isExpanded = expandedItems.has(item.id);
    
    // Calcular totais dos filhos
    // Na aba Com BDI (showBdiConfig=true), os valores já chegam com BDI aplicado via items prop
    // includeMaterial=false: zerar MATERIAL (não mão de obra)
    const totalMat = children.reduce((sum, child) => {
      const mat = showBdiConfig
        ? Number(child.materialCost)
        : (customCosts[child.id]?.materialCost ?? Number(child.materialCost));
      const effectiveMat = includeMaterial ? mat : 0; // Zerar material se desabilitado
      return sum + effectiveMat * Number(child.quantity);
    }, 0);
    const totalLab = children.reduce((sum, child) => {
      const labRaw = showBdiConfig
        ? Number(child.laborCost)
        : (customCosts[child.id]?.laborCost ?? Number(child.laborCost));
      // Aplicar laborAdjustment do filho na soma do pai
      const childLaborAdj = showBdiConfig ? 0 : (bdiConfigs[child.id]?.laborAdjustment ?? 0);
      const lab = labRaw * (1 + childLaborAdj / 100);
      const eq = showBdiConfig ? 0 : Number(child.equipmentCost ?? 0);
      const svc = showBdiConfig ? 0 : Number(child.serviceCost ?? 0);
      const oth = showBdiConfig ? 0 : Number(child.otherCost ?? 0);
      return sum + (lab + eq + svc + oth) * Number(child.quantity);
    }, 0);
    const totalGeral = totalMat + totalLab;
    const unitMat = qty > 0 ? totalMat / qty : 0;
    const unitLab = qty > 0 ? totalLab / qty : 0;
    const unitTotal = qty > 0 ? totalGeral / qty : 0;
    
    return (
      <>
        {/* Linha do item composto */}
        <TableRow key={`composite-${item.id}`} className="bg-emerald-50 hover:bg-emerald-100 border-l-4 border-emerald-500" style={{ display: 'flex', width: '100%', gap: '0' }}>
          <TableCell className="break-words whitespace-normal" style={{ flex: '1 1 auto', minWidth: '200px' }}>
            <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 24}px` }}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const newExpanded = new Set(expandedItems);
                  if (isExpanded) newExpanded.delete(item.id);
                  else newExpanded.add(item.id);
                  setExpandedItems(newExpanded);
                }}
                className="h-6 w-6 p-0 flex-shrink-0"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
              <span className="font-semibold text-xs mr-2 flex-shrink-0 text-emerald-700">{itemNumber}</span>
              <div className="flex flex-col">
                <span className="font-semibold text-emerald-800">{item.description}</span>
                {qty > 0 && totalGeral > 0 && (
                  <span className="text-xs text-emerald-600">
                    {qty.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {item.unit}
                    {' • '}
                    Mat: R$ {unitMat.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/{item.unit}
                    {' • '}
                    M.O.: R$ {unitLab.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/{item.unit}
                    {' • '}
                    Total: R$ {unitTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/{item.unit}
                  </span>
                )}
              </div>
            </div>
          </TableCell>
          <TableCell className="text-right text-sm" style={{ width: '90px', flexShrink: 0 }}>
            {onUpdateItemQuantity ? (
              <input
                type="number"
                step="0.01"
                value={editingQuantities[item.id] ?? qty.toFixed(2)}
                onChange={(e) => {
                  setEditingQuantities(prev => ({ ...prev, [item.id]: e.target.value }));
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                onBlur={(e) => {
                  const newQty = parseFloat(e.target.value) || 0;
                  onUpdateItemQuantity(item.id, newQty);
                  setEditingQuantities(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                }}
                className="w-20 px-2 py-1 text-right border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            ) : (
              qty.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            )}
          </TableCell>
          <TableCell className="text-center text-sm font-medium text-emerald-700" style={{ width: '80px', flexShrink: 0 }}>
            {item.unit}
          </TableCell>
          <TableCell className="text-right text-sm" style={{ width: '110px', flexShrink: 0 }}>
            R$ {unitMat.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </TableCell>
          <TableCell className="text-right text-sm" style={{ width: '110px', flexShrink: 0 }}>
            R$ {unitLab.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </TableCell>
          <TableCell className="text-right text-sm" style={{ width: '110px', flexShrink: 0 }}>
            R$ {totalMat.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </TableCell>
          <TableCell className="text-right text-sm" style={{ width: '110px', flexShrink: 0 }}>
            R$ {totalLab.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </TableCell>
          <TableCell className="text-right text-sm font-bold text-emerald-800" style={{ width: '120px', flexShrink: 0 }}>
            R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </TableCell>
          <TableCell style={{ width: '160px', flexShrink: 0 }}>
            <div className="flex items-center gap-1 justify-end">
              {/* Menu do item composto */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-100">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {onAddCompositionToComposite && (
                    <DropdownMenuItem onClick={() => onAddCompositionToComposite(item.id)} className="cursor-pointer">
                      <span className="text-green-600 font-medium">+ Adicionar composição</span>
                    </DropdownMenuItem>
                  )}
                  {onAddInputToComposite && (
                    <DropdownMenuItem onClick={() => onAddInputToComposite(item.id)} className="cursor-pointer">
                      <span className="text-blue-600 font-medium">+ Adicionar insumo</span>
                    </DropdownMenuItem>
                  )}
                  {onAddServiceToComposite && (
                    <DropdownMenuItem onClick={() => onAddServiceToComposite(item.id)} className="cursor-pointer">
                      <span className="text-orange-600 font-medium">+ Adicionar serviço a preço informado</span>
                    </DropdownMenuItem>
                  )}
                  {onEditCompositeItem && (
                    <DropdownMenuItem onClick={() => onEditCompositeItem(item)} className="cursor-pointer">
                      <span className="text-slate-600">Editar serviço</span>
                    </DropdownMenuItem>
                  )}
                  {onDeleteCompositeItem && (
                    <DropdownMenuItem onClick={() => onDeleteCompositeItem(item.id)} className="cursor-pointer">
                      <span className="text-red-600">Remover serviço</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </TableCell>
        </TableRow>
        {/* Filhos do item composto (expandido) */}
        {isExpanded && children.map((child, idx) => {
          const childQty = Number(child.quantity);
          // Na aba Com BDI (showBdiConfig=true), os valores já chegam com BDI aplicado via items prop
          // Na aba Preço Real, usar customCosts se disponível
          // includeMaterial=false: zerar MATERIAL (não mão de obra)
          const childMatRaw = showBdiConfig
            ? Number(child.materialCost)
            : (customCosts[child.id]?.materialCost ?? Number(child.materialCost));
          const childMat = includeMaterial ? childMatRaw : 0; // Zerar material se desabilitado
          const childLabRaw = showBdiConfig
            ? Number(child.laborCost)
            : (customCosts[child.id]?.laborCost ?? Number(child.laborCost));
          const childLaborAdj = bdiConfigs[child.id]?.laborAdjustment ?? 0;
          const childLab = childLabRaw * (1 + childLaborAdj / 100);
          const childUnit = childMat + childLab;
          const childTotalMat = childQty * childMat;
          const childTotalLab = childQty * childLab;
          const childTotal = childQty * childUnit;
          const isChildExpanded = expandedItems.has(child.id);
          return (
            <React.Fragment key={`composite-child-${child.id}`}>
              <TableRow className="bg-emerald-50/50 hover:bg-emerald-50" style={{ display: 'flex', width: '100%', gap: '0' }}>
                <TableCell className="break-words whitespace-normal" style={{ flex: '1 1 auto', minWidth: '200px' }}>
                  <div className="flex items-center gap-2" style={{ paddingLeft: `${(level + 1) * 24}px` }}>
                    {/* Botão de expansão para composições filhas */}
                    {child.type === 'composition' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (isChildExpanded) {
                            const newExpanded = new Set(expandedItems);
                            newExpanded.delete(child.id);
                            setExpandedItems(newExpanded);
                          } else {
                            const newExpanded = new Set(expandedItems);
                            newExpanded.add(child.id);
                            setExpandedItems(newExpanded);
                            if (child.compositionId && compositionInputs[child.compositionId] === undefined && onLoadCompositionInputs) {
                              try {
                                const inputs = await onLoadCompositionInputs(child.compositionId, child.id);
                                setCompositionInputs(prev => ({ ...prev, [child.compositionId!]: inputs }));
                              } catch {
                                setCompositionInputs(prev => ({ ...prev, [child.compositionId!]: [] }));
                              }
                            }
                          }
                        }}
                        className="h-6 w-6 p-0 flex-shrink-0 text-emerald-600"
                      >
                        {isChildExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    ) : (
                      <span className="w-6 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-xs mr-2 flex-shrink-0 text-slate-500">{itemNumber}.{idx + 1}</span>
                    <span className="text-sm">{child.description}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm" style={{ width: '90px', flexShrink: 0 }}>
                  {onUpdateItemQuantity ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editingQuantities[child.id] ?? childQty.toFixed(2)}
                      onChange={(e) => setEditingQuantities(prev => ({ ...prev, [child.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      onBlur={(e) => {
                        const newQty = parseFloat(e.target.value) || 0;
                        onUpdateItemQuantity(child.id, newQty);
                        setEditingQuantities(prev => { const n = { ...prev }; delete n[child.id]; return n; });
                      }}
                      className="w-20 px-2 py-1 text-right border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    />
                  ) : (
                    childQty.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                  )}
                </TableCell>
                <TableCell className="text-center text-sm" style={{ width: '80px', flexShrink: 0 }}>{child.unit}</TableCell>
                <TableCell className="text-right text-sm" style={{ width: '110px', flexShrink: 0 }}>
                  R$ {childMat.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right text-sm" style={{ width: '110px', flexShrink: 0 }}>
                  R$ {childLab.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right text-sm" style={{ width: '110px', flexShrink: 0 }}>
                  R$ {childTotalMat.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right text-sm" style={{ width: '110px', flexShrink: 0 }}>
                  R$ {childTotalLab.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right text-sm font-medium" style={{ width: '120px', flexShrink: 0 }}>
                  R$ {childTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell style={{ width: '160px', flexShrink: 0 }}>
                  <div className="flex items-center gap-1 justify-end">
                    {showBdiConfig && onUpdateBdiConfig && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-600 hover:text-slate-700 hover:bg-slate-50"
                            title="Configurar BDI"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72 p-4">
                          <div className="space-y-4">
                            <div className="font-semibold text-sm">Configuração de BDI</div>
                            <div className="space-y-3">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={bdiConfigs[child.id]?.applyBdiToMaterial ?? true}
                                  onChange={(e) => {
                                    const currentConfig = bdiConfigs[child.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0 };
                                    onUpdateBdiConfig(child.id, { ...currentConfig, applyBdiToMaterial: e.target.checked });
                                  }}
                                  className="h-4 w-4"
                                />
                                <span className="text-sm">Aplicar BDI ao Material</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={bdiConfigs[child.id]?.applyBdiToLabor ?? true}
                                  onChange={(e) => {
                                    const currentConfig = bdiConfigs[child.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0 };
                                    onUpdateBdiConfig(child.id, { ...currentConfig, applyBdiToLabor: e.target.checked });
                                  }}
                                  className="h-4 w-4"
                                />
                                <span className="text-sm">Aplicar BDI à Mão de Obra</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={bdiConfigs[child.id]?.aplicarEncargosSociais ?? true}
                                  onChange={(e) => {
                                    const currentConfig = bdiConfigs[child.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, aplicarEncargosSociais: true };
                                    onUpdateBdiConfig(child.id, { ...currentConfig, aplicarEncargosSociais: e.target.checked });
                                  }}
                                  className="h-4 w-4"
                                />
                                <span className="text-sm">Aplicar Encargos Sociais</span>
                              </label>
                              <div className="space-y-1">
                                <label className="text-sm font-semibold text-blue-700">Ajuste Material (%)</label>
                                <p className="text-xs text-slate-500">Acréscimo (+) ou desconto (-) sobre o Material desta composição</p>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={localBdiValues[`mat-${child.id}`] ?? (bdiConfigs[child.id]?.materialAdjustment ?? 0)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setLocalBdiValues(prev => ({ ...prev, [`mat-${child.id}`]: raw }));
                                    const val = parseFloat(raw) || 0;
                                    const currentConfig = bdiConfigs[child.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0 };
                                    onUpdateBdiConfig(child.id, { ...currentConfig, materialAdjustment: val });
                                  }}
                                  onBlur={() => {
                                    setLocalBdiValues(prev => { const n = { ...prev }; delete n[`mat-${child.id}`]; return n; });
                                  }}
                                  className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
                                  placeholder="0.00"
                                />
                                {(bdiConfigs[child.id]?.materialAdjustment ?? 0) !== 0 && (
                                  <p className="text-xs text-blue-600 font-medium">
                                    Material ajustado: {(bdiConfigs[child.id]?.materialAdjustment ?? 0) > 0 ? '+' : ''}{bdiConfigs[child.id]?.materialAdjustment}%
                                  </p>
                                )}
                              </div>
                              <div className="space-y-1 border-t pt-3 mt-1">
                                <label className="text-sm font-semibold text-orange-700">Ajuste M.O. (%)</label>
                                <p className="text-xs text-slate-500">Acréscimo (+) ou desconto (-) sobre a M.O. desta composição</p>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={localBdiValues[`lab-${child.id}`] ?? (bdiConfigs[child.id]?.laborAdjustment ?? 0)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setLocalBdiValues(prev => ({ ...prev, [`lab-${child.id}`]: raw }));
                                    const val = parseFloat(raw) || 0;
                                    const currentConfig = bdiConfigs[child.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, laborAdjustment: 0 };
                                    onUpdateBdiConfig(child.id, { ...currentConfig, laborAdjustment: val });
                                  }}
                                  onBlur={() => {
                                    setLocalBdiValues(prev => { const n = { ...prev }; delete n[`lab-${child.id}`]; return n; });
                                  }}
                                  className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-orange-50"
                                  placeholder="0.00"
                                />
                                {(bdiConfigs[child.id]?.laborAdjustment ?? 0) !== 0 && (
                                  <p className="text-xs text-orange-600 font-medium">
                                    M.O. ajustada: {(bdiConfigs[child.id]?.laborAdjustment ?? 0) > 0 ? '+' : ''}{bdiConfigs[child.id]?.laborAdjustment}%
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {!showBdiConfig && onUpdateBdiConfig && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`h-8 w-8 p-0 hover:bg-orange-50 ${
                              (bdiConfigs[child.id]?.laborAdjustment ?? 0) !== 0
                                ? 'text-orange-500'
                                : 'text-slate-400 hover:text-slate-600'
                            }`}
                            title="Ajuste de M.O."
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64 p-4">
                          <div className="space-y-3">
                            <div className="font-semibold text-sm text-slate-700 border-b pb-2">Ajuste de M.O.</div>
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-orange-700">Ajuste M.O. (%)</label>
                              <p className="text-xs text-slate-500">Acréscimo (+) ou desconto (-) sobre a M.O. desta composição</p>
                              <input
                                type="number"
                                step="0.01"
                                value={localBdiValues[`lab-${child.id}`] ?? (bdiConfigs[child.id]?.laborAdjustment ?? 0)}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setLocalBdiValues(prev => ({ ...prev, [`lab-${child.id}`]: raw }));
                                  const val = parseFloat(raw) || 0;
                                  const currentConfig = bdiConfigs[child.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, laborAdjustment: 0 };
                                  onUpdateBdiConfig(child.id, { ...currentConfig, laborAdjustment: val });
                                }}
                                onBlur={() => {
                                  setLocalBdiValues(prev => { const n = { ...prev }; delete n[`lab-${child.id}`]; return n; });
                                }}
                                className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-orange-50"
                                placeholder="0.00"
                              />
                              {(bdiConfigs[child.id]?.laborAdjustment ?? 0) !== 0 && (
                                <p className="text-xs text-orange-600 font-medium">
                                  M.O. ajustada: {(bdiConfigs[child.id]?.laborAdjustment ?? 0) > 0 ? '+' : ''}{bdiConfigs[child.id]?.laborAdjustment}%
                                </p>
                              )}
                            </div>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {onEditCompositeChild && child.type === 'service' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditCompositeChild(child)}
                        className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                        title="Editar item"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteItem(child.id)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Remover item"
                    >
                      ×
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {/* Expansão de insumos da composição filha */}
              {isChildExpanded && child.type === 'composition' && (
                <TableRow key={`composite-child-inputs-${child.id}`} className="bg-emerald-50/30">
                  <TableCell colSpan={10} className="p-4" style={{ paddingLeft: `${(level + 2) * 24}px` }}>
                     <CompositionInputsTableComponent
                       item={child}
                       compositionInputs={compositionInputs}
                       setCompositionInputs={setCompositionInputs}
                       onLoadCompositionInputs={onLoadCompositionInputs}
                       onSaveToBase={onSaveInputToBase}
                       onSaveCompositionForBudget={onSaveCompositionForBudget}
                       onUpdateCompositionToBase={onUpdateCompositionToBase}
                       setPendingSave={setPendingSave}
                       setSaveDialogOpen={setSaveDialogOpen}
                       onInputChange={(compositionId, updatedInputs) => {
                         let materialCost = 0;
                         let laborCost = 0;
                         let equipmentCost = 0;
                         updatedInputs.forEach(input => {
                           const totalCost = input.coefficient * input.unitCost;
                           const inputType = input.type.toLowerCase();
                           if (inputType === 'material') {
                             materialCost += totalCost;
                           } else if (inputType === 'labor') {
                             laborCost += totalCost;
                           } else if (inputType === 'equipment') {
                             equipmentCost += totalCost;
                           }
                         });
                         setCustomCosts(prev => ({ ...prev, [child.id]: { materialCost, laborCost, equipmentCost } }));
                         if (onUpdateCompositionCosts) {
                           onUpdateCompositionCosts(child.id, materialCost, laborCost, equipmentCost);
                         }
                       }}
                     />
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          );
        })}
      </>
    );
  };

  // Renderizar item
  const renderItem = (item: BudgetItem, itemNumber: string, level: number) => {
    const qty = Number(item.quantity);
    // Usar custos customizados se existirem, senão usar os valores do banco
    const materialUnitRaw = customCosts[item.id]?.materialCost ?? Number(item.materialCost);
    const materialAdjPct = bdiConfigs[item.id]?.materialAdjustment ?? 0;
    const materialUnit = materialUnitRaw * (1 + materialAdjPct / 100);
    const laborUnitRaw = customCosts[item.id]?.laborCost ?? Number(item.laborCost);
    const laborAdjPct = bdiConfigs[item.id]?.laborAdjustment ?? 0;
    const laborUnit = laborUnitRaw * (1 + laborAdjPct / 100);
    // Usar equipmentCost do customCosts quando disponível (editado pelo usuário), senão usar do banco
    const equipmentUnit = customCosts[item.id]?.equipmentCost ?? Number(item.equipmentCost ?? 0);
    const serviceUnit = Number(item.serviceCost ?? 0);
    const otherUnit = Number(item.otherCost ?? 0);
    
    const materialTotal = qty * materialUnit;
    // Consolidar equipment/service/other em laborTotal para exibição
    const laborTotal = qty * (laborUnit + equipmentUnit + serviceUnit + otherUnit);
    const equipmentTotal = qty * equipmentUnit;
    const serviceTotal = qty * serviceUnit;
    const otherTotal = qty * otherUnit;
    const priceTotal = materialTotal + laborTotal;

    const isExpanded = expandedItems.has(item.id);
    
    return (
      <>
      <TableRow key={`item-${item.id}`} className="hover:bg-slate-50" style={{ display: 'flex', width: '100%', gap: '0' }}>
        <TableCell className="break-words whitespace-normal" style={{ flex: '1 1 auto', minWidth: '200px' }}>
          <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 24}px` }}>
            {/* Mostrar botão de expansão apenas para composições */}
            {item.type === "composition" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (isExpanded) {
                    // Recolher
                    const newExpanded = new Set(expandedItems);
                    newExpanded.delete(item.id);
                    setExpandedItems(newExpanded);
                  } else {
                    // Expandir PRIMEIRO para mostrar "Carregando insumos..."
                    const newExpanded = new Set(expandedItems);
                    newExpanded.add(item.id);
                    setExpandedItems(newExpanded);
                    
                    // Carregar insumos DEPOIS de expandir
                    if (item.compositionId && compositionInputs[item.compositionId] === undefined && onLoadCompositionInputs) {
                      try {
                        const inputs = await onLoadCompositionInputs(item.compositionId, item.id);
                        setCompositionInputs(prev => ({
                          ...prev,
                          [item.compositionId!]: inputs
                        }));
                      } catch (error) {
                        console.error('Erro ao carregar insumos:', error);
                        setCompositionInputs(prev => ({
                          ...prev,
                          [item.compositionId!]: []
                        }));
                      }
                    }
                  }
                }}
                className="h-6 w-6 p-0 flex-shrink-0"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            )}
            {/* Para insumos e serviços, espaço para alinhar */}
            {item.type !== "composition" && <span className="w-6 flex-shrink-0" />}
            <span className="font-semibold text-xs mr-2 flex-shrink-0">{itemNumber}</span>
            <span>{item.description}</span>
          </div>
        </TableCell>
        <TableCell className="text-right">
          {onUpdateItemQuantity ? (
            <input
              type="number"
              step="0.01"
              value={editingQuantities[item.id] ?? qty.toFixed(2)}
              onChange={(e) => {
                setEditingQuantities(prev => ({
                  ...prev,
                  [item.id]: e.target.value
                }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              onBlur={(e) => {
                const newQty = parseFloat(e.target.value) || 0;
                onUpdateItemQuantity(item.id, newQty);
                setEditingQuantities(prev => {
                  const newVals = { ...prev };
                  delete newVals[item.id];
                  return newVals;
                });
              }}
              className="w-20 px-2 py-1 text-right border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            qty.toFixed(2)
          )}
        </TableCell>
        <TableCell className="text-center" style={{ flex: '0 0 auto', minWidth: '80px' }}>{item.unit}</TableCell>
        <TableCell className="text-right" style={{ flex: '0 0 auto', minWidth: '110px' }}>R$ {formatBRL(materialUnit)}</TableCell>
        <TableCell className="text-right" style={{ flex: '0 0 auto', minWidth: '110px' }}>R$ {formatBRL(laborUnit)}</TableCell>
        <TableCell className="text-right" style={{ flex: '0 0 auto', minWidth: '110px' }}>R$ {formatBRL(materialTotal)}</TableCell>
        <TableCell className="text-right" style={{ flex: '0 0 auto', minWidth: '110px' }}>R$ {formatBRL(laborTotal)}</TableCell>
        <TableCell className="text-right font-bold" style={{ flex: '0 0 auto', minWidth: '120px' }}>R$ {formatBRL(priceTotal)}</TableCell>
        <TableCell style={{ flex: '0 0 auto', minWidth: '140px' }}>
          <div className="flex gap-1">
            {showBdiConfig && onUpdateBdiConfig && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-600 hover:text-slate-700 hover:bg-slate-50"
                    title="Configurar BDI"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 p-4">
                  <div className="space-y-4">
                    <div className="font-semibold text-sm">Configuração de BDI</div>
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bdiConfigs[item.id]?.applyBdiToMaterial ?? true}
                          onChange={(e) => {
                            const currentConfig = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0 };
                            onUpdateBdiConfig(item.id, { ...currentConfig, applyBdiToMaterial: e.target.checked });
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Aplicar BDI ao Material</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bdiConfigs[item.id]?.applyBdiToLabor ?? true}
                          onChange={(e) => {
                            const currentConfig = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0 };
                            onUpdateBdiConfig(item.id, { ...currentConfig, applyBdiToLabor: e.target.checked });
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Aplicar BDI à Mão de Obra</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bdiConfigs[item.id]?.aplicarEncargosSociais ?? true}
                          onChange={(e) => {
                            const currentConfig = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, aplicarEncargosSociais: true };
                            onUpdateBdiConfig(item.id, { ...currentConfig, aplicarEncargosSociais: e.target.checked });
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Aplicar Encargos Sociais</span>
                      </label>
                      <div className="space-y-1">
                        <label className="text-sm font-semibold text-blue-700">Ajuste Material (%)</label>
                        <p className="text-xs text-slate-500">Acréscimo (+) ou desconto (-) sobre o Material desta composição</p>
                        <input
                          type="number"
                          step="0.01"
                          value={localBdiValues[`mat-${item.id}`] ?? (bdiConfigs[item.id]?.materialAdjustment ?? 0)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setLocalBdiValues(prev => ({ ...prev, [`mat-${item.id}`]: raw }));
                            const val = parseFloat(raw) || 0;
                            const currentConfig = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0 };
                            onUpdateBdiConfig(item.id, { ...currentConfig, materialAdjustment: val });
                          }}
                          onBlur={() => {
                            setLocalBdiValues(prev => { const n = { ...prev }; delete n[`mat-${item.id}`]; return n; });
                          }}
                          className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
                          placeholder="0.00"
                        />
                        {(bdiConfigs[item.id]?.materialAdjustment ?? 0) !== 0 && (
                          <p className="text-xs text-blue-600 font-medium">
                            Material ajustado: {(bdiConfigs[item.id]?.materialAdjustment ?? 0) > 0 ? '+' : ''}{bdiConfigs[item.id]?.materialAdjustment}%
                          </p>
                        )}
                      </div>
                      <div className="space-y-1 border-t pt-3 mt-1">
                        <label className="text-sm font-semibold text-orange-700">Ajuste M.O. (%)</label>
                        <p className="text-xs text-slate-500">Acréscimo (+) ou desconto (-) sobre a M.O. desta composição</p>
                        <input
                          type="number"
                          step="0.01"
                          value={localBdiValues[`lab-${item.id}`] ?? (bdiConfigs[item.id]?.laborAdjustment ?? 0)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setLocalBdiValues(prev => ({ ...prev, [`lab-${item.id}`]: raw }));
                            const val = parseFloat(raw) || 0;
                            const currentConfig = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, laborAdjustment: 0 };
                            onUpdateBdiConfig(item.id, { ...currentConfig, laborAdjustment: val });
                          }}
                          onBlur={() => {
                            setLocalBdiValues(prev => { const n = { ...prev }; delete n[`lab-${item.id}`]; return n; });
                          }}
                          className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-orange-50"
                          placeholder="0.00"
                        />
                        {(bdiConfigs[item.id]?.laborAdjustment ?? 0) !== 0 && (
                          <p className="text-xs text-orange-600 font-medium">
                            M.O. ajustada: {(bdiConfigs[item.id]?.laborAdjustment ?? 0) > 0 ? '+' : ''}{bdiConfigs[item.id]?.laborAdjustment}%
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!showBdiConfig && onUpdateBdiConfig && item.type === 'composition' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`h-8 w-8 p-0 hover:bg-orange-50 ${
                      (bdiConfigs[item.id]?.laborAdjustment ?? 0) !== 0
                        ? 'text-orange-500'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                    title="Ajuste de M.O."
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 p-4">
                  <div className="space-y-3">
                    <div className="font-semibold text-sm text-slate-700 border-b pb-2">Ajuste de M.O.</div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-orange-700">Ajuste M.O. (%)</label>
                      <p className="text-xs text-slate-500">Acréscimo (+) ou desconto (-) sobre a M.O. desta composição</p>
                      <input
                        type="number"
                        step="0.01"
                        value={localBdiValues[`lab-${item.id}`] ?? (bdiConfigs[item.id]?.laborAdjustment ?? 0)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setLocalBdiValues(prev => ({ ...prev, [`lab-${item.id}`]: raw }));
                          const val = parseFloat(raw) || 0;
                          const currentConfig = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, laborAdjustment: 0 };
                          onUpdateBdiConfig(item.id, { ...currentConfig, laborAdjustment: val });
                        }}
                        onBlur={() => {
                          setLocalBdiValues(prev => { const n = { ...prev }; delete n[`lab-${item.id}`]; return n; });
                        }}
                        className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-orange-50"
                        placeholder="0.00"
                      />
                      {(bdiConfigs[item.id]?.laborAdjustment ?? 0) !== 0 && (
                        <p className="text-xs text-orange-600 font-medium">
                          M.O. ajustada: {(bdiConfigs[item.id]?.laborAdjustment ?? 0) > 0 ? '+' : ''}{bdiConfigs[item.id]?.laborAdjustment}%
                        </p>
                      )}
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {item.type === "service" && onEditItem && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEditItem(item)}
                className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                title="Editar serviço"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {item.type === "input" && onEditItem && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEditItem(item)}
                className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                title="Editar insumo"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onMoveItemUp && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onMoveItemUp(item.id)}
                className="h-8 w-8 p-0 text-slate-600 hover:text-slate-700 hover:bg-slate-50"
                title="Mover para cima"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
            {onMoveItemDown && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onMoveItemDown(item.id)}
                className="h-8 w-8 p-0 text-slate-600 hover:text-slate-700 hover:bg-slate-50"
                title="Mover para baixo"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDeleteItem(item.id)}
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              ×
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow key={`item-inputs-${item.id}`} className="bg-slate-50">
          <TableCell colSpan={10} className="p-4">
            <CompositionInputsTableComponent 
              item={item}
              compositionInputs={compositionInputs}
              setCompositionInputs={setCompositionInputs}
              onLoadCompositionInputs={onLoadCompositionInputs}
              onSaveToBase={onSaveInputToBase}
              onSaveCompositionForBudget={onSaveCompositionForBudget}
              onUpdateCompositionToBase={onUpdateCompositionToBase}
              setPendingSave={setPendingSave}
              setSaveDialogOpen={setSaveDialogOpen}
              onInputChange={(compositionId, updatedInputs) => {
                // Recalcular valores da composição baseado em TODOS os insumos
                let materialCost = 0;
                let laborCost = 0;
                let equipmentCost = 0;
                
                // Usar os insumos atualizados que já contêm TODOS os insumos da composição
                updatedInputs.forEach(input => {
                  const totalCost = input.coefficient * input.unitCost;
                  // Comparar com tipos do banco: 'material', 'labor', 'equipment' (minúsculos e em inglês)
                  const inputType = input.type.toLowerCase();
                  if (inputType === 'material') {
                    materialCost += totalCost;
                  } else if (inputType === 'labor') {
                    laborCost += totalCost;
                  } else if (inputType === 'equipment') {
                    equipmentCost += totalCost;
                  }
                });
                
                // Atualizar custos customizados no estado local para atualização imediata da interface
                setCustomCosts(prev => ({
                  ...prev,
                  [item.id]: { materialCost, laborCost, equipmentCost }
                }));
                
                // Notificar o componente pai para atualizar os valores da composição no backend
                if (onUpdateCompositionCosts) {
                  onUpdateCompositionCosts(item.id, materialCost, laborCost, equipmentCost);
                }
              }}
            />
          </TableCell>
        </TableRow>
      )}
      </>
    );
  };

  // Formatar valor em reais com padrão brasileiro
  const formatBRL = (value: number): string => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Calcular custo real de um item considerando customCosts (edições locais de insumos)
  const getItemEffectiveCosts = (item: BudgetItem): { material: number; labor: number; total: number } => {
    const qty = Number(item.quantity);
    if (item.type === 'composite') {
      // Para compostos: somar os filhos com seus customCosts
      // includeMaterial=false: zerar MATERIAL (não mão de obra)
      const children = getCompositeChildren(item.id);
      const mat = children.reduce((sum, child) => {
        const m = customCosts[child.id]?.materialCost ?? Number(child.materialCost);
        const effectiveM = includeMaterial ? m : 0; // Zerar material se desabilitado
        return sum + effectiveM * Number(child.quantity);
      }, 0);
      const lab = children.reduce((sum, child) => {
        const lRaw = customCosts[child.id]?.laborCost ?? Number(child.laborCost);
        // Aplicar laborAdjustment do filho no cálculo do total da etapa
        const childLaborAdj = bdiConfigs[child.id]?.laborAdjustment ?? 0;
        const l = lRaw * (1 + childLaborAdj / 100);
        const eq = Number(child.equipmentCost ?? 0);
        const svc = Number((child as any).serviceCost ?? 0);
        const oth = Number((child as any).otherCost ?? 0);
        return sum + (l + eq + svc + oth) * Number(child.quantity);
      }, 0);
      return { material: mat, labor: lab, total: mat + lab };
    }
    // Para itens normais: usar customCosts se disponível
    const mat = (customCosts[item.id]?.materialCost ?? Number(item.materialCost)) * qty;
    const labRaw = (customCosts[item.id]?.laborCost ?? Number(item.laborCost)) * qty;
    // Aplicar laborAdjustment da composição simples no total da etapa
    const itemLaborAdj = bdiConfigs[item.id]?.laborAdjustment ?? 0;
    const lab = labRaw * (1 + itemLaborAdj / 100);
    // Aplicar materialAdjustment da composição simples no total da etapa
    const itemMatAdj = bdiConfigs[item.id]?.materialAdjustment ?? 0;
    const matAdj = mat * (1 + itemMatAdj / 100);
    const eq = Number(item.equipmentCost ?? 0) * qty;
    const svc = Number((item as any).serviceCost ?? 0) * qty;
    const oth = Number((item as any).otherCost ?? 0) * qty;
    return { material: matAdj, labor: lab + eq + svc + oth, total: matAdj + lab + eq + svc + oth };
  };

  // Calcular total recursivo de uma etapa (itens + sub-etapas)
  const calculateStageTotal = (stageId: number): number => {
    const stageItems = getStageItems(stageId);
    const subStages = getSubStages(stageId);
    
    // Soma dos itens diretos usando customCosts quando disponíveis
    const itemsTotal = stageItems.reduce((sum, item) => {
      return sum + getItemEffectiveCosts(item).total;
    }, 0);
    
    // Soma recursiva das sub-etapas
    const subStagesTotal = subStages.reduce((sum, subStage) => sum + calculateStageTotal(subStage.id), 0);
    
    return itemsTotal + subStagesTotal;
  };

  // Repassa pro componente pai o total de CADA etapa (mesmo cálculo do
  // cabeçalho azul de cada linha) — é assim que o Cronograma de Desembolso
  // (aba Gantt) consegue mostrar exatamente o mesmo valor desta tabela, sem
  // recalcular BDI numa fórmula separada.
  //
  // IMPORTANTE: "items" (e às vezes "stages") chegam do componente pai
  // recém-computados a cada render (ex.: um .map() inline), então a
  // referência muda mesmo quando os valores não mudam. Sem a comparação
  // abaixo, isso causava loop infinito: efeito roda -> chama onStageTotals
  // -> pai atualiza estado -> pai re-renderiza -> novo array de "items" ->
  // efeito roda de novo -> ... ("Maximum update depth exceeded" / erro
  // React #185 ao abrir a aba Comp. BDI). Só chama onStageTotals quando os
  // totais calculados de fato mudaram.
  const lastStageTotalsRef = useRef<string>("");
  useEffect(() => {
    if (!onStageTotals) return;
    const totals: Record<number, number> = {};
    for (const stage of stages) {
      // Arredondar pra 2 casas evita "mudança" só por ruído de ponto
      // flutuante entre um cálculo e outro com os mesmos valores de entrada.
      totals[stage.id] = Math.round(calculateStageTotal(stage.id) * 100) / 100;
    }
    const serialized = JSON.stringify(totals);
    if (serialized === lastStageTotalsRef.current) return;
    lastStageTotalsRef.current = serialized;
    onStageTotals(totals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, items, bdiConfigs, customCosts, includeMaterial]);

  // Calcular totais de material e M.O. separados para uma etapa (para custo por unidade de serviço)
  const calculateStageCosts = (stageId: number): { material: number; labor: number; total: number } => {
    const stageItems = getStageItems(stageId);
    const subStages = getSubStages(stageId);
    
    // Itens diretos usando getItemEffectiveCosts (inclui customCosts e compostos)
    const itemsMaterial = stageItems.reduce((sum, item) => sum + getItemEffectiveCosts(item).material, 0);
    const itemsLabor = stageItems.reduce((sum, item) => sum + getItemEffectiveCosts(item).labor, 0);
    
    // Sub-etapas recursivas
    const subCosts = subStages.reduce((acc, subStage) => {
      const sub = calculateStageCosts(subStage.id);
      return { material: acc.material + sub.material, labor: acc.labor + sub.labor, total: acc.total + sub.total };
    }, { material: 0, labor: 0, total: 0 });
    
    const material = itemsMaterial + subCosts.material;
    const labor = itemsLabor + subCosts.labor;
    return { material, labor, total: material + labor };
  };

  // Renderizar etapa recursivamente
  const renderStage = (stage: BudgetStage, indices: number[], level: number): React.ReactElement[] => {
    const isExpanded = expandedStages.has(stage.id);
    const stageItems = getStageItems(stage.id);
    const subStages = getSubStages(stage.id);
    const stageNumber = generateNumber(indices);
    const stageTotal = calculateStageTotal(stage.id);

    // Calcular custo por unidade de serviço (se configurado)
    const hasServiceUnit = !!(stage.serviceUnit && stage.serviceQuantity && Number(stage.serviceQuantity) > 0);
    const serviceQty = hasServiceUnit ? Number(stage.serviceQuantity) : 0;
    const stageCosts = hasServiceUnit ? calculateStageCosts(stage.id) : null;
    const unitMaterial = stageCosts && serviceQty > 0 ? stageCosts.material / serviceQty : 0;
    const unitLabor = stageCosts && serviceQty > 0 ? stageCosts.labor / serviceQty : 0;
    const unitTotal = unitMaterial + unitLabor;

    const elements: React.ReactElement[] = [];

    // Linha da Etapa
    elements.push(
      <TableRow 
        key={`stage-${stage.id}`} 
        className={cn(
          level === 0 ? "bg-[#1e3a5f] hover:bg-[#2a4a6f]" : "bg-[#3a5a7f] hover:bg-[#4a6a8f]",
          "text-white flex w-full"
        )}
      >
          <TableCell className="font-bold text-white flex-1" style={{ paddingLeft: `${level * 24 + 12}px` }}>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleStage(stage.id)}
                className="h-6 w-6 p-0 text-white hover:bg-slate-600"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              <div className="flex flex-col">
                <span>{stageNumber} - {stage.name.toUpperCase()}</span>
                {hasServiceUnit && (
                  <span className="text-xs font-normal text-blue-200 mt-0.5">
                    {Number(stage.serviceQuantity).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {stage.serviceUnit}
                    {" • "}
                    Mat: R$ {formatBRL(unitMaterial)}/{stage.serviceUnit}
                    {" • "}
                    M.O.: R$ {formatBRL(unitLabor)}/{stage.serviceUnit}
                    {" • "}
                    <span className="font-semibold text-yellow-300">Total: R$ {formatBRL(unitTotal)}/{stage.serviceUnit}</span>
                  </span>
                )}
              </div>
            </div>
          </TableCell>
          <TableCell className="text-white flex-shrink-0" style={{ minWidth: "120px" }}>
            {hasServiceUnit ? (
              <div className="text-xs text-center">
                <div className="text-blue-200">{stage.serviceUnit}</div>
                <div className="font-semibold">{Number(stage.serviceQuantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>
            ) : null}
          </TableCell>
          <TableCell className="text-white flex-shrink-0" style={{ minWidth: "60px" }}></TableCell>
          <TableCell className="text-white flex-shrink-0 text-right" style={{ minWidth: "100px" }}>
            {hasServiceUnit ? (
              <div className="text-xs">
                <div className="text-blue-200 text-right">R$ {formatBRL(unitMaterial)}</div>
              </div>
            ) : null}
          </TableCell>
          <TableCell className="text-white flex-shrink-0 text-right" style={{ minWidth: "100px" }}>
            {hasServiceUnit ? (
              <div className="text-xs">
                <div className="text-blue-200 text-right">R$ {formatBRL(unitLabor)}</div>
              </div>
            ) : null}
          </TableCell>
          <TableCell className="text-white flex-shrink-0 text-right" style={{ minWidth: "120px" }}>
            {hasServiceUnit && stageCosts ? (
              <div className="text-xs">
                <div className="text-blue-200 text-right">R$ {formatBRL(stageCosts.material)}</div>
              </div>
            ) : null}
          </TableCell>
          <TableCell className="text-white flex-shrink-0 text-right" style={{ minWidth: "120px" }}>
            {hasServiceUnit && stageCosts ? (
              <div className="text-xs">
                <div className="text-blue-200 text-right">R$ {formatBRL(stageCosts.labor)}</div>
              </div>
            ) : null}
          </TableCell>
          <TableCell className="text-white font-bold text-right flex-shrink-0" style={{ minWidth: "140px" }}>
            R$ {formatBRL(stageTotal)}
          </TableCell>
          <TableCell className="flex-shrink-0" style={{ minWidth: "360px" }}>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                className="h-8 px-2 text-xs bg-green-600 hover:bg-green-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddComposition(stage.id);
                }}
              >
                + Composição
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 px-2 text-xs bg-blue-600 hover:bg-blue-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddService(stage.id);
                }}
              >
                + Serviço
              </Button>
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 w-8 p-0 bg-orange-600 hover:bg-orange-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem onClick={() => onAddSubStage(stage.id)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar sub-etapa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddComposition(stage.id)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar composição
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddService(stage.id)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar serviço a preço informado
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddInput(stage.id)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar insumo
                </DropdownMenuItem>
                {(onAddCompositeService || onCreateCompositeItem) && (
                  <DropdownMenuItem onClick={() => {
                    setInlineCompositeStageId(stage.id);
                    setInlineCompositeName("");
                    setInlineCompositeUnit("");
                    setInlineCompositeQty("");
                    // Expandir a etapa automaticamente
                    const newExpanded = new Set(expandedStages);
                    newExpanded.add(stage.id);
                    setExpandedStages(newExpanded);
                  }} className="text-emerald-700 font-medium">
                    <Layers className="h-4 w-4 mr-2" />
                    Adicionar serviço composto
                  </DropdownMenuItem>
                )}
                {onImportEAP && (
                  <DropdownMenuItem onClick={() => onImportEAP(stage.id)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar EAP
                  </DropdownMenuItem>
                )}
                {onDuplicateStage && (
                  <DropdownMenuItem onClick={() => onDuplicateStage(stage.id)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicar etapa
                  </DropdownMenuItem>
                )}
                {onMoveStageUp && (
                  <DropdownMenuItem onClick={() => onMoveStageUp(stage.id)}>
                    <ArrowUp className="h-4 w-4 mr-2" />
                    Mover para cima
                  </DropdownMenuItem>
                )}
                {onMoveStageDown && (
                  <DropdownMenuItem onClick={() => onMoveStageDown(stage.id)}>
                    <ArrowDown className="h-4 w-4 mr-2" />
                    Mover para baixo
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onEditStage(stage)} className="text-blue-600">
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar etapa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDeleteStage(stage.id)} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remover item
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          </TableCell>
      </TableRow>
    );

    // Itens da Etapa e Sub-etapas (quando expandida)
    if (isExpanded) {
      let itemCounter = 0;
      let subStageCounter = 0;
      
      // Renderizar itens da etapa
      stageItems.forEach((item) => {
        itemCounter++;
        const itemNumber = `${stageNumber}.${itemCounter}`;
        if (item.type === 'composite') {
          const compositeElement = renderCompositeItem(item, itemNumber, level + 1);
          elements.push(React.cloneElement(compositeElement as React.ReactElement, { key: `composite-${item.id}` }));
        } else {
          const itemElement = renderItem(item, itemNumber, level + 1);
          elements.push(React.cloneElement(itemElement, { key: `item-${item.id}` }));
        }
      });
      
      // Formulário inline de Serviço Composto
      if (inlineCompositeStageId === stage.id) {
        elements.push(
          <TableRow key={`inline-composite-${stage.id}`} className="bg-emerald-50 border-l-4 border-emerald-500" style={{ display: 'flex', width: '100%', gap: '0' }}>
            <TableCell style={{ flex: '1 1 auto', minWidth: '200px' }}>
              <div className="flex items-center gap-2" style={{ paddingLeft: `${(level + 1) * 24}px` }}>
                <Layers className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Descrição do serviço composto..."
                  value={inlineCompositeName}
                  onChange={(e) => setInlineCompositeName(e.target.value)}
                  className="flex-1 text-sm border border-emerald-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  autoFocus
                />
              </div>
            </TableCell>
            <TableCell style={{ width: '80px', flexShrink: 0 }}>
              <select
                value={inlineCompositeUnit}
                onChange={(e) => setInlineCompositeUnit(e.target.value)}
                className="w-full text-sm border border-emerald-300 rounded px-1 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              >
                <option value="UN">UN</option>
                <option value="m²">m²</option>
                <option value="m³">m³</option>
                <option value="m">m</option>
                <option value="kg">kg</option>
                <option value="t">t</option>
                <option value="un">un</option>
                <option value="vb">vb</option>
                <option value="cj">cj</option>
                <option value="hr">hr</option>
                <option value="l">l</option>
              </select>
            </TableCell>
            <TableCell style={{ width: '90px', flexShrink: 0 }}>
              <input
                type="number"
                placeholder="Qtde"
                value={inlineCompositeQty}
                onChange={(e) => setInlineCompositeQty(e.target.value)}
                className="w-full text-sm border border-emerald-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-right"
                step="0.01"
                min="0"
              />
            </TableCell>
            <TableCell colSpan={4} style={{ width: '450px', flexShrink: 0 }}>
              <div className="flex items-center gap-2 justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={!inlineCompositeName.trim() || !inlineCompositeQty || isSavingInlineComposite}
                  onClick={async () => {
                    if (!onCreateCompositeItem) return;
                    setIsSavingInlineComposite(true);
                    try {
                      await onCreateCompositeItem(
                        stage.id,
                        inlineCompositeName.trim(),
                        inlineCompositeUnit,
                        parseFloat(inlineCompositeQty)
                      );
                      setInlineCompositeStageId(null);
                    } finally {
                      setIsSavingInlineComposite(false);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs"
                >
                  {isSavingInlineComposite ? "Salvando..." : "✓ Criar"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setInlineCompositeStageId(null)}
                  className="h-8 px-3 text-xs text-slate-500 hover:text-slate-700"
                >
                  ✕ Cancelar
                </Button>
              </div>
            </TableCell>
          </TableRow>
        );
      }
      
      // Renderizar sub-etapas
      subStages.forEach((subStage) => {
        subStageCounter++;
        const subStageIndices = [...indices, subStageCounter - 1];
        const subElements = renderStage(subStage, subStageIndices, level + 1);
        elements.push(...subElements);
      });
    }

    return elements;
  };

  if (rootStages.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Clique em "Adicionar Etapa" para começar a organizar o orçamento
      </div>
    );
  }

  return (
    <>
      <AlertDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Atualização Global</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Você está prestes a atualizar o valor unitário do insumo:
              </p>
              <p className="font-semibold text-slate-900">
                {pendingSave?.inputDescription}
              </p>
              <p>
                Novo valor: <span className="font-semibold text-blue-600">R$ {formatBRL(pendingSave?.unitCost || 0)}</span>
              </p>
              <p className="text-amber-600 font-medium mt-4">
                ⚠️ Esta alteração será aplicada em <strong>TODAS as composições</strong> que utilizam este insumo!
              </p>
              <p className="text-sm text-slate-600">
                Isso afetará todos os orçamentos que usam essas composições.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700"
              onClick={async () => {
                if (pendingSave && onSaveInputToBase) {
                  await onSaveInputToBase(pendingSave.inputId, pendingSave.unitCost, pendingSave.compositionId, pendingSave.coefficient);
                  setPendingSave(null);
                }
              }}
            >
              Confirmar Atualização
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Table className="w-full" style={{ display: 'flex', flexDirection: 'column' }}>
      <TableHeader style={{ display: 'flex', width: '100%' }}>
        <TableRow style={{ display: 'flex', width: '100%', gap: '0' }}>
          <TableHead className="text-xs" style={{ flex: '1 1 auto', minWidth: '200px' }}>DESCRIÇÃO</TableHead>
          <TableHead className="text-xs text-center" style={{ flex: '0 0 auto', minWidth: '80px' }}>QTDE</TableHead>
          <TableHead className="text-xs text-center" style={{ flex: '0 0 auto', minWidth: '50px' }}>UN</TableHead>
          <TableHead className="text-xs text-right" style={{ flex: '0 0 auto', minWidth: '110px' }}>VL.UNIT.MAT</TableHead>
          <TableHead className="text-xs text-right" style={{ flex: '0 0 auto', minWidth: '110px' }}>VL.UNIT.M.O.</TableHead>
          <TableHead className="text-xs text-right" style={{ flex: '0 0 auto', minWidth: '110px' }}>VL.TOT.MAT</TableHead>
          <TableHead className="text-xs text-right" style={{ flex: '0 0 auto', minWidth: '110px' }}>VL.TOT.M.O.</TableHead>
          <TableHead className="text-xs text-right" style={{ flex: '0 0 auto', minWidth: '120px' }}>TOTAL</TableHead>
          <TableHead className="text-xs text-center" style={{ flex: '0 0 auto', minWidth: '140px' }}></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rootStages.map((stage, index) => (
          <React.Fragment key={stage.id}>
            {renderStage(stage, [index], 0)}
          </React.Fragment>
        ))}
      </TableBody>
    </Table>
    </>
  );
}
