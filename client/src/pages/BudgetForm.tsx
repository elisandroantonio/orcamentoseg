import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Plus, Search, Trash2, Save, Check, ChevronsUpDown, ChevronDown, ChevronRight, Pencil, FileDown, FileSpreadsheet, Presentation, EyeOff, Calculator, Layers, Settings, Lock, LockOpen, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

import HierarchicalBudgetView from "@/components/HierarchicalBudgetView";
import { AddServiceDialog } from "@/components/AddServiceDialog";
import { AddInputDialog } from "@/components/budgets/AddInputDialog";
import { BudgetSummaryHeader } from "@/components/budgets/BudgetSummaryHeader";
import { handleExportPDF, handleExportExcel } from "@/lib/export-handlers";
import { generateBDIExcel, generateBDIPDF } from "@/lib/bdi-export";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

import BudgetGantt from "@/pages/BudgetGantt";
import { AbcCurveChart } from "@/components/budget/AbcCurveChart";
import { BDICalculator } from "@/components/BDICalculator";
import { AditivosTab } from "@/components/AditivosTab";
import { BudgetFinanceiro } from "@/components/BudgetFinanceiro";
import { BudgetFinanceiroLancamentos } from "@/components/BudgetFinanceiroLancamentos";
import { BudgetCashFlow } from "@/components/BudgetCashFlow";

interface BudgetFormData {
  title: string;
  clientId: string;
  projectId: string;
  squareMeters: string;
  description: string;
  observations: string;
  workStatus: string;
  socialCharges: string;
  adminCentral: string;
  profit: string;
  taxes: string;
  risk: string;
  warranty: string;
}

interface BudgetItem {
  id?: number;
  compositionId: number;
  type?: "composition" | "input" | "service";
  composition: {
    code: string;
    description: string;
    unit: string;
    materialCost: string;
    laborCost: string;
    equipmentCost?: string;
  };
  description?: string;
  unit?: string;
  quantity: string;
  materialCost?: string;
  laborCost?: string;
  equipmentCost?: string;
  serviceCost?: string;
  otherCost?: string;
}

export default function BudgetForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const isEditing = !!id;
  const utils = trpc.useUtils();
  
  // Formatar valor em reais com padrão brasileiro
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  
  const saveTemporaryMutation = trpc.budgets.saveInputTemporary.useMutation();
  const savePermanentMutation = trpc.budgets.saveInputPermanent.useMutation();

  const [items, setItems] = useState<BudgetItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isClientSelectorOpen, setIsClientSelectorOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [compositionInputs, setCompositionInputs] = useState<Record<number, any[]>>({});
  const [editingInputId, setEditingInputId] = useState<number | null>(null);
  const [editingValues, setEditingValues] = useState<{coefficient: string, unitCost: string}>({coefficient: "", unitCost: ""});
  const [activeTab, setActiveTab] = useState("dados");
  

  const [isStageDialogOpen, setIsStageDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<any>(null);
  const [parentStageForNew, setParentStageForNew] = useState<number | null>(null);
  const [stageName, setStageName] = useState("");
  const [stageDescription, setStageDescription] = useState("");
  const [stageServiceUnit, setStageServiceUnit] = useState("");
  const [stageServiceQuantity, setStageServiceQuantity] = useState("");
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());
  const [localStages, setLocalStages] = useState<any[]>([]);
  const [nextLocalStageId, setNextLocalStageId] = useState(-1);
  const [isCompositionDialogOpen, setIsCompositionDialogOpen] = useState(false);
  const [selectedStageForComposition, setSelectedStageForComposition] = useState<number | null>(null);
  const [compositionSearchTerm, setCompositionSearchTerm] = useState("");
  const [selectedCompositionId, setSelectedCompositionId] = useState<number | null>(null);
  const [compositionQuantity, setCompositionQuantity] = useState("1");
  const [budgetId, setBudgetId] = useState<number | null>(isEditing ? Number(id) : null);

  // ---- Congelamento de Orçamento ----
  const [isFreezeDialogOpen, setIsFreezeDialogOpen] = useState(false);
  const [isUnfreezeDialogOpen, setIsUnfreezeDialogOpen] = useState(false);
  const { data: freezeStatus, refetch: refetchFreezeStatus } = trpc.budgetFreeze.getStatus.useQuery(
    { budgetId: budgetId || 0 },
    { enabled: !!budgetId }
  );
  const isFrozen = useMemo(() => !!freezeStatus?.frozen, [freezeStatus]);
  const frozenAt = useMemo(() => {
    if (!freezeStatus?.frozenAt) return null;
    const d = freezeStatus.frozenAt instanceof Date ? freezeStatus.frozenAt : new Date(String(freezeStatus.frozenAt));
    return d.toLocaleDateString('pt-BR');
  }, [freezeStatus]);
  const frozenBy = useMemo(() => freezeStatus?.frozenBy || null, [freezeStatus]);
  const freezeMutation = trpc.budgetFreeze.freeze.useMutation({
    onSuccess: (data) => {
      refetchFreezeStatus();
      toast.success(`Orçamento congelado! ${data.snapshotted} insumos registrados, ${data.skipped} já customizados preservados.`);
      setIsFreezeDialogOpen(false);
    },
    onError: () => toast.error('Erro ao congelar orçamento.'),
  });
  const unfreezeMutation = trpc.budgetFreeze.unfreeze.useMutation({
    onSuccess: () => {
      refetchFreezeStatus();
      toast.success('Orçamento descongelado. Valores da base global voltarão a ser usados para novos cálculos.');
      setIsUnfreezeDialogOpen(false);
    },
    onError: () => toast.error('Erro ao descongelar orçamento.'),
  });

  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [selectedStageForService, setSelectedStageForService] = useState<number | null>(null);
  const [editingServiceData, setEditingServiceData] = useState<any>(null);
  const [isInputDialogOpen, setIsInputDialogOpen] = useState(false);
  const [selectedStageForInput, setSelectedStageForInput] = useState<number | null>(null);
  const [includeMaterial, setIncludeMaterial] = useState(true);
  const [bdiParamsCollapsed, setBdiParamsCollapsed] = useState(true); // Recolhido por padrão
  const [bdiCardsCollapsed, setBdiCardsCollapsed] = useState(true); // Recolhido por padrão
  const [presentationMode, setPresentationMode] = useState(false); // Modo Apresentação
  const [bdiConfigs, setBdiConfigs] = useState<Record<number, { applyBdiToMaterial: boolean; applyBdiToLabor: boolean; additionalIncrement: number; discount?: number; aplicarEncargosSociais?: boolean; laborAdjustment?: number; materialAdjustment?: number }>>({});

  // Estado para controlar se a composição/insumo está sendo adicionado a um item composto
  const [selectedCompositeItemId, setSelectedCompositeItemId] = useState<number | null>(null);
  // Estado para o dialog de serviço a preço informado dentro de composto
  const [isServiceToCompositeDialogOpen, setIsServiceToCompositeDialogOpen] = useState(false);

  // Estados para o modal de Serviço Composto
  const [isCompositeServiceDialogOpen, setIsCompositeServiceDialogOpen] = useState(false);
  const [compositeServiceStageId, setCompositeServiceStageId] = useState<number | null>(null);
  const [compositeServiceName, setCompositeServiceName] = useState("");
  const [compositeServiceUnit, setCompositeServiceUnit] = useState("");
  const [compositeServiceQuantity, setCompositeServiceQuantity] = useState("");
  const [compositeServiceItems, setCompositeServiceItems] = useState<Array<{
    type: 'composition' | 'input';
    id: number;
    code: string;
    description: string;
    unit: string;
    quantity: number;
    materialCost: number;
    laborCost: number;
    totalCost: number;
  }>>([]);
  const [compositeSearchTerm, setCompositeSearchTerm] = useState("");
  const [compositeSearchType, setCompositeSearchType] = useState<'composition' | 'input'>('composition');
  const [isSavingComposite, setIsSavingComposite] = useState(false);

  // Estados para o dialog de edição do item composto
  const [isEditCompositeDialogOpen, setIsEditCompositeDialogOpen] = useState(false);
  const [editingCompositeItem, setEditingCompositeItem] = useState<{ id: number; description: string; unit: string; quantity: string } | null>(null);
  // Estados para o dialog de edição de filho de composto (serviço a preço informado)
  const [isEditCompositeChildDialogOpen, setIsEditCompositeChildDialogOpen] = useState(false);
  const [editingCompositeChild, setEditingCompositeChild] = useState<{ itemId: number; description: string; unit: string; quantity: number; materialCost: number; laborCost: number; equipmentCost: number; serviceCost: number; otherCost: number } | null>(null);
  
  const { data: budget } = trpc.budgets.get.useQuery(
    { id: Number(id) },
    { enabled: isEditing }
  );
  
  const { data: stagesData = [], refetch: refetchStages } = trpc.budgets.getStages.useQuery(
    { budgetId: budgetId || 0 },
    { enabled: !!budgetId }
  );
  
  const { data: bdiConfigsData = [] } = trpc.budgetItemBdiConfig.getByBudgetId.useQuery(
    { budgetId: budgetId || 0 },
    { enabled: !!budgetId }
  );
  
  // Recarregar etapas e total do orçamento após salvar ajuste de BDI
  const upsertBdiConfigMutation = trpc.budgetItemBdiConfig.upsert.useMutation({
    onSuccess: async () => {
      await refetchStages();
      if (budgetId) {
        await utils.budgets.get.invalidate({ id: budgetId });
      }
    },
  });
  
  // Debounce ref para salvar BDI configs no backend após 600ms sem digitação
  const bdiSaveTimerRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  
  // Handler centralizado para atualizar bdiConfigs: atualiza estado imediatamente + salva backend com debounce
  const handleUpdateBdiConfig = useCallback((itemId: number, config: { applyBdiToMaterial: boolean; applyBdiToLabor: boolean; additionalIncrement: number; discount?: number; aplicarEncargosSociais?: boolean; laborAdjustment?: number; materialAdjustment?: number }) => {
    // 1. Atualizar estado local imediatamente (re-renderiza tabela com novo preço)
    setBdiConfigs(prev => ({ ...prev, [itemId]: config }));
    // 2. Cancelar timer anterior para este item
    if (bdiSaveTimerRef.current[itemId]) {
      clearTimeout(bdiSaveTimerRef.current[itemId]);
    }
    // 3. Salvar no backend após 600ms sem novas alterações
    bdiSaveTimerRef.current[itemId] = setTimeout(() => {
      upsertBdiConfigMutation.mutate({
        budgetItemId: itemId,
        applyBdiToMaterial: config.applyBdiToMaterial,
        applyBdiToLabor: config.applyBdiToLabor,
        additionalIncrement: config.additionalIncrement,
        discount: config.discount || 0,
        aplicarEncargosSociais: config.aplicarEncargosSociais,
        laborAdjustment: config.laborAdjustment || 0,
        materialAdjustment: config.materialAdjustment || 0,
      });
    }, 600);
  }, [upsertBdiConfigMutation]);
  
    // Melhoria 17: Mutations de reordenação
  const moveItemUpMutation = trpc.budgetItemReorder.moveUp.useMutation({
    onSuccess: () => {
      refetchStages();
    },
  });
  const moveItemDownMutation = trpc.budgetItemReorder.moveDown.useMutation({
    onSuccess: () => {
      refetchStages();
    },
  });
  // Mutations de reordenação de etapas
  const moveStageUpMutation = trpc.budgets.reorderStage.useMutation({
    onSuccess: async () => {
      await utils.budgets.getStages.invalidate({ budgetId: budgetId || 0 });
      await refetchStages();
    },
    onError: (e) => { if (!e.message.includes('boundary')) toast.error('Erro ao mover etapa'); },
  });
  const moveStageDownMutation = trpc.budgets.reorderStage.useMutation({
    onSuccess: async () => {
      await utils.budgets.getStages.invalidate({ budgetId: budgetId || 0 });
      await refetchStages();
    },
    onError: (e) => { if (!e.message.includes('boundary')) toast.error('Erro ao mover etapa'); },
  });
  
  // Atualizar bdiConfigs quando os dados chegarem do backend
  // Usa merge (não sobrescreve) para preservar valores editados localmente que ainda não foram persistidos
  useEffect(() => {
    if (bdiConfigsData && bdiConfigsData.length > 0) {
      const configs: Record<number, { applyBdiToMaterial: boolean; applyBdiToLabor: boolean; additionalIncrement: number; discount?: number; aplicarEncargosSociais?: boolean; laborAdjustment?: number; materialAdjustment?: number }> = {};
      bdiConfigsData.forEach((config: any) => {
        configs[config.budgetItemId] = {
          applyBdiToMaterial: config.applyBdiToMaterial === 1,
          applyBdiToLabor: config.applyBdiToLabor === 1,
          additionalIncrement: parseFloat(config.additionalIncrement || "0"),
          discount: parseFloat(config.discount || "0"),
          aplicarEncargosSociais: config.aplicarEncargosSociais === 1,
          laborAdjustment: parseFloat(config.laborAdjustment || "0"),
          materialAdjustment: parseFloat(config.materialAdjustment || "0"),
        };
      });
      // Merge: preservar valores já editados localmente (que podem estar à frente do backend)
      setBdiConfigs(prev => ({ ...configs, ...prev }));
    }
  }, [bdiConfigsData]);

  // Extrair stages e items da resposta da API
  const stages = stagesData.map((s: any) => ({
    id: s.id,
    name: s.name,
    parentStageId: s.parentStageId,
    order: s.order,
    serviceUnit: s.serviceUnit || null,
    serviceQuantity: s.serviceQuantity || null,
  }));

  const allItems = stagesData.flatMap((s: any) => 
    (s.items || []).map((item: any) => {
      // Para serviços, usar dados do item diretamente
      if (item.type === 'service') {
        // Usar valores DIRETOS do banco
        const material = Number(item.materialCost || 0);
        const labor = Number(item.laborCost || 0);
        const equipment = Number(item.equipmentCost || 0);
        const service = Number(item.serviceCost || 0);
        const other = Number(item.otherCost || 0);
        
        // Manter valores separados para cálculos corretos de BDI
        const unitCost = material + labor + equipment + service + other;
        
        return {
          id: item.id,
          stageId: s.id,
          compositionId: null,
          type: "service" as const,
          description: item.description || "",
          code: "",
          unit: item.unit || "",
          quantity: item.quantity,
          materialCost: material.toFixed(2),
          laborCost: labor.toFixed(2),
          equipmentCost: equipment.toFixed(2),
          serviceCost: service.toFixed(2),
          otherCost: other.toFixed(2),
          unitCost: unitCost.toFixed(2),
          totalCost: (Number(item.quantity) * unitCost).toFixed(2)
        };
      }
      
      // Para insumos, usar dados do item diretamente
      if (item.type === 'input') {
        const material = Number(item.materialCost || 0);
        const labor = Number(item.laborCost || 0);
        const equipment = Number(item.equipmentCost || 0);
        const unitCost = material + labor + equipment;
        
        return {
          id: item.id,
          stageId: s.id,
          compositionId: null,
          type: "input" as const,
          description: item.description || "",
          code: "",
          unit: item.unit || "",
          quantity: item.quantity,
          materialCost: material.toFixed(2),
          laborCost: labor.toFixed(2),
          equipmentCost: equipment.toFixed(2),
          unitCost: unitCost.toFixed(2),
          totalCost: (Number(item.quantity) * unitCost).toFixed(2)
        };
      }
      
      // Para itens compostos (Serviço Composto)
      if (item.type === 'composite') {
        const compositeId = Number(item.id);
        return {
          id: compositeId,
          stageId: Number(s.id),
          compositionId: null,
          type: "composite" as const,
          description: item.description || "",
          code: "",
          unit: item.unit || "",
          quantity: item.quantity || "1",
          materialCost: "0",
          laborCost: "0",
          unitCost: "0",
          totalCost: "0",
          parentItemId: null,
          // Filhos do item composto
          children: (item.children || []).map((child: any) => ({
            id: Number(child.id),
            stageId: Number(s.id),
            compositionId: child.compositionId ? Number(child.compositionId) : null,
            type: child.type as "composition" | "input" | "service",
            description: child.type === 'composition' ? (child.composition?.description || child.description || "") : (child.description || ""),
            code: child.type === 'composition' ? (child.composition?.code || "") : "",
            unit: child.type === 'composition' ? (child.composition?.unit || "") : (child.unit || ""),
            quantity: child.quantity,
            materialCost: child.type === 'composition' ? (child.composition?.materialCost || "0") : (child.materialCost || "0"),
            laborCost: child.type === 'composition' ? (child.composition?.laborCost || "0") : (child.laborCost || "0"),
            equipmentCost: child.equipmentCost || "0",
            serviceCost: child.serviceCost || "0",
            otherCost: child.otherCost || "0",
            unitCost: child.unitCost || "0",
            totalCost: child.totalCost || "0",
            parentItemId: compositeId,
          }))
        };
      }
      
      // Para composições, priorizar valores do budgetItem (que refletem customizações salvas)
      // e usar composição base apenas como fallback quando o budgetItem não tem valores
      const budgetItemMat = Number(item.materialCost || 0);
      const budgetItemLab = Number(item.laborCost || 0);
      const budgetItemEquip = Number(item.equipmentCost || 0);
      const baseMat = Number(item.composition?.materialCost || 0);
      const baseLab = Number(item.composition?.laborCost || 0);
      const baseEquip = Number(item.composition?.equipmentCost || 0);
      // Usar valores do budgetItem se existirem (não-zero), caso contrário usar base
      const hasCustomValues = budgetItemMat > 0 || budgetItemLab > 0 || budgetItemEquip > 0;
      const effectiveMat = hasCustomValues ? budgetItemMat : baseMat;
      const effectiveLab = hasCustomValues ? budgetItemLab : baseLab;
      const effectiveEquip = hasCustomValues ? budgetItemEquip : baseEquip;
      return {
        id: item.id,
        stageId: s.id,
        compositionId: item.compositionId,
        type: "composition" as const,
        description: item.composition?.description || "",
        code: item.composition?.code || "",
        unit: item.composition?.unit || "",
        quantity: item.quantity,
        materialCost: effectiveMat.toFixed(2),
        laborCost: effectiveLab.toFixed(2),
        equipmentCost: effectiveEquip.toFixed(2),
        unitCost: (effectiveMat + effectiveLab + effectiveEquip).toFixed(2),
        totalCost: (Number(item.quantity) * (effectiveMat + effectiveLab + effectiveEquip)).toFixed(2),
        parentItemId: item.parentItemId ? Number(item.parentItemId) : null,
      };
    })
  );
  
  // Achatar itens compostos: adicionar o item composto + seus filhos
  const allItemsFlat = allItems.flatMap((item: any) => {
    if (item.type === 'composite') {
      return [item, ...(item.children || [])];
    }
    return [item];
  });
  
  const createStageMutation = trpc.budgets.createStage.useMutation();
  const updateStageMutation = trpc.budgets.updateStage.useMutation();
  const deleteStageMutation = trpc.budgets.deleteStage.useMutation();
  const addItemToStageMutation = trpc.budgets.addItemToStage.useMutation();
  const addServiceItemMutation = trpc.budgets.addServiceItem.useMutation();
  const updateServiceItemMutation = trpc.budgets.updateServiceItem.useMutation();
  const updateItemQuantityMutation = trpc.budgets.updateItemQuantity.useMutation();
  const updateInputPermanentMutation = trpc.inputs.updatePermanent.useMutation();
  const updateCompositionInputsMutation = trpc.compositions.updateCompositionInputs.useMutation();
  const addInputItemMutation = trpc.budgets.addInputItem.useMutation();
  const updateInputItemMutation = trpc.budgets.updateInputItem.useMutation();
  const deleteItemMutation = trpc.budgets.deleteItem.useMutation();
  const createCompositeItemMutation = trpc.budgets.createCompositeItem.useMutation();
  const addCompositionToCompositeMutation = trpc.budgets.addCompositionToComposite.useMutation();
  const addInputToCompositeMutation = trpc.budgets.addInputToComposite.useMutation();
  const addServiceToCompositeMutation = trpc.budgets.addServiceToComposite.useMutation();
  const updateCompositeItemMutation = trpc.budgets.updateCompositeItem.useMutation();
  const deleteCompositeItemMutation = trpc.budgets.deleteCompositeItem.useMutation();
  
  const { data: projects } = trpc.projects.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const { data: compositions } = trpc.compositions.list.useQuery(
    { search: searchTerm },
    { enabled: searchTerm.length >= 2 }
  );
  
  const { data: compositionsForDialog } = trpc.compositions.list.useQuery(
    { search: compositionSearchTerm },
    { enabled: compositionSearchTerm.length >= 2 }
  );

  // Queries para o modal de Serviço Composto
  const { data: compositeCompositionsData } = trpc.compositions.list.useQuery(
    { search: compositeSearchTerm },
    { enabled: compositeSearchType === 'composition' && compositeSearchTerm.length >= 2 }
  );
  const { data: compositeInputsData } = trpc.inputs.list.useQuery(
    undefined,
    { enabled: compositeSearchType === 'input' }
  );
  
  const { data: companySettings } = trpc.companySettings.get.useQuery();
  
  const { register, handleSubmit, reset, control, watch, setValue, formState: { errors } } = useForm<BudgetFormData>({
    defaultValues: {
      workStatus: "execucao",
      socialCharges: "120",
      adminCentral: "0",
      profit: "10",
      taxes: "25",
      risk: "5",
      warranty: "2",
    }
  });
  
  const socialCharges = Number(watch("socialCharges") || 0);
  const adminCentral = Number(watch("adminCentral") || 0);
  const profit = Number(watch("profit") || 0);
  const taxes = Number(watch("taxes") || 0);
  const risk = Number(watch("risk") || 0);
  const warranty = Number(watch("warranty") || 0);

  // Fórmula composta TCU/SINAPI: BDI = [(1+AC)(1+G)(1+R)] / (1-L-I) - 1
  // AC = Adm. Central, G = Garantia, R = Risco, L = Lucro, I = Impostos
  const calcBDIMultiplier = (additionalBdi = 0, discount = 0) => {
    const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
    const denominator = 1 - profit / 100 - taxes / 100;
    const baseBDI = denominator > 0 ? (numerator / denominator - 1) : 0;
    const adjustedBDI = baseBDI + additionalBdi / 100 - discount / 100;
    return 1 + adjustedBDI;
  };
  
  // Função para calcular totalCost (TOTAL GERAL COM BDI)
  const calculateTotalWithBDI = () => {
    if (!allItems || allItems.length === 0) return "0.00";
    
    let totalMaterialWithBDI = 0;
    let totalLaborWithBDI = 0;
    
    // Expandir compostos: substituir item composto pelos seus filhos
    const itemsExpanded = allItems.flatMap((item: any) => {
      if (item.type === 'composite') {
        return (item.children || []).map((child: any) => ({
          ...child,
          serviceCost: child.serviceCost || "0",
          otherCost: child.otherCost || "0",
        }));
      }
      return [item];
    });

    itemsExpanded.forEach((item: any) => {
      const qty = parseFloat(item.quantity || "0");
      const material = parseFloat(item.materialCost || "0");
      const labor = parseFloat(item.laborCost || "0");
      const equipment = parseFloat(item.equipmentCost || "0");
      const service = parseFloat(item.serviceCost || "0");
      const other = parseFloat(item.otherCost || "0");
      
      // Aplicar filtro de material (quando desabilitado, material = 0; equipamentos NÃO são afetados)
      const effectiveMaterial = includeMaterial ? material : 0;
      
      // Buscar configuração de BDI para este item
      const itemConfig = bdiConfigs[item.id!] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, aplicarEncargosSociais: true };
      
      // Encargos sociais APENAS em labor (Melhoria 16: considerar flag)
      const aplicarEncargos = itemConfig.aplicarEncargosSociais !== false; // default true
      const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
      
      // BDI composto TCU/SINAPI
      const bdiMultiplier = calcBDIMultiplier();
      
      // Aplicar BDI ao material apenas se configurado (usando effectiveMaterial que respeita includeMaterial)
      const materialWithBDI = itemConfig.applyBdiToMaterial ? effectiveMaterial * bdiMultiplier : effectiveMaterial;
      
      // Aplicar BDI à mão de obra apenas se configurado
      const laborWithBDI = itemConfig.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;
      
      // Equipment, service e other: aplicar BDI SEM encargos sociais
      const equipmentWithBDI = equipment * bdiMultiplier;
      const serviceWithBDI = service * bdiMultiplier;
      const otherWithBDI = other * bdiMultiplier;
      
      // Total de M.O. = labor com BDI + equipment/service/other com BDI
      let totalLaborItem = laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI;
      
      // Aplicar incremento adicional e desconto se configurado
      const additionalIncrement = itemConfig.additionalIncrement || 0;
      const discount = itemConfig.discount || 0;
      if (additionalIncrement > 0 || discount > 0) {
        const adjustmentMultiplier = 1 + (additionalIncrement - discount) / 100;
        totalLaborItem = totalLaborItem * adjustmentMultiplier;
      }
      
      // Somar ao total geral
      totalMaterialWithBDI += materialWithBDI * qty;
      totalLaborWithBDI += totalLaborItem * qty;
    });
    
    const totalWithBDI = totalMaterialWithBDI + totalLaborWithBDI;
    return totalWithBDI.toFixed(2);
  };

  // Função auxiliar para construir itens com BDI para exportação PDF/Excel
  // Trata Serviços Compostos corretamente: calcula total a partir dos filhos com BDI individual
  const buildItemsWithBDIForExport = (includeChildrenBDI: boolean = true) => {
    return allItems.map((item: any) => {
      if (item.type === 'composite') {
        // Para compostos: calcular materialCost e laborCost somando filhos com BDI de cada filho
        const children = (item.children || []).map((child: any) => {
          const childMaterial = Number(child.materialCost) || 0;
          const childLabor = Number(child.laborCost) || 0;
          const childEquipment = Number(child.equipmentCost) || 0;
          const childService = Number(child.serviceCost) || 0;
          const childOther = Number(child.otherCost) || 0;
          const childEffectiveMaterial = includeMaterial ? childMaterial : 0;

          const childConfig = bdiConfigs[child.id!] || { applyBdiToMaterial: true, applyBdiToLabor: true, aplicarEncargosSociais: true, additionalIncrement: 0, discount: 0, laborAdjustment: 0 };
          const childAplicarEncargos = childConfig.aplicarEncargosSociais !== false;
          const childLaborWithCharges = childLabor * (1 + (childAplicarEncargos ? socialCharges : 0) / 100);
          const childTotalLabor = childLaborWithCharges + childEquipment + childService + childOther;
          const childAdditionalBdi = Number(childConfig.additionalIncrement) || 0;
          const childDiscount = Number(childConfig.discount) || 0;
          const childLaborAdjPct = Number(childConfig.laborAdjustment) || 0;
          const childBdiMultiplier = calcBDIMultiplier(childAdditionalBdi, childDiscount);
          const childMatAdjPct = Number(childConfig.materialAdjustment) || 0;
          const childEffectiveMaterialAdj = childEffectiveMaterial * (1 + childMatAdjPct / 100);
          const childMaterialWithBDI = childConfig.applyBdiToMaterial ? (childEffectiveMaterialAdj * childBdiMultiplier) : childEffectiveMaterialAdj;
          const childLaborWithBDI = childConfig.applyBdiToLabor ? (childTotalLabor * childBdiMultiplier) : childTotalLabor;
          const childLaborFinal = childLaborWithBDI * (1 + childLaborAdjPct / 100);
          return {
            ...child,
            materialCost: childMaterialWithBDI.toFixed(2),
            laborCost: childLaborFinal.toFixed(2),
            equipmentCost: "0",
            serviceCost: "0",
            otherCost: "0",
          };
        });

        // Total do composto = soma dos filhos com BDI
        let compositeTotalMat = 0;
        let compositeTotalLab = 0;
        children.forEach((child: any) => {
          const childQty = Number(child.quantity) || 0;
          compositeTotalMat += (Number(child.materialCost) || 0) * childQty;
          compositeTotalLab += (Number(child.laborCost) || 0) * childQty;
        });
        const compositeQty = Number(item.quantity) || 1;
        const compositeUnitMat = compositeQty > 0 ? compositeTotalMat / compositeQty : 0;
        const compositeUnitLab = compositeQty > 0 ? compositeTotalLab / compositeQty : 0;

        return {
          ...item,
          materialCost: compositeUnitMat.toFixed(2),
          laborCost: compositeUnitLab.toFixed(2),
          equipmentCost: "0",
          serviceCost: "0",
          otherCost: "0",
          children,
        };
      }

      // Para itens normais: aplicar BDI conforme bdiConfigs
      const material = Number(item.materialCost) || 0;
      const labor = Number(item.laborCost) || 0;
      const equipment = Number(item.equipmentCost) || 0;
      const service = Number(item.serviceCost) || 0;
      const other = Number(item.otherCost) || 0;
      const effectiveMaterial = includeMaterial ? material : 0;

      const itemConfig = bdiConfigs[item.id!] || { applyBdiToMaterial: true, applyBdiToLabor: true, aplicarEncargosSociais: true, additionalIncrement: 0, discount: 0, laborAdjustment: 0 };
      const aplicarEncargos = itemConfig.aplicarEncargosSociais !== false;
      const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
      const totalLabor = laborWithCharges + equipment + service + other;
      const additionalBdi = Number(itemConfig.additionalIncrement) || 0;
      const discount = Number(itemConfig.discount) || 0;
      const laborAdjPct = Number(itemConfig.laborAdjustment) || 0;
      const bdiMultiplier = calcBDIMultiplier(additionalBdi, discount);
      const matAdjPctExport = Number(itemConfig.materialAdjustment) || 0;
      const effectiveMaterialAdjExport = effectiveMaterial * (1 + matAdjPctExport / 100);
      const materialWithBDI = itemConfig.applyBdiToMaterial ? (effectiveMaterialAdjExport * bdiMultiplier) : effectiveMaterialAdjExport;
      const laborWithBDI = itemConfig.applyBdiToLabor ? (totalLabor * bdiMultiplier) : totalLabor;
      const laborFinal = laborWithBDI * (1 + laborAdjPct / 100);
      return {
        ...item,
        materialCost: materialWithBDI.toFixed(2),
        laborCost: laborFinal.toFixed(2),
        equipmentCost: "0",
        serviceCost: "0",
        otherCost: "0",
      };
    });
  };

  // Função auxiliar para carregar insumos de todas as composições (normais e filhos de compostos) para o analítico
  const loadInputsForAnalytico = async (items: any[], withBDI: boolean = false) => {
    // 1. Composições normais
    const compositionItems = items.filter(item => item.type === 'composition' && item.compositionId);
    if (compositionItems.length > 0) {
      try {
        const compositions = await Promise.all(
          compositionItems.map(item => utils.compositions.get.fetch({ id: item.compositionId }))
        );
        compositionItems.forEach((item, idx) => {
          if (compositions[idx]?.inputs) {
            item.inputs = withBDI
              ? compositions[idx].inputs.map((input: any) => ({
                  ...input,
                  unitCost: applyBDIToInputUnitCost(input),
                }))
              : compositions[idx].inputs;
          }
        });
      } catch (error) {
        console.warn('Erro ao buscar insumos de composições:', error);
      }
    }
    // 2. Filhos de compostos (Serviços Compostos)
    const compositeItems = items.filter(item => item.type === 'composite');
    for (const composite of compositeItems) {
      if (composite.children && composite.children.length > 0) {
        try {
          const childCompositions = await Promise.all(
            composite.children
              .filter((child: any) => child.compositionId)
              .map((child: any) => utils.compositions.get.fetch({ id: child.compositionId }))
          );
          composite.children.forEach((child: any, idx: number) => {
            if (childCompositions[idx]?.inputs) {
              child.inputs = withBDI
                ? childCompositions[idx].inputs.map((input: any) => ({
                    ...input,
                    unitCost: applyBDIToInputUnitCost(input),
                  }))
                : childCompositions[idx].inputs;
            }
          });
        } catch (error) {
          console.warn('Erro ao buscar insumos dos filhos do composto:', error);
        }
      }
    }
  };

  // Função auxiliar para aplicar BDI ao custo unitário de um insumo
  const applyBDIToInputUnitCost = (input: any): string => {
    const unitCost = parseFloat(input.input?.unitCost || "0");
    const inputType = (input.input?.type || "").toLowerCase();
    if (inputType === 'labor') {
      return (unitCost * (1 + socialCharges / 100) * calcBDIMultiplier()).toFixed(2);
    }
    return (unitCost * calcBDIMultiplier()).toFixed(2);
  };

  // Mutation separada para salvamento automático (sem redirecionamento)
  const autoSaveMutation = trpc.budgets.update.useMutation({
    onSuccess: () => {
      // Salvamento automático silencioso - sem toast nem redirecionamento
    },
    onError: () => {
      // Ignorar erros de salvamento automático silencioso
    },
  });
  
  // Salvamento automático ao editar dados do projeto
  const formValues = watch();
  useEffect(() => {
    if (!isEditing || !budgetId) return;
    
    const timer = setTimeout(() => {
      const payload = {
        id: budgetId,
        clientId: formValues.clientId ? Number(formValues.clientId) : undefined,
        projectId: formValues.projectId ? Number(formValues.projectId) : undefined,
        title: formValues.title || "",
        status: "draft" as const,
        // Garantir que os parâmetros de BDI sejam sempre salvos com valores válidos
        socialCharges: formValues.socialCharges || "33.00",
        adminCentral: formValues.adminCentral || "5.00",
        profit: formValues.profit || "10.00",
        taxes: formValues.taxes || "15.20",
        risk: formValues.risk || "2.00",
        warranty: formValues.warranty || "0.00",
        squareMeters: formValues.squareMeters || "1.0",
        description: formValues.description || "",
        observations: formValues.observations || "",
        workStatus: (formValues.workStatus || "execucao") as any,
        totalCost: calculateTotalWithBDI(),
      };
      
      // Usar mutation separada para não redirecionar
      autoSaveMutation.mutate(payload);
    }, 1000); // Debounce de 1 segundo
    
    return () => clearTimeout(timer);
  }, [formValues.title, formValues.clientId, formValues.projectId, formValues.squareMeters, formValues.description, formValues.observations, formValues.workStatus, formValues.socialCharges, formValues.adminCentral, formValues.profit, formValues.taxes, formValues.risk, formValues.warranty, isEditing, budgetId]);
  
  useEffect(() => {
    if (budget) {
      reset({
        title: budget.title,
        clientId: budget.clientId?.toString() || "",
        projectId: budget.projectId?.toString() || "",
        squareMeters: budget.squareMeters?.toString() || "",
        description: budget.description || "",
        observations: (budget as any).observations || "",
        workStatus: (budget as any).workStatus || "execucao",
        // Carregar parâmetros de BDI — respeitar os valores salvos, inclusive 0
        // Só usar padrão se o campo for null/undefined (nunca foi salvo)
        socialCharges: budget.socialCharges != null ? budget.socialCharges : "29.95",
        adminCentral: (budget as any).adminCentral != null ? (budget as any).adminCentral : "5.00",
        profit: budget.profit != null ? budget.profit : "10.00",
        taxes: budget.taxes != null ? budget.taxes : "15.20",
        risk: budget.risk != null ? budget.risk : "0.00",
        warranty: budget.warranty != null ? budget.warranty : "0.00",
      });
      // Atualizar budgetId quando budget é carregado
      if (budget.id) {
        setBudgetId(budget.id);
      }
      // Carregar includeMaterial do banco (1 = true, 0 = false)
      if ((budget as any).includeMaterial !== undefined && (budget as any).includeMaterial !== null) {
        setIncludeMaterial(Number((budget as any).includeMaterial) !== 0);
      }
    }
  }, [budget, reset]);
  
  const createMutation = trpc.budgets.create.useMutation({
    onSuccess: (data) => {
      setBudgetId(data.id);
      toast.success("Orçamento salvo com sucesso!");
      // Não redirecionar - manter na página para continuar editando
    },
    onError: (error) => {
      toast.error("Erro ao criar orçamento: " + error.message);
    },
  });
  
  // Exportação movida para frontend (jsPDF + xlsx) - ver funções handleExportPDF e handleExportExcel
  
  const updateMutation = trpc.budgets.update.useMutation({
    onSuccess: () => {
      toast.success("Orçamento atualizado com sucesso!");
      // NÃO redirecionar - manter na mesma aba para continuar editando
    },
    onError: (error) => {
      toast.error("Erro ao atualizar orçamento: " + error.message);
    },
  });
  
  // Função para salvar parâmetros de BDI
  const handleBDISave = (bdiParams: { adminCentral: number; profit: number; taxes: number; risk: number; warranty: number; socialCharges: number }) => {
    if (!budgetId) {
      toast.error("Erro: Orçamento não carregado");
      return;
    }
    
    autoSaveMutation.mutate({
      id: budgetId,
      clientId: formValues.clientId ? Number(formValues.clientId) : undefined,
      projectId: formValues.projectId ? Number(formValues.projectId) : undefined,
      title: formValues.title || "",
      status: "draft" as const,
      socialCharges: bdiParams.socialCharges.toString(),
      adminCentral: bdiParams.adminCentral.toString(),
      profit: bdiParams.profit.toString(),
      taxes: bdiParams.taxes.toString(),
      risk: bdiParams.risk.toString(),
      warranty: bdiParams.warranty.toString(),
      includeMaterial: includeMaterial,
      squareMeters: formValues.squareMeters || "1.0",
      description: formValues.description || "",
      observations: formValues.observations || "",
      totalCost: calculateTotalWithBDI(),
    });
    
    setValue("socialCharges", bdiParams.socialCharges.toString());
    setValue("adminCentral", bdiParams.adminCentral.toString());
    setValue("profit", bdiParams.profit.toString());
    setValue("taxes", bdiParams.taxes.toString());
    setValue("risk", bdiParams.risk.toString());
    setValue("warranty", bdiParams.warranty.toString());
    
    toast.success("Parâmetros de BDI salvos com sucesso!");
  };
  
  const onSubmit = (data: BudgetFormData) => {
    const payload = {
      ...data,
      clientId: data.clientId ? Number(data.clientId) : undefined,
      projectId: data.projectId ? Number(data.projectId) : undefined,
      status: "draft" as const,
      // Garantir valores padrão para campos obrigatórios
      socialCharges: data.socialCharges || "120.00",
      adminCentral: data.adminCentral || "0.00",
      profit: data.profit || "10.00",
      taxes: data.taxes || "25.00",
      risk: data.risk || "5.00",
      warranty: data.warranty || "2.00",
      squareMeters: data.squareMeters || "1.0",
      description: data.description || "",
      observations: data.observations || "",
      workStatus: (data.workStatus || "execucao") as any,
      totalCost: calculateTotalWithBDI(),
    };
    
    if (isEditing) {
      updateMutation.mutate({ id: Number(id), ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };
  
  const addItem = (composition: NonNullable<typeof compositions>[number]) => {
    setItems([...items, {
      compositionId: composition.id,
      composition: {
        code: composition.code || "",
        description: composition.description,
        unit: composition.unit,
        materialCost: composition.materialCost || "0",
        laborCost: composition.laborCost || "0",
        equipmentCost: composition.equipmentCost || "0",
      },
      quantity: "1",
    }]);
    setIsSearchOpen(false);
    setSearchTerm("");
  };
  
  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };
  
  const updateQuantity = (index: number, quantity: string) => {
    setItems(items.map((item, i) => i === index ? { ...item, quantity } : item));
  };
  
  const toggleExpand = async (index: number) => {
    const item = items[index];
    const compositionId = item.compositionId;
    
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
        // Buscar insumos se ainda não foram carregados
        if (!compositionInputs[compositionId]) {
          loadCompositionInputs(compositionId);
        }
      }
      return newSet;
    });
  };
  
  const loadCompositionInputs = async (compositionId: number) => {
    try {
      const inputs = await utils.compositions.getInputsWithCustomValues.fetch({ compositionId });
      setCompositionInputs(prev => ({
        ...prev,
        [compositionId]: inputs,
      }));
    } catch (error) {
      toast.error("Erro ao carregar insumos da composição");
    }
  };
  
  const startEditing = (ci: any) => {
    setEditingInputId(ci.id);
    setEditingValues({
      coefficient: ci.coefficient,
      unitCost: ci.input?.unitCost || "0",
    });
  };
  
  const saveTemporary = async (ci: any, newCoefficient?: string, newUnitCost?: string) => {
    try {
      // Usar os novos valores passados como parâmetro ou os do estado
      const coefficient = newCoefficient !== undefined ? newCoefficient : editingValues.coefficient;
      const unitCost = newUnitCost !== undefined ? newUnitCost : editingValues.unitCost;
      
      // Encontrar o budgetItemId correspondente
      const budgetItem = items.find(item => item.compositionId === ci.compositionId);
      if (!budgetItem) {
        toast.error("Item do orçamento não encontrado");
        return;
      }
      
      await saveTemporaryMutation.mutateAsync({
        budgetItemId: budgetItem.id!,
        inputId: ci.inputId,
        coefficient: coefficient,
        unitCost: String(unitCost),
      });
      
      // Atualizar estado local dos insumos
      const updatedInputs = compositionInputs[ci.compositionId].map(input => 
        input.id === ci.id 
          ? { ...input, coefficient: Number(coefficient), input: { ...input.input, unitCost: Number(unitCost) } }
          : input
      );
      
      setCompositionInputs(prev => ({
        ...prev,
        [ci.compositionId]: updatedInputs,
      }));
      
      // RECALCULAR TOTAIS DA COMPOSIÇÃO
      let materialCost = 0;
      let laborCost = 0;
      
      updatedInputs.forEach(input => {
        const totalCost = input.coefficient * input.input.unitCost;
        const inputType = input.type.toLowerCase();
        if (inputType === 'material') {
          materialCost += totalCost;
        } else if (inputType === 'labor' || inputType === 'equipment') {
          laborCost += totalCost;
        }
      });
      
      // ATUALIZAR ITEM NA LISTA DE ITENS
      const calculatedUnitCost = materialCost + laborCost;
      const calculatedTotalCost = Number(budgetItem.quantity) * calculatedUnitCost;
      
      setItems(prevItems => prevItems.map(item => 
        item.id === budgetItem.id
          ? {
              ...item,
              materialCost: materialCost.toFixed(2),
              laborCost: laborCost.toFixed(2),
              unitCost: calculatedUnitCost.toFixed(2),
              totalCost: calculatedTotalCost.toFixed(2)
            }
          : item
      ));
      
      // Aguardar um pouco para garantir que o backend termine o recálculo
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Invalidar e refetch stages para atualizar totais das etapas e sub-etapas
      console.log('[DEBUG] Invalidando cache de getStages...');
      await utils.budgets.getStages.invalidate({ budgetId: budgetId || 0 });
      
      console.log('[DEBUG] Refetchando stages...');
      const result = await refetchStages();
      console.log('[DEBUG] Resultado do refetch:', result?.data?.length || 0, 'items');
      
      toast.success("Alteração salva temporariamente (só neste orçamento)");
      setEditingInputId(null);
    } catch (error) {
      toast.error("Erro ao salvar alteração temporária");
    }
  };
  
  const savePermanent = async (ci: any) => {
    try {
      await savePermanentMutation.mutateAsync({
        inputId: ci.inputId,
        compositionId: ci.compositionId,
        coefficient: editingValues.coefficient,
        unitCost: editingValues.unitCost,
      });
      
      // Atualizar estado local
      setCompositionInputs(prev => ({
        ...prev,
        [ci.compositionId]: prev[ci.compositionId].map(input => 
          input.id === ci.id 
            ? { ...input, coefficient: editingValues.coefficient, input: { ...input.input, unitCost: editingValues.unitCost } }
            : input
        ),
      }));
      
      toast.success("Alteração gravada permanentemente na base de dados");
      setEditingInputId(null);
    } catch (error) {
      toast.error("Erro ao gravar alteração permanente");
    }
  };
  
  // Função para garantir que o orçamento está salvo antes de adicionar itens
  const ensureBudgetSaved = async (): Promise<{ budgetId: number; stageIdMap: Record<number, number> } | null> => {
    if (budgetId) {
      return { budgetId, stageIdMap: {} };
    }
    
    // Orçamento ainda não foi salvo - criar agora
    const fv = formValues;
    if (!fv.title || !fv.title.trim()) {
      toast.error("Preencha o título do orçamento antes de adicionar composições");
      return null;
    }
    
    try {
      toast.loading("Salvando orçamento...", { id: "auto-save" });
      const created = await createMutation.mutateAsync({
        title: fv.title,
        clientId: fv.clientId ? Number(fv.clientId) : undefined,
        projectId: fv.projectId ? Number(fv.projectId) : undefined,
        status: "draft" as const,
        socialCharges: fv.socialCharges || "120.00",
        profit: fv.profit || "10.00",
        taxes: fv.taxes || "25.00",
        risk: fv.risk || "5.00",
        warranty: fv.warranty || "2.00",
        squareMeters: fv.squareMeters || "1.0",
        description: fv.description || "",
        observations: fv.observations || "",
        totalCost: "0",
      });
      
      const newBudgetId = created.id;
      setBudgetId(newBudgetId);

      // Migrar etapas locais para o banco, respeitando a hierarquia (etapa >
      // sub-etapa) na ordem em que foram criadas. Antes, essa migração
      // ordenava TODAS as etapas locais por um único campo `order` — mas
      // esse campo é reaproveitado por grupo (cada etapa raiz e cada
      // sub-etapa reinicia a contagem em 0 dentro do seu próprio pai), então
      // uma ordenação global por esse número misturava etapas de grupos
      // diferentes (ex: a 2ª sub-etapa de uma etapa raiz, com order=1,
      // "furava a fila" na frente de uma nova etapa raiz criada bem depois,
      // também com order=1 dentro do grupo de raízes). Isso fazia com que
      // uma etapa nova (ex: "Barrilhete") aparecesse fora de ordem — às
      // vezes até antes de etapas já lançadas — assim que o orçamento fosse
      // salvo pela primeira vez.
      //
      // Agora a lista é percorrida em pré-ordem: cada etapa raiz na ordem em
      // que foi criada, seguida imediatamente de suas próprias sub-etapas
      // (também na ordem de criação), antes de passar pra próxima raiz —
      // preservando exatamente a sequência em que você foi lançando tudo.
      const stageIdMap: Record<number, number> = {};
      const sortedLocalStages = (() => {
        const byParent = new Map<number | null, any[]>();
        for (const s of localStages) {
          const key = s.parentStageId ?? null;
          if (!byParent.has(key)) byParent.set(key, []);
          byParent.get(key)!.push(s);
        }
        for (const arr of Array.from(byParent.values())) {
          arr.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        }
        const result: any[] = [];
        const visited = new Set<number>();
        const walk = (parentId: number | null) => {
          for (const child of byParent.get(parentId) || []) {
            if (visited.has(child.id)) continue;
            visited.add(child.id);
            result.push(child);
            walk(child.id);
          }
        };
        walk(null);
        // Órfãs (parentStageId aponta pra algo fora da lista local) — inclui
        // no final em vez de descartar.
        for (const s of localStages) {
          if (!visited.has(s.id)) result.push(s);
        }
        return result;
      })();

      for (const ls of sortedLocalStages) {
        const realParentId = ls.parentStageId ? stageIdMap[ls.parentStageId] : undefined;
        const result = await createStageMutation.mutateAsync({
          budgetId: newBudgetId,
          parentStageId: realParentId,
          name: ls.name,
          description: ls.description || undefined,
        });
        stageIdMap[ls.id] = result.id;
      }
      
      // Limpar etapas locais pois agora estão no banco
      setLocalStages([]);
      await refetchStages();
      
      toast.dismiss("auto-save");
      toast.success("Orçamento salvo automaticamente!");
      
      return { budgetId: newBudgetId, stageIdMap };
    } catch (error) {
      toast.dismiss("auto-save");
      toast.error("Erro ao salvar orçamento automaticamente");
      console.error(error);
      return null;
    }
  };

  // Funções de gerenciamento de etapas
  const openStageDialog = (parentId: number | null = null, stage: any = null) => {
    setParentStageForNew(parentId);
    setEditingStage(stage);
    setStageName(stage?.name || "");
    setStageDescription(stage?.description || "");
    setStageServiceUnit(stage?.serviceUnit || "");
    setStageServiceQuantity(stage?.serviceQuantity ? String(stage.serviceQuantity) : "");
    setIsStageDialogOpen(true);
  };
  
  const closeStageDialog = () => {
    setIsStageDialogOpen(false);
    setEditingStage(null);
    setParentStageForNew(null);
    setStageName("");
    setStageDescription("");
    setStageServiceUnit("");
    setStageServiceQuantity("");
  };
  
  const handleSaveStage = async () => {
    if (!stageName.trim()) {
      toast.error("Nome da etapa é obrigatório");
      return;
    }
    
    // Criar etapa localmente se orçamento ainda não foi salvo
    if (!budgetId || isNaN(budgetId)) {
      // Criar etapa local (sem salvar no banco)
      const newStage = {
        id: nextLocalStageId,
        name: stageName,
        description: stageDescription || null,
        budgetId: 0,
        parentStageId: parentStageForNew,
        order: localStages.filter(s => s.parentStageId === parentStageForNew).length,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      setLocalStages([...localStages, newStage]);
      setNextLocalStageId(nextLocalStageId - 1);
      toast.success("Etapa criada!");
      closeStageDialog();
      return;
    }
    
    const parsedServiceQty = stageServiceQuantity ? parseFloat(stageServiceQuantity.replace(',', '.')) : undefined;
    const serviceUnitVal = stageServiceUnit.trim() || undefined;

    try {
      if (editingStage) {
        await updateStageMutation.mutateAsync({
          id: editingStage.id,
          name: stageName,
          description: stageDescription,
          serviceUnit: serviceUnitVal,
          serviceQuantity: parsedServiceQty ?? null,
        });
        toast.success("Etapa atualizada com sucesso");
      } else {
        await createStageMutation.mutateAsync({
          budgetId,
          parentStageId: parentStageForNew || undefined,
          name: stageName,
          description: stageDescription,
          serviceUnit: serviceUnitVal,
          serviceQuantity: parsedServiceQty,
        });
        toast.success("Etapa criada com sucesso");
      }
      refetchStages();
      closeStageDialog();
    } catch (error) {
      toast.error("Erro ao salvar etapa");
    }
  };
  
  const handleDeleteStage = async (stageId: number) => {
    if (!confirm("Tem certeza que deseja excluir esta etapa? Todas as sub-etapas também serão removidas.")) {
      return;
    }
    
    try {
      await deleteStageMutation.mutateAsync({ id: stageId });
      toast.success("Etapa excluída com sucesso");
      refetchStages();
    } catch (error) {
      toast.error("Erro ao excluir etapa");
    }
  };
  
  const toggleStageExpansion = (stageId: number) => {
    setExpandedStages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stageId)) {
        newSet.delete(stageId);
      } else {
        newSet.add(stageId);
      }
      return newSet;
    });
  };
  
  const buildStageTree = () => {
    const stageMap = new Map();
    const rootStages: any[] = [];
    
    stages.forEach(stage => {
      stageMap.set(stage.id, { ...stage, children: [] });
    });
    
    stages.forEach(stage => {
      const stageNode = stageMap.get(stage.id);
      if (stage.parentStageId) {
        const parent = stageMap.get(stage.parentStageId);
        if (parent) {
          parent.children.push(stageNode);
        }
      } else {
        rootStages.push(stageNode);
      }
    });
    
    return rootStages;
  };
  
  const renderStageTree = (stageNodes: any[], level = 0) => {
    return stageNodes.map(stage => (
      <div key={stage.id} style={{ marginLeft: `${level * 24}px` }} className="border-l-2 border-border pl-4 py-2">
        <div className="flex items-center justify-between group">
          <div className="flex items-center gap-2 flex-1">
            {stage.children.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => toggleStageExpansion(stage.id)}
              >
                {expandedStages.has(stage.id) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
            <div className="flex-1">
              <div className="font-medium">{stage.name}</div>
              {stage.description && (
                <div className="text-sm text-muted-foreground">{stage.description}</div>
              )}
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openStageDialog(stage.id)}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openStageDialog(null, stage)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteStage(stage.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {expandedStages.has(stage.id) && stage.children.length > 0 && (
          <div className="mt-2">
            {renderStageTree(stage.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };
  
  // Cálculos
  const calculateRealPrice = (item: BudgetItem) => {
    // Para serviços a preço informado, usar APENAS os campos do item
    const material = Number(item.materialCost) || 0;
    const labor = Number(item.laborCost) || 0;
    const equipment = Number(item.equipmentCost) || 0;
    const service = Number(item.serviceCost) || 0;
    const other = Number(item.otherCost) || 0;
    
    // Aplicar filtro de material (equipamentos NÃO são afetados pelo includeMaterial)
    const effectiveMaterial = includeMaterial ? material : 0;
    
    // Equipment, service e other vão para M.O. (SEM encargos, SEM BDI nesta aba)
    const totalLabor = labor + equipment + service + other;
    
    return {
      materialUnit: effectiveMaterial,
      laborUnit: totalLabor,
      totalUnit: effectiveMaterial + totalLabor,
      materialTotal: effectiveMaterial * Number(item.quantity),
      laborTotal: totalLabor * Number(item.quantity),
      total: (effectiveMaterial + totalLabor) * Number(item.quantity),
    };
  };
  
  const calculateBDIPrice = (item: BudgetItem) => {
    // Para serviços a preço informado, usar APENAS os campos do item
    const material = Number(item.materialCost) || 0;
    const labor = Number(item.laborCost) || 0;
    const equipment = Number(item.equipmentCost) || 0;
    const service = Number(item.serviceCost) || 0;
    const other = Number(item.otherCost) || 0;
    
    // Aplicar filtro de material (equipamentos NÃO são afetados pelo includeMaterial)
    const effectiveMaterial = includeMaterial ? material : 0;
    
    // Encargos sociais APENAS em labor, NÃO em equipment/service/other (Melhoria 16: considerar flag)
    const aplicarEncargos = true; // TODO: buscar do bdiConfigs se necessário
    const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
    
    // BDI composto TCU/SINAPI
    const bdiMultiplier = calcBDIMultiplier();
    const materialWithBDI = effectiveMaterial * bdiMultiplier;
    const laborWithBDI = laborWithCharges * bdiMultiplier;
    
    // Equipment, service e other: aplicar BDI SEM encargos sociais (NÃO afetados pelo includeMaterial)
    const equipmentWithBDI = equipment * bdiMultiplier;
    const serviceWithBDI = service * bdiMultiplier;
    const otherWithBDI = other * bdiMultiplier;
    
    // Total de M.O. = labor com BDI + equipment/service/other com BDI
    const totalLabor = laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI;
    
    return {
      materialUnit: materialWithBDI,
      laborUnit: totalLabor,
      totalUnit: materialWithBDI + totalLabor,
      materialTotal: materialWithBDI * Number(item.quantity),
      laborTotal: totalLabor * Number(item.quantity),
      total: (materialWithBDI + totalLabor) * Number(item.quantity),
    };
  };
  
  const realTotals = items.reduce((acc, item) => {
    const calc = calculateRealPrice(item);
    return {
      material: acc.material + calc.materialTotal,
      labor: acc.labor + calc.laborTotal,
      total: acc.total + calc.total,
    };
  }, { material: 0, labor: 0, total: 0 });
  
  const bdiTotals = items.reduce((acc, item) => {
    const calc = calculateBDIPrice(item);
    return {
      material: acc.material + calc.materialTotal,
      labor: acc.labor + calc.laborTotal,
      total: acc.total + calc.total,
    };
  }, { material: 0, labor: 0, total: 0 });
  
  const filteredCompositions = compositions || [];
  
  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* ---- BADGE DE ORÇAMENTO CONGELADO ---- */}
        {isFrozen && budgetId && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
            <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                Orçamento Congelado
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Valores fixados em {frozenAt}{frozenBy ? ` por ${frozenBy}` : ''}. Alterações na base global não afetam este orçamento.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
              onClick={() => setIsUnfreezeDialogOpen(true)}
            >
              <LockOpen className="h-4 w-4 mr-1" />
              Descongelar
            </Button>
          </div>
        )}

        {/* ---- MODAL CONFIRMAR CONGELAMENTO ---- */}
        <Dialog open={isFreezeDialogOpen} onOpenChange={setIsFreezeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-blue-600" />
                Congelar Orçamento
              </DialogTitle>
              <DialogDescription>
                Ao congelar, todos os valores de insumos e composições serão fixados neste orçamento.
                Atualizações futuras na base global de preços <strong>não irão afetar</strong> este orçamento.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-2">
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Esta ação pode ser desfeita a qualquer momento clicando em "Descongelar",
                  mas os valores customizados serão preservados.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsFreezeDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => budgetId && freezeMutation.mutate({ budgetId })}
                disabled={freezeMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Lock className="h-4 w-4 mr-2" />
                {freezeMutation.isPending ? 'Congelando...' : 'Confirmar Congelamento'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---- MODAL CONFIRMAR DESCONGELAMENTO ---- */}
        <Dialog open={isUnfreezeDialogOpen} onOpenChange={setIsUnfreezeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LockOpen className="h-5 w-5 text-orange-600" />
                Descongelar Orçamento
              </DialogTitle>
              <DialogDescription>
                Ao descongelar, novos cálculos poderão usar valores atualizados da base global.
                Os insumos já customizados individualmente serão preservados.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <div className="flex items-start gap-2 p-3 rounded-md bg-orange-50 border border-orange-200 dark:bg-orange-950/30 dark:border-orange-800">
                <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                <p className="text-sm text-orange-800 dark:text-orange-300">
                  Insumos que não foram customizados individualmente voltarão a usar os valores atuais da base global.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUnfreezeDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => budgetId && unfreezeMutation.mutate({ budgetId })}
                disabled={unfreezeMutation.isPending}
                variant="destructive"
              >
                <LockOpen className="h-4 w-4 mr-2" />
                {unfreezeMutation.isPending ? 'Descongelando...' : 'Confirmar Descongelamento'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
             <TabsList className="grid w-full grid-cols-9 gap-0">
              <TabsTrigger value="dados" className="px-2 py-2 text-xs sm:text-sm">Projeto</TabsTrigger>
              <TabsTrigger value="composicoes" className="px-2 py-2 text-xs sm:text-sm">Comp. Real</TabsTrigger>
              <TabsTrigger value="bdi" className="px-2 py-2 text-xs sm:text-sm">Comp. BDI</TabsTrigger>
              <TabsTrigger value="graficos" className="px-2 py-2 text-xs sm:text-sm">Gráf.</TabsTrigger>
              <TabsTrigger value="gantt" className="px-2 py-2 text-xs sm:text-sm">Gantt</TabsTrigger>
              <TabsTrigger value="aditivos" className="px-2 py-2 text-xs sm:text-sm">Aditivos</TabsTrigger>
              <TabsTrigger value="medicoes" className="px-2 py-2 text-xs sm:text-sm">Medições</TabsTrigger>
              <TabsTrigger value="financeiro" className="px-2 py-2 text-xs sm:text-sm">Finan.</TabsTrigger>
              <TabsTrigger value="fluxo-caixa" className="px-2 py-2 text-xs sm:text-sm">Fluxo</TabsTrigger>
            </TabsList>
            
            {/* ABA 1 - DADOS DO PROJETO */}
            <TabsContent value="dados" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Informações Básicas</CardTitle>
                      <CardDescription>Dados gerais do orçamento</CardDescription>
                    </div>
                    {budget && (budget as any).code && (
                      <div className="text-right">
                        <p className="text-sm font-medium text-muted-foreground">Código</p>
                        <p className="text-lg font-bold text-primary">{(budget as any).code}</p>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Título *</Label>
                      <Input 
                        id="title" 
                        {...register("title", { required: true })} 
                        placeholder="Ex: Orçamento Galpão Industrial" 
                      />
                      {errors.title && <p className="text-sm text-destructive">Campo obrigatório</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clientId">Cliente</Label>
                      <Controller
                        name="clientId"
                        control={control}
                        render={({ field }) => {
                          const selectedClient = clients?.find(client => client.id.toString() === field.value);
                          return (
                            <Popover open={isClientSelectorOpen} onOpenChange={setIsClientSelectorOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={isClientSelectorOpen}
                                  className="w-full justify-between"
                                >
                                  {selectedClient ? (
                                    <span className="flex items-center gap-2">
                                      <span className="font-semibold">{selectedClient.name}</span>
                                      {selectedClient.document && (
                                        <>
                                          <span className="text-muted-foreground">-</span>
                                          <span className="text-muted-foreground text-sm">{selectedClient.document}</span>
                                        </>
                                      )}
                                    </span>
                                  ) : (
                                    "Selecione um cliente..."
                                  )}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[400px] p-0">
                                <Command>
                                  <CommandInput placeholder="Buscar cliente..." />
                                  <CommandList>
                                    <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                                    <CommandGroup>
                                      {clients?.map((client) => (
                                        <CommandItem
                                          key={client.id}
                                          value={`${client.name} ${client.document || ""}`}
                                          onSelect={() => {
                                            field.onChange(client.id.toString());
                                            setIsClientSelectorOpen(false);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              field.value === client.id.toString() ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          <div>
                                            <div className="font-semibold">{client.name}</div>
                                            {client.document && (
                                              <div className="text-sm text-muted-foreground">{client.document}</div>
                                            )}
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          );
                        }}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="projectId">Projeto</Label>
                      <Controller
                        name="projectId"
                        control={control}
                        render={({ field }) => (
                          <select 
                            {...field} 
                            id="projectId"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="">Selecione um projeto...</option>
                            {projects?.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="squareMeters">Metragem Quadrada (m²)</Label>
                      <Input 
                        id="squareMeters" 
                        type="number" 
                        step="0.01"
                        {...register("squareMeters")} 
                        placeholder="Ex: 150.50" 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea 
                      id="description" 
                      {...register("description")} 
                      placeholder="Descrição do orçamento"
                      rows={4}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="workStatus">Status da Obra</Label>
                      <Controller
                        name="workStatus"
                        control={control}
                        render={({ field }) => (
                          <select
                            {...field}
                            id="workStatus"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="orcamento">Em Orçamento</option>
                            <option value="contrato">Em Contrato</option>
                            <option value="execucao">Em Execução</option>
                            <option value="finalizada">Obra Finalizada</option>
                            <option value="nao_fechada">Não Fechada</option>
                          </select>
                        )}
                      />
                      <p className="text-xs text-muted-foreground">Obras Em Contrato e Em Execução aparecem no Painel Financeiro</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="observations">Observações</Label>
                    <Textarea 
                      id="observations" 
                      {...register("observations")} 
                      placeholder="Notas importantes: prazo de entrega, condições de pagamento, validade da proposta, etc."
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground">Estas observações aparecerão no rodapé do PDF exportado</p>
                  </div>
                  
                  <div className="flex justify-between gap-2">
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setLocation("/orcamentos")}>
                        Cancelar
                      </Button>
                      {/* Botão Fechar Orçamento (só aparece quando já existe um orçamento salvo) */}
                      {budgetId && (
                        isFrozen ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="border-blue-300 text-blue-700 hover:bg-blue-100"
                            onClick={() => setIsUnfreezeDialogOpen(true)}
                          >
                            <LockOpen className="h-4 w-4 mr-2" />
                            Descongelar Orçamento
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => setIsFreezeDialogOpen(true)}
                          >
                            <Lock className="h-4 w-4 mr-2" />
                            Fechar Orçamento
                          </Button>
                        )
                      )}
                    </div>
                    <Button type="button" onClick={async () => {
                      const formData = watch();
                      if (!formData.title) {
                        toast.error("Por favor, preencha o título do orçamento");
                        return;
                      }
                      
                      // Salvar orçamento se ainda não foi salvo
                      if (!budgetId) {
                        const payload = {
                          ...formData,
                          clientId: formData.clientId ? Number(formData.clientId) : undefined,
                          projectId: formData.projectId ? Number(formData.projectId) : undefined,
                          squareMeters: formData.squareMeters || undefined,
                          description: formData.description || undefined,
                          status: "draft" as const,
                        };
                        createMutation.mutate(payload, {
                          onSuccess: () => {
                            setActiveTab("composicoes");
                          }
                        });
                      } else {
                        setActiveTab("composicoes");
                      }
                    }}>
                      Avançar para Composições
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* ABA 2 - COMPOSIÇÕES SEM BDI (PREÇO REAL) */}
            <TabsContent value="composicoes" className="space-y-6">
              {/* Dialogs escondidos - mantidos para funcionalidade */}
              <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                      <DialogTitle>Buscar Composi\u00e7\u00e3o</DialogTitle>
                      <DialogDescription>
                        Digite palavras-chave para buscar (ex: "alvenaria bloco")
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar composi\u00e7\u00e3o..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-96 overflow-y-auto border rounded-lg">
                        {filteredCompositions?.slice(0, 50).map((composition) => (
                          <div
                            key={composition.id}
                            className="p-3 border-b hover:bg-accent cursor-pointer transition-colors"
                            onClick={() => addItem(composition)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">
                                  {composition.code && <span className="text-primary">{composition.code} - </span>}
                                  {composition.description}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Unidade: {composition.unit}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {searchTerm.length < 2 && (
                          <div className="p-8 text-center text-muted-foreground">
                            Digite pelo menos 2 caracteres para buscar
                          </div>
                        )}
                        {searchTerm.length >= 2 && filteredCompositions?.length === 0 && (
                          <div className="p-8 text-center text-muted-foreground">
                            Nenhuma composi\u00e7\u00e3o encontrada
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
              </Dialog>
              
              <Card>
                <CardContent>
                  {/* Resumo do Orçamento */}
                  {budgetId && allItems.length > 0 && (() => {
                    // Calcular totais aplicando EXATAMENTE a mesma lógica da aba COM BDI
                    let totalMaterialWithBDI = 0;
                    let totalLaborWithBDI = 0;
                    let totalMaterialWithoutBDI = 0;
                    let totalLaborWithoutBDI = 0;
                    let totalEquipmentWithoutBDI = 0;
                    let totalServiceWithoutBDI = 0;
                    let totalOtherWithoutBDI = 0;
                    
                    // Melhoria 18: Acumuladores para detalhamento do BDI
                    let totalEncargosSociaisValue = 0;
                    let totalLucroValue = 0;
                    let totalImpostosValue = 0;
                    let totalRiscoValue = 0;
                    let totalGarantiaValue = 0;
                    
                    // Expandir compostos: substituir item composto pelos seus filhos
                    const itemsForCard = allItems.flatMap((item: any) => {
                      if (item.type === 'composite') {
                        return (item.children || []).map((child: any) => ({
                          ...child,
                          // Filhos de compostos não têm serviceCost/otherCost, garantir zero
                          serviceCost: child.serviceCost || "0",
                          otherCost: child.otherCost || "0",
                        }));
                      }
                      return [item];
                    });

                    itemsForCard.forEach((item: any) => {
                      const qty = parseFloat(item.quantity || "0");
                      const material = parseFloat(item.materialCost || "0");
                      const labor = parseFloat(item.laborCost || "0");
                      const equipment = parseFloat(item.equipmentCost || "0");
                      const service = parseFloat(item.serviceCost || "0");
                      const other = parseFloat(item.otherCost || "0");
                      
                      // Aplicar filtro de material (sempre incluir na aba Preço Real)
                      const effectiveMaterial = material;
                      
                      // Buscar configuração de BDI para este item
                      const itemConfig = bdiConfigs[item.id!] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0 };
                      
                      // Encargos sociais APENAS em labor (Melhoria 16: considerar flag)
                      const aplicarEncargos = itemConfig.aplicarEncargosSociais !== false;
                      const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
                      
                      // BDI composto TCU/SINAPI
                      const additionalIncrement = itemConfig.additionalIncrement || 0;
                      const discount = itemConfig.discount || 0;
                      const bdiMultiplier = calcBDIMultiplier(additionalIncrement, discount);
                      
                      // Aplicar BDI ao material apenas se configurado
                      // Aplicar materialAdjustment antes do BDI
                      const matAdjPctReal = itemConfig.materialAdjustment || 0;
                      const effectiveMaterialAdjReal = effectiveMaterial * (1 + matAdjPctReal / 100);
                      const materialWithBDI = itemConfig.applyBdiToMaterial ? effectiveMaterialAdjReal * bdiMultiplier : effectiveMaterialAdjReal;
                      
                      // Aplicar BDI à mão de obra apenas se configurado
                      const laborWithBDI = itemConfig.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;

                      // Equipment, service e other: aplicar BDI SEM encargos sociais
                      const equipmentWithBDI = equipment * bdiMultiplier;
                      const serviceWithBDI = service * bdiMultiplier;
                      const otherWithBDI = other * bdiMultiplier;

                      // Ajuste M.O. (%) por item — estava faltando aqui, por isso este
                      // card não batia com a tabela detalhada/barra de total (que já
                      // aplicavam esse ajuste). Mesma lógica usada nos outros pontos do
                      // arquivo que exportam/calculam o total com BDI.
                      const laborAdjPct = Number(itemConfig.laborAdjustment) || 0;

                      // Total de M.O. = labor com BDI + equipment/service/other com BDI
                      const totalLaborItem = (laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI) * (1 + laborAdjPct / 100);

                      // Somar ao total geral
                      totalMaterialWithBDI += materialWithBDI * qty;
                      totalLaborWithBDI += totalLaborItem * qty;
                      totalMaterialWithoutBDI += effectiveMaterial * qty;
                      totalLaborWithoutBDI += labor * qty;
                      totalEquipmentWithoutBDI += equipment * qty;
                      totalServiceWithoutBDI += service * qty;
                      totalOtherWithoutBDI += other * qty;
                      
                      // Melhoria 18: Calcular contribuição de cada componente do BDI
                      // 1. Encargos Sociais (apenas em labor)
                      if (aplicarEncargos) {
                        totalEncargosSociaisValue += (labor * (socialCharges / 100)) * qty;
                      }
                      
                      // 2-5. Lucro, Impostos, Risco, Garantia (sobre base com encargos)
                      const baseValue = (effectiveMaterial + laborWithCharges + equipment + service + other) * qty;
                      totalLucroValue += baseValue * (profit / 100);
                      totalImpostosValue += baseValue * (taxes / 100);
                      totalRiscoValue += baseValue * (risk / 100);
                      totalGarantiaValue += baseValue * (warranty / 100);
                    });
                    
                    const totalWithBDI = totalMaterialWithBDI + totalLaborWithBDI;
                    const totalWithoutBDI = totalMaterialWithoutBDI + totalLaborWithoutBDI + totalEquipmentWithoutBDI + totalServiceWithoutBDI + totalOtherWithoutBDI;
                    const bdiValue = totalWithBDI - totalWithoutBDI;
                    const bdiPercentage = totalWithoutBDI > 0 ? (bdiValue / totalWithoutBDI) * 100 : 0;
                    
                    // Calcular percentuais
                    const materialPercentage = totalWithoutBDI > 0 ? (totalMaterialWithoutBDI / totalWithoutBDI) * 100 : 0;
                    const laborPercentage = totalWithoutBDI > 0 ? (totalLaborWithoutBDI / totalWithoutBDI) * 100 : 0;
                    const equipmentPercentage = totalWithoutBDI > 0 ? (totalEquipmentWithoutBDI / totalWithoutBDI) * 100 : 0;
                    const servicePercentage = totalWithoutBDI > 0 ? (totalServiceWithoutBDI / totalWithoutBDI) * 100 : 0;
                    const otherPercentage = totalWithoutBDI > 0 ? (totalOtherWithoutBDI / totalWithoutBDI) * 100 : 0;
                    
                    return (
                      <BudgetSummaryHeader
                        totalWithoutBDI={totalWithoutBDI}
                        bdiValue={bdiValue}
                        bdiPercentage={bdiPercentage}
                        totalWithBDI={totalWithBDI}
                        materialPercentage={materialPercentage}
                        laborPercentage={laborPercentage}
                        equipmentPercentage={equipmentPercentage}
                        servicePercentage={servicePercentage}
                        otherPercentage={otherPercentage}
                        materialValue={totalMaterialWithoutBDI}
                        laborValue={totalLaborWithoutBDI}
                        equipmentValue={totalEquipmentWithoutBDI}
                        serviceValue={totalServiceWithoutBDI}
                        otherValue={totalOtherWithoutBDI}
                        materialWithBDI={totalMaterialWithBDI}
                        laborWithBDI={totalLaborWithBDI}
                        equipmentWithBDI={totalEquipmentWithoutBDI}
                        serviceWithBDI={totalServiceWithoutBDI}
                        otherWithBDI={totalOtherWithoutBDI}
                        squareMeters={Number(watch("squareMeters")) || undefined}
                        encargosSociaisValue={totalEncargosSociaisValue}
                        lucroValue={totalLucroValue}
                        impostosValue={totalImpostosValue}
                        riscoValue={totalRiscoValue}
                        garantiaValue={totalGarantiaValue}
                      />
                    );
                  })()}
                  
                  {/* Bot\u00e3o Adicionar Etapa */}
                  <div className="mb-4">
                    <Dialog open={isStageDialogOpen} onOpenChange={setIsStageDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline">
                          <Plus className="h-4 w-4 mr-2" />
                          Adicionar Etapa
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{editingStage ? "Editar Etapa" : "Nova Etapa"}</DialogTitle>
                          <DialogDescription>
                            {editingStage
                              ? "Edite as informações da etapa"
                              : parentStageForNew
                                ? "Crie uma sub-etapa dentro da etapa selecionada"
                                : "Crie uma etapa para organizar as composições (ex: \"Serviços Iniciais\", \"Fundações\")"}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="stage-name">Nome da Etapa *</Label>
                            <Input
                              id="stage-name"
                              value={stageName}
                              onChange={(e) => setStageName(e.target.value)}
                              placeholder="Ex: Serviços Iniciais"
                            />
                          </div>

                          {/* Campos opcionais para custo por unidade de serviço */}
                          <div className="rounded-lg border border-dashed border-muted-foreground/40 p-3 space-y-3">
                            <div className="flex items-center gap-2">
                              <Calculator className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium text-muted-foreground">Custo por Unidade de Serviço (opcional)</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Preencha para calcular o custo unitário por unidade de contratação. Ex: R$/m³ de estrutura de concreto armado.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="stage-service-unit" className="text-xs">Unidade de referência</Label>
                                <select
                                  id="stage-service-unit"
                                  value={stageServiceUnit}
                                  onChange={(e) => setStageServiceUnit(e.target.value)}
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                  <option value="">-- Selecione --</option>
                                  <option value="m²">m² (metro quadrado)</option>
                                  <option value="m³">m³ (metro cúbico)</option>
                                  <option value="m">m (metro linear)</option>
                                  <option value="kg">kg (quilograma)</option>
                                  <option value="t">t (tonelada)</option>
                                  <option value="un">un (unidade)</option>
                                  <option value="vb">vb (verba)</option>
                                  <option value="cj">cj (conjunto)</option>
                                  <option value="hr">hr (hora)</option>
                                </select>
                              </div>
                              <div>
                                <Label htmlFor="stage-service-qty" className="text-xs">Quantidade total</Label>
                                <Input
                                  id="stage-service-qty"
                                  type="text"
                                  inputMode="decimal"
                                  value={stageServiceQuantity}
                                  onChange={(e) => setStageServiceQuantity(e.target.value)}
                                  placeholder="Ex: 120,00"
                                  className="h-9 text-sm"
                                />
                              </div>
                            </div>
                            {stageServiceUnit && stageServiceQuantity && (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                ✓ O sistema calculará automaticamente o custo por {stageServiceUnit}
                              </p>
                            )}
                          </div>

                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={closeStageDialog}>
                              Cancelar
                            </Button>
                            <Button type="button" onClick={handleSaveStage}>
                              {editingStage ? "Salvar Alterações" : "Criar Etapa"}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  
                  <HierarchicalBudgetView
                    stages={[...localStages, ...stages]}
                    items={allItemsFlat}
                    includeMaterial={includeMaterial}
                    onAddSubStage={(parentStageId) => {
                      openStageDialog(parentStageId);
                    }}
                    onAddComposition={(stageId) => {
                      setSelectedStageForComposition(stageId);
                      setIsCompositionDialogOpen(true);
                    }}
                    onAddInput={(stageId) => {
                      setSelectedStageForInput(stageId);
                      setIsInputDialogOpen(true);
                    }}
                    onAddService={(stageId) => {
                      setSelectedStageForService(stageId);
                      setIsServiceDialogOpen(true);
                    }}
                    onCreateCompositeItem={async (stageId, description, unit, quantity) => {
                      if (!budgetId) return;
                      try {
                        await createCompositeItemMutation.mutateAsync({
                          stageId,
                          budgetId,
                          description,
                          unit,
                          quantity,
                        });
                        await refetchStages();
                        toast.success(`Serviço composto "${description}" criado! Agora use o ⚙️ para adicionar composições e insumos.`);
                      } catch (error) {
                        console.error("Erro ao criar serviço composto:", error);
                        toast.error("Erro ao criar serviço composto");
                      }
                    }}
                    onMoveStageUp={(stageId) => {
                      if (budgetId) moveStageUpMutation.mutate({ budgetId, stageId, direction: 'up' });
                    }}
                    onMoveStageDown={(stageId) => {
                      if (budgetId) moveStageDownMutation.mutate({ budgetId, stageId, direction: 'down' });
                    }}
                    onEditStage={(stage) => {
                      setEditingStage(stage);
                      setStageName(stage.name);
                      setStageDescription("");
                      setStageServiceUnit((stage as any).serviceUnit || "");
                      setStageServiceQuantity((stage as any).serviceQuantity ? String((stage as any).serviceQuantity) : "");
                      setIsStageDialogOpen(true);
                    }}
                    onDeleteStage={handleDeleteStage}
                    onDeleteItem={async (itemId) => {
                      if (!budgetId) return;
                      if (!confirm("Tem certeza que deseja excluir este item?")) return;
                      
                      try {
                        await deleteItemMutation.mutateAsync({
                          id: itemId
                        });
                        toast.success("Item excluído com sucesso");
                        refetchStages();
                      } catch (error) {
                        toast.error("Erro ao excluir item");
                      }
                    }}
                    onEditItem={(item) => {
                      if (item.type === "service") {
                        // Extrair valores dos custos consolidados
                        const materialCost = parseFloat(item.materialCost || "0");
                        const laborCost = parseFloat(item.laborCost || "0");
                        const equipmentCost = parseFloat(item.equipmentCost || "0");
                        const serviceCost = parseFloat(item.serviceCost || "0");
                        const otherCost = parseFloat(item.otherCost || "0");
                        
                        setEditingServiceData({
                          itemId: item.id,
                          description: item.description,
                          unit: item.unit,
                          quantity: parseFloat(item.quantity || "1"),
                          materialCost,
                          laborCost,
                          equipmentCost,
                          serviceCost,
                          otherCost,
                        });
                        setIsServiceDialogOpen(true);
                      } else if (item.type === "input") {
                        // Editar insumo
                        const materialCost = parseFloat(item.materialCost || "0");
                        const laborCost = parseFloat(item.laborCost || "0");
                        const equipmentCost = parseFloat(item.equipmentCost || "0");
                        
                        setEditingServiceData({
                          itemId: item.id,
                          description: item.description,
                          unit: item.unit,
                          quantity: parseFloat(item.quantity || "1"),
                          materialCost,
                          laborCost,
                          equipmentCost,
                          serviceCost: 0,
                          otherCost: 0,
                        });
                        setIsServiceDialogOpen(true);
                      }
                    }}
                    onUpdateItemQuantity={async (itemId, quantity) => {
                      try {
                        await updateItemQuantityMutation.mutateAsync({
                          id: itemId,
                          quantity: quantity.toFixed(2),
                        });
                        await refetchStages();
                        toast.success("Quantidade atualizada com sucesso!");
                      } catch (error) {
                        console.error("Erro ao atualizar quantidade:", error);
                        toast.error("Erro ao atualizar quantidade");
                      }
                    }}
                    onLoadCompositionInputs={async (compositionId, budgetItemId) => {
                      // Invalidar cache para garantir dados frescos do banco
                      await utils.compositions.getInputsWithCustomValues.invalidate({ compositionId, budgetItemId });
                      const inputs = await utils.compositions.getInputsWithCustomValues.fetch({ 
                        compositionId,
                        budgetItemId 
                      });
                      return inputs.map((input: any) => ({
                        id: input.inputId,
                        code: input.input.code,
                        description: input.input.description,
                        type: input.input.type,
                        unit: input.input.unit,
                        coefficient: parseFloat(input.coefficient),
                        // Priorizar valor customizado (budget_item_inputs.unitCost) sobre valor da base (input.input.unitCost)
                        unitCost: parseFloat(input.unitCost ?? input.input.unitCost),
                        isCustom: input.isCustom ?? false,
                      }));
                    }}
                    onUpdateCompositionCosts={async (itemId, materialCost, laborCost, equipmentCost) => {
                      try {
                        // Buscar quantidade do item em allItems (que contém todos os itens carregados)
                        const currentItem = allItems.find(i => i.id === itemId);
                        const currentQuantity = currentItem?.quantity || "1";
                        
                        // Atualizar os valores da composição no backend preservando a quantidade
                        await updateItemQuantityMutation.mutateAsync({
                          id: itemId,
                          quantity: currentQuantity.toString(),
                          materialCost: materialCost.toFixed(2),
                          laborCost: laborCost.toFixed(2),
                          equipmentCost: (equipmentCost ?? 0).toFixed(2),
                        });
                        await refetchStages();
                        toast.success("Valores da composição atualizados!");
                      } catch (error) {
                        console.error("Erro ao atualizar valores da composição:", error);
                        toast.error("Erro ao atualizar valores");
                      }
                    }}
                    onSaveInputToBase={async (inputId, unitCost, compositionId, coefficient) => {
                      try {
                        await updateInputPermanentMutation.mutateAsync({
                          inputId,
                          compositionId: compositionId ?? 0,
                          unitCost: unitCost.toFixed(2),
                          coefficient: coefficient !== undefined ? coefficient.toString() : undefined,
                        });
                        // Recarregar o orçamento para refletir as mudanças
                        await refetchStages();
                        toast.success("Insumo atualizado na base! Coeficiente e custo unitário salvos permanentemente.");
                      } catch (error) {
                        console.error("Erro ao salvar insumo na base:", error);
                        toast.error("Erro ao salvar insumo na base");
                      }
                    }}
                    onUpdateCompositionToBase={async (compositionId, budgetItemId, inputs) => {
                      try {
                        await updateCompositionInputsMutation.mutateAsync({
                          compositionId,
                          budgetItemId: budgetItemId ?? undefined,
                          inputs,
                        });
                        // Recarregar o orçamento para refletir as mudanças
                        await refetchStages();
                        toast.success("Composição atualizada na base! Todos os coeficientes e valores unitários foram salvos permanentemente.");
                      } catch (error) {
                        console.error("Erro ao atualizar composição na base:", error);
                        toast.error("Erro ao atualizar composição na base");
                      }
                    }}
                    onSaveCompositionForBudget={async (compositionId: number, budgetItemId: number, inputs: any[]) => {
                      try {
                        // Salvar cada insumo customizado no backend
                        // CompositionInput usa campo 'id' (não 'inputId')
                        for (const input of inputs) {
                          await saveTemporaryMutation.mutateAsync({
                            budgetItemId,
                            inputId: input.id ?? input.inputId,
                            coefficient: input.coefficient.toString(),
                            unitCost: input.unitCost.toString(),
                          });
                        }
                        
                        // Recarregar dados do servidor (já recalculados)
                        await refetchStages();
                        
                        toast.success("Composição atualizada neste orçamento! Totais e aba Com BDI atualizados.");
                      } catch (error) {
                        console.error("Erro ao salvar composição:", error);
                        toast.error("Erro ao salvar");
                      }
                    }}
                    onMoveItemUp={async (itemId) => {
                      try {
                        await moveItemUpMutation.mutateAsync({ itemId });
                        await refetchStages();
                        toast.success("Item movido para cima!");
                      } catch (error) {
                        console.error("Erro ao mover item:", error);
                        toast.error("Erro ao mover item");
                      }
                    }}
                    onMoveItemDown={async (itemId) => {
                      try {
                        await moveItemDownMutation.mutateAsync({ itemId });
                        await refetchStages();
                        toast.success("Item movido para baixo!");
                      } catch (error) {
                        console.error("Erro ao mover item:", error);
                        toast.error("Erro ao mover item");
                      }
                    }}
                    onAddCompositionToComposite={async (compositeItemId) => {
                      setSelectedCompositeItemId(compositeItemId);
                      setIsCompositionDialogOpen(true);
                    }}
                    onAddInputToComposite={async (compositeItemId) => {
                      setSelectedCompositeItemId(compositeItemId);
                      setIsInputDialogOpen(true);
                    }}
                    onAddServiceToComposite={(compositeItemId) => {
                      setSelectedCompositeItemId(compositeItemId);
                      setIsServiceToCompositeDialogOpen(true);
                    }}
                    onEditCompositeChild={(item) => {
                      setEditingCompositeChild({
                        itemId: item.id,
                        description: item.description,
                        unit: item.unit,
                        quantity: parseFloat(item.quantity) || 1,
                        materialCost: parseFloat(item.materialCost) || 0,
                        laborCost: parseFloat(item.laborCost) || 0,
                        equipmentCost: parseFloat(item.equipmentCost ?? '0') || 0,
                        serviceCost: parseFloat(item.serviceCost ?? '0') || 0,
                        otherCost: parseFloat(item.otherCost ?? '0') || 0,
                      });
                      setIsEditCompositeChildDialogOpen(true);
                    }}
                    onEditCompositeItem={(item) => {
                      setEditingCompositeItem({
                        id: Number(item.id),
                        description: item.description,
                        unit: item.unit,
                        quantity: String(item.quantity ?? 1),
                      });
                      setIsEditCompositeDialogOpen(true);
                    }}
                    onDeleteCompositeItem={async (itemId) => {
                      if (!confirm("Tem certeza que deseja excluir este serviço composto e todos os seus itens?")) return;
                      try {
                        await deleteCompositeItemMutation.mutateAsync({ itemId, budgetId: budgetId! });
                        toast.success("Serviço composto excluído com sucesso");
                        refetchStages();
                      } catch (error) {
                        toast.error("Erro ao excluir serviço composto");
                      }
                    }}
                    bdiConfigs={bdiConfigs}
                    onUpdateBdiConfig={(itemId, config) => {
                      setBdiConfigs(prev => ({ ...prev, [itemId]: config }));
                      upsertBdiConfigMutation.mutate({
                        budgetItemId: itemId,
                        applyBdiToMaterial: config.applyBdiToMaterial,
                        applyBdiToLabor: config.applyBdiToLabor,
                        additionalIncrement: config.additionalIncrement,
                        discount: config.discount || 0,
                        aplicarEncargosSociais: config.aplicarEncargosSociais,
                        laborAdjustment: config.laborAdjustment || 0,
                      });
                    }}
                  />
                  
                  {false && items.length > 0 && (
                    <div className="space-y-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12"></TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="text-right">Qtde</TableHead>
                            <TableHead>Un.</TableHead>
                            <TableHead className="text-right">Material Unit.</TableHead>
                            <TableHead className="text-right">MO Unit.</TableHead>
                            <TableHead className="text-right">Total Unit.</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item, index) => {
                            const calc = calculateRealPrice(item);
                            return (
                              <>
                              <TableRow key={index}>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleExpand(index)}
                                  >
                                    {expandedItems.has(index) ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{item.composition.code}</TableCell>
                                <TableCell>{item.composition.description}</TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={item.quantity}
                                    onChange={(e) => updateQuantity(index, e.target.value)}
                                    className="w-20 text-right"
                                  />
                                </TableCell>
                                <TableCell>{item.composition.unit}</TableCell>
                                <TableCell className="text-right">R$ {calc.materialUnit.toFixed(2)}</TableCell>
                                <TableCell className="text-right">R$ {calc.laborUnit.toFixed(2)}</TableCell>
                                <TableCell className="text-right font-semibold">R$ {calc.totalUnit.toFixed(2)}</TableCell>
                                <TableCell className="text-right font-bold">R$ {calc.total.toFixed(2)}</TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeItem(index)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {expandedItems.has(index) && (
                                <TableRow className="bg-muted/50">
                                  <TableCell colSpan={10} className="p-0">
                                    <div className="py-4 px-2 overflow-x-auto">
                                      <h4 className="font-semibold mb-3 text-sm">Insumos da Composição</h4>
                                      {compositionInputs[item.compositionId] ? (
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="w-[150px]">Código</TableHead>
                                              <TableHead className="w-full">Descrição</TableHead>
                                              <TableHead className="w-[120px]">Tipo</TableHead>
                                              <TableHead className="w-[80px]">Un.</TableHead>
                                              <TableHead className="text-right w-[120px]">Coeficiente</TableHead>
                                              <TableHead className="text-right w-[120px]">Custo Unit.</TableHead>
                                              <TableHead className="text-right w-[120px]">Custo Total</TableHead>
                                              <TableHead className="w-[120px]">Ações</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {compositionInputs[item.compositionId].map((ci: any) => {
                                              const isEditing = editingInputId === ci.id;
                                              const coefficient = isEditing ? editingValues.coefficient : ci.coefficient;
                                              const unitCost = isEditing ? editingValues.unitCost : ci.input?.unitCost || "0";
                                              const totalCost = Number(coefficient) * Number(unitCost);
                                              
                                              return (
                                                <TableRow key={ci.id}>
                                                  <TableCell className="font-mono text-xs">{ci.input?.code || "-"}</TableCell>
                                                  <TableCell className="text-sm">{ci.input?.description}</TableCell>
                                                  <TableCell>
                                                    <span className={cn(
                                                      "text-xs px-2 py-1 rounded",
                                                      ci.input?.type === "material" && "bg-blue-100 text-blue-800",
                                                      ci.input?.type === "labor" && "bg-green-100 text-green-800",
                                                      ci.input?.type === "equipment" && "bg-orange-100 text-orange-800"
                                                    )}>
                                                      {ci.input?.type === "material" ? "Material" : ci.input?.type === "labor" ? "Mão de Obra" : "Equipamento"}
                                                    </span>
                                                  </TableCell>
                                                  <TableCell>{ci.input?.unit}</TableCell>
                                                  <TableCell className="text-right">
                                                    {isEditing ? (
                                                      <Input
                                                        type="number"
                                                        step="0.0001"
                                                        value={editingValues.coefficient}
                                                        onChange={(e) => {
                                                          const newValue = e.target.value;
                                                          setEditingValues(prev => ({...prev, coefficient: newValue}));
                                                        }}
                                                        onKeyDown={(e) => {
                                                          if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            saveTemporary(ci, editingValues.coefficient, editingValues.unitCost);
                                                          }
                                                        }}
                                                        className="w-24 text-right"
                                                        autoFocus
                                                      />
                                                    ) : (
                                                      Number(ci.coefficient).toFixed(4)
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="text-right">
                                                    {isEditing ? (
                                                      <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={editingValues.unitCost}
                                                        onChange={(e) => {
                                                          const newValue = e.target.value;
                                                          setEditingValues(prev => ({...prev, unitCost: newValue}));
                                                        }}
                                                        onKeyDown={(e) => {
                                                          if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            saveTemporary(ci, editingValues.coefficient, editingValues.unitCost);
                                                          }
                                                        }}
                                                        className="w-24 text-right"
                                                      />
                                                    ) : (
                                                      `R$ ${Number(ci.input?.unitCost || 0).toFixed(2)}`
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="text-right font-semibold">R$ {totalCost.toFixed(2)}</TableCell>
                                                  <TableCell>
                                                    {isEditing ? (
                                                      <div className="flex gap-1">
                                                        <Button
                                                          type="button"
                                                          size="sm"
                                                          variant="outline"
                                                          onClick={() => setEditingInputId(null)}
                                                        >
                                                          Cancelar
                                                        </Button>
                                                        <Button
                                                          type="button"
                                                          size="sm"
                                                          onClick={() => savePermanent(ci)}
                                                        >
                                                          Gravar Base
                                                        </Button>
                                                      </div>
                                                    ) : (
                                                      <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => startEditing(ci)}
                                                      >
                                                        <Pencil className="h-4 w-4" />
                                                      </Button>
                                                    )}
                                                  </TableCell>
                                                </TableRow>
                                              );
                                            })}
                                          </TableBody>
                                        </Table>
                                      ) : (
                                        <div className="text-center py-4 text-muted-foreground text-sm">
                                          Carregando insumos...
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                              </>
                            );
                          })}
                        </TableBody>
                      </Table>
                      
                      <div className="border-t pt-4">
                        <div className="flex justify-end gap-8 text-sm">
                          <div className="space-y-1">
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Total Material:</span>
                              <span className="font-semibold">R$ {formatCurrency(realTotals.material)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Total Mão de Obra:</span>
                              <span className="font-semibold">R$ {formatCurrency(realTotals.labor)}</span>
                            </div>
                            <div className="flex justify-between gap-4 text-base font-bold border-t pt-1">
                              <span>Total Geral:</span>
                              <span>R$ {formatCurrency(realTotals.total)}</span>
                            </div>
                            <div className="flex justify-between gap-4 text-sm text-muted-foreground mt-2">
                              <span>Valor da Obra/m²:</span>
                              <span>R$ {formatCurrency(realTotals.total / (Number(watch("squareMeters")) || 1))}/m²</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-between mt-6">
                    <Button type="button" variant="outline" onClick={() => setActiveTab("dados")}>
                      Voltar
                    </Button>
                    <div className="flex gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline">
                            <FileDown className="h-4 w-4 mr-2" />
                            Exportar PDF
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => {
                            const itemsWithoutBDI = allItems.map(item => {
                              const material = Number(item.materialCost) || 0;
                              const labor = Number(item.laborCost) || 0;
                              const equipment = Number(item.equipmentCost) || 0;
                              const service = Number(item.serviceCost) || 0;
                              const other = Number(item.otherCost) || 0;
                              // Aplicar filtro de material (equipamentos NÃO são afetados)
                              const effectiveMaterial = includeMaterial ? material : 0;
                              const totalLabor = labor + equipment + service + other;
                              return {
                                ...item,
                                materialCost: effectiveMaterial.toFixed(2),
                                laborCost: totalLabor.toFixed(2),
                                equipmentCost: "0",
                                serviceCost: "0",
                                otherCost: "0",
                              };
                            });
                            handleExportPDF(
                              budget,
                              stages || [],
                              itemsWithoutBDI,
                              clients?.find(c => c.id === budget?.clientId),
                              projects?.find(p => p.id === budget?.projectId),
                              companySettings,
                              false,
                              true,
                              'sintetico'
                            );
                          }}>
                            Orçamento Sintético
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={async () => {
                            const itemsWithoutBDI = allItems.map(item => {
                              const material = Number(item.materialCost) || 0;
                              const labor = Number(item.laborCost) || 0;
                              const equipment = Number(item.equipmentCost) || 0;
                              const service = Number(item.serviceCost) || 0;
                              const other = Number(item.otherCost) || 0;
                              // Aplicar filtro de material (equipamentos NÃO são afetados)
                              const effectiveMaterial = includeMaterial ? material : 0;
                              const totalLabor = labor + equipment + service + other;
                              return {
                                ...item,
                                materialCost: effectiveMaterial.toFixed(2),
                                laborCost: totalLabor.toFixed(2),
                                equipmentCost: "0",
                                serviceCost: "0",
                                otherCost: "0",
                              };
                            });
                            
                            await loadInputsForAnalytico(itemsWithoutBDI, false);
                            
                            handleExportPDF(
                              budget,
                              stages || [],
                              itemsWithoutBDI,
                              clients?.find(c => c.id === budget?.clientId),
                              projects?.find(p => p.id === budget?.projectId),
                              companySettings,
                              false,
                              true,
                              'analitico'
                            );
                          }}>
                            Orçamento Analítico
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline">
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Exportar Excel
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => {
                            const itemsWithoutBDI = allItems.map(item => {
                              const material = Number(item.materialCost) || 0;
                              const labor = Number(item.laborCost) || 0;
                              const equipment = Number(item.equipmentCost) || 0;
                              const service = Number(item.serviceCost) || 0;
                              const other = Number(item.otherCost) || 0;
                              // Aplicar filtro de material (equipamentos NÃO são afetados)
                              const effectiveMaterial = includeMaterial ? material : 0;
                              const totalLabor = labor + equipment + service + other;
                              return {
                                ...item,
                                materialCost: effectiveMaterial.toFixed(2),
                                laborCost: totalLabor.toFixed(2),
                                equipmentCost: "0",
                                serviceCost: "0",
                                otherCost: "0",
                              };
                            });
                            handleExportExcel(
                              budget,
                              stages || [],
                              itemsWithoutBDI,
                              clients?.find(c => c.id === budget?.clientId),
                              projects?.find(p => p.id === budget?.projectId),
                              companySettings,
                              false,
                              true,
                              'sintetico'
                            );
                          }}>
                            Orçamento Sintético
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={async () => {
                            const itemsWithoutBDI = allItems.map(item => {
                              const material = Number(item.materialCost) || 0;
                              const labor = Number(item.laborCost) || 0;
                              const equipment = Number(item.equipmentCost) || 0;
                              const service = Number(item.serviceCost) || 0;
                              const other = Number(item.otherCost) || 0;
                              // Aplicar filtro de material (equipamentos NÃO são afetados)
                              const effectiveMaterial = includeMaterial ? material : 0;
                              const totalLabor = labor + equipment + service + other;
                              return {
                                ...item,
                                materialCost: effectiveMaterial.toFixed(2),
                                laborCost: totalLabor.toFixed(2),
                                equipmentCost: "0",
                                serviceCost: "0",
                                otherCost: "0",
                              };
                            });
                            
                            await loadInputsForAnalytico(itemsWithoutBDI, false);
                            
                            handleExportExcel(
                              budget,
                              stages || [],
                              itemsWithoutBDI,
                              clients?.find(c => c.id === budget?.clientId),
                              projects?.find(p => p.id === budget?.projectId),
                              companySettings,
                              false,
                              true,
                              'analitico'
                            );
                          }}>
                            Orçamento Analítico
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline">
                            <Calculator className="h-4 w-4 mr-2" />
                            Demonstrativo de BDI
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => {
                            if (!budget || !companySettings) return;
                            const socialCharges = parseFloat(budget.socialCharges || "0");
                            const adminCentral = parseFloat((budget as any).adminCentral || "0");
                            const profit = parseFloat(budget.profit || "0");
                            const taxes = parseFloat(budget.taxes || "0");
                            const risk = parseFloat(budget.risk || "0");
                            const warranty = parseFloat(budget.warranty || "0");
                            const den = 1 - profit / 100 - taxes / 100;
                            const bdiMultiplier = den > 0
                              ? (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100) / den
                              : 1;
                            generateBDIExcel(companySettings, budget.title, {
                              socialCharges, adminCentral, profit, taxes, risk, warranty,
                              bdiRate: (bdiMultiplier - 1) * 100,
                            });
                          }}>
                            Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            if (!budget || !companySettings) return;
                            const socialCharges = parseFloat(budget.socialCharges || "0");
                            const adminCentral = parseFloat((budget as any).adminCentral || "0");
                            const profit = parseFloat(budget.profit || "0");
                            const taxes = parseFloat(budget.taxes || "0");
                            const risk = parseFloat(budget.risk || "0");
                            const warranty = parseFloat(budget.warranty || "0");
                            const den = 1 - profit / 100 - taxes / 100;
                            const bdiMultiplier = den > 0
                              ? (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100) / den
                              : 1;
                            generateBDIPDF(companySettings, budget.title, {
                              socialCharges, adminCentral, profit, taxes, risk, warranty,
                              bdiRate: (bdiMultiplier - 1) * 100,
                            });
                          }}>
                            PDF
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button type="submit" variant="outline">
                        <Save className="h-4 w-4 mr-2" />
                        Salvar Rascunho
                      </Button>
                      <Button type="button" onClick={() => setActiveTab("bdi")}>
                        Ver com BDI
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* ABA 3 - COMPOSIÇÕES COM BDI */}
            <TabsContent value="bdi" className="space-y-6">
              {/* Botão Modo Apresentação */}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant={presentationMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const newMode = !presentationMode;
                    setPresentationMode(newMode);
                    if (newMode) {
                      // Ativar modo apresentação: recolhe ambos os blocos sensíveis
                      setBdiParamsCollapsed(true);
                      setBdiCardsCollapsed(true);
                    } else {
                      // Desativar modo apresentação: expande ambos os blocos
                      setBdiParamsCollapsed(false);
                      setBdiCardsCollapsed(false);
                    }
                  }}
                  className={presentationMode ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600" : ""}
                >
                  {presentationMode ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-2" />
                      Modo Apresentação Ativo
                    </>
                  ) : (
                    <>
                      <Presentation className="h-4 w-4 mr-2" />
                      Modo Apresentação
                    </>
                  )}
                </Button>
              </div>
              <Card className={presentationMode ? 'hidden' : ''}>
                <CardHeader
                  className="cursor-pointer select-none hover:bg-muted/50 transition-colors rounded-t-lg"
                  onClick={() => setBdiParamsCollapsed(prev => !prev)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Parâmetros de BDI</CardTitle>
                      {bdiParamsCollapsed && (
                        <CardDescription className="mt-1">
                          BDI Total: <strong>{((calcBDIMultiplier() - 1) * 100).toFixed(2)}%</strong> &mdash; clique para expandir e editar
                        </CardDescription>
                      )}
                      {!bdiParamsCollapsed && (
                        <CardDescription>Configure os percentuais aplicados</CardDescription>
                      )}
                    </div>
                    <div className={`transition-transform duration-200 ${bdiParamsCollapsed ? '' : 'rotate-180'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                  </div>
                </CardHeader>
                {!bdiParamsCollapsed && (
                  <CardContent>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-4">
                      <div className="space-y-2">
                        <Label htmlFor="socialCharges">Encargos Sociais (%)</Label>
                        <Input 
                          id="socialCharges" 
                          type="number" 
                          step="0.01"
                          {...register("socialCharges")} 
                          placeholder="120"
                        />
                        <p className="text-xs text-muted-foreground">Apenas em MO</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="adminCentral">Adm. Central (%)</Label>
                        <Input 
                          id="adminCentral" 
                          type="number" 
                          step="0.01"
                          {...register("adminCentral")} 
                          placeholder="0"
                        />
                        <p className="text-xs text-muted-foreground">AC — numerador</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="profit">Lucro (%)</Label>
                        <Input 
                          id="profit" 
                          type="number" 
                          step="0.01"
                          {...register("profit")} 
                          placeholder="10"
                        />
                        <p className="text-xs text-muted-foreground">L — denominador</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="taxes">Impostos (%)</Label>
                        <Input 
                          id="taxes" 
                          type="number" 
                          step="0.01"
                          {...register("taxes")} 
                          placeholder="25"
                        />
                        <p className="text-xs text-muted-foreground">I — denominador</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="risk">Risco (%)</Label>
                        <Input 
                          id="risk" 
                          type="number" 
                          step="0.01"
                          {...register("risk")} 
                          placeholder="5"
                        />
                        <p className="text-xs text-muted-foreground">R — numerador</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="warranty">Garantia (%)</Label>
                        <Input 
                          id="warranty" 
                          type="number" 
                          step="0.01"
                          {...register("warranty")} 
                          placeholder="2"
                        />
                        <p className="text-xs text-muted-foreground">G — numerador</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">Fórmula clássica de BDI: BDI = [(1+AC)(1+G)(1+R)] / (1−L−I) − 1</p>
                    <div className="mt-4 p-4 bg-muted rounded-lg space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">BDI Total (exceto Encargos Sociais):</span>
                        <span className="text-xl font-bold">{((calcBDIMultiplier() - 1) * 100).toFixed(2)}%</span>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-border">
                        <div className="space-y-0.5">
                          <Label htmlFor="includeMaterial" className="text-base font-semibold">Incluir Material no Orçamento</Label>
                          <p className="text-xs text-muted-foreground">Desative para gerar orçamento apenas de mão de obra</p>
                        </div>
                        <Switch
                          id="includeMaterial"
                          checked={includeMaterial}
                          onCheckedChange={setIncludeMaterial}
                        />
                      </div>
                      <div className="flex justify-end pt-3 border-t border-border">
                        <Button
                          type="button"
                          className="bg-green-600 hover:bg-green-700 text-white gap-2"
                          disabled={!budgetId || autoSaveMutation.isPending}
                          onClick={() => handleBDISave({
                            socialCharges: Number(formValues.socialCharges || 0),
                            adminCentral: Number(formValues.adminCentral || 0),
                            profit: Number(formValues.profit || 0),
                            taxes: Number(formValues.taxes || 0),
                            risk: Number(formValues.risk || 0),
                            warranty: Number(formValues.warranty || 0),
                          })}
                        >
                          {autoSaveMutation.isPending ? (
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                          )}
                          {autoSaveMutation.isPending ? 'Salvando...' : 'Salvar Parâmetros de BDI'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
              
              <Card className={presentationMode ? 'hidden' : ''}>
                <CardContent className="p-0">
                  <div
                    className="cursor-pointer select-none hover:bg-muted/50 transition-colors rounded-t-lg px-6 py-3 flex items-center justify-between"
                    onClick={() => setBdiCardsCollapsed(prev => !prev)}
                  >
                    <span className="text-base font-semibold">Resumo do Orçamento</span>
                    <div className={`transition-transform duration-200 ${bdiCardsCollapsed ? '' : 'rotate-180'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                  </div>
                  <div className={bdiCardsCollapsed ? 'hidden' : 'px-6 pb-6'}>
                  {/* Resumo do Orçamento com BDI */}
                  {budgetId && allItems.length > 0 && (() => {
                    // Calcular totais aplicando EXATAMENTE a mesma lógica das etapas (HierarchicalBudgetView)
                    let totalMaterialWithBDI = 0;
                    let totalLaborWithBDI = 0;
                    // Variável exportada para barra de totais abaixo da tabela
                    // (reutilizada via closure no bloco de botões)
                    let totalMaterialWithoutBDI = 0;
                    let totalLaborWithoutBDI = 0;
                    let totalEquipmentWithoutBDI = 0;
                    let totalServiceWithoutBDI = 0;
                    let totalOtherWithoutBDI = 0;
                    
                    // Melhoria 18: Acumuladores para detalhamento do BDI
                    let totalEncargosSociaisValue = 0;
                    let totalLucroValue = 0;
                    let totalImpostosValue = 0;
                    let totalRiscoValue = 0;
                    let totalGarantiaValue = 0;
                    
                    // Expandir compostos: substituir item composto pelos seus filhos
                    const itemsForCardBdi = allItems.flatMap((item: any) => {
                      if (item.type === 'composite') {
                        return (item.children || []).map((child: any) => ({
                          ...child,
                          serviceCost: child.serviceCost || "0",
                          otherCost: child.otherCost || "0",
                        }));
                      }
                      return [item];
                    });

                    itemsForCardBdi.forEach((item: any) => {
                      const qty = parseFloat(item.quantity || "0");
                      const material = parseFloat(item.materialCost || "0");
                      const labor = parseFloat(item.laborCost || "0");
                      const equipment = parseFloat(item.equipmentCost || "0");
                      const service = parseFloat(item.serviceCost || "0");
                      const other = parseFloat(item.otherCost || "0");
                      
                      // Aplicar filtro de material
                      const effectiveMaterial = includeMaterial ? material : 0;
                      
                      // Buscar configuração de BDI para este item
                      const itemConfig = bdiConfigs[item.id!] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0 };
                      
                      // Encargos sociais APENAS em labor (Melhoria 16: considerar flag)
                      const aplicarEncargos = itemConfig.aplicarEncargosSociais !== false;
                      const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
                      
                      // BDI composto TCU/SINAPI
                      const additionalIncrement = itemConfig.additionalIncrement || 0;
                      const discount = itemConfig.discount || 0;
                      const bdiMultiplier = calcBDIMultiplier(additionalIncrement, discount);
                      
                      // Aplicar BDI ao material apenas se configurado
                      // Aplicar materialAdjustment antes do BDI
                      const matAdjPct = itemConfig.materialAdjustment || 0;
                      const effectiveMaterialAdj = effectiveMaterial * (1 + matAdjPct / 100);
                      const materialWithBDI = itemConfig.applyBdiToMaterial ? effectiveMaterialAdj * bdiMultiplier : effectiveMaterialAdj;
                      
                      // Aplicar BDI à mão de obra apenas se configurado
                      const laborWithBDI = itemConfig.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;

                      // Equipment, service e other: aplicar BDI SEM encargos sociais
                      const equipmentWithBDI = equipment * bdiMultiplier;
                      const serviceWithBDI = service * bdiMultiplier;
                      const otherWithBDI = other * bdiMultiplier;

                      // Ajuste M.O. (%) por item — estava faltando aqui, por isso este
                      // card não batia com a tabela detalhada/barra de total (que já
                      // aplicavam esse ajuste). Mesma lógica usada nos outros pontos do
                      // arquivo que exportam/calculam o total com BDI.
                      const laborAdjPct = Number(itemConfig.laborAdjustment) || 0;

                      // Total de M.O. = labor com BDI + equipment/service/other com BDI
                      const totalLaborItem = (laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI) * (1 + laborAdjPct / 100);

                      // Somar ao total geral
                      totalMaterialWithBDI += materialWithBDI * qty;
                      totalLaborWithBDI += totalLaborItem * qty;
                      totalMaterialWithoutBDI += effectiveMaterial * qty;
                      totalLaborWithoutBDI += labor * qty;
                      totalEquipmentWithoutBDI += equipment * qty;
                      totalServiceWithoutBDI += service * qty;
                      totalOtherWithoutBDI += other * qty;
                      
                      // Melhoria 18: Calcular contribuição de cada componente do BDI
                      // 1. Encargos Sociais (apenas em labor)
                      if (aplicarEncargos) {
                        totalEncargosSociaisValue += (labor * (socialCharges / 100)) * qty;
                      }
                      
                      // 2-5. Lucro, Impostos, Risco, Garantia (sobre base com encargos)
                      const baseValue = (effectiveMaterial + laborWithCharges + equipment + service + other) * qty;
                      totalLucroValue += baseValue * (profit / 100);
                      totalImpostosValue += baseValue * (taxes / 100);
                      totalRiscoValue += baseValue * (risk / 100);
                      totalGarantiaValue += baseValue * (warranty / 100);
                    });
                    
                    const totalWithBDI = totalMaterialWithBDI + totalLaborWithBDI;
                    const totalWithoutBDI = totalMaterialWithoutBDI + totalLaborWithoutBDI + totalEquipmentWithoutBDI + totalServiceWithoutBDI + totalOtherWithoutBDI;
                    const bdiValue = totalWithBDI - totalWithoutBDI;
                    const bdiPercentage = totalWithoutBDI > 0 ? (bdiValue / totalWithoutBDI) * 100 : 0;
                    
                    // Calcular percentuais
                    const materialPercentage = totalWithoutBDI > 0 ? (totalMaterialWithoutBDI / totalWithoutBDI) * 100 : 0;
                    const laborPercentage = totalWithoutBDI > 0 ? (totalLaborWithoutBDI / totalWithoutBDI) * 100 : 0;
                    const equipmentPercentage = totalWithoutBDI > 0 ? (totalEquipmentWithoutBDI / totalWithoutBDI) * 100 : 0;
                    const servicePercentage = totalWithoutBDI > 0 ? (totalServiceWithoutBDI / totalWithoutBDI) * 100 : 0;
                    const otherPercentage = totalWithoutBDI > 0 ? (totalOtherWithoutBDI / totalWithoutBDI) * 100 : 0;
                    
                    return (
                      <BudgetSummaryHeader
                        totalWithoutBDI={totalWithoutBDI}
                        bdiValue={bdiValue}
                        bdiPercentage={bdiPercentage}
                        totalWithBDI={totalWithBDI}
                        materialPercentage={materialPercentage}
                        laborPercentage={laborPercentage}
                        equipmentPercentage={equipmentPercentage}
                        servicePercentage={servicePercentage}
                        otherPercentage={otherPercentage}
                        materialValue={totalMaterialWithoutBDI}
                        laborValue={totalLaborWithoutBDI}
                        equipmentValue={totalEquipmentWithoutBDI}
                        serviceValue={totalServiceWithoutBDI}
                        otherValue={totalOtherWithoutBDI}
                        materialWithBDI={totalMaterialWithBDI}
                        laborWithBDI={totalLaborWithBDI}
                        equipmentWithBDI={totalEquipmentWithoutBDI}
                        serviceWithBDI={totalServiceWithoutBDI}
                        otherWithBDI={totalOtherWithoutBDI}
                        squareMeters={Number(watch("squareMeters")) || undefined}
                        encargosSociaisValue={totalEncargosSociaisValue}
                        lucroValue={totalLucroValue}
                        impostosValue={totalImpostosValue}
                        riscoValue={totalRiscoValue}
                        garantiaValue={totalGarantiaValue}
                      />
                    );
                  })()}
                  </div>
                </CardContent>
              </Card>

              {/* Card de Composições com BDI - sempre visível */}
              <Card>
                <CardContent className="p-0">
                  {allItems.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      Nenhuma composição adicionada ainda
                    </div>
                  ) : (
                    <HierarchicalBudgetView
                      stages={[...localStages, ...stages]}
                      items={allItemsFlat.map(item => {
                        // Aplicar BDI aos valores de material e mão de obra
                        const material = Number(item.materialCost) || 0;
                        const labor = Number(item.laborCost) || 0;
                        const equipment = Number(item.equipmentCost) || 0;
                        const service = Number(item.serviceCost) || 0;
                        const other = Number(item.otherCost) || 0;
                        
                        // Aplicar filtro de material
                        const effectiveMaterial = includeMaterial ? material : 0;
                        
                        // Buscar configuração de BDI para este item
                        const itemConfig = bdiConfigs[item.id!] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0 };
                        
                        // Encargos sociais APENAS em labor, NÃO em equipment/service/other (Melhoria 16: considerar flag)
                        const aplicarEncargos = itemConfig.aplicarEncargosSociais !== false;
                        const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
                        
                        // BDI composto TCU/SINAPI
                        const additionalIncrement = itemConfig.additionalIncrement || 0;
                        const discount = itemConfig.discount || 0;
                        const bdiMultiplier = calcBDIMultiplier(additionalIncrement, discount);
                        
                        // Aplicar BDI ao material apenas se configurado
                        const materialWithBDI = itemConfig.applyBdiToMaterial ? effectiveMaterial * bdiMultiplier : effectiveMaterial;
                        
                        // Aplicar BDI à mão de obra apenas se configurado
                        const laborWithBDI = itemConfig.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;
                        
                        // Equipment, service e other: aplicar BDI SEM encargos sociais
                        const equipmentWithBDI = equipment * bdiMultiplier;
                        const serviceWithBDI = service * bdiMultiplier;
                        const otherWithBDI = other * bdiMultiplier;
                        
                        // Total de M.O. = labor com BDI + equipment/service/other com BDI
                        const totalLabor = laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI;
                        
                        // Retornar item com valores atualizados
                        return {
                          ...item,
                          materialCost: materialWithBDI.toFixed(2),
                          laborCost: totalLabor.toFixed(2),
                          // Zerar equipment/service/other pois já estão consolidados em laborCost
                          equipmentCost: "0.00",
                          serviceCost: "0.00",
                          otherCost: "0.00",
                          unitCost: (materialWithBDI + totalLabor).toFixed(2),
                          totalCost: ((materialWithBDI + totalLabor) * Number(item.quantity)).toFixed(2),
                        };
                      })}
                      includeMaterial={includeMaterial}
                      showBdiConfig={true}
                      bdiConfigs={bdiConfigs}
                      onUpdateBdiConfig={handleUpdateBdiConfig}
                      onAddSubStage={() => {}}
                      onAddComposition={() => {}}
                      onAddInput={() => {}}
                      onAddService={() => {}}
                      onMoveStageUp={(stageId) => {
                        if (budgetId) moveStageUpMutation.mutate({ budgetId, stageId, direction: 'up' });
                      }}
                      onMoveStageDown={(stageId) => {
                        if (budgetId) moveStageDownMutation.mutate({ budgetId, stageId, direction: 'down' });
                      }}
                      onEditStage={() => {}}
                      onDeleteStage={() => {}}
                      onDeleteItem={() => {}}
                      onUpdateItemQuantity={undefined}
                      onMoveItemUp={(itemId) => moveItemUpMutation.mutate({ itemId })}
                      onMoveItemDown={(itemId) => moveItemDownMutation.mutate({ itemId })}
                      onLoadCompositionInputs={async (compositionId, budgetItemId) => {
                        // Carregar insumos e aplicar BDI
                        const inputs = await utils.compositions.getInputsWithCustomValues.fetch({ 
                          compositionId,
                          budgetItemId 
                        });
                        return inputs.map((input: any) => {
                          // Priorizar valor customizado (budget_item_inputs) sobre valor da base global
                          const unitCost = parseFloat(input.unitCost ?? input.input.unitCost);
                          const inputType = input.input.type.toLowerCase();
                          
                          // Aplicar BDI conforme tipo de insumo
                          let unitCostWithBDI = unitCost;
                          if (inputType === 'labor') {
                            // Mão de obra: encargos sociais + BDI composto TCU/SINAPI
                            unitCostWithBDI = unitCost * (1 + socialCharges / 100) * calcBDIMultiplier();
                          } else {
                            // Material e Equipamento: apenas BDI composto TCU/SINAPI
                            unitCostWithBDI = unitCost * calcBDIMultiplier();
                          }
                          
                          return {
                            id: input.inputId,
                            code: input.input.code,
                            description: input.input.description,
                            type: input.input.type,
                            unit: input.input.unit,
                            coefficient: parseFloat(input.coefficient),
                            unitCost: unitCostWithBDI,
                          };
                        });
                      }}
                      onUpdateCompositionCosts={undefined}
                      onSaveInputToBase={undefined}
                      onEditCompositeItem={(item) => {
                        setEditingCompositeItem({
                          id: Number(item.id),
                          description: item.description,
                          unit: item.unit,
                          quantity: String(item.quantity ?? 1),
                        });
                        setIsEditCompositeDialogOpen(true);
                      }}
                      onEditCompositeChild={(item) => {
                        setEditingCompositeChild({
                          itemId: item.id,
                          description: item.description,
                          unit: item.unit,
                          quantity: parseFloat(item.quantity) || 1,
                          materialCost: parseFloat(item.materialCost) || 0,
                          laborCost: parseFloat(item.laborCost) || 0,
                          equipmentCost: parseFloat(item.equipmentCost ?? '0') || 0,
                          serviceCost: parseFloat(item.serviceCost ?? '0') || 0,
                          otherCost: parseFloat(item.otherCost ?? '0') || 0,
                        });
                        setIsEditCompositeChildDialogOpen(true);
                      }}
                    />
                  )}
                  
                  {/* Barra de Totais BDI - entre tabela e botões */}
                  {allItems.length > 0 && (() => {
                    // Calcular totais BDI expandindo composites
                    const expandedItems = allItems.flatMap((item: any) => {
                      if (item.type === 'composite') {
                        return (item.children || []).map((child: any) => ({
                          ...child,
                          serviceCost: child.serviceCost || '0',
                          otherCost: child.otherCost || '0',
                        }));
                      }
                      return [item];
                    });
                    let sumMat = 0, sumLab = 0;
                    expandedItems.forEach((item: any) => {
                      const qty = parseFloat(item.quantity || '0');
                      const material = parseFloat(item.materialCost || '0');
                      const labor = parseFloat(item.laborCost || '0');
                      const equipment = parseFloat(item.equipmentCost || '0');
                      const service = parseFloat(item.serviceCost || '0');
                      const other = parseFloat(item.otherCost || '0');
                      const effectiveMaterial = includeMaterial ? material : 0;
                      const itemConfig = bdiConfigs[item.id!] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, aplicarEncargosSociais: true, laborAdjustment: 0 };
                      const aplicarEncargos = itemConfig.aplicarEncargosSociais !== false;
                      const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
                      const additionalIncrement = itemConfig.additionalIncrement || 0;
                      const discount = itemConfig.discount || 0;
                      const laborAdjPct = itemConfig.laborAdjustment || 0;
                      const bdiMultiplier = calcBDIMultiplier(additionalIncrement, discount);
                      const matAdjPctRodape = itemConfig.materialAdjustment || 0;
                      const effectiveMaterialAdjRodape = effectiveMaterial * (1 + matAdjPctRodape / 100);
                      const materialWithBDI = itemConfig.applyBdiToMaterial ? effectiveMaterialAdjRodape * bdiMultiplier : effectiveMaterialAdjRodape;
                      const laborWithBDI = itemConfig.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;
                      const laborWithAdj = laborWithBDI * (1 + laborAdjPct / 100);
                      const equipmentWithBDI = equipment * bdiMultiplier;
                      const serviceWithBDI = service * bdiMultiplier;
                      const otherWithBDI = other * bdiMultiplier;
                      const totalLaborItem = laborWithAdj + equipmentWithBDI + serviceWithBDI + otherWithBDI;
                      sumMat += materialWithBDI * qty;
                      sumLab += totalLaborItem * qty;
                    });
                    const sumTotal = sumMat + sumLab;
                    return (
                      <div className="border-t border-border bg-muted/30 px-6 py-4 rounded-b-lg">
                        <div className="flex flex-wrap items-center justify-end gap-6 text-sm">
                          {includeMaterial && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground font-medium">Total Material (c/ BDI):</span>
                              <span className="font-bold text-blue-600 dark:text-blue-400 text-base">
                                R$ {sumMat.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground font-medium">Total Mão de Obra (c/ BDI):</span>
                            <span className="font-bold text-orange-600 dark:text-orange-400 text-base">
                              R$ {sumLab.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 border-l border-border pl-6">
                            <span className="text-foreground font-semibold text-base">Valor Total da Obra:</span>
                            <span className="font-bold text-green-600 dark:text-green-400 text-xl">
                              R$ {sumTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex justify-between mt-6">
                    <Button type="button" variant="outline" onClick={() => setActiveTab("composicoes")}>
                      Voltar
                    </Button>
                    <div className="flex gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline">
                            <FileDown className="h-4 w-4 mr-2" />
                            Exportar PDF
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => {
                            const itemsWithBDI = buildItemsWithBDIForExport();
                            handleExportPDF(
                              budget,
                              stages || [],
                              itemsWithBDI,
                              clients?.find(c => c.id === budget?.clientId),
                              projects?.find(p => p.id === budget?.projectId),
                              companySettings,
                              true,
                              includeMaterial,
                              'sintetico'
                            );
                          }}>
                            Orçamento Sintético
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={async () => {
                            const itemsWithBDI = buildItemsWithBDIForExport();
                            await loadInputsForAnalytico(itemsWithBDI, true);
                            handleExportPDF(
                              budget,
                              stages || [],
                              itemsWithBDI,
                              clients?.find(c => c.id === budget?.clientId),
                              projects?.find(p => p.id === budget?.projectId),
                              companySettings,
                              true,
                              includeMaterial,
                              'analitico'
                            );
                          }}>
                            Orçamento Analítico
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline">
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Exportar Excel
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => {
                            const itemsWithBDI = buildItemsWithBDIForExport();
                            handleExportExcel(
                              budget,
                              stages || [],
                              itemsWithBDI,
                              clients?.find(c => c.id === budget?.clientId),
                              projects?.find(p => p.id === budget?.projectId),
                              companySettings,
                              true,
                              includeMaterial,
                              'sintetico'
                            );
                          }}>
                            Orçamento Sintético
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={async () => {
                            const itemsWithBDI = buildItemsWithBDIForExport();
                            await loadInputsForAnalytico(itemsWithBDI, true);
                            handleExportExcel(
                              budget,
                              stages || [],
                              itemsWithBDI,
                              clients?.find(c => c.id === budget?.clientId),
                              projects?.find(p => p.id === budget?.projectId),
                              companySettings,
                              true,
                              includeMaterial,
                              'analitico'
                            );
                          }}>
                            Orçamento Analítico
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline">
                            <Calculator className="h-4 w-4 mr-2" />
                            Demonstrativo de BDI
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => {
                            if (!budget || !companySettings) return;
                            const socialCharges = parseFloat(budget.socialCharges || "0");
                            const adminCentral = parseFloat((budget as any).adminCentral || "0");
                            const profit = parseFloat(budget.profit || "0");
                            const taxes = parseFloat(budget.taxes || "0");
                            const risk = parseFloat(budget.risk || "0");
                            const warranty = parseFloat(budget.warranty || "0");
                            const den = 1 - profit / 100 - taxes / 100;
                            const bdiMultiplier = den > 0
                              ? (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100) / den
                              : 1;
                            generateBDIExcel(companySettings, budget.title, {
                              socialCharges, adminCentral, profit, taxes, risk, warranty,
                              bdiRate: (bdiMultiplier - 1) * 100,
                            });
                          }}>
                            Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            if (!budget || !companySettings) return;
                            const socialCharges = parseFloat(budget.socialCharges || "0");
                            const adminCentral = parseFloat((budget as any).adminCentral || "0");
                            const profit = parseFloat(budget.profit || "0");
                            const taxes = parseFloat(budget.taxes || "0");
                            const risk = parseFloat(budget.risk || "0");
                            const warranty = parseFloat(budget.warranty || "0");
                            const den = 1 - profit / 100 - taxes / 100;
                            const bdiMultiplier = den > 0
                              ? (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100) / den
                              : 1;
                            generateBDIPDF(companySettings, budget.title, {
                              socialCharges, adminCentral, profit, taxes, risk, warranty,
                              bdiRate: (bdiMultiplier - 1) * 100,
                            });
                          }}>
                            PDF
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button type="submit">
                        <Save className="h-4 w-4 mr-2" />
                        Salvar Orçamento
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA 4 - GRÁFICOS */}
            <TabsContent value="graficos" className="space-y-6">
              {/* Gráfico de Pizza - Distribuição de Custos */}
              <Card>
                <CardHeader>
                  <CardTitle>Distribuição de Custos</CardTitle>
                  <CardDescription>
                    Proporção entre Material, Mão de Obra e BDI no orçamento total
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-96 flex items-center justify-center">
                    {(() => {
                      // Calcular totais para o gráfico de pizza
                      let totalMaterial = 0;
                      let totalLabor = 0;
                      let totalBDI = 0;
                      
                      // Expandir compostos: substituir item composto pelos seus filhos
                      const itemsForChart = allItems.flatMap((item: any) => {
                        if (item.type === 'composite') {
                          return (item.children || []).map((child: any) => ({
                            ...child,
                            serviceCost: child.serviceCost || "0",
                            otherCost: child.otherCost || "0",
                          }));
                        }
                        return [item];
                      });

                      itemsForChart.forEach((item: any) => {
                        const qty = parseFloat(item.quantity || "0");
                        const material = parseFloat(item.materialCost || "0");
                        const labor = parseFloat(item.laborCost || "0");
                        const equipment = parseFloat(item.equipmentCost || "0");
                        const service = parseFloat(item.serviceCost || "0");
                        const other = parseFloat(item.otherCost || "0");
                        
                        const itemConfig = bdiConfigs[item.id!] || { applyBdiToMaterial: true, applyBdiToLabor: true, aplicarEncargosSociais: true };
                        const aplicarEncargos = itemConfig.aplicarEncargosSociais !== false;
                        
                        // Custo base
                        const materialBase = material * qty;
                        const laborBase = (labor + equipment + service + other) * qty;
                        
                        // Encargos sociais
                        const encargosSociais = aplicarEncargos ? (labor * qty * socialCharges / 100) : 0;
                        
                        // BDI composto TCU/SINAPI
                        const _bdiRate = calcBDIMultiplier() - 1;
                        const bdiMaterial = itemConfig.applyBdiToMaterial ? (material * qty * _bdiRate) : 0;
                        const bdiLabor = itemConfig.applyBdiToLabor ? ((labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100) + equipment + service + other) * qty * _bdiRate) : 0;
                        
                        totalMaterial += materialBase;
                        totalLabor += laborBase + encargosSociais;
                        totalBDI += bdiMaterial + bdiLabor;
                      });
                      
                      const total = totalMaterial + totalLabor + totalBDI;
                      
                      if (total === 0) {
                        return <p className="text-muted-foreground">Nenhum dado disponível para exibir</p>;
                      }
                      
                      const data = [
                        { name: 'Material', value: totalMaterial, fill: '#3b82f6' },
                        { name: 'Mão de Obra', value: totalLabor, fill: '#10b981' },
                        { name: 'BDI', value: totalBDI, fill: '#f59e0b' },
                      ];
                      
                      return (
                        <div className="w-full h-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={(entry) => `${entry.name}: R$ ${entry.value.toFixed(2)} (${((entry.value / total) * 100).toFixed(1)}%)`}
                                outerRadius={120}
                                dataKey="value"
                              >
                                {data.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
              
              {/* Gráfico de Curva ABC */}
              <Card>
                <CardHeader>
                  <CardTitle>Curva ABC - Por Custo Total</CardTitle>
                  <CardDescription>
                    Análise ABC das composições por valor total (Classe A: 80%, B: 15%, C: 5%)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-96">
                    {(() => {
                      // Agrupar itens por descrição e calcular valor total
                      const itemMap = new Map<string, { description: string; totalCost: number }>();
                      
                      allItems.forEach(item => {
                        const qty = parseFloat(item.quantity || "0");
                        const material = parseFloat(item.materialCost || "0");
                        const labor = parseFloat(item.laborCost || "0");
                        const equipment = parseFloat(item.equipmentCost || "0");
                        const service = parseFloat(item.serviceCost || "0");
                        const other = parseFloat(item.otherCost || "0");
                        
                        const itemConfig = bdiConfigs[item.id!] || { applyBdiToMaterial: true, applyBdiToLabor: true, aplicarEncargosSociais: true };
                        const aplicarEncargos = itemConfig.aplicarEncargosSociais !== false;
                        
                        // Calcular custo total com BDI composto TCU/SINAPI
                        const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
                        const bdiMultiplier = calcBDIMultiplier();
                        
                        const materialWithBDI = itemConfig.applyBdiToMaterial ? material * bdiMultiplier : material;
                        const laborWithBDI = itemConfig.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;
                        const equipmentWithBDI = equipment * bdiMultiplier;
                        const serviceWithBDI = service * bdiMultiplier;
                        const otherWithBDI = other * bdiMultiplier;
                        
                        const totalCost = (materialWithBDI + laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI) * qty;
                        
                        const key = item.description || 'Sem descrição';
                        const existing = itemMap.get(key);
                        if (existing) {
                          existing.totalCost += totalCost;
                        } else {
                          itemMap.set(key, { description: key, totalCost });
                        }
                      });
                      
                      // Converter para array e ordenar por valor decrescente
                      const sortedItems = Array.from(itemMap.values())
                        .sort((a, b) => b.totalCost - a.totalCost);
                      
                      if (sortedItems.length === 0) {
                        return <p className="text-muted-foreground text-center py-12">Nenhum dado disponível para exibir</p>;
                      }
                      
                      // Calcular percentual acumulado e classificar
                      const totalValue = sortedItems.reduce((sum, item) => sum + item.totalCost, 0);
                      let accumulated = 0;
                      
                      const abcData = sortedItems.map((item, index) => {
                        accumulated += item.totalCost;
                        const percentAccumulated = (accumulated / totalValue) * 100;
                        
                        let classe = 'C';
                        let color = '#94a3b8'; // gray
                        if (percentAccumulated <= 80) {
                          classe = 'A';
                          color = '#ef4444'; // red
                        } else if (percentAccumulated <= 95) {
                          classe = 'B';
                          color = '#f59e0b'; // orange
                        }
                        
                        return {
                          name: item.description.length > 30 ? item.description.substring(0, 27) + '...' : item.description,
                          fullName: item.description,
                          value: item.totalCost,
                          percentAccumulated: percentAccumulated,
                          classe,
                          fill: color,
                        };
                      });
                      
                      // Limitar a 20 itens para não sobrecarregar o gráfico
                      const displayData = abcData.slice(0, 20);
                      
                      return (
                        <div className="w-full h-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={displayData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis 
                                dataKey="name" 
                                angle={-45} 
                                textAnchor="end" 
                                height={100}
                                interval={0}
                                tick={{ fontSize: 10 }}
                              />
                              <YAxis 
                                yAxisId="left"
                                label={{ value: 'Valor (R$)', angle: -90, position: 'insideLeft' }}
                              />
                              <YAxis 
                                yAxisId="right"
                                orientation="right"
                                label={{ value: '% Acumulado', angle: 90, position: 'insideRight' }}
                              />
                              <Tooltip 
                                formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                                labelFormatter={(label, payload) => {
                                  if (payload && payload[0]) {
                                    return payload[0].payload.fullName;
                                  }
                                  return label;
                                }}
                              />
                              <Legend />
                              <Bar yAxisId="left" dataKey="value" name="Valor" />
                              <Bar yAxisId="right" dataKey="percentAccumulated" name="% Acumulado" fill="#8884d8" />
                            </BarChart>
                          </ResponsiveContainer>
                          <div className="mt-4 flex gap-4 justify-center text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-red-500"></div>
                              <span>Classe A (até 80%)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-orange-500"></div>
                              <span>Classe B (80-95%)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-gray-400"></div>
                              <span>Classe C (95-100%)</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
              
              {/* Gráfico de Barras Empilhadas por Sub-etapa */}
              <Card>
                <CardHeader>
                  <CardTitle>Custos por Sub-etapa</CardTitle>
                  <CardDescription>
                    Distribuição de Material, Mão de Obra e BDI por sub-etapa do projeto
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-96">
                    {(() => {
                      // Agrupar itens por sub-etapa (stage)
                      const stageMap = new Map<number, { name: string; material: number; labor: number; bdi: number }>();
                      
                      allItems.forEach(item => {
                        if (!item.stageId) return;
                        
                        const qty = parseFloat(item.quantity || "0");
                        const material = parseFloat(item.materialCost || "0");
                        const labor = parseFloat(item.laborCost || "0");
                        const equipment = parseFloat(item.equipmentCost || "0");
                        const service = parseFloat(item.serviceCost || "0");
                        const other = parseFloat(item.otherCost || "0");
                        
                        const itemConfig = bdiConfigs[item.id!] || { applyBdiToMaterial: true, applyBdiToLabor: true, aplicarEncargosSociais: true };
                        const aplicarEncargos = itemConfig.aplicarEncargosSociais !== false;
                        
                        // Custo base
                        const materialBase = material * qty;
                        const laborBase = (labor + equipment + service + other) * qty;
                        
                        // Encargos sociais
                        const encargosSociais = aplicarEncargos ? (labor * qty * socialCharges / 100) : 0;
                        
                        // BDI composto TCU/SINAPI
                        const _bdiRate2 = calcBDIMultiplier() - 1;
                        const bdiMaterial = itemConfig.applyBdiToMaterial ? (material * qty * _bdiRate2) : 0;
                        const bdiLabor = itemConfig.applyBdiToLabor ? ((labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100) + equipment + service + other) * qty * _bdiRate2) : 0;
                        
                        // Encontrar nome da sub-etapa
                        const stage = stages.find(s => s.id === item.stageId);
                        const stageName = stage?.name || `Sub-etapa ${item.stageId}`;
                        
                        const existing = stageMap.get(item.stageId);
                        if (existing) {
                          existing.material += materialBase;
                          existing.labor += laborBase + encargosSociais;
                          existing.bdi += bdiMaterial + bdiLabor;
                        } else {
                          stageMap.set(item.stageId, {
                            name: stageName,
                            material: materialBase,
                            labor: laborBase + encargosSociais,
                            bdi: bdiMaterial + bdiLabor,
                          });
                        }
                      });
                      
                      const stageData = Array.from(stageMap.values())
                        .map(stage => ({
                          name: stage.name.length > 25 ? stage.name.substring(0, 22) + '...' : stage.name,
                          fullName: stage.name,
                          Material: stage.material,
                          'Mão de Obra': stage.labor,
                          BDI: stage.bdi,
                        }))
                        .sort((a, b) => (b.Material + b['Mão de Obra'] + b.BDI) - (a.Material + a['Mão de Obra'] + a.BDI));
                      
                      if (stageData.length === 0) {
                        return <p className="text-muted-foreground text-center py-12">Nenhum dado disponível para exibir</p>;
                      }
                      
                      return (
                        <div className="w-full h-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stageData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis 
                                dataKey="name" 
                                angle={-45} 
                                textAnchor="end" 
                                height={100}
                                interval={0}
                                tick={{ fontSize: 10 }}
                              />
                              <YAxis label={{ value: 'Valor (R$)', angle: -90, position: 'insideLeft' }} />
                              <Tooltip 
                                formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                                labelFormatter={(label, payload) => {
                                  if (payload && payload[0]) {
                                    return payload[0].payload.fullName;
                                  }
                                  return label;
                                }}
                              />
                              <Legend />
                              <Bar dataKey="Material" stackId="a" fill="#3b82f6" />
                              <Bar dataKey="Mão de Obra" stackId="a" fill="#10b981" />
                              <Bar dataKey="BDI" stackId="a" fill="#f59e0b" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
              
              {/* Gráfico de Curva ABC de Materiais */}
              <Card>
                <CardHeader>
                  <CardTitle>Curva ABC de Materiais</CardTitle>
                  <CardDescription>
                    Análise ABC dos materiais/insumos por valor total (Classe A: 80%, B: 95%, C: 100%)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const abcData = trpc.budgets.getAbcCurve.useQuery({ budgetId: parseInt(id!) });
                    
                    if (abcData.isLoading) {
                      return <p className="text-muted-foreground text-center py-12">Carregando...</p>;
                    }
                    
                    if (!abcData.data || abcData.data.items.length === 0) {
                      return <p className="text-muted-foreground text-center py-12">Nenhum material encontrado neste orçamento.</p>;
                    }
                    
                    return <AbcCurveChart data={abcData.data} />;
                  })()}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA 5 - GANTT */}
            <TabsContent value="gantt" className="space-y-6">
              <BudgetGantt />
            </TabsContent>

            {/* ABA 6 - ADITIVOS */}
            <TabsContent value="aditivos" className="space-y-4">
              {budgetId ? (
                <AditivosTab
                  budgetId={budgetId}
                  socialCharges={socialCharges}
                  adminCentral={adminCentral}
                  profit={profit}
                  taxes={taxes}
                  risk={risk}
                  warranty={warranty}
                  totalContrato={parseFloat(calculateTotalWithBDI())}
                  budgetTitle={formValues.title}
                  clientData={clients?.find(c => c.id.toString() === formValues.clientId) ?? null}
                  projectData={projects?.find(p => p.id.toString() === formValues.projectId) ?? null}
                  companySettings={companySettings}
                />
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <p>Salve o orçamento primeiro para gerenciar aditivos.</p>
                </div>
              )}
            </TabsContent>

            {/* ── Aba Financeiro ── */}
            {/* ── Aba Medições ── */}
            <TabsContent value="medicoes" className="space-y-4">
              {budgetId ? (
                <BudgetFinanceiro
                  budgetId={budgetId}
                  stages={stagesData.map((s: any) => ({
                    id: s.id,
                    budgetId: s.budgetId || budgetId,
                    parentStageId: s.parentStageId || null,
                    name: s.name,
                    order: s.order,
                    totalWithBdi: s.totalWithBdi || "0",
                    items: (s.items || []).map((item: any) => ({
                      id: item.id,
                      stageId: s.id,
                      type: item.type || "composition",
                      description: item.type === 'composition'
                        ? (item.composition?.description || item.description || "")
                        : (item.description || ""),
                      unit: item.type === 'composition'
                        ? (item.composition?.unit || item.unit || "")
                        : (item.unit || ""),
                      quantity: String(item.quantity || "1"),
                      materialCost: item.type === 'composition'
                        ? (item.composition?.materialCost || "0")
                        : (item.materialCost || "0"),
                      laborCost: item.type === 'composition'
                        ? (item.composition?.laborCost || "0")
                        : (item.laborCost || "0"),
                      equipmentCost: item.equipmentCost || "0",
                      serviceCost: item.serviceCost || "0",
                      otherCost: item.otherCost || "0",
                      unitCost: item.unitCost || "0",
                      totalCost: item.totalCost || "0",
                      order: item.order || 0,
                      aplicarEncargosSociais: item.aplicarEncargosSociais,
                      children: item.type === 'composite'
                        ? (item.children || []).map((child: any) => ({
                            id: child.id,
                            stageId: s.id,
                            type: child.type || "composition",
                            description: child.type === 'composition'
                              ? (child.composition?.description || child.description || "")
                              : (child.description || ""),
                            unit: child.type === 'composition'
                              ? (child.composition?.unit || child.unit || "")
                              : (child.unit || ""),
                            quantity: String(child.quantity || "1"),
                            materialCost: child.type === 'composition'
                              ? (child.composition?.materialCost || "0")
                              : (child.materialCost || "0"),
                            laborCost: child.type === 'composition'
                              ? (child.composition?.laborCost || "0")
                              : (child.laborCost || "0"),
                            equipmentCost: child.equipmentCost || "0",
                            serviceCost: child.serviceCost || "0",
                            otherCost: child.otherCost || "0",
                            unitCost: child.unitCost || "0",
                            totalCost: child.totalCost || "0",
                            order: child.order || 0,
                          }))
                        : undefined,
                    }))
                  }))}
                  bdiConfigs={bdiConfigs}
                  socialCharges={socialCharges}
                  adminCentral={adminCentral}
                  profit={profit}
                  taxes={taxes}
                  risk={risk}
                  warranty={warranty}
                  includeMaterial={includeMaterial}
                  totalContratoWithBdi={parseFloat(calculateTotalWithBDI())}
                  budgetTitle={(formValues as any).title || "Orçamento"}
                  companySettings={companySettings as any}
                />
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500 text-sm">
                    Salve o orçamento primeiro para acessar a aba Financeiro.
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── Aba Financeiro (Lançamentos) ── */}
            <TabsContent value="financeiro" className="space-y-4">
              {budgetId ? (
                <BudgetFinanceiroLancamentos budgetId={budgetId} />
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500 text-sm">
                    Salve o orçamento primeiro para acessar a aba Financeiro.
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── Aba Fluxo de Caixa ── */}
            <TabsContent value="fluxo-caixa" className="space-y-4">
              {budgetId ? (
                <BudgetCashFlow budgetId={budgetId} stagesData={stagesData} />
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-gray-500">Salve o orçamento para visualizar o fluxo de caixa.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
         </form>
      </div>
      
      {/* Diálogo para adicionar composição */}
      <Dialog open={isCompositionDialogOpen} onOpenChange={setIsCompositionDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Composição à Etapa</DialogTitle>
            <DialogDescription>
              Busque e selecione uma composição SINAPI para adicionar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Buscar Composição</Label>
              <Input
                placeholder="Digite para buscar (mínimo 2 caracteres)..."
                value={compositionSearchTerm}
                onChange={(e) => setCompositionSearchTerm(e.target.value)}
              />
            </div>
            
            {compositionSearchTerm.length >= 2 && (
              <div className="border rounded-md max-h-[300px] overflow-y-auto">
                {compositionsForDialog && compositionsForDialog.length > 0 ? (
                  <div className="divide-y">
                    {compositionsForDialog.map((comp) => (
                      <div
                        key={comp.id}
                        className={cn(
                          "p-3 cursor-pointer hover:bg-slate-50 transition-colors",
                          selectedCompositionId === comp.id && "bg-blue-50"
                        )}
                        onClick={() => setSelectedCompositionId(comp.id)}
                      >
                        <div className="font-mono text-sm text-slate-600">{comp.code}</div>
                        <div className="font-medium">{comp.description}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {comp.unit} | Material: R$ {formatCurrency(Number(comp.materialCost))} | M.O.: R$ {formatCurrency(Number(comp.laborCost))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-slate-500">
                    Nenhuma composição encontrada
                  </div>
                )}
              </div>
            )}
            
            {selectedCompositionId && (
              <div>
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={compositionQuantity}
                  onChange={(e) => setCompositionQuantity(e.target.value)}
                  placeholder="1.000"
                />
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCompositionDialogOpen(false);
                  setCompositionSearchTerm("");
                  setSelectedCompositionId(null);
                  setCompositionQuantity("1");
                  setSelectedCompositeItemId(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!selectedCompositionId || !compositionQuantity}
                onClick={async () => {
                  if (!selectedCompositionId) return;
                  
                  // Garantir que o orçamento está salvo (cria automaticamente se necessário)
                  const saved = await ensureBudgetSaved();
                  if (!saved) return;
                  const { budgetId: activeBudgetId, stageIdMap } = saved;
                  
                  try {
                    if (selectedCompositeItemId) {
                      // Adicionando composição a um Serviço Composto
                      await addCompositionToCompositeMutation.mutateAsync({
                        budgetId: activeBudgetId,
                        parentItemId: selectedCompositeItemId,
                        compositionId: selectedCompositionId,
                        quantity: parseFloat(compositionQuantity),
                      });
                    } else if (selectedStageForComposition) {
                      // Mapear ID local para ID real (caso etapa tenha sido migrada)
                      const realStageId = stageIdMap[selectedStageForComposition] ?? selectedStageForComposition;
                      // Adicionando composição a uma etapa normal
                      await addItemToStageMutation.mutateAsync({
                        budgetId: activeBudgetId,
                        stageId: realStageId,
                        compositionId: selectedCompositionId,
                        quantity: parseFloat(compositionQuantity),
                      });
                    } else {
                      return;
                    }
                    
                    toast.success("Composição adicionada com sucesso!");
                    
                    // Recarregar stages para atualizar a lista
                    await refetchStages();
                    
                    // Fechar diálogo e resetar
                    setIsCompositionDialogOpen(false);
                    setCompositionSearchTerm("");
                    setSelectedCompositionId(null);
                    setCompositionQuantity("1");
                    setSelectedCompositeItemId(null);
                  } catch (error) {
                    toast.error("Erro ao adicionar composição");
                    console.error(error);
                  }
                }}
              >
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Adicionar/Editar Serviço */}
      <AddServiceDialog
        open={isServiceDialogOpen}
        onOpenChange={(open) => {
          setIsServiceDialogOpen(open);
          if (!open) {
            setEditingServiceData(null);
          }
        }}
        editMode={!!editingServiceData}
        initialData={editingServiceData}
        onAdd={async (service) => {
          if (!selectedStageForService) return;
          // Garantir que o orçamento está salvo
          const saved = await ensureBudgetSaved();
          if (!saved) return;
          const { budgetId: activeBudgetId, stageIdMap } = saved;
          const realStageId = stageIdMap[selectedStageForService] ?? selectedStageForService;

          try {
            await addServiceItemMutation.mutateAsync({
              budgetId: activeBudgetId,
              stageId: realStageId,
              description: service.description,
              unit: service.unit,
              quantity: service.quantity,
              materialCost: service.materialCost,
              laborCost: service.laborCost,
              equipmentCost: service.equipmentCost,
              serviceCost: service.serviceCost,
              otherCost: service.otherCost,
            });

            toast.success("Serviço adicionado com sucesso!");
            await refetchStages();
          } catch (error) {
            toast.error("Erro ao adicionar serviço");
            console.error(error);
          }
        }}
        onUpdate={async (itemId, service) => {
          if (!budgetId) {
            toast.error("Orçamento não encontrado");
            return;
          }

          try {
            // Detectar se é insumo (serviceCost e otherCost são 0)
            const isInput = service.serviceCost === 0 && service.otherCost === 0;
            
            if (isInput) {
              // Atualizar insumo
              await updateInputItemMutation.mutateAsync({
                itemId,
                budgetId,
                description: service.description,
                unit: service.unit,
                quantity: service.quantity,
                materialCost: service.materialCost,
                laborCost: service.laborCost,
                equipmentCost: service.equipmentCost,
              });
              toast.success("Insumo atualizado com sucesso!");
            } else {
              // Atualizar serviço
              await updateServiceItemMutation.mutateAsync({
                itemId,
                budgetId,
                description: service.description,
                unit: service.unit,
                quantity: service.quantity,
                materialCost: service.materialCost,
                laborCost: service.laborCost,
                equipmentCost: service.equipmentCost,
                serviceCost: service.serviceCost,
                otherCost: service.otherCost,
              });
              toast.success("Serviço atualizado com sucesso!");
            }
            
            setEditingServiceData(null);
            await refetchStages();
          } catch (error) {
            console.error("Error updating:", error);
            toast.error("Erro ao atualizar: " + (error as any)?.message);
          }
        }}
      />

      {/* Dialog de Adicionar Insumo */}
      <AddInputDialog
        open={isInputDialogOpen}
        onOpenChange={(open) => {
          setIsInputDialogOpen(open);
          if (!open) setSelectedCompositeItemId(null);
        }}
        onAdd={async (inputId, quantity) => {
          // Garantir que o orçamento está salvo
          const saved = await ensureBudgetSaved();
          if (!saved) return;
          const { budgetId: activeBudgetId, stageIdMap } = saved;

          try {
            if (selectedCompositeItemId) {
              // Adicionando insumo a um Serviço Composto
              await addInputToCompositeMutation.mutateAsync({
                budgetId: activeBudgetId,
                parentItemId: selectedCompositeItemId,
                inputId: inputId,
                quantity: quantity,
              });
            } else if (selectedStageForInput) {
              // Mapear ID local para ID real
              const realStageId = stageIdMap[selectedStageForInput] ?? selectedStageForInput;
              // Adicionando insumo a uma etapa normal
              await addInputItemMutation.mutateAsync({
                budgetId: activeBudgetId,
                stageId: realStageId,
                inputId: inputId,
                quantity: quantity,
              });
            } else {
              return;
            }

            toast.success("Insumo adicionado com sucesso!");
            await refetchStages();
            setSelectedCompositeItemId(null);
          } catch (error) {
            toast.error("Erro ao adicionar insumo");
            console.error(error);
          }
        }}
      />

      {/* Dialog de Adicionar Serviço a Preço Informado dentro de Composto */}
      <AddServiceDialog
        open={isServiceToCompositeDialogOpen}
        onOpenChange={(open) => {
          setIsServiceToCompositeDialogOpen(open);
          if (!open) setSelectedCompositeItemId(null);
        }}
        editMode={false}
        initialData={undefined}
        onAdd={async (service) => {
          if (!selectedCompositeItemId) return;
          const saved = await ensureBudgetSaved();
          if (!saved) return;
          const { budgetId: activeBudgetId } = saved;

          try {
            await addServiceToCompositeMutation.mutateAsync({
              budgetId: activeBudgetId,
              parentItemId: selectedCompositeItemId,
              description: service.description,
              unit: service.unit,
              quantity: service.quantity,
              materialCost: service.materialCost,
              laborCost: service.laborCost,
              equipmentCost: service.equipmentCost,
              serviceCost: service.serviceCost,
              otherCost: service.otherCost,
            });
            toast.success("Serviço adicionado ao composto com sucesso!");
            setIsServiceToCompositeDialogOpen(false);
            setSelectedCompositeItemId(null);
            await refetchStages();
          } catch (error) {
            toast.error("Erro ao adicionar serviço ao composto");
            console.error(error);
          }
        }}
        onUpdate={async () => {}}
      />

      {/* Dialog de Editar Filho de Composto (serviço a preço informado) */}
      <AddServiceDialog
        open={isEditCompositeChildDialogOpen}
        onOpenChange={(open) => {
          setIsEditCompositeChildDialogOpen(open);
          if (!open) setEditingCompositeChild(null);
        }}
        editMode={true}
        initialData={editingCompositeChild ? {
          itemId: editingCompositeChild.itemId,
          description: editingCompositeChild.description,
          unit: editingCompositeChild.unit,
          quantity: editingCompositeChild.quantity,
          materialCost: editingCompositeChild.materialCost,
          laborCost: editingCompositeChild.laborCost,
          equipmentCost: editingCompositeChild.equipmentCost,
          serviceCost: editingCompositeChild.serviceCost,
          otherCost: editingCompositeChild.otherCost,
        } : undefined}
        onAdd={async () => {}}
        onUpdate={async (itemId, service) => {
          if (!budgetId) return;
          try {
            await updateServiceItemMutation.mutateAsync({
              itemId,
              budgetId,
              description: service.description,
              unit: service.unit,
              quantity: service.quantity,
              materialCost: service.materialCost,
              laborCost: service.laborCost,
              equipmentCost: service.equipmentCost,
              serviceCost: service.serviceCost,
              otherCost: service.otherCost,
            });
            toast.success("Serviço atualizado com sucesso!");
            setIsEditCompositeChildDialogOpen(false);
            setEditingCompositeChild(null);
            await refetchStages();
          } catch (error) {
            toast.error("Erro ao atualizar serviço: " + (error as any)?.message);
            console.error(error);
          }
        }}
      />

      {/* Modal de Serviço Composto */}
      <Dialog open={isCompositeServiceDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCompositeServiceDialogOpen(false);
          setCompositeServiceName("");
          setCompositeServiceUnit("");
          setCompositeServiceQuantity("");
          setCompositeServiceItems([]);
          setCompositeSearchTerm("");
          setCompositeSearchType('composition');
        }
      }}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-600" />
              Adicionar Serviço Composto
            </DialogTitle>
            <DialogDescription>
              Agrupe composições e insumos com unidades diferentes para calcular o custo por unidade de contratação (ex: R$/m³, R$/m²)
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Coluna esquerda: configuração do serviço */}
            <div className="space-y-4">
              <div>
                <Label>Descrição do Serviço *</Label>
                <Input
                  placeholder="Ex: Estrutura de Concreto Armado"
                  value={compositeServiceName}
                  onChange={(e) => setCompositeServiceName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Unidade de Contratação *</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={compositeServiceUnit}
                    onChange={(e) => setCompositeServiceUnit(e.target.value)}
                  >
                    <option value="">-- Selecione --</option>
                    <option value="m²">m² (metro quadrado)</option>
                    <option value="m³">m³ (metro cúbico)</option>
                    <option value="m">m (metro linear)</option>
                    <option value="kg">kg (quilograma)</option>
                    <option value="t">t (tonelada)</option>
                    <option value="un">un (unidade)</option>
                    <option value="vb">vb (verba)</option>
                    <option value="cj">cj (conjunto)</option>
                    <option value="hr">hr (hora)</option>
                  </select>
                </div>
                <div>
                  <Label>Quantidade Total *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Ex: 120"
                    value={compositeServiceQuantity}
                    onChange={(e) => setCompositeServiceQuantity(e.target.value)}
                  />
                </div>
              </div>

              {/* Resumo de custo unitário */}
              {compositeServiceItems.length > 0 && compositeServiceUnit && compositeServiceQuantity && Number(compositeServiceQuantity) > 0 && (() => {
                const totalMat = compositeServiceItems.reduce((s, i) => s + i.materialCost * i.quantity, 0);
                const totalLab = compositeServiceItems.reduce((s, i) => s + i.laborCost * i.quantity, 0);
                const totalGeral = totalMat + totalLab;
                const qty = Number(compositeServiceQuantity);
                return (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
                    <div className="font-semibold text-emerald-800 text-sm">Custo por {compositeServiceUnit}</div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="text-center">
                        <div className="text-slate-500">Material</div>
                        <div className="font-bold text-blue-700">R$ {(totalMat / qty).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-500">Mão de Obra</div>
                        <div className="font-bold text-orange-700">R$ {(totalLab / qty).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-slate-500">Total</div>
                        <div className="font-bold text-emerald-700">R$ {(totalGeral / qty).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 text-center">
                      Total geral: R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ÷ {Number(compositeServiceQuantity).toLocaleString('pt-BR')} {compositeServiceUnit}
                    </div>
                  </div>
                );
              })()}

              {/* Tabela de itens adicionados */}
              {compositeServiceItems.length > 0 && (
                <div>
                  <Label className="mb-2 block">Itens do Serviço Composto</Label>
                  <div className="border rounded-md overflow-auto max-h-[300px]">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Descrição</th>
                          <th className="text-center p-2 w-16">UN</th>
                          <th className="text-center p-2 w-20">Qtde</th>
                          <th className="text-right p-2 w-24">Mat. Unit.</th>
                          <th className="text-right p-2 w-24">M.O. Unit.</th>
                          <th className="text-right p-2 w-24">Total</th>
                          <th className="w-8 p-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {compositeServiceItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2">
                              <div className="font-mono text-xs text-slate-500">{item.code}</div>
                              <div>{item.description}</div>
                            </td>
                            <td className="text-center p-2 text-slate-500">{item.unit}</td>
                            <td className="text-center p-2">
                              <Input
                                type="number"
                                step="0.001"
                                min="0"
                                className="h-7 text-center w-20"
                                value={item.quantity}
                                onChange={(e) => {
                                  const newItems = [...compositeServiceItems];
                                  newItems[idx] = { ...newItems[idx], quantity: Number(e.target.value) || 0 };
                                  setCompositeServiceItems(newItems);
                                }}
                              />
                            </td>
                            <td className="text-right p-2 text-blue-700">R$ {item.materialCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right p-2 text-orange-700">R$ {item.laborCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right p-2 font-semibold">R$ {((item.materialCost + item.laborCost) * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="p-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                onClick={() => setCompositeServiceItems(compositeServiceItems.filter((_, i) => i !== idx))}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Coluna direita: busca de composições/insumos */}
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={compositeSearchType === 'composition' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setCompositeSearchType('composition'); setCompositeSearchTerm(""); }}
                >
                  Composições
                </Button>
                <Button
                  type="button"
                  variant={compositeSearchType === 'input' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setCompositeSearchType('input'); setCompositeSearchTerm(""); }}
                >
                  Insumos
                </Button>
              </div>

              <div>
                <Label>Buscar {compositeSearchType === 'composition' ? 'Composição' : 'Insumo'}</Label>
                <Input
                  placeholder={`Digite para buscar (mínimo 2 caracteres)...`}
                  value={compositeSearchTerm}
                  onChange={(e) => setCompositeSearchTerm(e.target.value)}
                />
              </div>

              {/* Resultados da busca */}
              {compositeSearchTerm.length >= 2 && (
                <div className="border rounded-md max-h-[400px] overflow-y-auto">
                  {compositeSearchType === 'composition' ? (
                    compositeCompositionsData && compositeCompositionsData.length > 0 ? (
                      <div className="divide-y">
                        {compositeCompositionsData.map((comp) => (
                          <div
                            key={comp.id}
                            className="p-3 cursor-pointer hover:bg-emerald-50 transition-colors"
                            onClick={() => {
                              // Verificar se já foi adicionado
                              if (compositeServiceItems.find(i => i.type === 'composition' && i.id === comp.id)) {
                                toast.info("Esta composição já foi adicionada");
                                return;
                              }
                              setCompositeServiceItems([...compositeServiceItems, {
                                type: 'composition',
                                id: comp.id,
                                code: comp.code || '',
                                description: comp.description,
                                unit: comp.unit,
                                quantity: 1,
                                materialCost: Number(comp.materialCost),
                                laborCost: Number(comp.laborCost),
                                totalCost: Number(comp.materialCost) + Number(comp.laborCost),
                              }]);
                              toast.success(`"${comp.description}" adicionado`);
                            }}
                          >
                            <div className="font-mono text-xs text-slate-500">{comp.code}</div>
                            <div className="font-medium text-sm">{comp.description}</div>
                            <div className="text-xs text-slate-500 mt-1">
                              {comp.unit} | Mat: R$ {Number(comp.materialCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | M.O.: R$ {Number(comp.laborCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-slate-500 text-sm">Nenhuma composição encontrada</div>
                    )
                  ) : (
                    (() => {
                      const filtered = (compositeInputsData || []).filter(inp =>
                        inp.description.toLowerCase().includes(compositeSearchTerm.toLowerCase()) ||
                        (inp.code || '').toLowerCase().includes(compositeSearchTerm.toLowerCase())
                      );
                      return filtered.length > 0 ? (
                        <div className="divide-y">
                          {filtered.map((inp) => (
                            <div
                              key={inp.id}
                              className="p-3 cursor-pointer hover:bg-emerald-50 transition-colors"
                              onClick={() => {
                                if (compositeServiceItems.find(i => i.type === 'input' && i.id === inp.id)) {
                                  toast.info("Este insumo já foi adicionado");
                                  return;
                                }
                                const unitCost = Number(inp.unitCost);
                                const isMat = inp.type === 'material';
                                const isLab = inp.type === 'labor';
                                setCompositeServiceItems([...compositeServiceItems, {
                                  type: 'input',
                                  id: inp.id,
                                  code: inp.code || '',
                                  description: inp.description,
                                  unit: inp.unit,
                                  quantity: 1,
                                  materialCost: isMat ? unitCost : 0,
                                  laborCost: isLab ? unitCost : 0,
                                  totalCost: unitCost,
                                }]);
                                toast.success(`"${inp.description}" adicionado`);
                              }}
                            >
                              <div className="font-mono text-xs text-slate-500">{inp.code}</div>
                              <div className="font-medium text-sm">{inp.description}</div>
                              <div className="text-xs text-slate-500 mt-1">
                                {inp.unit} | {inp.type === 'material' ? 'Material' : inp.type === 'labor' ? 'Mão de Obra' : 'Equipamento'} | R$ {Number(inp.unitCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-slate-500 text-sm">Nenhum insumo encontrado</div>
                      );
                    })()
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-slate-500">
              {compositeServiceItems.length} {compositeServiceItems.length === 1 ? 'item adicionado' : 'itens adicionados'}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCompositeServiceDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!compositeServiceName || !compositeServiceUnit || !compositeServiceQuantity || compositeServiceItems.length === 0 || isSavingComposite}
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={async () => {
                  if (!budgetId || !compositeServiceStageId) {
                    toast.error("Salve o orçamento antes de adicionar serviços compostos");
                    return;
                  }
                  setIsSavingComposite(true);
                  try {
                    // 1. Criar sub-etapa com serviceUnit e serviceQuantity
                    const newStage = await createStageMutation.mutateAsync({
                      budgetId,
                      parentStageId: compositeServiceStageId,
                      name: compositeServiceName,
                      serviceUnit: compositeServiceUnit,
                      serviceQuantity: Number(compositeServiceQuantity),
                    });

                    // 2. Adicionar cada item à sub-etapa
                    for (const item of compositeServiceItems) {
                      if (item.type === 'composition') {
                        await addItemToStageMutation.mutateAsync({
                          budgetId,
                          stageId: newStage.id,
                          compositionId: item.id,
                          quantity: item.quantity,
                        });
                      } else {
                        await addInputItemMutation.mutateAsync({
                          budgetId,
                          stageId: newStage.id,
                          inputId: item.id,
                          quantity: item.quantity,
                        });
                      }
                    }

                    toast.success(`Serviço composto "${compositeServiceName}" criado com ${compositeServiceItems.length} itens!`);
                    await refetchStages();
                    setIsCompositeServiceDialogOpen(false);
                    setCompositeServiceName("");
                    setCompositeServiceUnit("");
                    setCompositeServiceQuantity("");
                    setCompositeServiceItems([]);
                    setCompositeSearchTerm("");
                  } catch (error) {
                    toast.error("Erro ao criar serviço composto");
                    console.error(error);
                  } finally {
                    setIsSavingComposite(false);
                  }
                }}
              >
                {isSavingComposite ? "Salvando..." : "Criar Serviço Composto"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Edição do Serviço Composto */}
      <Dialog open={isEditCompositeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsEditCompositeDialogOpen(false);
          setEditingCompositeItem(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-emerald-600" />
              Editar Serviço Composto
            </DialogTitle>
            <DialogDescription>
              Altere a descrição, unidade e quantidade do serviço composto.
            </DialogDescription>
          </DialogHeader>
          {editingCompositeItem && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="edit-composite-description">Descrição</Label>
                <Input
                  id="edit-composite-description"
                  value={editingCompositeItem.description}
                  onChange={(e) => setEditingCompositeItem(prev => prev ? { ...prev, description: e.target.value } : null)}
                  placeholder="Descrição do serviço composto"
                  className="w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-composite-unit">Unidade</Label>
                  <Input
                    id="edit-composite-unit"
                    value={editingCompositeItem.unit}
                    onChange={(e) => setEditingCompositeItem(prev => prev ? { ...prev, unit: e.target.value } : null)}
                    placeholder="Ex: m³, m², un"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-composite-quantity">Quantidade</Label>
                  <Input
                    id="edit-composite-quantity"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingCompositeItem.quantity}
                    onChange={(e) => setEditingCompositeItem(prev => prev ? { ...prev, quantity: e.target.value } : null)}
                    placeholder="Ex: 10.00"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditCompositeDialogOpen(false);
              setEditingCompositeItem(null);
            }}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!editingCompositeItem?.description?.trim() || !editingCompositeItem?.unit?.trim() || updateCompositeItemMutation.isPending}
              onClick={async () => {
                if (!editingCompositeItem || !budgetId) return;
                try {
                  await updateCompositeItemMutation.mutateAsync({
                    itemId: editingCompositeItem.id,
                    budgetId: budgetId,
                    description: editingCompositeItem.description.trim(),
                    unit: editingCompositeItem.unit.trim(),
                    quantity: Number(editingCompositeItem.quantity) || 1,
                  });
                  toast.success("Serviço composto atualizado com sucesso!");
                  setIsEditCompositeDialogOpen(false);
                  setEditingCompositeItem(null);
                  refetchStages();
                } catch (error) {
                  toast.error("Erro ao atualizar serviço composto");
                  console.error(error);
                }
              }}
            >
              {updateCompositeItemMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
