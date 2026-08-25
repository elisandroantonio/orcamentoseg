import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronRight, Lock, Unlock, Save, AlertCircle, FileText, TrendingUp, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportBoletimPDF } from "@/lib/boletimPdf";
import type { BoletimData, BoletimItemRow, BoletimAdditiveSection } from "@/lib/boletimPdf";
import { useSaldoMedido } from "@/hooks/useBudgetProgress";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface BudgetItem {
  id: number;
  stageId: number | null;
  type: string;
  description: string;
  unit: string;
  quantity: string;
  materialCost: string;
  laborCost: string;
  equipmentCost: string;
  serviceCost: string;
  otherCost: string;
  unitCost: string;
  totalCost: string;
  order: number;
  aplicarEncargosSociais?: number;
  children?: BudgetItem[];
}

interface BudgetStage {
  id: number;
  budgetId: number;
  parentStageId: number | null;
  name: string;
  order: number;
  totalWithBdi: string;
  items: BudgetItem[];
}

interface MeasurementPeriod {
  id: number;
  budgetId: number;
  periodNumber: number;
  name: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  status: "open" | "closed";
  notes: string | null;
}

interface MeasurementItemData {
  id: number;
  periodId: number;
  budgetId: number;
  budgetItemId: number;
  percentMeasured: string;
  quantityMeasured: string;
  valueMeasured: string;
}

interface BudgetFinanceiroProps {
  budgetId: number;
  stages: BudgetStage[];
  bdiConfigs: Record<number, { applyBdiToMaterial: boolean; applyBdiToLabor: boolean; additionalIncrement: number; discount?: number; aplicarEncargosSociais?: boolean }>;
  socialCharges: number;
  adminCentral: number;
  profit: number;
  taxes: number;
  risk: number;
  warranty: number;
  includeMaterial?: boolean;
  totalContratoWithBdi?: number;
  budgetTitle?: string;
  companySettings?: {
    companyName: string;
    cnpj: string;
    responsibleName: string;
    responsibleTitle: string;
    phone: string;
    email: string;
    logoUrl?: string | null;
  } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

// ─── Sub-componente: Tabela de Medição do Orçamento Original ─────────────────

function OriginalBudgetTab({
  budgetId,
  stages,
  bdiConfigs,
  socialCharges,
  adminCentral,
  profit,
  taxes,
  risk,
  warranty,
  includeMaterial,
  selectedPeriodId,
  periods,
}: {
  budgetId: number;
  stages: BudgetStage[];
  bdiConfigs: BudgetFinanceiroProps["bdiConfigs"];
  socialCharges: number;
  adminCentral: number;
  profit: number;
  taxes: number;
  risk: number;
  warranty: number;
  includeMaterial: boolean;
  selectedPeriodId: number | null;
  periods: MeasurementPeriod[];
}) {
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());
  const [editingValues, setEditingValues] = useState<Record<number, string>>({});
  const [pendingChanges, setPendingChanges] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Reset edits when period changes
  useEffect(() => {
    setEditingValues({});
    setPendingChanges(new Set());
  }, [selectedPeriodId]);

  const { data: periodItems = [], refetch: refetchItems } = trpc.measurements.listItems.useQuery(
    { periodId: selectedPeriodId! },
    { enabled: !!selectedPeriodId }
  );

  const { data: allHistoricalItems = [], refetch: refetchAllItems } = trpc.measurements.listAllItemsForBudget.useQuery(
    { budgetId },
    { enabled: !!budgetId }
  );

  const batchUpsert = trpc.measurements.batchUpsertItems.useMutation({
    onSuccess: () => {
      refetchItems();
      refetchAllItems();
      setPendingChanges(new Set());
      toast.success("Medições salvas!");
    },
    onError: (e) => toast.error("Erro ao salvar medições: " + e.message),
  });

  const calcBDIMultiplier = useCallback((additionalBdi = 0, discount = 0) => {
    const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
    const denominator = 1 - profit / 100 - taxes / 100;
    const baseBdi = denominator > 0 ? numerator / denominator : 1;
    return baseBdi * (1 + additionalBdi / 100) * (1 - discount / 100);
  }, [adminCentral, warranty, risk, profit, taxes]);

  const calcItemTotalWithBdi = useCallback((item: BudgetItem): number => {
    const qty = Number(item.quantity);
    const rawMaterial = Number(item.materialCost);
    const material = includeMaterial ? rawMaterial : 0;
    const labor = Number(item.laborCost);
    const equipment = Number(item.equipmentCost);
    const service = Number(item.serviceCost);
    const other = Number(item.otherCost);
    const config = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, aplicarEncargosSociais: true };
    const aplicarEncargos = config.aplicarEncargosSociais !== false;
    const bdiMult = calcBDIMultiplier(config.additionalIncrement, config.discount || 0);
    const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
    const matWithBdi = config.applyBdiToMaterial ? material * bdiMult : material;
    const laborWithBdi = config.applyBdiToLabor ? laborWithCharges * bdiMult : laborWithCharges;
    const eqWithBdi = equipment * bdiMult;
    const svcWithBdi = service * bdiMult;
    const othWithBdi = other * bdiMult;
    return (matWithBdi + laborWithBdi + eqWithBdi + svcWithBdi + othWithBdi) * qty;
  }, [bdiConfigs, calcBDIMultiplier, socialCharges, includeMaterial]);

  const measurementMap = useMemo(() => {
    const map: Record<number, MeasurementItemData> = {};
    (periodItems as any[]).forEach((mi: any) => { map[mi.budgetItemId] = mi; });
    return map;
  }, [periodItems]);

  // historicalAccumMap: soma de percentMeasured (%) dos períodos ANTERIORES ao selecionado
  // Usar % em vez de R$ evita inconsistências quando o totalWithBdi muda (BDI, composição)
  const historicalAccumMap = useMemo(() => {
    const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
    const previousPeriodIds = new Set(
      periods
        .filter((p) => selectedPeriod && p.periodNumber < selectedPeriod.periodNumber)
        .map((p) => p.id)
    );
    const accumMap: Record<number, number> = {};
    (allHistoricalItems as any[]).forEach((mi: any) => {
      if (previousPeriodIds.has(mi.periodId)) {
        // Soma percentuais (0-100), não valores monetários
        accumMap[mi.budgetItemId] = (accumMap[mi.budgetItemId] || 0) + Number(mi.percentMeasured);
      }
    });
    // Garante que nenhum item ultrapasse 100% acumulado
    Object.keys(accumMap).forEach(k => {
      accumMap[Number(k)] = Math.min(100, accumMap[Number(k)]);
    });
    return accumMap;
  }, [allHistoricalItems, periods, selectedPeriodId]);

  const rootStages = useMemo(() => stages.filter(s => !s.parentStageId), [stages]);

  // Totais gerais — atualizam em tempo real com editingValues
  const periodTotals = useMemo(() => {
    let totalContrato = 0;
    let totalMedidoPeriodo = 0;
    let totalMedidoAcumulado = 0;
    const allItems: BudgetItem[] = [];
    const collectItems = (stageList: BudgetStage[]) => {
      stageList.forEach(stage => {
        stage.items.forEach(item => {
          if (item.type !== 'composite') allItems.push(item);
          if (item.children) item.children.forEach(c => allItems.push(c));
        });
        const subStages = stages.filter(s => s.parentStageId === stage.id);
        collectItems(subStages);
      });
    };
    collectItems(rootStages);
    allItems.forEach(item => {
      const total = calcItemTotalWithBdi(item);
      totalContrato += total;
      const mi = measurementMap[item.id];
      // Usa valor editado em tempo real se disponível, senão usa o salvo
      const pctStr = editingValues[item.id] ?? (mi ? String(mi.percentMeasured) : "0");
      const pctNum = Math.min(100, Math.max(0, Number(pctStr.replace(",", ".")) || 0));
      totalMedidoPeriodo += total * pctNum / 100;
      const prevPct = historicalAccumMap[item.id] || 0;
      const itemPctAcum = Math.min(100, prevPct + pctNum);
      totalMedidoAcumulado += total * itemPctAcum / 100;
    });
    return { totalContrato, totalMedidoPeriodo, totalMedidoAcumulado };
  }, [rootStages, stages, calcItemTotalWithBdi, measurementMap, historicalAccumMap, editingValues]);

  const handlePercentChange = (itemId: number, value: string) => {
    setEditingValues(prev => ({ ...prev, [itemId]: value }));
    setPendingChanges(prev => new Set(prev).add(itemId));
  };

  const handleSaveMeasurements = async () => {
    if (!selectedPeriodId) return;
    setIsSaving(true);
    try {
      const items: { budgetItemId: number; percentMeasured: string; quantityMeasured: string; valueMeasured: string }[] = [];
      const allItems: BudgetItem[] = [];
      const collectItems = (stageList: BudgetStage[]) => {
        stageList.forEach(stage => {
          stage.items.forEach(item => {
            if (item.type !== 'composite') allItems.push(item);
            if (item.children) item.children.forEach(c => allItems.push(c));
          });
          const subStages = stages.filter(s => s.parentStageId === stage.id);
          collectItems(subStages);
        });
      };
      collectItems(rootStages);
      allItems.forEach(item => {
        const pctStr = editingValues[item.id] ?? (measurementMap[item.id]?.percentMeasured ?? "0");
        const pct = Math.min(100, Math.max(0, Number(pctStr.replace(",", ".")) || 0));
        const totalWithBdi = calcItemTotalWithBdi(item);
        const valueMeasured = (totalWithBdi * pct / 100).toFixed(2);
        const qty = Number(item.quantity);
        const quantityMeasured = (qty * pct / 100).toFixed(4);
        if (pct > 0 || pendingChanges.has(item.id)) {
          items.push({
            budgetItemId: item.id,
            percentMeasured: pct.toFixed(4),
            quantityMeasured,
            valueMeasured,
          });
        }
      });
      await batchUpsert.mutateAsync({ periodId: selectedPeriodId, budgetId, items });
    } finally {
      setIsSaving(false);
    }
  };

  const renderItem = (item: BudgetItem, stageIndex: string, itemIndex: number, depth = 0): React.ReactElement => {
    const totalWithBdi = calcItemTotalWithBdi(item);
    const mi = measurementMap[item.id];
    const pctEditing = editingValues[item.id];
    const pctValue = pctEditing !== undefined ? pctEditing : (mi ? Number(mi.percentMeasured).toFixed(2) : "");
    const pctNum = Number((pctEditing ?? mi?.percentMeasured ?? "0").toString().replace(",", ".")) || 0;
    const valueMedido = totalWithBdi * pctNum / 100;
    const isPending = pendingChanges.has(item.id);
    // Acumulado em % (soma dos períodos anteriores) + % do período atual
    const prevAccumPct = historicalAccumMap[item.id] || 0;
    const pctAcum = Math.min(100, prevAccumPct + pctNum);
    // Valor acumulado e saldo calculados a partir do % acumulado (evita arredondamento com R$ histórico)
    const valueAcum = totalWithBdi * pctAcum / 100;
    const saldo = totalWithBdi * (1 - pctAcum / 100);
    const selectedPeriod = periods.find(p => p.id === selectedPeriodId);

    return (
      <tr key={item.id} className={cn("border-b border-gray-100 hover:bg-blue-50/30 transition-colors", depth > 0 && "bg-gray-50/50")}>
        <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap" style={{ paddingLeft: `${8 + depth * 16}px` }}>
          {stageIndex}.{itemIndex + 1}
        </td>
        <td className="px-2 py-1.5 text-xs text-gray-800 max-w-[220px]">
          <div className="truncate" title={item.description}>{item.description}</div>
        </td>
        <td className="px-2 py-1.5 text-xs text-center text-gray-600">{item.unit}</td>
        <td className="px-2 py-1.5 text-xs text-right text-gray-700">
          {Number(item.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
        </td>
        <td className="px-2 py-1.5 text-xs text-right text-gray-700">
          {fmtBRL(totalWithBdi / Number(item.quantity) || 0)}
        </td>
        <td className="px-2 py-1.5 text-xs text-right font-medium text-gray-900">
          {fmtBRL(totalWithBdi)}
        </td>
        {selectedPeriodId ? (
          <>
            <td className="px-1 py-1 text-xs text-center">
              <div className="flex items-center gap-0.5">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={pctValue}
                  onChange={e => handlePercentChange(item.id, e.target.value)}
                  disabled={selectedPeriod?.status === "closed"}
                  className={cn(
                    "h-6 w-16 text-xs text-right px-1 border",
                    isPending ? "border-amber-400 bg-amber-50" : "border-gray-200",
                    selectedPeriod?.status === "closed" && "opacity-50"
                  )}
                  placeholder="0,00"
                />
                <span className="text-gray-400 text-xs">%</span>
              </div>
            </td>
            <td className="px-2 py-1.5 text-xs text-right text-blue-700 font-medium">{fmtBRL(valueMedido)}</td>
            <td className="px-2 py-1.5 text-xs text-right text-gray-600">{fmtPct(pctAcum)}</td>
            <td className="px-2 py-1.5 text-xs text-right text-gray-700">{fmtBRL(valueAcum)}</td>
            <td className={cn("px-2 py-1.5 text-xs text-right font-medium", saldo > 0.01 ? "text-orange-600" : "text-green-600")}>
              {fmtBRL(saldo)}
            </td>
          </>
        ) : (
          <td colSpan={5} className="px-2 py-1.5 text-xs text-center text-gray-400 italic">
            Selecione um período
          </td>
        )}
      </tr>
    );
  };

  const renderStage = (stage: BudgetStage, stageIndex: number, depth = 0): React.ReactElement[] => {
    const isExpanded = expandedStages.has(stage.id);
    const subStages = stages.filter(s => s.parentStageId === stage.id);
    const prefix = `${stageIndex + 1}`;
    const stageTotalWithBdi = stage.items.reduce((acc, item) => {
      if (item.type !== 'composite') return acc + calcItemTotalWithBdi(item);
      return acc + (item.children || []).reduce((a, c) => a + calcItemTotalWithBdi(c), 0);
    }, 0) + stages.filter(s => s.parentStageId === stage.id).reduce((acc, sub) => {
      return acc + sub.items.reduce((a2, item) => {
        if (item.type !== 'composite') return a2 + calcItemTotalWithBdi(item);
        return a2 + (item.children || []).reduce((a3, c) => a3 + calcItemTotalWithBdi(c), 0);
      }, 0);
    }, 0);

    let stageMedidoPeriodo = 0;
    // Acumulado da etapa: calculado a partir dos % acumulados de cada item
    let stageValueAcum = 0;
    stage.items.forEach(item => {
      if (item.type !== 'composite') {
        const mi = measurementMap[item.id];
        // Usa valor editado em tempo real se disponível, senão usa o salvo
        const pctStr = editingValues[item.id] ?? (mi ? String(mi.percentMeasured) : "0");
        const pctNum = Math.min(100, Math.max(0, Number(pctStr.replace(",", ".")) || 0));
        const itemTotal = calcItemTotalWithBdi(item);
        stageMedidoPeriodo += itemTotal * pctNum / 100;
        const prevPct = historicalAccumMap[item.id] || 0;
        const itemPctAcum = Math.min(100, prevPct + pctNum);
        stageValueAcum += itemTotal * itemPctAcum / 100;
      }
      if (item.children) {
        item.children.forEach(child => {
          const mi = measurementMap[child.id];
          const pctStr = editingValues[child.id] ?? (mi ? String(mi.percentMeasured) : "0");
          const pctNum = Math.min(100, Math.max(0, Number(pctStr.replace(",", ".")) || 0));
          const childTotal = calcItemTotalWithBdi(child);
          stageMedidoPeriodo += childTotal * pctNum / 100;
          const prevPct = historicalAccumMap[child.id] || 0;
          const childPctAcum = Math.min(100, prevPct + pctNum);
          stageValueAcum += childTotal * childPctAcum / 100;
        });
      }
    });
    const stageAcumulado = stageValueAcum;
    const stagePctAcum = stageTotalWithBdi > 0 ? (stageAcumulado / stageTotalWithBdi) * 100 : 0;

    const rows: React.ReactElement[] = [];
    rows.push(
      <tr
        key={`stage-${stage.id}`}
        className={cn(
          "cursor-pointer select-none border-b",
          depth === 0 ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-slate-500 text-white hover:bg-slate-400"
        )}
        onClick={() => setExpandedStages(prev => { const next = new Set(prev); if (next.has(stage.id)) next.delete(stage.id); else next.add(stage.id); return next; })}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <td className="px-2 py-2 text-xs font-bold" style={{ paddingLeft: `${8 + depth * 16}px` }}>
          {isExpanded ? <ChevronDown className="w-3 h-3 inline mr-1" /> : <ChevronRight className="w-3 h-3 inline mr-1" />}
          {stageIndex + 1}
        </td>
        <td className="px-2 py-2 text-xs font-bold" colSpan={4}>{stage.name}</td>
        <td className="px-2 py-2 text-xs font-bold text-right">{fmtBRL(stageTotalWithBdi)}</td>
        {selectedPeriodId ? (
          <>
            <td className="px-2 py-2 text-xs text-center bg-blue-900/50">—</td>
            <td className="px-2 py-2 text-xs text-right bg-blue-900/50">{fmtBRL(stageMedidoPeriodo)}</td>
            <td className="px-2 py-2 text-xs text-center bg-indigo-900/50">{fmtPct(stagePctAcum)}</td>
            <td className="px-2 py-2 text-xs text-right bg-indigo-900/50">{fmtBRL(stageAcumulado)}</td>
            <td className={cn("px-2 py-2 text-xs text-right font-bold bg-orange-900/50", stageTotalWithBdi - stageAcumulado > 0.01 ? "text-orange-200" : "text-green-200")}>
              {fmtBRL(stageTotalWithBdi - stageAcumulado)}
            </td>
          </>
        ) : (
          <td colSpan={5} />
        )}
      </tr>
    );

    if (isExpanded) {
      // Sub-etapas
      subStages.forEach((sub, si) => {
        rows.push(...renderStage(sub, si, depth + 1));
      });
      // Itens
      stage.items.forEach((item, ii) => {
        if (item.type === 'composite') {
          rows.push(
            <tr key={`composite-${item.id}`} className="bg-blue-50 border-b border-blue-100">
              <td className="px-2 py-1.5 text-xs text-blue-700 font-semibold" style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}>
                {prefix}.{ii + 1}
              </td>
              <td className="px-2 py-1.5 text-xs text-blue-800 font-semibold" colSpan={4}>{item.description}</td>
              <td className="px-2 py-1.5 text-xs text-right font-semibold text-blue-800">
                {fmtBRL(calcItemTotalWithBdi(item))}
              </td>
              {selectedPeriodId ? <td colSpan={5} /> : <td colSpan={5} />}
            </tr>
          );
          item.children?.forEach((child, ci) => {
            rows.push(renderItem(child, `${prefix}.${ii + 1}`, ci, depth + 2));
          });
        } else {
          rows.push(renderItem(item, prefix, ii, depth + 1));
        }
      });
    }
    return rows;
  };

  return (
    <div className="space-y-3">
      {/* Resumo do período */}
      {selectedPeriodId && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-slate-100 rounded p-2 text-center">
            <div className="text-gray-500">Valor do Contrato</div>
            <div className="font-bold text-slate-800">{fmtBRL(periodTotals.totalContrato)}</div>
          </div>
          <div className="bg-blue-50 rounded p-2 text-center">
            <div className="text-gray-500">Medido no Período</div>
            <div className="font-bold text-blue-700">{fmtBRL(periodTotals.totalMedidoPeriodo)}</div>
          </div>
          <div className="bg-orange-50 rounded p-2 text-center">
            <div className="text-gray-500">Saldo a Medir</div>
            <div className="font-bold text-orange-700">{fmtBRL(periodTotals.totalContrato - periodTotals.totalMedidoAcumulado)}</div>
          </div>
        </div>
      )}

      {/* Botão salvar */}
      {pendingChanges.size > 0 && (
        <Button type="button" size="sm" className="h-8 text-xs gap-1 bg-blue-600 hover:bg-blue-700" onClick={handleSaveMeasurements} disabled={isSaving}>
          <Save className="w-3 h-3" /> {isSaving ? "Salvando..." : `Salvar Medições (${pendingChanges.size})`}
        </Button>
      )}

      {/* Tabela */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-2 py-2 text-left font-semibold w-12">Item</th>
              <th className="px-2 py-2 text-left font-semibold">Descrição</th>
              <th className="px-2 py-2 text-center font-semibold w-12">UN</th>
              <th className="px-2 py-2 text-right font-semibold w-20">Qtde</th>
              <th className="px-2 py-2 text-right font-semibold w-24">VL Unit (c/BDI)</th>
              <th className="px-2 py-2 text-right font-semibold w-28">VL Total (c/BDI)</th>
              {selectedPeriodId ? (
                <>
                  <th className="px-2 py-2 text-center font-semibold w-24 bg-blue-800">% Medido</th>
                  <th className="px-2 py-2 text-right font-semibold w-28 bg-blue-800">Vl Medido</th>
                  <th className="px-2 py-2 text-center font-semibold w-20 bg-indigo-800">% Acum.</th>
                  <th className="px-2 py-2 text-right font-semibold w-28 bg-indigo-800">Vl Acum.</th>
                  <th className="px-2 py-2 text-right font-semibold w-28 bg-orange-800">Saldo</th>
                </>
              ) : (
                <th className="px-2 py-2 text-center font-semibold w-40 bg-slate-700" colSpan={5}>
                  ← Selecione um período para medir
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rootStages.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-400 text-sm">
                  <AlertCircle className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                  Nenhuma etapa encontrada. Adicione etapas e composições na aba "Composições".
                </td>
              </tr>
            ) : (
              rootStages.map((stage, si) => renderStage(stage, si))
            )}
          </tbody>
          {selectedPeriodId && (
            <tfoot>
              <tr className="bg-slate-800 text-white font-bold">
                <td colSpan={5} className="px-2 py-2 text-xs text-right">TOTAL GERAL:</td>
                <td className="px-2 py-2 text-xs text-right">{fmtBRL(periodTotals.totalContrato)}</td>
                <td className="px-2 py-2 text-xs text-center bg-blue-900">—</td>
                <td className="px-2 py-2 text-xs text-right bg-blue-900">{fmtBRL(periodTotals.totalMedidoPeriodo)}</td>
                <td className="px-2 py-2 text-xs text-center bg-indigo-900">—</td>
                <td className="px-2 py-2 text-xs text-right bg-indigo-900">{fmtBRL(periodTotals.totalMedidoAcumulado)}</td>
                <td className="px-2 py-2 text-xs text-right bg-orange-900">
                  {fmtBRL(periodTotals.totalContrato - periodTotals.totalMedidoAcumulado)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Sub-componente: Tabela de Medição de um Aditivo ─────────────────────────

function AdditiveMeasurementTab({
  additiveId,
  additiveName,
  budgetParams,
  selectedPeriodId,
  periods,
}: {
  additiveId: number;
  additiveName: string;
  budgetParams: { socialCharges: number; adminCentral: number; profit: number; taxes: number; risk: number; warranty: number };
  selectedPeriodId: number | null;
  periods: MeasurementPeriod[];
}) {
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());
  const [editingValues, setEditingValues] = useState<Record<number, string>>({});
  const [pendingChanges, setPendingChanges] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setEditingValues({});
    setPendingChanges(new Set());
  }, [selectedPeriodId]);

  // Buscar etapas e itens do aditivo
  const { data: additiveStages = [] } = trpc.additives.getStages.useQuery(
    { additiveId },
    { enabled: !!additiveId }
  );

  // Buscar medições do período atual para este aditivo
  const { data: periodMeasurements = [], refetch: refetchMeasurements } = trpc.additives.listMeasurementItems.useQuery(
    { additiveId, periodId: selectedPeriodId! },
    { enabled: !!selectedPeriodId && !!additiveId }
  );

  // Buscar todas as medições históricas deste aditivo
  const { data: allHistoricalMeasurements = [], refetch: refetchAllMeasurements } = trpc.additives.listAllMeasurementItems.useQuery(
    { additiveId },
    { enabled: !!additiveId }
  );

  const batchUpsert = trpc.additives.batchUpsertMeasurementItems.useMutation({
    onSuccess: () => {
      refetchMeasurements();
      refetchAllMeasurements();
      setPendingChanges(new Set());
      toast.success("Medições do aditivo salvas!");
    },
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
  });

  const calcBDIMultiplier = useCallback((additionalBdi = 0, discount = 0) => {
    const { adminCentral, warranty, risk, profit, taxes } = budgetParams;
    const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
    const denominator = 1 - profit / 100 - taxes / 100;
    const baseBdi = denominator > 0 ? numerator / denominator : 1;
    return baseBdi * (1 + additionalBdi / 100) * (1 - discount / 100);
  }, [budgetParams]);

  const calcAdditiveItemTotal = useCallback((item: any): number => {
    const qty = Number(item.quantity || 1);
    const rawMaterial = Number(item.materialCost || 0);
    const material = Number(item.includeMaterial ?? 1) ? rawMaterial : 0;
    const labor = Number(item.laborCost || 0);
    const equipment = Number(item.equipmentCost || 0);
    const service = Number(item.serviceCost || 0);
    const other = Number(item.otherCost || 0);
    const applyBdiToMaterial = Number(item.applyBdiToMaterial ?? 1);
    const applyBdiToLabor = Number(item.applyBdiToLabor ?? 1);
    const aplicarEncargos = Number(item.aplicarEncargosSociais ?? 1);
    const additionalIncrement = Number(item.additionalIncrement || 0);
    const discount = Number(item.discount || 0);
    const bdiMult = calcBDIMultiplier(additionalIncrement, discount);
    const laborWithCharges = labor * (1 + (aplicarEncargos ? budgetParams.socialCharges : 0) / 100);
    const matWithBdi = applyBdiToMaterial ? material * bdiMult : material;
    const laborWithBdi = applyBdiToLabor ? laborWithCharges * bdiMult : laborWithCharges;
    const eqWithBdi = equipment * bdiMult;
    const svcWithBdi = service * bdiMult;
    const othWithBdi = other * bdiMult;
    return (matWithBdi + laborWithBdi + eqWithBdi + svcWithBdi + othWithBdi) * qty;
  }, [calcBDIMultiplier, budgetParams.socialCharges]);

  // Mapa de medições do período atual
  const measurementMap = useMemo(() => {
    const map: Record<number, any> = {};
    (periodMeasurements as any[]).forEach((m: any) => { map[m.additiveItemId] = m; });
    return map;
  }, [periodMeasurements]);

  // Mapa de acumulado histórico (períodos anteriores)
  const historicalAccumMap = useMemo(() => {
    const selectedPeriod = periods.find(p => p.id === selectedPeriodId);
    const previousPeriodIds = new Set(
      periods
        .filter(p => selectedPeriod && p.periodNumber < selectedPeriod.periodNumber)
        .map(p => p.id)
    );
    const accumMap: Record<number, number> = {};
    (allHistoricalMeasurements as any[]).forEach((m: any) => {
      if (previousPeriodIds.has(m.periodId)) {
        accumMap[m.additiveItemId] = (accumMap[m.additiveItemId] || 0) + Number(m.measuredValue);
      }
    });
    return accumMap;
  }, [allHistoricalMeasurements, periods, selectedPeriodId]);

  // Totais do aditivo
  const additiveTotals = useMemo(() => {
    let totalContrato = 0;
    let totalMedidoPeriodo = 0;
    let totalMedidoAcumulado = 0;
    const allItems: any[] = [];
    const collectItems = (stageList: any[]) => {
      stageList.forEach((stage: any) => {
        (stage.items || []).forEach((item: any) => allItems.push(item));
        collectItems(stage.children || []);
      });
    };
    collectItems(additiveStages as any[]);
    allItems.forEach(item => {
      const total = calcAdditiveItemTotal(item);
      totalContrato += total;
      const m = measurementMap[item.id];
      if (m) totalMedidoPeriodo += Number(m.measuredValue);
      totalMedidoAcumulado += (historicalAccumMap[item.id] || 0);
    });
    totalMedidoAcumulado += totalMedidoPeriodo;
    return { totalContrato, totalMedidoPeriodo, totalMedidoAcumulado };
  }, [additiveStages, calcAdditiveItemTotal, measurementMap, historicalAccumMap]);

  const handlePercentChange = (itemId: number, value: string) => {
    setEditingValues(prev => ({ ...prev, [itemId]: value }));
    setPendingChanges(prev => new Set(prev).add(itemId));
  };

  const handleSave = async () => {
    if (!selectedPeriodId) return;
    setIsSaving(true);
    try {
      const allItems: any[] = [];
      const collectItems = (stageList: any[]) => {
        stageList.forEach((stage: any) => {
          (stage.items || []).forEach((item: any) => allItems.push(item));
          collectItems(stage.children || []);
        });
      };
      collectItems(additiveStages as any[]);
      const items: { additiveItemId: number; measuredPercent: string; measuredValue: string }[] = [];
      allItems.forEach(item => {
        const pctStr = editingValues[item.id] ?? (measurementMap[item.id]?.measuredPercent?.toString() ?? "0");
        const pct = Math.min(100, Math.max(0, Number(pctStr.replace(",", ".")) || 0));
        const totalWithBdi = calcAdditiveItemTotal(item);
        const measuredValue = (totalWithBdi * pct / 100).toFixed(2);
        if (pct > 0 || pendingChanges.has(item.id)) {
          items.push({
            additiveItemId: item.id,
            measuredPercent: pct.toFixed(4),
            measuredValue,
          });
        }
      });
      await batchUpsert.mutateAsync({ additiveId, periodId: selectedPeriodId, items });
    } finally {
      setIsSaving(false);
    }
  };

  const renderAdditiveItem = (item: any, stagePrefix: string, itemIndex: number, depth = 0): React.ReactElement => {
    const totalWithBdi = calcAdditiveItemTotal(item);
    const m = measurementMap[item.id];
    const pctEditing = editingValues[item.id];
    const pctValue = pctEditing !== undefined ? pctEditing : (m ? Number(m.measuredPercent).toFixed(2) : "");
    const pctNum = Number((pctEditing ?? m?.measuredPercent ?? "0").toString().replace(",", ".")) || 0;
    const valueMedido = totalWithBdi * pctNum / 100;
    const isPending = pendingChanges.has(item.id);
    const prevAccum = historicalAccumMap[item.id] || 0;
    const valueAcum = prevAccum + valueMedido;
    const pctAcum = totalWithBdi > 0 ? (valueAcum / totalWithBdi) * 100 : 0;
    const saldo = totalWithBdi - valueAcum;
    const selectedPeriod = periods.find(p => p.id === selectedPeriodId);

    return (
      <tr key={item.id} className={cn("border-b border-gray-100 hover:bg-green-50/30 transition-colors", depth > 0 && "bg-gray-50/50")}>
        <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap" style={{ paddingLeft: `${8 + depth * 16}px` }}>
          {stagePrefix}.{itemIndex + 1}
        </td>
        <td className="px-2 py-1.5 text-xs text-gray-800 max-w-[220px]">
          <div className="truncate" title={item.description}>{item.description}</div>
        </td>
        <td className="px-2 py-1.5 text-xs text-center text-gray-600">{item.unit}</td>
        <td className="px-2 py-1.5 text-xs text-right text-gray-700">
          {Number(item.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
        </td>
        <td className="px-2 py-1.5 text-xs text-right text-gray-700">
          {fmtBRL(totalWithBdi / Number(item.quantity) || 0)}
        </td>
        <td className="px-2 py-1.5 text-xs text-right font-medium text-gray-900">
          {fmtBRL(totalWithBdi)}
        </td>
        {selectedPeriodId ? (
          <>
            <td className="px-1 py-1 text-xs text-center">
              <div className="flex items-center gap-0.5">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={pctValue}
                  onChange={e => handlePercentChange(item.id, e.target.value)}
                  disabled={selectedPeriod?.status === "closed"}
                  className={cn(
                    "h-6 w-16 text-xs text-right px-1 border",
                    isPending ? "border-amber-400 bg-amber-50" : "border-gray-200",
                    selectedPeriod?.status === "closed" && "opacity-50"
                  )}
                  placeholder="0,00"
                />
                <span className="text-gray-400 text-xs">%</span>
              </div>
            </td>
            <td className="px-2 py-1.5 text-xs text-right text-green-700 font-medium">{fmtBRL(valueMedido)}</td>
            <td className="px-2 py-1.5 text-xs text-right text-gray-600">{fmtPct(pctAcum)}</td>
            <td className="px-2 py-1.5 text-xs text-right text-gray-700">{fmtBRL(valueAcum)}</td>
            <td className={cn("px-2 py-1.5 text-xs text-right font-medium", saldo > 0.01 ? "text-orange-600" : "text-green-600")}>
              {fmtBRL(saldo)}
            </td>
          </>
        ) : (
          <td colSpan={5} className="px-2 py-1.5 text-xs text-center text-gray-400 italic">
            Selecione um período
          </td>
        )}
      </tr>
    );
  };

  const renderAdditiveStage = (stage: any, stageIndex: number, depth = 0): React.ReactElement[] => {
    const isExpanded = expandedStages.has(stage.id);
    const prefix = `${stageIndex + 1}`;
    const stageTotalWithBdi = (stage.items || []).reduce((acc: number, item: any) => acc + calcAdditiveItemTotal(item), 0)
      + (stage.children || []).reduce((acc: number, sub: any) => acc + (sub.items || []).reduce((a: number, item: any) => a + calcAdditiveItemTotal(item), 0), 0);
    let stageMedido = 0;
    let stageAccum = 0;
    (stage.items || []).forEach((item: any) => {
      const m = measurementMap[item.id];
      if (m) stageMedido += Number(m.measuredValue);
      stageAccum += (historicalAccumMap[item.id] || 0);
    });
    const stageAcumulado = stageAccum + stageMedido;
    const stagePctAcum = stageTotalWithBdi > 0 ? (stageAcumulado / stageTotalWithBdi) * 100 : 0;

    const rows: React.ReactElement[] = [];
    rows.push(
      <tr
        key={`addstage-${stage.id}`}
        className={cn(
          "cursor-pointer select-none border-b",
          depth === 0 ? "bg-emerald-800 text-white hover:bg-emerald-700" : "bg-emerald-600 text-white hover:bg-emerald-500"
        )}
        onClick={() => setExpandedStages(prev => { const next = new Set(prev); if (next.has(stage.id)) next.delete(stage.id); else next.add(stage.id); return next; })}
      >
        <td className="px-2 py-2 text-xs font-bold" style={{ paddingLeft: `${8 + depth * 16}px` }}>
          {isExpanded ? <ChevronDown className="w-3 h-3 inline mr-1" /> : <ChevronRight className="w-3 h-3 inline mr-1" />}
          {stageIndex + 1}
        </td>
        <td className="px-2 py-2 text-xs font-bold" colSpan={4}>{stage.name}</td>
        <td className="px-2 py-2 text-xs font-bold text-right">{fmtBRL(stageTotalWithBdi)}</td>
        {selectedPeriodId ? (
          <>
            <td className="px-2 py-2 text-xs text-center bg-blue-900/50">—</td>
            <td className="px-2 py-2 text-xs text-right bg-blue-900/50">{fmtBRL(stageMedido)}</td>
            <td className="px-2 py-2 text-xs text-center bg-indigo-900/50">{fmtPct(stagePctAcum)}</td>
            <td className="px-2 py-2 text-xs text-right bg-indigo-900/50">{fmtBRL(stageAcumulado)}</td>
            <td className={cn("px-2 py-2 text-xs text-right font-bold bg-orange-900/50", stageTotalWithBdi - stageAcumulado > 0.01 ? "text-orange-200" : "text-green-200")}>
              {fmtBRL(stageTotalWithBdi - stageAcumulado)}
            </td>
          </>
        ) : <td colSpan={5} />}
      </tr>
    );

    if (isExpanded) {
      (stage.children || []).forEach((sub: any, si: number) => {
        rows.push(...renderAdditiveStage(sub, si, depth + 1));
      });
      (stage.items || []).forEach((item: any, ii: number) => {
        rows.push(renderAdditiveItem(item, prefix, ii, depth + 1));
      });
    }
    return rows;
  };

  if ((additiveStages as any[]).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm gap-2">
        <AlertCircle className="w-8 h-8 text-gray-300" />
        <p>Este aditivo não possui composições cadastradas.</p>
        <p className="text-xs">Adicione etapas e composições na aba "Aditivos".</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Resumo */}
      {selectedPeriodId && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-emerald-50 rounded p-2 text-center">
            <div className="text-gray-500">Valor do Aditivo</div>
            <div className="font-bold text-emerald-800">{fmtBRL(additiveTotals.totalContrato)}</div>
          </div>
          <div className="bg-blue-50 rounded p-2 text-center">
            <div className="text-gray-500">Medido no Período</div>
            <div className="font-bold text-blue-700">{fmtBRL(additiveTotals.totalMedidoPeriodo)}</div>
          </div>
          <div className="bg-orange-50 rounded p-2 text-center">
            <div className="text-gray-500">Saldo a Medir</div>
            <div className="font-bold text-orange-700">{fmtBRL(additiveTotals.totalContrato - additiveTotals.totalMedidoAcumulado)}</div>
          </div>
        </div>
      )}

      {/* Botão salvar */}
      {pendingChanges.size > 0 && (
        <Button type="button" size="sm" className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={isSaving}>
          <Save className="w-3 h-3" /> {isSaving ? "Salvando..." : `Salvar Medições do Aditivo (${pendingChanges.size})`}
        </Button>
      )}

      {/* Tabela */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-emerald-900 text-white">
              <th className="px-2 py-2 text-left font-semibold w-12">Item</th>
              <th className="px-2 py-2 text-left font-semibold">Descrição</th>
              <th className="px-2 py-2 text-center font-semibold w-12">UN</th>
              <th className="px-2 py-2 text-right font-semibold w-20">Qtde</th>
              <th className="px-2 py-2 text-right font-semibold w-24">VL Unit (c/BDI)</th>
              <th className="px-2 py-2 text-right font-semibold w-28">VL Total (c/BDI)</th>
              {selectedPeriodId ? (
                <>
                  <th className="px-2 py-2 text-center font-semibold w-24 bg-blue-800">% Medido</th>
                  <th className="px-2 py-2 text-right font-semibold w-28 bg-blue-800">Vl Medido</th>
                  <th className="px-2 py-2 text-center font-semibold w-20 bg-indigo-800">% Acum.</th>
                  <th className="px-2 py-2 text-right font-semibold w-28 bg-indigo-800">Vl Acum.</th>
                  <th className="px-2 py-2 text-right font-semibold w-28 bg-orange-800">Saldo</th>
                </>
              ) : (
                <th className="px-2 py-2 text-center font-semibold w-40 bg-emerald-800" colSpan={5}>
                  ← Selecione um período para medir
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {(additiveStages as any[]).map((stage: any, si: number) => renderAdditiveStage(stage, si))}
          </tbody>
          {selectedPeriodId && (
            <tfoot>
              <tr className="bg-emerald-900 text-white font-bold">
                <td colSpan={5} className="px-2 py-2 text-xs text-right">TOTAL DO ADITIVO:</td>
                <td className="px-2 py-2 text-xs text-right">{fmtBRL(additiveTotals.totalContrato)}</td>
                <td className="px-2 py-2 text-xs text-center bg-blue-900">—</td>
                <td className="px-2 py-2 text-xs text-right bg-blue-900">{fmtBRL(additiveTotals.totalMedidoPeriodo)}</td>
                <td className="px-2 py-2 text-xs text-center bg-indigo-900">—</td>
                <td className="px-2 py-2 text-xs text-right bg-indigo-900">{fmtBRL(additiveTotals.totalMedidoAcumulado)}</td>
                <td className="px-2 py-2 text-xs text-right bg-orange-900">
                  {fmtBRL(additiveTotals.totalContrato - additiveTotals.totalMedidoAcumulado)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BudgetFinanceiro({
  budgetId,
  stages,
  bdiConfigs,
  socialCharges,
  adminCentral,
  profit,
  taxes,
  risk,
  warranty,
  includeMaterial = true,
  totalContratoWithBdi,
  budgetTitle = "Orçamento",
  companySettings,
}: BudgetFinanceiroProps) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"original" | number>("original");
  const [showNewPeriodDialog, setShowNewPeriodDialog] = useState(false);
  const [newPeriodForm, setNewPeriodForm] = useState({ name: "", startDate: "", endDate: "" });
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const utils = trpc.useUtils();

  // Queries
  const { data: periods = [], refetch: refetchPeriods } = trpc.measurements.listPeriods.useQuery(
    { budgetId },
    { enabled: !!budgetId }
  );

  // Aditivos aprovados do novo sistema
  const { data: budgetAdditives = [] } = trpc.additives.list.useQuery(
    { budgetId },
    { enabled: !!budgetId }
  );
  const approvedAdditives = (budgetAdditives as any[]).filter((a: any) => a.status === 'aprovado');

  // Mutations
  const createPeriod = trpc.measurements.createPeriod.useMutation({
    onSuccess: () => {
      refetchPeriods();
      setShowNewPeriodDialog(false);
      setNewPeriodForm({ name: "", startDate: "", endDate: "" });
      toast.success("Período criado com sucesso!");
    },
    onError: (e) => toast.error("Erro ao criar período: " + e.message),
  });

  const updatePeriod = trpc.measurements.updatePeriod.useMutation({
    onSuccess: () => { refetchPeriods(); toast.success("Período atualizado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deletePeriod = trpc.measurements.deletePeriod.useMutation({
    onSuccess: () => { refetchPeriods(); setSelectedPeriodId(null); toast.success("Período excluído!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const selectedPeriod = (periods as MeasurementPeriod[]).find(p => p.id === selectedPeriodId);

  // Totais globais para o cabeçalho
  const approvedAdditivesTotal = useMemo(() => {
    return approvedAdditives.reduce((sum: number, a: any) => sum + Number(a.totalCostWithBdi || 0), 0);
  }, [approvedAdditives]);

  // Saldo medido / evolução da obra (só orçamento base, sem aditivos — soma de TODOS
  // os períodos já medidos, independente do período selecionado no seletor abaixo).
  // Cálculo compartilhado com BudgetDashboard (mesma fonte, mesmo número nos dois lugares).
  const saldoMedidoTotal = useSaldoMedido(budgetId, stages, bdiConfigs, {
    socialCharges,
    adminCentral,
    profit,
    taxes,
    risk,
    warranty,
    includeMaterial,
  });

  // Usar totalContratoWithBdi passado pelo BudgetForm (mesmo cálculo da aba Comp. BDI)
  // Fallback: recalcular localmente se a prop não for fornecida (compatibilidade)
  const baseContractTotalFallback = useMemo(() => {
    if (totalContratoWithBdi !== undefined) return totalContratoWithBdi;
    let total = 0;
    const calcBDI = (additionalBdi = 0, discount = 0) => {
      const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
      const denominator = 1 - profit / 100 - taxes / 100;
      const baseBdi = denominator > 0 ? numerator / denominator : 1;
      return baseBdi * (1 + additionalBdi / 100) * (1 - discount / 100);
    };
    const rootStages = stages.filter(s => !s.parentStageId);
    const collectItems = (stageList: BudgetStage[]) => {
      stageList.forEach(stage => {
        stage.items.forEach(item => {
          if (item.type === 'composite') {
            (item.children || []).forEach(child => {
              const qty = Number(child.quantity);
              const material = includeMaterial ? Number(child.materialCost) : 0;
              const labor = Number(child.laborCost);
              const config = bdiConfigs[child.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, aplicarEncargosSociais: true };
              const bdiMult = calcBDI(config.additionalIncrement, config.discount || 0);
              const laborWithCharges = labor * (1 + (config.aplicarEncargosSociais !== false ? socialCharges : 0) / 100);
              total += (
                (config.applyBdiToMaterial ? material * bdiMult : material) +
                (config.applyBdiToLabor ? laborWithCharges * bdiMult : laborWithCharges) +
                Number(child.equipmentCost) * bdiMult +
                Number(child.serviceCost) * bdiMult +
                Number(child.otherCost) * bdiMult
              ) * qty;
            });
          } else {
            const qty = Number(item.quantity);
            const material = includeMaterial ? Number(item.materialCost) : 0;
            const labor = Number(item.laborCost);
            const config = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, aplicarEncargosSociais: true };
            const bdiMult = calcBDI(config.additionalIncrement, config.discount || 0);
            const laborWithCharges = labor * (1 + (config.aplicarEncargosSociais !== false ? socialCharges : 0) / 100);
            total += (
              (config.applyBdiToMaterial ? material * bdiMult : material) +
              (config.applyBdiToLabor ? laborWithCharges * bdiMult : laborWithCharges) +
              Number(item.equipmentCost) * bdiMult +
              Number(item.serviceCost) * bdiMult +
              Number(item.otherCost) * bdiMult
            ) * qty;
          }
        });
        const subStages = stages.filter(s => s.parentStageId === stage.id);
        collectItems(subStages);
      });
    };
    collectItems(rootStages);
    return total;
  }, [totalContratoWithBdi, stages, bdiConfigs, adminCentral, warranty, risk, profit, taxes, socialCharges, includeMaterial]);
  const baseContractTotal = baseContractTotalFallback;

  // ─── Exportar Boletim de Medição em PDF ─────────────────────────────────────
  const handleExportBoletimPDF = async () => {
    if (!selectedPeriodId) {
      toast.error("Selecione um período de medição antes de exportar o PDF.");
      return;
    }
    setIsExportingPDF(true);
    const toastId = toast.loading("Gerando Boletim de Medição em PDF...");
    try {
      // Buscar dados do servidor
      const serverData = await utils.measurements.getBoletimData.fetch({
        budgetId,
        periodId: selectedPeriodId,
      });

      // ── Parâmetros BDI ────────────────────────────────────────────────────
      const { socialCharges: sc, adminCentral: ac, profit: pr, taxes: tx, risk: rk, warranty: wa } = serverData.budget;
      const calcBDIMult = (additionalBdi = 0, discount = 0) => {
        const num = (1 + ac / 100) * (1 + wa / 100) * (1 + rk / 100);
        const den = 1 - pr / 100 - tx / 100;
        const base = den > 0 ? num / den : 1;
        return base * (1 + additionalBdi / 100) * (1 - discount / 100);
      };

      const includeMat = serverData.budget.includeMaterial;
      const calcItemTotal = (item: any): number => {
        const qty = Number(item.quantity);
        const mat = includeMat ? Number(item.materialCost) : 0;
        const lab = Number(item.laborCost);
        const eq = Number(item.equipmentCost);
        const svc = Number(item.serviceCost);
        const oth = Number(item.otherCost);
        const cfg = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, aplicarEncargosSociais: true };
        const bdiMult = calcBDIMult(cfg.additionalIncrement, cfg.discount || 0);
        const laborWithCharges = lab * (1 + (cfg.aplicarEncargosSociais !== false ? sc : 0) / 100);
        const matB = cfg.applyBdiToMaterial ? mat * bdiMult : mat;
        const labB = cfg.applyBdiToLabor ? laborWithCharges * bdiMult : laborWithCharges;
        return (matB + labB + eq * bdiMult + svc * bdiMult + oth * bdiMult) * qty;
      };

      // ── Mapas de medição ─────────────────────────────────────────────────
      const selectedPeriodData = serverData.selectedPeriod;

      // % medido no período selecionado por budgetItemId
      const periodMeasMap: Record<number, { percentMeasured: number; valueMeasured: number }> = {};
      serverData.allMeasurementItems.forEach((mi: any) => {
        if (Number(mi.periodId) === Number(selectedPeriodData.id)) {
          periodMeasMap[Number(mi.budgetItemId)] = {
            percentMeasured: Number(mi.percentMeasured),
            valueMeasured: Number(mi.valueMeasured),
          };
        }
      });

      // % acumulado de períodos ANTERIORES ao selecionado por budgetItemId
      const accumMap: Record<number, number> = {};
      serverData.allPeriods
        .filter(p => p.periodNumber < selectedPeriodData.periodNumber)
        .forEach(p => {
          serverData.allMeasurementItems.forEach((mi: any) => {
            if (Number(mi.periodId) === Number(p.id)) {
              const key = Number(mi.budgetItemId);
              accumMap[key] = Math.min(100, (accumMap[key] || 0) + Number(mi.percentMeasured));
            }
          });
        });

      // ── Construir linhas hierárquicas do orçamento original ───────────────
      // Função recursiva que processa etapas e seus filhos
      const buildRows = (stageList: BudgetStage[], depth: number, counterPrefix: string): BoletimItemRow[] => {
        const rows: BoletimItemRow[] = [];
        let stageCounter = 1;
        stageList.forEach(stage => {
          const stageNum = counterPrefix ? `${counterPrefix}.${stageCounter}` : String(stageCounter);
          stageCounter++;

          // Calcular totais recursivamente para a etapa (inclui sub-etapas)
          const calcStageTotals = (s: BudgetStage): { total: number; medPeriodo: number; acumulado: number } => {
            let total = 0, medPeriodo = 0, acumulado = 0;
            s.items.forEach(item => {
              if (item.type === 'composite') {
                (item.children || []).forEach(child => {
                  const t = calcItemTotal(child);
                  total += t;
                  const mi = periodMeasMap[Number(child.id)];
                  medPeriodo += mi ? Number(mi.valueMeasured) : 0;
                  const prevPct = accumMap[Number(child.id)] || 0;
                  const miPct = mi ? Number(mi.percentMeasured) : 0;
                  acumulado += t * Math.min(100, prevPct + miPct) / 100;
                });
              } else {
                const t = calcItemTotal(item);
                total += t;
                const mi = periodMeasMap[Number(item.id)];
                medPeriodo += mi ? Number(mi.valueMeasured) : 0;
                const prevPct = accumMap[Number(item.id)] || 0;
                const miPct = mi ? Number(mi.percentMeasured) : 0;
                acumulado += t * Math.min(100, prevPct + miPct) / 100;
              }
            });
            // Incluir sub-etapas no total
            const subStages = stages.filter(ss => ss.parentStageId === s.id);
            subStages.forEach(sub => {
              const subTotals = calcStageTotals(sub);
              total += subTotals.total;
              medPeriodo += subTotals.medPeriodo;
              acumulado += subTotals.acumulado;
            });
            return { total, medPeriodo, acumulado };
          };

          const { total: stageTotalWithBdi, medPeriodo: stageMedidoPeriodo, acumulado: stageAcumulado } = calcStageTotals(stage);

          rows.push({
            itemNumber: stageNum,
            description: stage.name,
            unit: "", quantity: 0, unitCostWithBdi: 0,
            totalWithBdi: stageTotalWithBdi,
            percentMedidoPeriodo: stageTotalWithBdi > 0 ? (stageMedidoPeriodo / stageTotalWithBdi) * 100 : 0,
            valueMedidoPeriodo: stageMedidoPeriodo,
            percentAcumulado: stageTotalWithBdi > 0 ? (stageAcumulado / stageTotalWithBdi) * 100 : 0,
            valueAcumulado: stageAcumulado,
            saldo: stageTotalWithBdi - stageAcumulado,
            isStage: true,
            depth,
          });

          // Sub-etapas (recursão)
          const subStages = stages.filter(s2 => s2.parentStageId === stage.id);
          if (subStages.length > 0) {
            rows.push(...buildRows(subStages, depth + 1, stageNum));
          } else {
            // Itens da etapa
            let itemCounter = 1;
            stage.items.forEach(item => {
              if (item.type === 'composite') {
                (item.children || []).forEach(child => {
                  const t = calcItemTotal(child);
                  const mi = periodMeasMap[Number(child.id)];
                  const prevPct = accumMap[Number(child.id)] || 0;
                  const miPct = mi ? Number(mi.percentMeasured) : 0;
                  const accumPct = Math.min(100, prevPct + miPct);
                  rows.push({
                    itemNumber: `${stageNum}.${itemCounter++}`,
                    description: child.description,
                    unit: child.unit,
                    quantity: Number(child.quantity),
                    unitCostWithBdi: Number(child.quantity) > 0 ? t / Number(child.quantity) : 0,
                    totalWithBdi: t,
                    percentMedidoPeriodo: miPct,
                    valueMedidoPeriodo: mi ? Number(mi.valueMeasured) : 0,
                    percentAcumulado: accumPct,
                    valueAcumulado: t * accumPct / 100,
                    saldo: t - t * accumPct / 100,
                    isStage: false,
                    depth: depth + 1,
                  });
                });
              } else {
                const t = calcItemTotal(item);
                const mi = periodMeasMap[Number(item.id)];
                const prevPct = accumMap[Number(item.id)] || 0;
                const miPct = mi ? Number(mi.percentMeasured) : 0;
                const accumPct = Math.min(100, prevPct + miPct);
                rows.push({
                  itemNumber: `${stageNum}.${itemCounter++}`,
                  description: item.description,
                  unit: item.unit,
                  quantity: Number(item.quantity),
                  unitCostWithBdi: Number(item.quantity) > 0 ? t / Number(item.quantity) : 0,
                  totalWithBdi: t,
                  percentMedidoPeriodo: miPct,
                  valueMedidoPeriodo: mi ? Number(mi.valueMeasured) : 0,
                  percentAcumulado: accumPct,
                  valueAcumulado: t * accumPct / 100,
                  saldo: t - t * accumPct / 100,
                  isStage: false,
                  depth: depth + 1,
                });
              }
            });
          }
        });
        return rows;
      };

      const rootStagesList = stages.filter(s => !s.parentStageId);
      const itemRows = buildRows(rootStagesList, 0, "");

      // ── Totais do orçamento original ──────────────────────────────────────
      let totalContrato = 0;
      let totalMedidoPeriodo = 0;
      let totalMedidoAcumulado = 0;
      itemRows.filter(r => !r.isStage).forEach(r => {
        totalContrato += r.totalWithBdi;
        totalMedidoPeriodo += r.valueMedidoPeriodo;
        totalMedidoAcumulado += r.valueAcumulado;
      });

      // ── Histórico de períodos com totais ──────────────────────────────────
      const approvedAdditivesTotal = serverData.approvedAdditives.reduce((s: number, a: any) => s + (a.totalCostWithBdi || 0), 0);
      const totalContratoComAditivos = totalContrato + approvedAdditivesTotal;
      let runningAccum = 0;
      const allPeriodsFormatted = serverData.allPeriods
        .sort((a, b) => a.periodNumber - b.periodNumber)
        .map(p => {
          let periodTotal = 0;
          serverData.allMeasurementItems.forEach((mi: any) => {
            if (Number(mi.periodId) === Number(p.id)) periodTotal += Number(mi.valueMeasured);
          });
          runningAccum += periodTotal;
          return {
            periodNumber: p.periodNumber,
            name: p.name,
            startDate: p.startDate,
            endDate: p.endDate,
            status: p.status,
            totalMedidoPeriodo: periodTotal,
            totalMedidoAcumulado: runningAccum,
            percentAcumulado: totalContratoComAditivos > 0 ? (runningAccum / totalContratoComAditivos) * 100 : 0,
          };
        });

      // Montar seções de aditivos
      const additivesSections: BoletimAdditiveSection[] = [];
      for (const additive of serverData.approvedAdditives) {
        const addStages = serverData.additiveStagesAll.filter((s: any) => s.additiveId === additive.id);
        const addItems = serverData.additiveItemsAll.filter((i: any) => i.additiveId === additive.id);

        // Mapa de medições do aditivo no período selecionado
        const addMeasPeriod: Record<number, { measuredPercent: number; measuredValue: number }> = {};
        const addMeasAccum: Record<number, number> = {};
        serverData.additiveMeasurements.forEach((am: any) => {
          const amAdditiveId = am.additiveId || am.additiveid;
          const amAdditiveItemId = am.additiveItemId || am.additiveitemid;
          const amPeriodId = am.periodId || am.periodid;
          const amPeriodNumber = am.periodNumber || am.periodnumber;
          if (amAdditiveId !== additive.id) return;
          if (amPeriodId === selectedPeriodId) {
            addMeasPeriod[amAdditiveItemId] = {
              measuredPercent: parseFloat(am.measuredPercent || am.measuredpercent || "0"),
              measuredValue: parseFloat(am.measuredValue || am.measuredvalue || "0"),
            };
          }
          if (amPeriodNumber < selectedPeriodData.periodNumber) {
            addMeasAccum[amAdditiveItemId] = Math.min(100,
              (addMeasAccum[amAdditiveItemId] || 0) + parseFloat(am.measuredPercent || am.measuredpercent || "0")
            );
          }
        });

        // Calcular total do aditivo por item
        const calcAddItemTotal = (item: any): number => {
          const qty = Number(item.quantity || 1);
          const mat = Number(item.includeMaterial ?? 1) ? Number(item.materialCost || item.materialcost || 0) : 0;
          const lab = Number(item.laborCost || item.laborcost || 0);
          const eq = Number(item.equipmentCost || item.equipmentcost || 0);
          const svc = Number(item.serviceCost || item.servicecost || 0);
          const oth = Number(item.otherCost || item.othercost || 0);
          const applyBdiMat = Number(item.applyBdiToMaterial ?? item.applybditomaterial ?? 1);
          const applyBdiLab = Number(item.applyBdiToLabor ?? item.applybditolabor ?? 1);
          const aplicarEnc = Number(item.aplicarEncargosSociais ?? item.aplicarencargossociais ?? 1);
          const addInc = Number(item.additionalIncrement || item.additionalincrement || 0);
          const disc = Number(item.discount || 0);
          const bdiMult = calcBDIMult(addInc, disc);
          const labWithCharges = lab * (1 + (aplicarEnc ? sc : 0) / 100);
          const matB = applyBdiMat ? mat * bdiMult : mat;
          const labB = applyBdiLab ? labWithCharges * bdiMult : labWithCharges;
          return (matB + labB + eq * bdiMult + svc * bdiMult + oth * bdiMult) * qty;
        };

        // Montar hierarquia de etapas do aditivo
        const stageMap: Record<number, any> = {};
        const rootAddStages: any[] = [];
        addStages.forEach((s: any) => { stageMap[s.id] = { ...s, items: [], children: [] }; });
        addStages.forEach((s: any) => {
          if (s.parentStageId && stageMap[s.parentStageId]) stageMap[s.parentStageId].children.push(stageMap[s.id]);
          else rootAddStages.push(stageMap[s.id]);
        });
        addItems.forEach((item: any) => {
          const sid = item.stageId || item.stageid;
          if (sid && stageMap[sid]) stageMap[sid].items.push(item);
        });

        const addRows: BoletimItemRow[] = [];
        let addTotalMedidoPeriodo = 0;
        let addTotalAcumulado = 0;
        let addCounter = 1;

        const buildAddRows = (stageList: any[], depth: number, prefix: string) => {
          let sc2 = 1;
          stageList.forEach(stage => {
            const sNum = prefix ? `${prefix}.${sc2}` : String(sc2);
            sc2++;
            let stageTot = 0, stageMed = 0, stageAcc = 0;
            stage.items.forEach((item: any) => {
              const t = calcAddItemTotal(item);
              stageTot += t;
              const itemId = item.id;
              const mp = addMeasPeriod[itemId];
              if (mp) stageMed += mp.measuredValue;
              const prevPct = addMeasAccum[itemId] || 0;
              const miPct = mp ? mp.measuredPercent : 0;
              stageAcc += t * Math.min(100, prevPct + miPct) / 100;
            });
            if (stage.children.length > 0) {
              stage.children.forEach((child: any) => {
                child.items.forEach((item: any) => {
                  const t = calcAddItemTotal(item);
                  stageTot += t;
                  const itemId = item.id;
                  const mp = addMeasPeriod[itemId];
                  if (mp) stageMed += mp.measuredValue;
                  const prevPct = addMeasAccum[itemId] || 0;
                  const miPct = mp ? mp.measuredPercent : 0;
                  stageAcc += t * Math.min(100, prevPct + miPct) / 100;
                });
              });
            }
            addRows.push({
              itemNumber: sNum,
              description: stage.name,
              unit: "", quantity: 0, unitCostWithBdi: 0,
              totalWithBdi: stageTot,
              percentMedidoPeriodo: stageTot > 0 ? (stageMed / stageTot) * 100 : 0,
              valueMedidoPeriodo: stageMed,
              percentAcumulado: stageTot > 0 ? (stageAcc / stageTot) * 100 : 0,
              valueAcumulado: stageAcc,
              saldo: stageTot - stageAcc,
              isStage: true,
              depth,
            });
            if (stage.children.length > 0) {
              buildAddRows(stage.children, depth + 1, sNum);
            } else {
              let ic = 1;
              stage.items.forEach((item: any) => {
                const t = calcAddItemTotal(item);
                const itemId = item.id;
                const mp = addMeasPeriod[itemId];
                const prevPct = addMeasAccum[itemId] || 0;
                const miPct = mp ? mp.measuredPercent : 0;
                const accumPct = Math.min(100, prevPct + miPct);
                addTotalMedidoPeriodo += mp ? mp.measuredValue : 0;
                addTotalAcumulado += t * accumPct / 100;
                addRows.push({
                  itemNumber: `${sNum}.${ic++}`,
                  description: item.description || item.name || "",
                  unit: item.unit || "",
                  quantity: Number(item.quantity || 1),
                  unitCostWithBdi: Number(item.quantity || 1) > 0 ? t / Number(item.quantity || 1) : 0,
                  totalWithBdi: t,
                  percentMedidoPeriodo: miPct,
                  valueMedidoPeriodo: mp ? mp.measuredValue : 0,
                  percentAcumulado: accumPct,
                  valueAcumulado: t * accumPct / 100,
                  saldo: t - t * accumPct / 100,
                  isStage: false,
                  depth: depth + 1,
                });
              });
            }
          });
        };

        buildAddRows(rootAddStages, 0, "");
        additivesSections.push({
          additiveName: additive.name,
          additiveTotal: additive.totalCostWithBdi,
          items: addRows,
          totalMedidoPeriodo: addTotalMedidoPeriodo,
          totalMedidoAcumulado: addTotalAcumulado,
        });
      }

      // Montar BoletimData
      const boletimData: BoletimData = {
        budgetTitle,
        company: companySettings || serverData.company,
        client: serverData.client,
        projectName: serverData.projectName,
        selectedPeriod: {
          id: selectedPeriodData.id,
          name: selectedPeriodData.name,
          periodNumber: selectedPeriodData.periodNumber,
          startDate: selectedPeriodData.startDate,
          endDate: selectedPeriodData.endDate,
        },
        allPeriods: allPeriodsFormatted,
        totalContrato: baseContractTotal,
        totalMedidoPeriodo,
        totalMedidoAcumulado,
        totalAditivos: approvedAdditivesTotal,
        items: itemRows,
        additives: additivesSections,
      };

      await exportBoletimPDF(boletimData);
      toast.dismiss(toastId);
      toast.success("Boletim de Medição exportado com sucesso!");
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Erro ao gerar PDF: " + (err?.message || "Erro desconhecido"));
      console.error("[BoletimPDF] Erro:", err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho: Resumo financeiro ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800 rounded-lg p-3 text-white">
          <div className="text-xs text-slate-300 mb-1">Valor do Contrato</div>
          <div className="text-base font-bold">{fmtBRL(baseContractTotal)}</div>
        </div>
        <div className="bg-blue-700 rounded-lg p-3 text-white">
          <div className="text-xs text-blue-200 mb-1">Saldo Medido</div>
          <div className="text-base font-bold">{fmtBRL(saldoMedidoTotal)}</div>
        </div>
        <div className="bg-orange-700 rounded-lg p-3 text-white">
          <div className="text-xs text-orange-200 mb-1">Saldo Residual (a medir)</div>
          <div className="text-base font-bold">{fmtBRL(Math.max(0, baseContractTotal - saldoMedidoTotal))}</div>
        </div>
        <div className="bg-emerald-700 rounded-lg p-3 text-white">
          <div className="text-xs text-emerald-200 mb-1">Evolução da Obra</div>
          <div className="text-base font-bold">
            {(baseContractTotal > 0 ? (saldoMedidoTotal / baseContractTotal) * 100 : 0).toFixed(1)}%
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-emerald-900/50 overflow-hidden">
            <div
              className="h-full bg-white/80 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, baseContractTotal > 0 ? (saldoMedidoTotal / baseContractTotal) * 100 : 0))}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Barra de ações: Período ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Label className="text-xs whitespace-nowrap font-semibold">Período de Medição:</Label>
          <Select
            value={selectedPeriodId?.toString() ?? ""}
            onValueChange={v => {
              setSelectedPeriodId(v ? Number(v) : null);
            }}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Selecione um período..." />
            </SelectTrigger>
            <SelectContent>
              {(periods as MeasurementPeriod[]).map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>
                  <span className="flex items-center gap-2">
                    {p.status === "closed" ? <Lock className="w-3 h-3 text-gray-400" /> : <Unlock className="w-3 h-3 text-green-500" />}
                    {p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setShowNewPeriodDialog(true)}>
          <Plus className="w-3 h-3" /> Novo Período
        </Button>

        {selectedPeriod?.status === "open" && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1 text-amber-700 border-amber-300"
            onClick={() => updatePeriod.mutate({ id: selectedPeriod.id, status: "closed" })}>
            <Lock className="w-3 h-3" /> Fechar Período
          </Button>
        )}

        {selectedPeriod?.status === "closed" && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1 text-green-700 border-green-300"
            onClick={() => updatePeriod.mutate({ id: selectedPeriod.id, status: "open" })}>
            <Unlock className="w-3 h-3" /> Reabrir Período
          </Button>
        )}

        {selectedPeriod && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1 text-red-600 border-red-200"
            onClick={() => { if (confirm("Excluir este período e todas as medições?")) deletePeriod.mutate({ id: selectedPeriod.id }); }}>
            <Trash2 className="w-3 h-3" /> Excluir Período
          </Button>
        )}

        {/* Botão Exportar Boletim PDF */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
          disabled={!selectedPeriodId || isExportingPDF}
          onClick={handleExportBoletimPDF}
          title={!selectedPeriodId ? "Selecione um período para exportar" : "Exportar Boletim de Medição em PDF"}
        >
          {isExportingPDF ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> Gerando PDF...</>
          ) : (
            <><Download className="w-3 h-3" /> Exportar Boletim PDF</>
          )}
        </Button>
      </div>

      {/* ── Aviso de período fechado ── */}
      {selectedPeriod?.status === "closed" && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800">
          <Lock className="w-3 h-3" />
          Este período está <strong>fechado</strong>. Reabra para editar as medições.
        </div>
      )}

      {/* ── Abas: Orçamento Original + Aditivos Aprovados ── */}
      <div className="border rounded-lg overflow-hidden">
        {/* Tab headers */}
        <div className="flex overflow-x-auto bg-slate-100 border-b">
          <button
            type="button"
            onClick={() => setActiveTab("original")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-r transition-colors",
              activeTab === "original"
                ? "bg-white text-slate-900 border-b-2 border-b-slate-700 -mb-px"
                : "text-slate-600 hover:bg-slate-200"
            )}
          >
            <FileText className="w-3 h-3" />
            Orçamento Original
          </button>
          {approvedAdditives.map((additive: any) => (
            <button
              key={additive.id}
              type="button"
              onClick={() => setActiveTab(additive.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-r transition-colors",
                activeTab === additive.id
                  ? "bg-white text-emerald-900 border-b-2 border-b-emerald-600 -mb-px"
                  : "text-slate-600 hover:bg-slate-200"
              )}
            >
              <TrendingUp className="w-3 h-3 text-emerald-600" />
              {additive.name}
              <span className="ml-1 text-xs bg-emerald-100 text-emerald-700 rounded px-1">
                {fmtBRL(Number(additive.totalCostWithBdi || 0))}
              </span>
            </button>
          ))}
          {approvedAdditives.length === 0 && (
            <div className="px-4 py-2.5 text-xs text-slate-400 italic">
              Nenhum aditivo aprovado — aprove um aditivo na aba "Aditivos" para medi-lo aqui
            </div>
          )}
        </div>

        {/* Tab content */}
        <div className="p-3">
          {activeTab === "original" ? (
            <OriginalBudgetTab
              budgetId={budgetId}
              stages={stages}
              bdiConfigs={bdiConfigs}
              socialCharges={socialCharges}
              adminCentral={adminCentral}
              profit={profit}
              taxes={taxes}
              risk={risk}
              warranty={warranty}
              includeMaterial={includeMaterial}
              selectedPeriodId={selectedPeriodId}
              periods={periods as MeasurementPeriod[]}
            />
          ) : (
            (() => {
              const additive = approvedAdditives.find((a: any) => a.id === activeTab);
              if (!additive) return null;
              return (
                <AdditiveMeasurementTab
                  key={additive.id}
                  additiveId={additive.id}
                  additiveName={additive.name}
                  budgetParams={{ socialCharges, adminCentral, profit, taxes, risk, warranty }}
                  selectedPeriodId={selectedPeriodId}
                  periods={periods as MeasurementPeriod[]}
                />
              );
            })()
          )}
        </div>
      </div>

      {/* ── Dialog: Novo Período ── */}
      <Dialog open={showNewPeriodDialog} onOpenChange={setShowNewPeriodDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Período de Medição</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome do Período *</Label>
              <Input
                placeholder="Ex: Medição 01 - Janeiro/2026"
                value={newPeriodForm.name}
                onChange={e => setNewPeriodForm(f => ({ ...f, name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data Início</Label>
                <Input type="date" value={newPeriodForm.startDate}
                  onChange={e => setNewPeriodForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Data Fim</Label>
                <Input type="date" value={newPeriodForm.endDate}
                  onChange={e => setNewPeriodForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowNewPeriodDialog(false)}>Cancelar</Button>
            <Button type="button"
              onClick={() => createPeriod.mutate({ budgetId, name: newPeriodForm.name, startDate: newPeriodForm.startDate || undefined, endDate: newPeriodForm.endDate || undefined })}
              disabled={!newPeriodForm.name.trim() || createPeriod.isPending}
            >
              {createPeriod.isPending ? "Criando..." : "Criar Período"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
