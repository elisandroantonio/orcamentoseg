import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Package, ArrowLeft, Search, RefreshCw, Pencil, Trash2,
  ChevronDown, ChevronRight, Download, FileText, PlusCircle
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const fmt = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtQty = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// Remove acento, uppercase, colapsa espaços — usado pra chave de agrupamento,
// categorização e comparação de similaridade (tudo que precisa comparar
// texto ignorando grafia).
const normalizeText = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

// ── Categorização de materiais (aba Resumo Geral) ───────────────────────
// Classifica pela descrição, por palavra-chave, pra organizar a lista de
// compra em seções — como numa loja de material de construção. Palavras
// curtas/ambíguas ("CAL", "AÇO", "PVC"...) exigem bater a palavra inteira
// (exact) pra não confundir com "CALHA", "ESPAÇO" etc.
interface MaterialKeyword { text: string; exact?: boolean }
const MATERIAL_CATEGORIES: { name: string; keywords: MaterialKeyword[] }[] = [
  { name: "Cimento e Argamassa", keywords: [
    { text: "CIMENTO" }, { text: "ARGAMASSA" }, { text: "CAL HIDRATADA" }, { text: "CAL VIRGEM" },
    { text: "ADITIVO" }, { text: "REJUNTE" }, { text: "CAL", exact: true },
  ]},
  { name: "Agregados", keywords: [
    { text: "AREIA" }, { text: "BRITA" }, { text: "PEDRISCO" }, { text: "CASCALHO" }, { text: "SEIXO" }, { text: "RACHAO" },
  ]},
  { name: "Aço e Ferragem", keywords: [
    { text: "ACO", exact: true }, { text: "VERGALHAO" }, { text: "ARAME" }, { text: "PREGO" },
    { text: "PARAFUSO" }, { text: "TELA SOLDADA" }, { text: "ESTRIBO" }, { text: "FERRAGEM" },
  ]},
  { name: "Alvenaria e Revestimento", keywords: [
    { text: "TIJOLO" }, { text: "BLOCO" }, { text: "TELHA" }, { text: "CERAMIC" }, { text: "PORCELANATO" },
    { text: "AZULEJO" }, { text: "PISO" }, { text: "REVESTIMENTO" }, { text: "CONTRAPISO" },
  ]},
  { name: "Madeira", keywords: [
    { text: "MADEIRA" }, { text: "COMPENSADO" }, { text: "SARRAFO" }, { text: "CAIBRO" }, { text: "TABUA" },
  ]},
  { name: "Elétrica", keywords: [
    { text: "ELETRIC" }, { text: "CABO" }, { text: "DISJUNTOR" }, { text: "ELETRODUTO" }, { text: "TOMADA" },
    { text: "INTERRUPTOR" }, { text: "LUMINARIA" }, { text: "FIO", exact: true },
  ]},
  { name: "Hidráulica", keywords: [
    { text: "HIDRAULIC" }, { text: "TUBO" }, { text: "CANO", exact: true }, { text: "PVC", exact: true },
    { text: "CONEXAO" }, { text: "REGISTRO" }, { text: "VALVULA" }, { text: "CAIXA DAGUA" },
  ]},
  { name: "Tintas e Acabamento", keywords: [
    { text: "TINTA" }, { text: "VERNIZ" }, { text: "MASSA CORRIDA" }, { text: "SELADOR" }, { text: "TEXTURA" },
  ]},
  { name: "Esquadrias e Vidros", keywords: [
    { text: "ESQUADRIA" }, { text: "JANELA" }, { text: "VIDRO" }, { text: "BATENTE" }, { text: "PORTA", exact: true },
  ]},
  { name: "Impermeabilização", keywords: [
    { text: "IMPERMEABILIZ" }, { text: "MANTA ASFALTICA" },
  ]},
];
const OUTROS_CATEGORY = "Outros";

function categorizeMaterial(description: string): string {
  const desc = normalizeText(description);
  for (const cat of MATERIAL_CATEGORIES) {
    for (const kw of cat.keywords) {
      const pattern = kw.exact ? `\\b${kw.text}\\b` : `\\b${kw.text}`;
      if (new RegExp(pattern).test(desc)) return cat.name;
    }
  }
  return OUTROS_CATEGORY;
}

// ── Arredondamento pra unidade de compra ────────────────────────────────
// Só cimento por enquanto (saco de 50kg é praticamente padrão nacional).
// Outros materiais (cal, argamassa industrializada etc.) têm tamanho de
// embalagem variável — evitar chutar até confirmar o tamanho real usado.
interface PackagingRule { keyword: string; unit: string; packageSize: number; packageLabel: string }
const PACKAGING_RULES: PackagingRule[] = [
  { keyword: "CIMENTO", unit: "KG", packageSize: 50, packageLabel: "sacos de 50kg" },
];

function suggestPurchaseUnit(description: string, unit: string, quantity: number): string | null {
  const desc = normalizeText(description);
  const normUnit = normalizeText(unit);
  const rule = PACKAGING_RULES.find((r) => r.unit === normUnit && new RegExp(`\\b${r.keyword}`).test(desc));
  if (!rule || quantity <= 0) return null;
  const packages = Math.ceil(quantity / rule.packageSize);
  return `${packages} ${rule.packageLabel}`;
}

// ── Similaridade de descrição (assistente de mesclagem) ─────────────────
function wordSet(description: string): Set<string> {
  return new Set(normalizeText(description).split(" ").filter((w) => w.length > 2));
}
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of Array.from(a)) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface EditItemForm {
  id: number;
  description: string;
  unit: string;
  quantity: string;
  unitCost: string;
}

export default function MaterialListView({ params }: { params: { id: string } }) {
  const listId = parseInt(params.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: list, isLoading } = trpc.materialLists.getById.useQuery({ id: listId });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "input" | "service" | "manual">("all");
  // Busca e filtro próprios da aba "Resumo Geral" — independentes da aba
  // "Por Orçamento/Etapa", já que são usos diferentes (uma é pra navegar a
  // estrutura, a outra é pra achar rápido "quanto de cimento eu preciso").
  const [summarySearch, setSummarySearch] = useState("");
  const [summaryTypeFilter, setSummaryTypeFilter] = useState<"all" | "input" | "service" | "manual">("all");
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [expandedBudgets, setExpandedBudgets] = useState<Set<number | string>>(new Set());
  const [editItem, setEditItem] = useState<EditItemForm | null>(null);
  const [regeneratingBudgetId, setRegeneratingBudgetId] = useState<number | string | null>(null);
  const [addManualOpen, setAddManualOpen] = useState(false);
  const [addManualForm, setAddManualForm] = useState({ description: "", unit: "", quantity: "1", unitCost: "0", stageName: "" });

  const updateItemMutation = trpc.materialLists.updateItem.useMutation({
    onSuccess: () => {
      utils.materialLists.getById.invalidate({ id: listId });
      toast.success("Item atualizado");
      setEditItem(null);
    },
    onError: (e) => toast.error(e.message || "Erro ao atualizar item"),
  });

  const deleteItemMutation = trpc.materialLists.deleteItem.useMutation({
    onSuccess: () => {
      utils.materialLists.getById.invalidate({ id: listId });
      toast.success("Item removido");
    },
    onError: () => toast.error("Erro ao remover item"),
  });

  const regenerateMutation = trpc.materialLists.regenerate.useMutation({
    onSuccess: (data) => {
      utils.materialLists.getById.invalidate({ id: listId });
      toast.success(`Lista regenerada com ${data.count} itens`);
      setRegeneratingBudgetId(null);
    },
    onError: (e) => {
      toast.error(e.message || "Erro ao regenerar lista");
      setRegeneratingBudgetId(null);
    },
  });

  const addManualMutation = trpc.materialLists.addManualItem.useMutation({
    onSuccess: () => {
      utils.materialLists.getById.invalidate({ id: listId });
      toast.success("Item adicionado");
      setAddManualOpen(false);
      setAddManualForm({ description: "", unit: "", quantity: "1", unitCost: "0", stageName: "" });
    },
    onError: (e) => toast.error(e.message || "Erro ao adicionar item"),
  });

  const handleAddManual = () => {
    const qty = parseFloat(addManualForm.quantity.replace(",", "."));
    const uc = parseFloat(addManualForm.unitCost.replace(",", "."));
    if (!addManualForm.description.trim() || !addManualForm.unit.trim()) {
      toast.error("Preencha descrição e unidade");
      return;
    }
    addManualMutation.mutate({
      materialListId: listId,
      description: addManualForm.description.trim(),
      unit: addManualForm.unit.trim(),
      quantity: isNaN(qty) ? 1 : qty,
      unitCost: isNaN(uc) ? 0 : uc,
      stageName: addManualForm.stageName.trim() || undefined,
    });
  };

  const handleRegenerate = (budgetId: number | string) => {
    if (typeof budgetId !== "number") return; // itens manuais não têm orçamento para regenerar
    setRegeneratingBudgetId(budgetId);
    regenerateMutation.mutate({ materialListId: listId, budgetId });
  };

  const handleSaveEdit = () => {
    if (!editItem) return;
    updateItemMutation.mutate({
      id: editItem.id,
      description: editItem.description,
      unit: editItem.unit,
      quantity: parseFloat(editItem.quantity.replace(",", ".")),
      unitCost: parseFloat(editItem.unitCost.replace(",", ".")),
    });
  };

  const toggleStage = (key: string) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleBudget = (budgetId: number | string) => {
    setExpandedBudgets((prev) => {
      const next = new Set(prev);
      next.has(budgetId) ? next.delete(budgetId) : next.add(budgetId);
      return next;
    });
  };

  // Agrupar itens por orçamento → etapa
  const grouped = useMemo(() => {
    if (!list?.items) return [];
    const q = search.toLowerCase().trim();

    // Filtrar por busca e tipo
    const filtered = list.items.filter((item: any) => {
      const matchesSearch = !q ||
        item.description?.toLowerCase().includes(q) ||
        item.sinapiCode?.toLowerCase().includes(q) ||
        item.stageName?.toLowerCase().includes(q);
      const matchesType = typeFilter === "all" || item.itemType === typeFilter;
      return matchesSearch && matchesType;
    });

    // Agrupar por budgetId
    const budgetMap = new Map<number | string, { budgetTitle: string; stages: Map<string, { stageName: string; items: any[] }> }>();

    for (const item of filtered) {
      const budgetKey: number | string = item.budgetId ?? "manual";
      if (!budgetMap.has(budgetKey)) {
        const budgetInfo = item.budgetId ? list.budgets?.find((b: any) => b.budgetId === item.budgetId) : null;
        budgetMap.set(budgetKey, {
          budgetTitle: budgetInfo?.budgetTitle || (item.budgetId ? `Orçamento #${item.budgetId}` : "Itens Manuais"),
          stages: new Map(),
        });
      }
      const budgetGroup = budgetMap.get(budgetKey)!;
      const stageKey = item.stageName || "Sem etapa";
      if (!budgetGroup.stages.has(stageKey)) {
        budgetGroup.stages.set(stageKey, { stageName: stageKey, items: [] });
      }
      budgetGroup.stages.get(stageKey)!.items.push(item);
    }

    return Array.from(budgetMap.entries()).map(([budgetId, group]) => ({
      budgetId,
      budgetTitle: group.budgetTitle,
      stages: Array.from(group.stages.values()),
    }));
  }, [list, search, typeFilter]);

  // Regras de mesclagem manual (assistente de duplicados) — valem pra
  // qualquer lista do usuário, não só esta.
  const { data: mergeRules = [] } = trpc.materialMergeRules.list.useQuery();
  const createMergeRule = trpc.materialMergeRules.create.useMutation({
    onSuccess: () => {
      utils.materialMergeRules.list.invalidate();
      toast.success("Materiais mesclados.");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao mesclar materiais"),
  });
  const deleteMergeRule = trpc.materialMergeRules.delete.useMutation({
    onSuccess: () => {
      utils.materialMergeRules.list.invalidate();
      toast.success("Mesclagem desfeita.");
    },
    onError: () => toast.error("Erro ao desfazer mesclagem"),
  });

  // Resumo geral: somar todos os itens do mesmo material — mesmo quando
  // vêm de composições diferentes com inputId distinto (ex: "Cimento
  // CP-II-32" cadastrado em duas composições separadas). Consolidar por
  // inputId sozinho fragmentava a lista: cada composição podia referenciar
  // seu próprio registro de insumo pro "mesmo" material físico. Agora a
  // chave é o código SINAPI (quando existe) ou a descrição normalizada
  // (sem acento, maiúsculas, espaços duplicados) + unidade — assim
  // variações de grafia/capitalização caem na mesma linha. Por cima disso,
  // aplica as regras de mesclagem manual (assistente de duplicados) pra
  // juntar os casos que a consolidação automática não pega sozinha.
  const summary = useMemo(() => {
    if (!list?.items) return [];
    const q = summarySearch.toLowerCase().trim();
    const filtered = list.items.filter((item: any) => {
      const matchesSearch = !q ||
        item.description?.toLowerCase().includes(q) ||
        item.sinapiCode?.toLowerCase().includes(q);
      const matchesType = summaryTypeFilter === "all" || item.itemType === summaryTypeFilter;
      return matchesSearch && matchesType;
    });

    const map = new Map<string, {
      sinapiCode: string | null;
      description: string;
      unit: string;
      quantity: number;
      totalCost: number;
      variants: Set<string>;
    }>();
    for (const item of filtered) {
      const normUnit = normalizeText(item.unit);
      const normCode = item.sinapiCode ? normalizeText(item.sinapiCode) : null;
      const key = normCode
        ? `code_${normCode}_${normUnit}`
        : `desc_${normalizeText(item.description)}_${normUnit}`;
      if (!map.has(key)) {
        map.set(key, {
          sinapiCode: item.sinapiCode || null,
          description: item.description,
          unit: item.unit,
          quantity: 0,
          totalCost: 0,
          variants: new Set(),
        });
      }
      const entry = map.get(key)!;
      entry.quantity += parseFloat(item.quantity || "0");
      entry.totalCost += parseFloat(item.totalCost || "0");
      entry.variants.add(item.description);
    }

    // Aplica as regras de mesclagem manual: redireciona cada sourceKey pro
    // targetKey escolhido como canônico, somando os valores.
    const rulesBySource = new Map((mergeRules as any[]).map((r) => [r.sourceKey, r]));
    for (const [key, entry] of Array.from(map.entries())) {
      const rule = rulesBySource.get(key);
      if (!rule) continue;
      const targetKey = rule.targetKey;
      if (!map.has(targetKey)) {
        map.set(targetKey, {
          sinapiCode: null,
          description: rule.targetDescription || entry.description,
          unit: rule.targetUnit || entry.unit,
          quantity: 0,
          totalCost: 0,
          variants: new Set(),
        });
      }
      const target = map.get(targetKey)!;
      target.quantity += entry.quantity;
      target.totalCost += entry.totalCost;
      entry.variants.forEach((v) => target.variants.add(v));
      map.delete(key);
    }

    return Array.from(map.entries())
      .map(([key, e]) => ({
        key,
        sinapiCode: e.sinapiCode,
        description: e.description,
        unit: e.unit,
        category: categorizeMaterial(e.description),
        purchaseSuggestion: suggestPurchaseUnit(e.description, e.unit, e.quantity),
        quantity: e.quantity,
        // Custo unitário derivado do total ÷ quantidade consolidada — garante
        // que Custo Unit. × Qtde Total sempre bate com o Custo Total exibido,
        // mesmo quando os itens mesclados tinham custos unitários levemente
        // diferentes entre composições.
        unitCost: e.quantity > 0 ? e.totalCost / e.quantity : 0,
        totalCost: e.totalCost,
        variantCount: e.variants.size,
        variantList: Array.from(e.variants),
      }))
      .sort((a, b) => a.description.localeCompare(b.description));
  }, [list, summarySearch, summaryTypeFilter, mergeRules]);

  // Agrupa o resumo por categoria, na ordem definida em MATERIAL_CATEGORIES
  // (Outros sempre por último).
  const summaryByCategory = useMemo(() => {
    const order = [...MATERIAL_CATEGORIES.map((c) => c.name), OUTROS_CATEGORY];
    const groups = new Map<string, typeof summary>();
    for (const item of summary) {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category)!.push(item);
    }
    return order
      .filter((name) => groups.has(name))
      .map((name) => ({
        category: name,
        items: groups.get(name)!,
        subtotal: groups.get(name)!.reduce((sum, i) => sum + i.totalCost, 0),
      }));
  }, [summary]);

  // Assistente de mesclagem: sugere pares de materiais parecidos (mesma
  // unidade, descrição similar) que a consolidação automática não juntou —
  // ex: um com código SINAPI, outro sem. Roda sobre o resumo já consolidado,
  // então pares já mesclados (manual ou automaticamente) não aparecem mais.
  const duplicateCandidates = useMemo(() => {
    const candidates: { a: (typeof summary)[number]; b: (typeof summary)[number]; score: number }[] = [];
    for (let i = 0; i < summary.length; i++) {
      for (let j = i + 1; j < summary.length; j++) {
        const a = summary[i];
        const b = summary[j];
        if (normalizeText(a.unit) !== normalizeText(b.unit)) continue;
        const score = jaccardSimilarity(wordSet(a.description), wordSet(b.description));
        if (score >= 0.4) candidates.push({ a, b, score });
      }
    }
    return candidates.sort((x, y) => y.score - x.score).slice(0, 20);
  }, [summary]);

  const handleMerge = (keep: (typeof summary)[number], discard: (typeof summary)[number]) => {
    createMergeRule.mutate({
      sourceKey: discard.key,
      targetKey: keep.key,
      targetDescription: keep.description,
      targetUnit: keep.unit,
    });
  };

  const grandTotal = useMemo(
    () => summary.reduce((acc, item) => acc + item.totalCost, 0),
    [summary]
  );

  // Inicializar expansão de todos os orçamentos ao carregar
  useMemo(() => {
    if (list?.budgets) {
      const ids: (number | string)[] = list.budgets.map((b: any) => b.budgetId as number);
      setExpandedBudgets(new Set(ids));
    }
  }, [list?.budgets?.length]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center text-gray-400">Carregando...</div>
      </DashboardLayout>
    );
  }

  if (!list) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center text-gray-500">Lista não encontrada.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link href="/material-lists">
            <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 truncate">
              <Package className="h-5 w-5 text-blue-600 shrink-0" />
              {list.name}
            </h1>
            {list.description && (
              <p className="text-xs text-gray-500 mt-0.5">{list.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => exportToExcel(list, grouped, summary, grandTotal)}
            >
              <Download className="h-3.5 w-3.5" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => exportToPdf(list, grouped, summary, grandTotal)}
            >
              <FileText className="h-3.5 w-3.5" />
              PDF
            </Button>
          </div>
        </div>

        <Tabs defaultValue="por-orcamento" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="por-orcamento">Por Orçamento / Etapa</TabsTrigger>
            <TabsTrigger value="resumo">Resumo Geral</TabsTrigger>
          </TabsList>

          <TabsContent value="por-orcamento">
        {/* Barra de filtros */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por descrição ou código SINAPI..."
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="h-9 w-[210px] text-sm">
              <SelectValue placeholder="Tipo de item" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="input">Insumos SINAPI</SelectItem>
              <SelectItem value="service">Serviços a preço informado</SelectItem>
              <SelectItem value="manual">Itens manuais</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-9 gap-1.5 text-xs shrink-0"
            onClick={() => setAddManualOpen(true)}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Adicionar item
          </Button>
        </div>

        {/* Seção por orçamento */}
        {grouped.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {search ? "Nenhum item encontrado para esta busca." : "Nenhum item nesta lista."}
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((budgetGroup) => (
              <div key={budgetGroup.budgetId} className="border rounded-lg overflow-hidden">
                {/* Cabeçalho do orçamento */}
                <div
                  className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b cursor-pointer select-none"
                  onClick={() => toggleBudget(budgetGroup.budgetId)}
                >
                  <div className="flex items-center gap-2">
                    {expandedBudgets.has(budgetGroup.budgetId) ? (
                      <ChevronDown className="h-4 w-4 text-blue-600" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-blue-600" />
                    )}
                    <span className="font-semibold text-blue-800 text-sm">
                      Orçamento: {budgetGroup.budgetTitle}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-blue-600 hover:text-blue-800"
                    disabled={regeneratingBudgetId === budgetGroup.budgetId}
                    onClick={(e) => { e.stopPropagation(); handleRegenerate(budgetGroup.budgetId); }}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${regeneratingBudgetId === budgetGroup.budgetId ? "animate-spin" : ""}`} />
                    Regenerar
                  </Button>
                </div>

                {expandedBudgets.has(budgetGroup.budgetId) && (
                  <div className="divide-y">
                    {budgetGroup.stages.map((stage) => {
                      const stageKey = `${budgetGroup.budgetId}_${stage.stageName}`;
                      const isOpen = expandedStages.has(stageKey) || expandedStages.size === 0;
                      const stageTotal = stage.items.reduce(
                        (acc: number, item: any) => acc + parseFloat(item.totalCost || "0"), 0
                      );

                      return (
                        <div key={stageKey}>
                          {/* Cabeçalho da etapa */}
                          <div
                            className="flex items-center justify-between px-4 py-2.5 bg-gray-50 cursor-pointer select-none hover:bg-gray-100"
                            onClick={() => toggleStage(stageKey)}
                          >
                            <div className="flex items-center gap-2">
                              {isOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                              )}
                              <span className="text-sm font-medium text-gray-700">{stage.stageName}</span>
                              <span className="text-xs text-gray-400">({stage.items.length} item(s))</span>
                            </div>
                            <span className="text-sm font-semibold text-gray-700">{fmt(stageTotal)}</span>
                          </div>

                          {/* Tabela de itens */}
                          {isOpen && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-100 text-gray-500 uppercase">
                                    <th className="text-left px-3 py-2 font-medium w-24">Cód. SINAPI</th>
                                    <th className="text-left px-3 py-2 font-medium">Descrição</th>
                                    <th className="text-center px-3 py-2 font-medium w-16">UN</th>
                                    <th className="text-right px-3 py-2 font-medium w-24">Quantidade</th>
                                    <th className="text-right px-3 py-2 font-medium w-28">Custo Unit.</th>
                                    <th className="text-right px-3 py-2 font-medium w-28">Custo Total</th>
                                    <th className="text-center px-3 py-2 font-medium w-20">Ações</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {stage.items.map((item: any) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                      <td className="px-3 py-2 text-gray-500 font-mono">
                                        {item.sinapiCode || "—"}
                                      </td>
                                      <td className="px-3 py-2 text-gray-800">
                                        {item.description}
                                        {item.itemType === "service" && (
                                          <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-600 px-1 py-0.5 rounded">
                                            Preço Inf.
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-center text-gray-600">{item.unit}</td>
                                      <td className="px-3 py-2 text-right text-gray-700">{fmtQty(item.quantity)}</td>
                                      <td className="px-3 py-2 text-right text-gray-700">{fmt(item.unitCost)}</td>
                                      <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmt(item.totalCost)}</td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            className="p-1 text-gray-400 hover:text-blue-600 rounded"
                                            onClick={() =>
                                              setEditItem({
                                                id: item.id,
                                                description: item.description,
                                                unit: item.unit,
                                                quantity: fmtQty(item.quantity),
                                                unitCost: Number(item.unitCost).toFixed(2),
                                              })
                                            }
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </button>
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <button className="p-1 text-gray-400 hover:text-red-600 rounded">
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>Remover item?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  O item "{item.description}" será removido desta lista.
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction
                                                  className="bg-red-600 hover:bg-red-700"
                                                  onClick={() => deleteItemMutation.mutate({ id: item.id })}
                                                >
                                                  Remover
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-gray-50 font-semibold text-xs text-gray-600">
                                    <td colSpan={5} className="px-3 py-2 text-right">Subtotal da etapa:</td>
                                    <td className="px-3 py-2 text-right text-gray-800">{fmt(stageTotal)}</td>
                                    <td />
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
          </TabsContent>

          <TabsContent value="resumo">
            {/* Busca por palavra-chave — própria desta aba */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={summarySearch}
                  onChange={(e) => setSummarySearch(e.target.value)}
                  placeholder="Buscar por palavra-chave (ex: cimento, tijolo, areia)..."
                  className="pl-9 h-9 text-sm"
                  autoFocus
                />
              </div>
              <Select value={summaryTypeFilter} onValueChange={(v) => setSummaryTypeFilter(v as typeof summaryTypeFilter)}>
                <SelectTrigger className="h-9 w-[210px] text-sm">
                  <SelectValue placeholder="Tipo de item" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="input">Insumos SINAPI</SelectItem>
                  <SelectItem value="service">Serviços a preço informado</SelectItem>
                  <SelectItem value="manual">Itens manuais</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {summary.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                {summarySearch ? "Nenhum material encontrado para esta busca." : "Nenhum item nesta lista."}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-800 text-white flex items-center justify-between">
                    <h2 className="font-bold text-sm">Resumo Geral — Todos os Insumos Somados</h2>
                    <span className="text-xs text-gray-300">{summary.length} material(is)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-100 text-gray-500 uppercase">
                          <th className="text-left px-3 py-2 font-medium w-24">Cód. SINAPI</th>
                          <th className="text-left px-3 py-2 font-medium">Descrição</th>
                          <th className="text-center px-3 py-2 font-medium w-16">UN</th>
                          <th className="text-right px-3 py-2 font-medium w-28">Qtde Total</th>
                          <th className="text-left px-3 py-2 font-medium w-32">Compra sugerida</th>
                          <th className="text-right px-3 py-2 font-medium w-28">Custo Unit.</th>
                          <th className="text-right px-3 py-2 font-medium w-28">Custo Total</th>
                        </tr>
                      </thead>
                      {summaryByCategory.map((group) => (
                        <tbody key={group.category} className="divide-y divide-gray-100">
                          <tr className="bg-blue-50">
                            <td colSpan={7} className="px-3 py-1.5 font-semibold text-blue-700 text-[11px] uppercase tracking-wide">
                              {group.category} <span className="text-blue-400 font-normal normal-case">({group.items.length})</span>
                            </td>
                          </tr>
                          {group.items.map((item) => (
                            <tr key={item.key} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-500 font-mono">{item.sinapiCode || "—"}</td>
                              <td className="px-3 py-2 text-gray-800">
                                {item.description}
                                {item.variantCount > 1 && (
                                  <span
                                    title={`Consolidado de ${item.variantCount} variações de descrição encontradas nas composições:\n${item.variantList.join("\n")}`}
                                    className="ml-1.5 text-[10px] bg-purple-100 text-purple-600 px-1 py-0.5 rounded cursor-help"
                                  >
                                    {item.variantCount}x mesclado
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center text-gray-600">{item.unit}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{fmtQty(item.quantity)}</td>
                              <td className="px-3 py-2 text-left text-gray-500">{item.purchaseSuggestion || "—"}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{fmt(item.unitCost)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmt(item.totalCost)}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-3 py-1.5 text-right text-gray-500 font-medium">Subtotal {group.category}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-gray-700">{fmt(group.subtotal)}</td>
                          </tr>
                        </tbody>
                      ))}
                      <tfoot>
                        <tr className="bg-blue-600 text-white font-bold text-xs">
                          <td colSpan={6} className="px-3 py-3 text-right">TOTAL GERAL</td>
                          <td className="px-3 py-3 text-right text-base">{fmt(grandTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {duplicateCandidates.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
                      <h2 className="font-bold text-sm text-amber-800">Possíveis materiais duplicados</h2>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        Materiais com descrição parecida e mesma unidade que talvez sejam o mesmo item. Escolha qual descrição manter.
                      </p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {duplicateCandidates.map((c, idx) => (
                        <div key={idx} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-800 truncate">
                              {c.a.description} <span className="text-gray-400">×</span> {c.b.description}
                            </div>
                            <div className="text-gray-400 text-[10px]">{c.a.unit} · similaridade {(c.score * 100).toFixed(0)}%</div>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => handleMerge(c.a, c.b)}>
                              Usar "{c.a.description.length > 20 ? c.a.description.slice(0, 20) + "…" : c.a.description}"
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => handleMerge(c.b, c.a)}>
                              Usar "{c.b.description.length > 20 ? c.b.description.slice(0, 20) + "…" : c.b.description}"
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {mergeRules.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b">
                      <h2 className="font-bold text-sm text-gray-700">Mesclagens ativas</h2>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {(mergeRules as any[]).map((rule) => (
                        <div key={rule.id} className="px-4 py-2 flex items-center justify-between gap-3 text-xs">
                          <div className="text-gray-600">
                            Mesclado em <span className="font-medium text-gray-800">{rule.targetDescription || rule.targetKey}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] text-red-500 hover:text-red-600"
                            onClick={() => deleteMergeRule.mutate({ id: rule.id })}
                          >
                            Desfazer
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Dialog: Editar item */}
        <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) setEditItem(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Item</DialogTitle>
            </DialogHeader>
            {editItem && (
              <div className="space-y-3 py-2">
                <div>
                  <Label className="text-xs font-medium">Descrição</Label>
                  <Input
                    value={editItem.description}
                    onChange={(e) => setEditItem((p) => p ? { ...p, description: e.target.value } : p)}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium">Unidade</Label>
                    <Input
                      value={editItem.unit}
                      onChange={(e) => setEditItem((p) => p ? { ...p, unit: e.target.value } : p)}
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Quantidade</Label>
                    <Input
                      value={editItem.quantity}
                      onChange={(e) => setEditItem((p) => p ? { ...p, quantity: e.target.value } : p)}
                      className="mt-1 h-9 text-sm"
                      inputMode="decimal"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium">Custo Unitário (R$)</Label>
                  <Input
                    value={editItem.unitCost}
                    onChange={(e) => setEditItem((p) => p ? { ...p, unitCost: e.target.value } : p)}
                    className="mt-1 h-9 text-sm"
                    inputMode="decimal"
                  />
                </div>
                <div className="bg-gray-50 rounded px-3 py-2 text-xs text-gray-600">
                  Total calculado:{" "}
                  <span className="font-bold text-gray-800">
                    {fmt(
                      parseFloat(editItem.quantity.replace(",", ".") || "0") *
                      parseFloat(editItem.unitCost.replace(",", ".") || "0")
                    )}
                  </span>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditItem(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={updateItemMutation.isPending}>
                {updateItemMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Adicionar item manual */}
        <Dialog open={addManualOpen} onOpenChange={(open) => { if (!open) setAddManualOpen(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar Item Manual</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-xs font-medium">Descrição <span className="text-red-500">*</span></Label>
                <Input
                  value={addManualForm.description}
                  onChange={(e) => setAddManualForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Ex: Areia média lavada"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Etapa / Grupo (opcional)</Label>
                <Input
                  value={addManualForm.stageName}
                  onChange={(e) => setAddManualForm((p) => ({ ...p, stageName: e.target.value }))}
                  placeholder="Ex: Fundações"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Unidade <span className="text-red-500">*</span></Label>
                  <Input
                    value={addManualForm.unit}
                    onChange={(e) => setAddManualForm((p) => ({ ...p, unit: e.target.value }))}
                    placeholder="Ex: m³, kg, un"
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium">Quantidade</Label>
                  <Input
                    value={addManualForm.quantity}
                    onChange={(e) => setAddManualForm((p) => ({ ...p, quantity: e.target.value }))}
                    className="mt-1 h-9 text-sm"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium">Custo Unitário (R$)</Label>
                <Input
                  value={addManualForm.unitCost}
                  onChange={(e) => setAddManualForm((p) => ({ ...p, unitCost: e.target.value }))}
                  className="mt-1 h-9 text-sm"
                  inputMode="decimal"
                />
              </div>
              <div className="bg-gray-50 rounded px-3 py-2 text-xs text-gray-600">
                Total calculado:{" "}
                <span className="font-bold text-gray-800">
                  {fmt(
                    parseFloat(addManualForm.quantity.replace(",", ".") || "0") *
                    parseFloat(addManualForm.unitCost.replace(",", ".") || "0")
                  )}
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddManualOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddManual} disabled={addManualMutation.isPending}>
                {addManualMutation.isPending ? "Adicionando..." : "Adicionar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

// ─── Exportação Excel ─────────────────────────────────────────────────────────
function exportToExcel(list: any, grouped: any[], summary: any[], grandTotal: number) {
  try {
    import("xlsx").then((XLSX) => {
      const wb = XLSX.utils.book_new();

      for (const budgetGroup of grouped) {
        const rows: any[][] = [];
        rows.push([`Lista: ${list.name}`]);
        rows.push([`Orçamento: ${budgetGroup.budgetTitle}`]);
        rows.push([]);
        rows.push(["Cód. SINAPI", "Descrição", "UN", "Quantidade", "Custo Unit. (R$)", "Custo Total (R$)", "Etapa"]);

        for (const stage of budgetGroup.stages) {
          for (const item of stage.items) {
            rows.push([
              item.sinapiCode || "",
              item.description,
              item.unit,
              parseFloat(item.quantity),
              parseFloat(item.unitCost),
              parseFloat(item.totalCost),
              stage.stageName,
            ]);
          }
          const stageTotal = stage.items.reduce((acc: number, i: any) => acc + parseFloat(i.totalCost || "0"), 0);
          rows.push(["", `Subtotal — ${stage.stageName}`, "", "", "", stageTotal, ""]);
          rows.push([]);
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const safeName = budgetGroup.budgetTitle.replace(/[\\/:*?[\]]/g, "").substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, safeName);
      }

      // Aba de resumo geral
      const summaryRows: any[][] = [
        [`Resumo Geral — ${list.name}`],
        [],
        ["Cód. SINAPI", "Descrição", "UN", "Qtde Total", "Custo Unit. (R$)", "Custo Total (R$)"],
      ];
      for (const item of summary) {
        summaryRows.push([
          item.sinapiCode || "",
          item.description,
          item.unit,
          item.quantity,
          item.unitCost,
          item.totalCost,
        ]);
      }
      summaryRows.push([]);
      summaryRows.push(["", "TOTAL GERAL", "", "", "", grandTotal]);

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo Geral");

      XLSX.writeFile(wb, `${list.name}.xlsx`);
      toast.success("Excel gerado com sucesso!");
    });
  } catch {
    toast.error("Erro ao gerar Excel. Verifique se a biblioteca está disponível.");
  }
}

// ─── Exportação PDF ───────────────────────────────────────────────────────────
function exportToPdf(list: any, grouped: any[], summary: any[], grandTotal: number) {
  try {
    import("jspdf").then(({ default: jsPDF }) =>
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const pageWidth = doc.internal.pageSize.getWidth();

        const fmt2 = (v: number) =>
          v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

        let y = 15;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(`Lista de Materiais: ${list.name}`, 14, y);
        y += 8;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, y);
        y += 8;

        for (const budgetGroup of grouped) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text(`Orçamento: ${budgetGroup.budgetTitle}`, 14, y);
          y += 6;

          for (const stage of budgetGroup.stages) {
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(60, 60, 60);
            doc.text(`Etapa: ${stage.stageName}`, 14, y);
            y += 4;

            const stageTotal = stage.items.reduce(
              (acc: number, i: any) => acc + parseFloat(i.totalCost || "0"), 0
            );

            autoTable(doc, {
              startY: y,
              head: [["Cód. SINAPI", "Descrição", "UN", "Quantidade", "Custo Unit.", "Custo Total"]],
              body: [
                ...stage.items.map((item: any) => [
                  item.sinapiCode || "—",
                  item.description,
                  item.unit,
                  Number(item.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
                  fmt2(parseFloat(item.unitCost)),
                  fmt2(parseFloat(item.totalCost)),
                ]),
                [{ content: `Subtotal: ${stage.stageName}`, colSpan: 5, styles: { fontStyle: "bold", halign: "right" } }, { content: fmt2(stageTotal), styles: { fontStyle: "bold" } }],
              ],
              styles: { fontSize: 7, cellPadding: 1.5 },
              headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
              columnStyles: {
                0: { cellWidth: 22 },
                2: { cellWidth: 12, halign: "center" },
                3: { cellWidth: 22, halign: "right" },
                4: { cellWidth: 28, halign: "right" },
                5: { cellWidth: 28, halign: "right" },
              },
              margin: { left: 14, right: 14 },
            });

            y = (doc as any).lastAutoTable.finalY + 6;
          }
          y += 4;
        }

        // Resumo geral
        doc.addPage();
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text("Resumo Geral — Todos os Insumos Somados", 14, 15);

        autoTable(doc, {
          startY: 22,
          head: [["Cód. SINAPI", "Descrição", "UN", "Qtde Total", "Custo Unit.", "Custo Total"]],
          body: [
            ...summary.map((item) => [
              item.sinapiCode || "—",
              item.description,
              item.unit,
              item.quantity.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
              fmt2(item.unitCost),
              fmt2(item.totalCost),
            ]),
            [
              { content: "TOTAL GERAL", colSpan: 5, styles: { fontStyle: "bold", halign: "right", fillColor: [37, 99, 235], textColor: 255 } },
              { content: fmt2(grandTotal), styles: { fontStyle: "bold", fillColor: [37, 99, 235], textColor: 255 } },
            ],
          ],
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: "bold" },
          columnStyles: {
            0: { cellWidth: 22 },
            2: { cellWidth: 12, halign: "center" },
            3: { cellWidth: 28, halign: "right" },
            4: { cellWidth: 28, halign: "right" },
            5: { cellWidth: 28, halign: "right" },
          },
          margin: { left: 14, right: 14 },
        });

        doc.save(`${list.name}.pdf`);
        toast.success("PDF gerado com sucesso!");
      })
    );
  } catch {
    toast.error("Erro ao gerar PDF.");
  }
}
