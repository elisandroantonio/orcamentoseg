import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, ChevronDown, ChevronRight, Trash2, Pencil, CheckCircle2, XCircle,
  Settings, Layers, Search, X, SlidersHorizontal, List, Save, RotateCcw, RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AditivoEditorProps {
  additiveId: number;
  budgetId: number;
  isFrozen: boolean;
  viewMode: "sem-bdi" | "com-bdi";
  socialCharges: number;
  adminCentral: number;
  profit: number;
  taxes: number;
  risk: number;
  warranty: number;
  bdiMultiplier: number;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Fonte única de verdade pro cálculo "com BDI" de um item de aditivo.
// Antes existiam duas contas separadas (uma pra coluna Total, outra pras
// colunas Material/M.O.) que podiam divergir — por exemplo a coluna M.O.
// aplicava encargos sociais sem checar a flag "aplicarEncargosSociais" do
// item, enquanto o Total respeitava. Agora Material, M.O. e Total vêm todos
// daqui, então não tem como ficar inconsistente de novo.
function calcItemBdiBreakdown(item: any, bdiMultiplier: number, socialCharges: number) {
  // Respeitar flag includeMaterial por item (0 = material por conta do cliente)
  const rawMaterial = item.materialCost || 0;
  const materialBase = Number(item.includeMaterial) === 0 ? 0 : rawMaterial;
  const laborBase = (item.laborCost || 0) + (item.equipmentCost || 0) + (item.serviceCost || 0) + (item.otherCost || 0);
  // Ajuste de Material e M.O. (equalização) — mesmo conceito da aba Comp. BDI,
  // aplicado antes do multiplicador de BDI.
  const matAdjMultiplier = 1 + (item.materialAdjustment || 0) / 100;
  const labAdjMultiplier = 1 + (item.laborAdjustment || 0) / 100;
  const material = materialBase * matAdjMultiplier;
  const labor = laborBase * labAdjMultiplier;
  const aplicarEncargos = Number(item.aplicarEncargosSociais) !== 0;
  const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
  const applyMat = Number(item.applyBdiToMaterial) !== 0;
  const applyLab = Number(item.applyBdiToLabor) !== 0;
  // Compat: mantém incremento/desconto legado, caso existam valores antigos
  const increment = 1 + (item.additionalIncrement || 0) / 100;
  const discount = 1 - (item.discount || 0) / 100;
  const matFinal = applyMat ? material * bdiMultiplier : material;
  const labFinal = applyLab ? laborWithCharges * bdiMultiplier : laborWithCharges;
  const qty = item.quantity || 1;
  const factor = increment * discount * qty;
  return {
    material: matFinal * factor,
    labor: labFinal * factor,
    total: (matFinal + labFinal) * factor,
  };
}

function calcItemTotalWithBdi(item: any, bdiMultiplier: number, socialCharges: number) {
  return calcItemBdiBreakdown(item, bdiMultiplier, socialCharges).total;
}

export function AditivoEditor({
  additiveId,
  budgetId,
  isFrozen,
  viewMode,
  socialCharges,
  bdiMultiplier,
}: AditivoEditorProps) {
  const utils = trpc.useUtils();

  const { data: stages = [], isLoading } = trpc.additives.getStages.useQuery({ additiveId });

  // UI state (declarado antes das mutations para evitar erros de referência)
  const [bdiPopoverItemId, setBdiPopoverItemId] = useState<number | null>(null);
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());
  const [addStageDialog, setAddStageDialog] = useState<{ open: boolean; parentId: number | null }>({ open: false, parentId: null });
  const [newStageName, setNewStageName] = useState("");
  const [editingStageId, setEditingStageId] = useState<number | null>(null);
  const [editingStageName, setEditingStageName] = useState("");
  const [addItemDialog, setAddItemDialog] = useState<{ open: boolean; stageId: number | null }>({ open: false, stageId: null });
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemValues, setEditingItemValues] = useState<Record<string, any>>({});
  // Dialog de edição completa de item
  const [editItemDialog, setEditItemDialog] = useState<{
    open: boolean;
    item: any | null;
  }>({ open: false, item: null });
  const [editItemForm, setEditItemForm] = useState({
    description: "",
    unit: "",
    quantity: 1,
    materialCost: 0,
    laborCost: 0,
    equipmentCost: 0,
    serviceCost: 0,
    otherCost: 0,
  });
  // Estado para expansão de insumos por item
  const [expandedInputsItemId, setExpandedInputsItemId] = useState<number | null>(null);
  // Estado local dos insumos sendo editados
  type InputRow = { inputId: number; description: string; unit: string; type: string; coefficient: number; unitCost: number };
  const [editingInputs, setEditingInputs] = useState<InputRow[]>([]);
  const [inputsDirty, setInputsDirty] = useState(false);
  const [itemForm, setItemForm] = useState({
    type: "composition" as "composition" | "input" | "service",
    description: "",
    unit: "",
    quantity: 1,
    materialCost: 0,
    laborCost: 0,
    equipmentCost: 0,
    serviceCost: 0,
    otherCost: 0,
    unitCost: 0,
    compositionId: null as number | null,
  });

  // Mutations
  const createStage = trpc.additives.createStage.useMutation({
    onSuccess: () => { utils.additives.getStages.invalidate({ additiveId }); toast.success("Etapa criada!"); setAddStageDialog({ open: false, parentId: null }); setNewStageName(""); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateStage = trpc.additives.updateStage.useMutation({
    onSuccess: () => { utils.additives.getStages.invalidate({ additiveId }); setEditingStageId(null); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteStage = trpc.additives.deleteStage.useMutation({
    onSuccess: () => { utils.additives.getStages.invalidate({ additiveId }); toast.success("Etapa removida."); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const createItem = trpc.additives.createItem.useMutation({
    onSuccess: () => {
      utils.additives.getStages.invalidate({ additiveId });
      utils.additives.list.invalidate({ budgetId });
      toast.success("Item adicionado!");
      setAddItemDialog({ open: false, stageId: null });
      setItemForm({ type: "composition", description: "", unit: "", quantity: 1, materialCost: 0, laborCost: 0, equipmentCost: 0, serviceCost: 0, otherCost: 0, unitCost: 0, compositionId: null });
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateItem = trpc.additives.updateItem.useMutation({
    onSuccess: () => {
      utils.additives.getStages.invalidate({ additiveId });
      utils.additives.list.invalidate({ budgetId });
      setEditingItemId(null);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteItem = trpc.additives.deleteItem.useMutation({
    onSuccess: () => {
      utils.additives.getStages.invalidate({ additiveId });
      utils.additives.list.invalidate({ budgetId });
      toast.success("Item removido.");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  // Mutations de sincronização com o orçamento principal
  const syncItem = trpc.additives.syncItemWithBudget.useMutation({
    onSuccess: () => {
      utils.additives.getStages.invalidate({ additiveId });
      utils.additives.list.invalidate({ budgetId });
      toast.success("Item sincronizado com o orçamento principal!");
    },
    onError: (e) => toast.error("Erro ao sincronizar: " + e.message),
  });
  const syncAll = trpc.additives.syncAllItemsWithBudget.useMutation({
    onSuccess: (data) => {
      utils.additives.getStages.invalidate({ additiveId });
      utils.additives.list.invalidate({ budgetId });
      toast.success(`${data.synced} item(ns) sincronizado(s) com o orçamento principal!`);
    },
    onError: (e) => toast.error("Erro ao sincronizar: " + e.message),
  });
  // Mutation para salvar insumos customizados do item de aditivo
  const saveAdditiveInputs = trpc.additives.saveAdditiveItemInputs.useMutation({
    onSuccess: () => {
      utils.additives.getStages.invalidate({ additiveId });
      utils.additives.list.invalidate({ budgetId });
      // Recarregar insumos do item expandido
      if (expandedInputsItemId !== null) {
        utils.additives.getAdditiveItemInputs.invalidate({ additiveItemId: expandedInputsItemId });
      }
      setInputsDirty(false);
      toast.success("Insumos atualizados!");
    },
    onError: (e) => toast.error("Erro ao salvar insumos: " + e.message),
  });

  // Query de insumos do item expandido
  const { data: additiveItemInputsData, isLoading: inputsLoading } = trpc.additives.getAdditiveItemInputs.useQuery(
    { additiveItemId: expandedInputsItemId!, additiveId },
    { enabled: expandedInputsItemId !== null, staleTime: 0 }
  );

  // Quando os insumos carregam, inicializar o estado de edição
  useEffect(() => {
    if (additiveItemInputsData && !inputsDirty) {
      setEditingInputs(additiveItemInputsData.inputs.map((inp: any) => ({
        inputId: inp.inputId,
        description: inp.description || '',
        unit: inp.unit || '',
        type: inp.type || 'material',
        coefficient: inp.coefficient,
        unitCost: inp.unitCost,
      })));
    }
  }, [additiveItemInputsData, inputsDirty]);

  const handleToggleInputs = (itemId: number, isComposition: boolean) => {
    if (!isComposition) return; // Só composições têm insumos
    if (expandedInputsItemId === itemId) {
      setExpandedInputsItemId(null);
      setEditingInputs([]);
      setInputsDirty(false);
    } else {
      setExpandedInputsItemId(itemId);
      setEditingInputs([]);
      setInputsDirty(false);
    }
  };

  const handleSaveInputs = (itemId: number) => {
    saveAdditiveInputs.mutate({
      additiveItemId: itemId,
      additiveId,
      inputs: editingInputs.map(inp => ({
        inputId: inp.inputId,
        coefficient: inp.coefficient,
        unitCost: inp.unitCost,
        type: inp.type,
      }))
    });
  };

  const handleResetInputs = () => {
    if (additiveItemInputsData) {
      setEditingInputs(additiveItemInputsData.inputs.map((inp: any) => ({
        inputId: inp.inputId,
        description: inp.description || '',
        unit: inp.unit || '',
        type: inp.type || 'material',
        coefficient: inp.coefficient,
        unitCost: inp.unitCost,
      })));
      setInputsDirty(false);
    }
  };

  // Busca de composições
  const [compSearch, setCompSearch] = useState("");
  const [selectedCompId, setSelectedCompId] = useState<number | null>(null);
  const [showCompResults, setShowCompResults] = useState(false);
  const { data: compositionsData } = trpc.compositions.list.useQuery(
    { search: compSearch },
    { enabled: addItemDialog.open && itemForm.type === "composition" && compSearch.length >= 2 }
  );

  // Busca custos calculados da composição selecionada
  // O servidor busca automaticamente o budgetItemId pelo budgetId + compositionId
  // para usar os valores customizados do orçamento principal (budget_item_inputs)
  const { data: compCostsData } = trpc.additives.getCompositionForAdditive.useQuery(
    { compositionId: selectedCompId!, budgetId },
    { enabled: selectedCompId !== null, staleTime: 0 }
  );

  const toggleStage = (id: number) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectComposition = useCallback((comp: any) => {
    // Primeiro, definir dados básicos da composição
    setItemForm(prev => ({
      ...prev,
      compositionId: comp.id,
      description: comp.description,
      unit: comp.unit || "",
      materialCost: 0,
      laborCost: 0,
      equipmentCost: 0,
      serviceCost: 0,
      otherCost: 0,
      unitCost: 0,
    }));
    // Fechar lista de resultados e atualizar busca com o nome selecionado
    setCompSearch(comp.description);
    setShowCompResults(false);
    // Disparar busca de custos calculados
    setSelectedCompId(comp.id);
  }, []);

  // Atualizar custos quando os dados calculados chegarem
  useEffect(() => {
    if (compCostsData && selectedCompId !== null) {
      setItemForm(prev => {
        if (prev.compositionId !== selectedCompId) return prev;
        return {
          ...prev,
          materialCost: compCostsData.materialCost,
          laborCost: compCostsData.laborCost,
          equipmentCost: compCostsData.equipmentCost,
          serviceCost: compCostsData.serviceCost,
          otherCost: compCostsData.otherCost,
          unitCost: compCostsData.unitCost,
        };
      });
    }
  }, [compCostsData, selectedCompId]);

  const handleAddItem = () => {
    if (!addItemDialog.stageId) return;
    const unitCost = itemForm.type === "service"
      ? itemForm.unitCost
      : (itemForm.materialCost + itemForm.laborCost + itemForm.equipmentCost + itemForm.serviceCost + itemForm.otherCost);
    createItem.mutate({
      additiveId,
      stageId: addItemDialog.stageId,
      type: itemForm.type,
      compositionId: itemForm.compositionId,
      description: itemForm.description,
      unit: itemForm.unit,
      quantity: itemForm.quantity,
      materialCost: itemForm.materialCost,
      laborCost: itemForm.laborCost,
      equipmentCost: itemForm.equipmentCost,
      serviceCost: itemForm.serviceCost,
      otherCost: itemForm.otherCost,
      unitCost,
    });
  };

  const renderStageNumber = (stageIndex: number, parentNum?: string) => {
    return parentNum ? `${parentNum}.${stageIndex + 1}` : `${stageIndex + 1}`;
  };

  const renderItems = (items: any[], stageNum: string) => {
    if (!items || items.length === 0) return null;
    return items.map((item: any, idx: number) => {
      const itemNum = `${stageNum}.${idx + 1}`;
      const isEditing = editingItemId === item.id;
      const isComposition = item.type === 'composition';
      const isInputsExpanded = expandedInputsItemId === item.id;
      // totalNoBdi respeita includeMaterial: exclui material se desabilitado
      const _rawMat = item.materialCost || 0;
      const _mat = (item.includeMaterial === 0 || item.includeMaterial === false) ? 0 : _rawMat;
      const _lab = (item.laborCost || 0) + (item.equipmentCost || 0) + (item.serviceCost || 0) + (item.otherCost || 0);
      const _qty = item.quantity || 1;
      const totalNoBdi = (_mat + _lab) * _qty;

      if (viewMode === "com-bdi") {
        // Material, M.O. e Total vêm todos do mesmo cálculo agora — ver
        // calcItemBdiBreakdown (única fonte de verdade).
        const _bdi = calcItemBdiBreakdown(item, bdiMultiplier, socialCharges);
        return (
          <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50">
            <td className="py-2 px-3 text-xs text-gray-400 w-16">{itemNum}</td>
            <td className="py-2 px-3 text-xs text-gray-700">{item.description}</td>
            <td className="py-2 px-3 text-xs text-center text-gray-500">{item.quantity}</td>
            <td className="py-2 px-3 text-xs text-center text-gray-500">{item.unit}</td>
            <td className="py-2 px-3 text-xs text-right text-gray-600">
              {formatCurrency(_bdi.material)}
            </td>
            <td className="py-2 px-3 text-xs text-right text-gray-600">
              {formatCurrency(_bdi.labor)}
            </td>
            <td className="py-2 px-3 text-xs text-right font-semibold text-blue-700">
              {formatCurrency(_bdi.total)}
            </td>
            {!isFrozen && (
              <td className="py-2 px-3 text-xs">
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400"
                    title="Editar item"
                    onClick={() => {
                      setEditItemForm({
                        description: item.description || "",
                        unit: item.unit || "",
                        quantity: item.quantity || 1,
                        materialCost: item.materialCost || 0,
                        laborCost: item.laborCost || 0,
                        equipmentCost: item.equipmentCost || 0,
                        serviceCost: item.serviceCost || 0,
                        otherCost: item.otherCost || 0,
                      });
                      setEditItemDialog({ open: true, item });
                    }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Popover open={bdiPopoverItemId === item.id} onOpenChange={(open) => setBdiPopoverItemId(open ? item.id : null)}>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="ghost" className={cn("h-6 w-6 p-0", (item.applyBdiToMaterial === false || item.applyBdiToMaterial === 0 || item.applyBdiToLabor === false || item.applyBdiToLabor === 0 || item.includeMaterial === 0 || item.includeMaterial === false || (item.materialAdjustment && item.materialAdjustment !== '0') || (item.laborAdjustment && item.laborAdjustment !== '0')) ? "text-orange-500" : "text-gray-400")}>
                        <SlidersHorizontal className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3" align="end">
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-gray-700">Configuração de BDI</p>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Checkbox id={`applyMat2-${item.id}`} checked={Number(item.applyBdiToMaterial) !== 0}
                              onCheckedChange={(v) => updateItem.mutate({ id: item.id, applyBdiToMaterial: v === true })} />
                            <Label htmlFor={`applyMat2-${item.id}`} className="text-xs cursor-pointer">Aplicar BDI ao Material</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox id={`applyLab2-${item.id}`} checked={Number(item.applyBdiToLabor) !== 0}
                              onCheckedChange={(v) => updateItem.mutate({ id: item.id, applyBdiToLabor: v === true })} />
                            <Label htmlFor={`applyLab2-${item.id}`} className="text-xs cursor-pointer">Aplicar BDI à Mão de Obra</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox id={`applyEnc2-${item.id}`} checked={Number(item.aplicarEncargosSociais) !== 0}
                              onCheckedChange={(v) => updateItem.mutate({ id: item.id, aplicarEncargosSociais: v === true })} />
                            <Label htmlFor={`applyEnc2-${item.id}`} className="text-xs cursor-pointer">Aplicar Encargos Sociais</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox id={`inclMat2-${item.id}`} checked={Number(item.includeMaterial) !== 0}
                              onCheckedChange={(v) => updateItem.mutate({ id: item.id, includeMaterial: v === true })} />
                            <Label htmlFor={`inclMat2-${item.id}`} className="text-xs cursor-pointer">Incluir Material no Orçamento</Label>
                          </div>
                        </div>
                        <div className="space-y-2 pt-1 border-t border-gray-100">
                          <div>
                            <Label className="text-xs font-semibold text-blue-700">Ajuste Material (%)</Label>
                            <p className="text-[11px] text-gray-500">Acréscimo (+) ou desconto (-) sobre o Material deste item</p>
                            <Input type="number" step="0.01" className="h-7 text-xs mt-1 border-blue-300 bg-blue-50 focus-visible:ring-blue-500"
                              defaultValue={item.materialAdjustment || 0}
                              onBlur={(e) => updateItem.mutate({ id: item.id, materialAdjustment: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div>
                            <Label className="text-xs font-semibold text-orange-700">Ajuste M.O. (%)</Label>
                            <p className="text-[11px] text-gray-500">Acréscimo (+) ou desconto (-) sobre a M.O. deste item</p>
                            <Input type="number" step="0.01" className="h-7 text-xs mt-1 border-orange-300 bg-orange-50 focus-visible:ring-orange-500"
                              defaultValue={item.laborAdjustment || 0}
                              onBlur={(e) => updateItem.mutate({ id: item.id, laborAdjustment: parseFloat(e.target.value) || 0 })} />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {isComposition && (
                    <Button size="sm" variant="ghost"
                      className="h-6 w-6 p-0 text-teal-500 hover:text-teal-700"
                      title="Sincronizar com orçamento principal"
                      disabled={syncItem.isPending}
                      onClick={() => syncItem.mutate({ additiveItemId: item.id, budgetId })}>
                      <RefreshCw className={cn("h-3 w-3", syncItem.isPending && "animate-spin")} />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => deleteItem.mutate({ id: item.id })}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </td>
            )}
          </tr>
        );
      }
      // Painel de insumos expandido
      const inputsPanel = isInputsExpanded ? (
        <tr key={`inputs-${item.id}`} className="bg-blue-50/60">
          <td colSpan={8} className="px-4 py-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                  <List className="h-3.5 w-3.5" /> Insumos da Composição
                  {additiveItemInputsData?.source === 'custom' && (
                    <span className="ml-2 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Customizado</span>
                  )}
                </span>
                <div className="flex gap-1">
                  {inputsDirty && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-gray-500 gap-1"
                      onClick={handleResetInputs}>
                      <RotateCcw className="h-3 w-3" /> Desfazer
                    </Button>
                  )}
                  <Button size="sm" className="h-6 px-2 text-xs gap-1 bg-blue-600 hover:bg-blue-700"
                    onClick={() => handleSaveInputs(item.id)}
                    disabled={!inputsDirty || saveAdditiveInputs.isPending}>
                    <Save className="h-3 w-3" /> {saveAdditiveInputs.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
              {inputsLoading ? (
                <div className="text-xs text-gray-400 py-2">Carregando insumos...</div>
              ) : editingInputs.length === 0 ? (
                <div className="text-xs text-gray-400 py-2">Nenhum insumo encontrado.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-blue-200 text-gray-500">
                      <th className="py-1 px-2 text-left">Cód.</th>
                      <th className="py-1 px-2 text-left">Descrição</th>
                      <th className="py-1 px-2 text-center w-12">Tipo</th>
                      <th className="py-1 px-2 text-center w-12">UN</th>
                      <th className="py-1 px-2 text-center w-24">Coef.</th>
                      <th className="py-1 px-2 text-center w-28">Vlr. Unit.</th>
                      <th className="py-1 px-2 text-right w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editingInputs.map((inp, i) => (
                      <tr key={inp.inputId} className="border-b border-blue-100">
                        <td className="py-1 px-2 text-gray-400">{inp.inputId}</td>
                        <td className="py-1 px-2 text-gray-700">{inp.description}</td>
                        <td className="py-1 px-2 text-center">
                          <span className={cn('text-xs px-1 rounded', inp.type === 'labor' ? 'bg-green-100 text-green-700' : inp.type === 'equipment' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700')}>
                            {inp.type === 'labor' ? 'M.O.' : inp.type === 'equipment' ? 'Equip.' : 'Mat.'}
                          </span>
                        </td>
                        <td className="py-1 px-2 text-center text-gray-500">{inp.unit}</td>
                        <td className="py-1 px-2">
                          <Input
                            type="number"
                            className="h-6 w-20 text-xs text-center mx-auto"
                            value={inp.coefficient}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setEditingInputs(prev => prev.map((r, ri) => ri === i ? { ...r, coefficient: val } : r));
                              setInputsDirty(true);
                            }}
                          />
                        </td>
                        <td className="py-1 px-2">
                          <Input
                            type="number"
                            className="h-6 w-24 text-xs text-center mx-auto"
                            value={inp.unitCost}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setEditingInputs(prev => prev.map((r, ri) => ri === i ? { ...r, unitCost: val } : r));
                              setInputsDirty(true);
                            }}
                          />
                        </td>
                        <td className="py-1 px-2 text-right font-medium text-gray-700">
                          {formatCurrency(inp.coefficient * inp.unitCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-blue-200">
                      <td colSpan={6} className="py-1 px-2 text-right text-xs font-semibold text-gray-600">Total unitário:</td>
                      <td className="py-1 px-2 text-right text-xs font-bold text-blue-700">
                        {formatCurrency(editingInputs.reduce((s, r) => s + r.coefficient * r.unitCost, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </td>
        </tr>
      ) : null;

      // Visão s/ BDI
      return (
        <>
          <tr key={item.id} className={cn("border-b border-gray-100 hover:bg-gray-50/50", isInputsExpanded && "bg-blue-50/30")}>
          <td className="py-2 px-3 text-xs text-gray-400 w-16">{itemNum}</td>
          <td className="py-2 px-3 text-xs text-gray-700">{item.description}</td>
          <td className="py-2 px-3 text-xs text-center">
            <span className="text-gray-600">{item.quantity}</span>
          </td>
          <td className="py-2 px-3 text-xs text-center text-gray-500">{item.unit}</td>
          <td className="py-2 px-3 text-xs text-right text-gray-600">{formatCurrency(_mat * _qty)}</td>
          <td className="py-2 px-3 text-xs text-right text-gray-600">
            {formatCurrency(_lab * _qty)}
          </td>
          <td className="py-2 px-3 text-xs text-right font-semibold text-gray-800">
            {formatCurrency(totalNoBdi)}
          </td>
          {!isFrozen && (
            <td className="py-2 px-3 text-xs">
              <div className="flex items-center gap-1">
                  <>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400"
                      title="Editar item"
                      onClick={() => {
                        setEditItemForm({
                          description: item.description || "",
                          unit: item.unit || "",
                          quantity: item.quantity || 1,
                          materialCost: item.materialCost || 0,
                          laborCost: item.laborCost || 0,
                          equipmentCost: item.equipmentCost || 0,
                          serviceCost: item.serviceCost || 0,
                          otherCost: item.otherCost || 0,
                        });
                        setEditItemDialog({ open: true, item });
                      }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Popover open={bdiPopoverItemId === item.id} onOpenChange={(open) => setBdiPopoverItemId(open ? item.id : null)}>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="ghost" className={cn("h-6 w-6 p-0", (item.applyBdiToMaterial === false || item.applyBdiToMaterial === 0 || item.applyBdiToLabor === false || item.applyBdiToLabor === 0 || item.includeMaterial === 0 || item.includeMaterial === false || (item.materialAdjustment && item.materialAdjustment !== '0') || (item.laborAdjustment && item.laborAdjustment !== '0')) ? "text-orange-500" : "text-gray-400")}>
                          <SlidersHorizontal className="h-3 w-3" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-3" align="end">
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-gray-700">Configuração de BDI</p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Checkbox id={`applyMat-${item.id}`} checked={Number(item.applyBdiToMaterial) !== 0}
                                onCheckedChange={(v) => updateItem.mutate({ id: item.id, applyBdiToMaterial: v === true })} />
                              <Label htmlFor={`applyMat-${item.id}`} className="text-xs cursor-pointer">Aplicar BDI ao Material</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox id={`applyLab-${item.id}`} checked={Number(item.applyBdiToLabor) !== 0}
                                onCheckedChange={(v) => updateItem.mutate({ id: item.id, applyBdiToLabor: v === true })} />
                              <Label htmlFor={`applyLab-${item.id}`} className="text-xs cursor-pointer">Aplicar BDI à Mão de Obra</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox id={`applyEnc-${item.id}`} checked={Number(item.aplicarEncargosSociais) !== 0}
                                onCheckedChange={(v) => updateItem.mutate({ id: item.id, aplicarEncargosSociais: v === true })} />
                              <Label htmlFor={`applyEnc-${item.id}`} className="text-xs cursor-pointer">Aplicar Encargos Sociais</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox id={`inclMat-${item.id}`} checked={Number(item.includeMaterial) !== 0}
                                onCheckedChange={(v) => updateItem.mutate({ id: item.id, includeMaterial: v === true })} />
                              <Label htmlFor={`inclMat-${item.id}`} className="text-xs cursor-pointer">Incluir Material no Orçamento</Label>
                            </div>
                          </div>
                          <div className="space-y-2 pt-1 border-t border-gray-100">
                            <div>
                              <Label className="text-xs font-semibold text-blue-700">Ajuste Material (%)</Label>
                              <p className="text-[11px] text-gray-500">Acréscimo (+) ou desconto (-) sobre o Material deste item</p>
                              <Input type="number" step="0.01" className="h-7 text-xs mt-1 border-blue-300 bg-blue-50 focus-visible:ring-blue-500"
                                defaultValue={item.materialAdjustment || 0}
                                onBlur={(e) => updateItem.mutate({ id: item.id, materialAdjustment: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div>
                              <Label className="text-xs font-semibold text-orange-700">Ajuste M.O. (%)</Label>
                              <p className="text-[11px] text-gray-500">Acréscimo (+) ou desconto (-) sobre a M.O. deste item</p>
                              <Input type="number" step="0.01" className="h-7 text-xs mt-1 border-orange-300 bg-orange-50 focus-visible:ring-orange-500"
                                defaultValue={item.laborAdjustment || 0}
                                onBlur={(e) => updateItem.mutate({ id: item.id, laborAdjustment: parseFloat(e.target.value) || 0 })} />
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    {isComposition && (
                      <Button size="sm" variant="ghost"
                        className={cn("h-6 w-6 p-0", isInputsExpanded ? "text-blue-600" : "text-gray-400")}
                        onClick={() => handleToggleInputs(item.id, isComposition)}
                        title="Editar insumos">
                        <List className="h-3 w-3" />
                      </Button>
                    )}
                    {isComposition && (
                      <Button size="sm" variant="ghost"
                        className="h-6 w-6 p-0 text-teal-500 hover:text-teal-700"
                        title="Sincronizar com orçamento principal"
                        disabled={syncItem.isPending}
                        onClick={() => syncItem.mutate({ additiveItemId: item.id, budgetId })}>
                        <RefreshCw className={cn("h-3 w-3", syncItem.isPending && "animate-spin")} />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400"
                      onClick={() => deleteItem.mutate({ id: item.id })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
              </div>
            </td>
          )}
        </tr>
          {inputsPanel}
        </>  
      );
    });
  };

  const renderStage = (stage: any, stageIndex: number, parentNum?: string) => {
    const stageNum = renderStageNumber(stageIndex, parentNum);
    const isExpanded = expandedStages.has(stage.id);
    const isEditingStage = editingStageId === stage.id;
    // stageTotalNoBdi respeita includeMaterial: exclui material se desabilitado
    const calcItemNoBdi = (i: any) => {
      const mat = (i.includeMaterial === 0 || i.includeMaterial === false) ? 0 : (i.materialCost || 0);
      const lab = (i.laborCost || 0) + (i.equipmentCost || 0) + (i.serviceCost || 0) + (i.otherCost || 0);
      return (mat + lab) * (i.quantity || 1);
    };
    const stageTotalNoBdi = (stage.items || []).reduce((sum: number, item: any) => sum + calcItemNoBdi(item), 0)
      + (stage.children || []).reduce((sum: number, child: any) => sum + (child.items || []).reduce((s: number, i: any) => s + calcItemNoBdi(i), 0), 0);
    const stageTotalWithBdi = (stage.items || []).reduce((sum: number, item: any) => sum + calcItemTotalWithBdi(item, bdiMultiplier, socialCharges), 0)
      + (stage.children || []).reduce((sum: number, child: any) => sum + (child.items || []).reduce((s: number, i: any) => s + calcItemTotalWithBdi(i, bdiMultiplier, socialCharges), 0), 0);
    const stageTotal = viewMode === "com-bdi" ? stageTotalWithBdi : stageTotalNoBdi;

    return (
      <div key={stage.id} className="mb-2">
        {/* Cabeçalho da etapa */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-md ${parentNum ? "bg-blue-50 border border-blue-100" : "bg-slate-100 border border-slate-200"}`}>
          <button onClick={() => toggleStage(stage.id)} className="text-gray-500 hover:text-gray-700">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <span className="text-xs font-semibold text-gray-500 w-8">{stageNum}</span>

          {isEditingStage ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                value={editingStageName}
                onChange={e => setEditingStageName(e.target.value)}
                className="h-6 text-xs"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter") updateStage.mutate({ id: stage.id, name: editingStageName });
                  if (e.key === "Escape") setEditingStageId(null);
                }}
              />
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => updateStage.mutate({ id: stage.id, name: editingStageName })}>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingStageId(null)}>
                <XCircle className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </div>
          ) : (
            <span className="flex-1 text-sm font-semibold text-gray-800">{stage.name}</span>
          )}

          <span className="text-xs font-semibold text-gray-600 ml-auto">{formatCurrency(stageTotal)}</span>

          {!isFrozen && !isEditingStage && (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400"
                onClick={() => { setEditingStageId(stage.id); setEditingStageName(stage.name); }}>
                <Pencil className="h-3 w-3" />
              </Button>
              {/* Botão + para adicionar sub-etapa ou item */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-blue-600 hover:bg-blue-50">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="end">
                  <div className="space-y-0.5">
                    <button
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 rounded flex items-center gap-2"
                      onClick={() => { setAddStageDialog({ open: true, parentId: stage.id }); }}
                    >
                      <Layers className="h-3.5 w-3.5 text-blue-500" /> Sub-etapa
                    </button>
                    <button
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 rounded flex items-center gap-2"
                      onClick={() => { setAddItemDialog({ open: true, stageId: stage.id }); setItemForm(prev => ({ ...prev, type: "composition" })); }}
                    >
                      <Search className="h-3.5 w-3.5 text-green-500" /> Composição
                    </button>
                    <button
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 rounded flex items-center gap-2"
                      onClick={() => { setAddItemDialog({ open: true, stageId: stage.id }); setItemForm(prev => ({ ...prev, type: "service" })); }}
                    >
                      <Settings className="h-3.5 w-3.5 text-orange-500" /> Serviço por preço
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400"
                onClick={() => deleteStage.mutate({ id: stage.id })}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Conteúdo expandido */}
        {isExpanded && (
          <div className="ml-4 mt-1">
            {/* Sub-etapas */}
            {(stage.children || []).map((child: any, childIdx: number) =>
              renderStage(child, childIdx, stageNum)
            )}

            {/* Itens da etapa */}
            {(stage.items || []).length > 0 && (
              <div className="mt-1 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400">
                      <th className="py-1 px-3 text-left w-16">Item</th>
                      <th className="py-1 px-3 text-left">Descrição</th>
                      <th className="py-1 px-3 text-center w-16">Qtde</th>
                      <th className="py-1 px-3 text-center w-12">UN</th>
                      <th className="py-1 px-3 text-right w-24">Material</th>
                      <th className="py-1 px-3 text-right w-24">M.O.</th>
                      <th className="py-1 px-3 text-right w-28">Total</th>
                      {!isFrozen && <th className="py-1 px-3 w-16"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {renderItems(stage.items, stageNum)}
                  </tbody>
                </table>
              </div>
            )}

            {/* Botão adicionar item inline (se não há sub-etapas) */}
            {!isFrozen && (stage.children || []).length === 0 && (
              <button
                className="mt-1 text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 px-3 py-1"
                onClick={() => { setAddItemDialog({ open: true, stageId: stage.id }); setItemForm(prev => ({ ...prev, type: "composition" })); }}
              >
                <Plus className="h-3 w-3" /> Adicionar composição
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return <div className="text-center py-6 text-gray-400 text-sm">Carregando...</div>;
  }

  return (
    <div className="space-y-2">
      {/* Botão adicionar etapa */}
      {!isFrozen && (
        <div className="flex justify-between mb-2">
          <Button
            size="sm" variant="outline" className="h-7 text-xs gap-1 text-teal-600 border-teal-300 hover:bg-teal-50"
            disabled={syncAll.isPending}
            onClick={() => syncAll.mutate({ additiveId, budgetId })}
            title="Atualiza os custos de todas as composições com os valores atuais do orçamento principal"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncAll.isPending && "animate-spin")} />
            {syncAll.isPending ? "Sincronizando..." : "Sincronizar com Orçamento"}
          </Button>
          <Button
            size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => setAddStageDialog({ open: true, parentId: null })}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar Etapa
          </Button>
        </div>
      )}

      {/* Lista de etapas */}
      {stages.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
          <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>Nenhuma etapa criada.</p>
          {!isFrozen && <p className="text-xs mt-1">Clique em "Adicionar Etapa" para começar.</p>}
        </div>
      ) : (
        <div>
          {stages.map((stage: any, idx: number) => renderStage(stage, idx))}
        </div>
      )}

      {/* Dialog: Adicionar etapa */}
      <Dialog open={addStageDialog.open} onOpenChange={(open) => !open && setAddStageDialog({ open: false, parentId: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{addStageDialog.parentId ? "Nova Sub-etapa" : "Nova Etapa"}</DialogTitle>
          </DialogHeader>
          <Input
            value={newStageName}
            onChange={e => setNewStageName(e.target.value)}
            placeholder="Nome da etapa..."
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter" && newStageName.trim()) {
                createStage.mutate({ additiveId, name: newStageName.trim(), parentStageId: addStageDialog.parentId ?? undefined });
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStageDialog({ open: false, parentId: null })}>Cancelar</Button>
            <Button
              onClick={() => createStage.mutate({ additiveId, name: newStageName.trim(), parentStageId: addStageDialog.parentId ?? undefined })}
              disabled={!newStageName.trim() || createStage.isPending}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Adicionar item */}
      <Dialog open={addItemDialog.open} onOpenChange={(open) => !open && setAddItemDialog({ open: false, stageId: null })}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>
              {itemForm.type === "composition" ? "Adicionar Composição" : "Serviço por Preço Informado"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Tipo */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={itemForm.type === "composition" ? "default" : "outline"}
                className="text-xs h-7"
                onClick={() => setItemForm(prev => ({ ...prev, type: "composition" }))}
              >
                Composição da Base
              </Button>
              <Button
                size="sm"
                variant={itemForm.type === "service" ? "default" : "outline"}
                className="text-xs h-7"
                onClick={() => setItemForm(prev => ({ ...prev, type: "service" }))}
              >
                Serviço por Preço
              </Button>
            </div>

            {/* Busca de composição */}
            {itemForm.type === "composition" && (
              <div>
                <label className="text-xs font-medium text-gray-600">Buscar Composição</label>
                <div className="relative mt-1">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      value={compSearch}
                      onChange={e => {
                        setCompSearch(e.target.value);
                        setShowCompResults(true);
                        if (!e.target.value) {
                          setSelectedCompId(null);
                          setItemForm(prev => ({ ...prev, compositionId: null, description: "", unit: "" }));
                        }
                      }}
                      onFocus={() => setShowCompResults(true)}
                      placeholder="Digite para buscar composição SINAPI..."
                      className="h-8 text-xs pl-7 pr-7"
                    />
                    {compSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setCompSearch("");
                          setShowCompResults(false);
                          setSelectedCompId(null);
                          setItemForm(prev => ({ ...prev, compositionId: null, description: "", unit: "" }));
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {/* Lista de resultados inline */}
                  {showCompResults && compSearch.length >= 2 && (
                    <div className="border border-gray-200 rounded-md mt-1 max-h-48 overflow-y-auto bg-white shadow-md">
                      {!compositionsData || compositionsData.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-400">Nenhuma composição encontrada.</div>
                      ) : (
                        compositionsData.slice(0, 20).map((comp: any) => (
                          <button
                            key={comp.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0 cursor-pointer"
                            onClick={() => handleSelectComposition(comp)}
                          >
                            <div className="text-xs font-medium text-blue-700">{comp.code}</div>
                            <div className="text-xs text-gray-700 leading-tight">{comp.description}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {comp.unit} | Material: {comp.materialCost ? `R$ ${Number(comp.materialCost).toFixed(2)}` : "—"} | M.O.: {comp.laborCost ? `R$ ${Number(comp.laborCost).toFixed(2)}` : "—"}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {/* Composição selecionada */}
                  {itemForm.compositionId && !showCompResults && (
                    <div className="mt-1 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="text-xs font-medium text-blue-800 leading-tight">{itemForm.description}</div>
                      <div className="text-xs text-blue-600 mt-0.5">Unidade: {itemForm.unit}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Campos manuais */}
            {itemForm.type === "service" && (
              <div>
                <label className="text-xs font-medium text-gray-600">Descrição</label>
                <Input
                  value={itemForm.description}
                  onChange={e => setItemForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrição do serviço..."
                  className="h-8 text-xs mt-1"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Unidade</label>
                <Input
                  value={itemForm.unit}
                  onChange={e => setItemForm(prev => ({ ...prev, unit: e.target.value }))}
                  placeholder="m², m³, un..."
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Quantidade</label>
                <Input
                  type="number"
                  value={itemForm.quantity}
                  onChange={e => setItemForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>

            {itemForm.type === "service" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Material (R$)</label>
                  <Input type="number" value={itemForm.materialCost} onChange={e => setItemForm(prev => ({ ...prev, materialCost: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Mão de Obra (R$)</label>
                  <Input type="number" value={itemForm.laborCost} onChange={e => setItemForm(prev => ({ ...prev, laborCost: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Equipamentos (R$)</label>
                  <Input type="number" value={itemForm.equipmentCost} onChange={e => setItemForm(prev => ({ ...prev, equipmentCost: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Outros (R$)</label>
                  <Input type="number" value={itemForm.otherCost} onChange={e => setItemForm(prev => ({ ...prev, otherCost: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs mt-1" />
                </div>
              </div>
            )}

            {/* Preview do valor */}
            {(itemForm.description || itemForm.compositionId) && (
              <div className="bg-gray-50 rounded-md p-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Valor unitário s/ BDI:</span>
                  <span className="font-semibold">{formatCurrency(itemForm.type === "service" ? (itemForm.materialCost + itemForm.laborCost + itemForm.equipmentCost + itemForm.otherCost) : itemForm.unitCost)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">Total ({itemForm.quantity} {itemForm.unit}):</span>
                  <span className="font-semibold text-blue-700">
                    {formatCurrency((itemForm.type === "service"
                      ? (itemForm.materialCost + itemForm.laborCost + itemForm.equipmentCost + itemForm.otherCost)
                      : itemForm.unitCost) * itemForm.quantity)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemDialog({ open: false, stageId: null })}>Cancelar</Button>
            <Button
              onClick={handleAddItem}
              disabled={!itemForm.description || !itemForm.unit || createItem.isPending}
            >
              {createItem.isPending ? "Adicionando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog: Editar item do aditivo */}
      <Dialog open={editItemDialog.open} onOpenChange={(open) => !open && setEditItemDialog({ open: false, item: null })}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editItemDialog.item?.type === 'service' ? 'Editar Serviço a Preço Informado' : 'Editar Composição'}
            </DialogTitle>
          </DialogHeader>
          {editItemDialog.item && (
            <div className="space-y-4 py-1">
              {/* Descrição */}
              <div>
                <Label className="text-xs font-medium text-gray-600">Descrição</Label>
                <Input
                  value={editItemForm.description}
                  onChange={e => setEditItemForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrição do item..."
                  className="h-8 text-xs mt-1"
                  readOnly={editItemDialog.item?.type === 'composition'}
                />
                {editItemDialog.item?.type === 'composition' && (
                  <p className="text-xs text-gray-400 mt-0.5">Composição da base — descrição não editável</p>
                )}
              </div>
              {/* Unidade e Quantidade */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-gray-600">Unidade</Label>
                  <Input
                    value={editItemForm.unit}
                    onChange={e => setEditItemForm(prev => ({ ...prev, unit: e.target.value }))}
                    placeholder="m², m³, H/DIA, un..."
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">Quantidade</Label>
                  <Input
                    type="number"
                    value={editItemForm.quantity}
                    onChange={e => setEditItemForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                    className="h-8 text-xs mt-1"
                    min={0}
                    step={0.01}
                  />
                </div>
              </div>
              {/* Custos */}
              <div>
                <Label className="text-xs font-medium text-gray-600 block mb-2">
                  Custos Unitários (R$)
                  {editItemDialog.item?.type === 'composition' && (
                    <span className="text-gray-400 font-normal ml-1">— editáveis para ajuste manual</span>
                  )}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Material</Label>
                    <Input
                      type="number"
                      value={editItemForm.materialCost}
                      onChange={e => setEditItemForm(prev => ({ ...prev, materialCost: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-xs mt-1"
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Mão de Obra</Label>
                    <Input
                      type="number"
                      value={editItemForm.laborCost}
                      onChange={e => setEditItemForm(prev => ({ ...prev, laborCost: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-xs mt-1"
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Equipamentos</Label>
                    <Input
                      type="number"
                      value={editItemForm.equipmentCost}
                      onChange={e => setEditItemForm(prev => ({ ...prev, equipmentCost: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-xs mt-1"
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Serviços</Label>
                    <Input
                      type="number"
                      value={editItemForm.serviceCost}
                      onChange={e => setEditItemForm(prev => ({ ...prev, serviceCost: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-xs mt-1"
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Outros</Label>
                    <Input
                      type="number"
                      value={editItemForm.otherCost}
                      onChange={e => setEditItemForm(prev => ({ ...prev, otherCost: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-xs mt-1"
                      min={0}
                      step={0.01}
                    />
                  </div>
                </div>
              </div>
              {/* Preview de totais */}
              <div className="bg-gray-50 rounded-md p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Valor unitário s/ BDI:</span>
                  <span className="font-semibold">
                    {formatCurrency(editItemForm.materialCost + editItemForm.laborCost + editItemForm.equipmentCost + editItemForm.serviceCost + editItemForm.otherCost)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total ({editItemForm.quantity} {editItemForm.unit}):</span>
                  <span className="font-semibold text-blue-700">
                    {formatCurrency((editItemForm.materialCost + editItemForm.laborCost + editItemForm.equipmentCost + editItemForm.serviceCost + editItemForm.otherCost) * editItemForm.quantity)}
                  </span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItemDialog({ open: false, item: null })}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!editItemDialog.item) return;
                updateItem.mutate({
                  id: editItemDialog.item.id,
                  description: editItemForm.description,
                  unit: editItemForm.unit,
                  quantity: editItemForm.quantity,
                  materialCost: editItemForm.materialCost,
                  laborCost: editItemForm.laborCost,
                  equipmentCost: editItemForm.equipmentCost,
                  serviceCost: editItemForm.serviceCost,
                  otherCost: editItemForm.otherCost,
                });
                setEditItemDialog({ open: false, item: null });
                toast.success("Item atualizado!");
              }}
              disabled={updateItem.isPending}
            >
              {updateItem.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
