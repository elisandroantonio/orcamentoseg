import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

// ─────────────────────────────────────────────────────────────────────────
// Hooks compartilhados de "avanço da obra" (planejado x realizado, saldo
// medido). Usados pela aba Medições (BudgetFinanceiro), pela aba Gantt
// (BudgetGantt) e pela visão geral do orçamento (BudgetDashboard) — extraído
// pra um lugar só pra garantir que os três lugares sempre mostrem o mesmo
// número, calculado do mesmo jeito.
// ─────────────────────────────────────────────────────────────────────────

export interface BdiConfigEntry {
  applyBdiToMaterial: boolean;
  applyBdiToLabor: boolean;
  additionalIncrement: number;
  discount?: number;
  aplicarEncargosSociais?: boolean;
  includeMaterialOverride?: boolean;
}

export interface BudgetBdiParams {
  socialCharges: number;
  adminCentral: number;
  profit: number;
  taxes: number;
  risk: number;
  warranty: number;
  includeMaterial: boolean;
}

/**
 * Saldo medido acumulado (soma de TODOS os períodos já medidos, não só até
 * um período selecionado) — usa a fórmula de BDI configurável por item
 * (bdiConfigs), a mesma da aba Medições. Precisa de `stages` no formato
 * retornado por `trpc.budgets.getStages` (com `.items`, cada item com
 * materialCost/laborCost/etc.).
 */
export function useSaldoMedido(
  budgetId: number,
  stages: any[],
  bdiConfigs: Record<number, BdiConfigEntry>,
  params: BudgetBdiParams
) {
  const { data: allBudgetMeasurementItems = [] } = trpc.measurements.listAllItemsForBudget.useQuery(
    { budgetId },
    { enabled: !!budgetId }
  );

  const { socialCharges, adminCentral, profit, taxes, risk, warranty, includeMaterial } = params;

  return useMemo(() => {
    const calcBDIMultiplier = (additionalBdi = 0, discount = 0) => {
      const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
      const denominator = 1 - profit / 100 - taxes / 100;
      const baseBdi = denominator > 0 ? numerator / denominator : 1;
      return baseBdi * (1 + additionalBdi / 100) * (1 - discount / 100);
    };

    const calcItemTotalWithBdi = (item: any): number => {
      const qty = Number(item.quantity);
      const rawMaterial = Number(item.materialCost);
      const labor = Number(item.laborCost);
      const equipment = Number(item.equipmentCost);
      const service = Number(item.serviceCost);
      const other = Number(item.otherCost);
      const config = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, aplicarEncargosSociais: true };
      const material = (includeMaterial || config.includeMaterialOverride) ? rawMaterial : 0;
      const aplicarEncargos = config.aplicarEncargosSociais !== false;
      const bdiMult = calcBDIMultiplier(config.additionalIncrement, config.discount || 0);
      const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
      const matWithBdi = config.applyBdiToMaterial ? material * bdiMult : material;
      const laborWithBdi = config.applyBdiToLabor ? laborWithCharges * bdiMult : laborWithCharges;
      const eqWithBdi = equipment * bdiMult;
      const svcWithBdi = service * bdiMult;
      const othWithBdi = other * bdiMult;
      return (matWithBdi + laborWithBdi + eqWithBdi + svcWithBdi + othWithBdi) * qty;
    };

    const accumPercentByItem: Record<number, number> = {};
    (allBudgetMeasurementItems as any[]).forEach((mi: any) => {
      accumPercentByItem[mi.budgetItemId] = Math.min(100, (accumPercentByItem[mi.budgetItemId] || 0) + Number(mi.percentMeasured));
    });

    const rootStages = stages.filter((s: any) => !s.parentStageId);
    const allItems: any[] = [];
    const collectItems = (stageList: any[]) => {
      stageList.forEach((stage: any) => {
        (stage.items || []).forEach((item: any) => {
          if (item.type !== "composite") allItems.push(item);
          if (item.children) item.children.forEach((c: any) => allItems.push(c));
        });
        const subStages = stages.filter((s: any) => s.parentStageId === stage.id);
        collectItems(subStages);
      });
    };
    collectItems(rootStages);

    let total = 0;
    allItems.forEach((item: any) => {
      const itemTotal = calcItemTotalWithBdi(item);
      const pct = accumPercentByItem[item.id] || 0;
      total += (itemTotal * pct) / 100;
    });
    return total;
  }, [allBudgetMeasurementItems, stages, bdiConfigs, socialCharges, adminCentral, profit, taxes, risk, warranty, includeMaterial]);
}

export interface AvancoFisicoChartPoint {
  period: string;
  planejado: number;
  realizado: number | null;
}

export interface AvancoFisicoResult {
  chartData: AvancoFisicoChartPoint[];
  totalBudgetDated: number;
  plannedTodayPercent: number;
  realizadoTodayPercent: number;
  deltaPercent: number;
  deltaValue: number;
}

/**
 * Avanço físico planejado (pelas datas de início/fim de cada etapa no
 * Gantt) x realizado (medições salvas). Só considera etapas com data de
 * início E fim preenchidas. Usa `stage.totalWithBdi` (a fórmula de BDI
 * simples, por orçamento, que o servidor já calcula em
 * `trpc.budgets.getStages`) — não usa bdiConfigs por item, pra ficar
 * consistente com o total que a própria tela do Gantt já mostra.
 */
export function useAvancoFisico(budgetId: number, stages: any[], budget: any): AvancoFisicoResult | null {
  const { data: measurementPeriodsForChart = [] } = trpc.measurements.listPeriods.useQuery(
    { budgetId },
    { enabled: !!budgetId }
  );
  const { data: allMeasuredItemsForChart = [] } = trpc.measurements.listAllItemsForBudget.useQuery(
    { budgetId },
    { enabled: !!budgetId }
  );

  return useMemo(() => {
    const datedStages = stages.filter((s: any) => s.startDate && s.endDate);
    if (datedStages.length === 0) return null;

    const encargos = parseFloat(budget?.socialCharges || "0") / 100;
    const lucro = parseFloat(budget?.profit || "0") / 100;
    const impostos = parseFloat(budget?.taxes || "0") / 100;
    const risco = parseFloat(budget?.risk || "0") / 100;
    const garantia = parseFloat(budget?.warranty || "0") / 100;
    const itemTotalWithBdiLocal = (item: any) => {
      const qty = parseFloat(item.quantity || "0");
      const material = parseFloat(item.materialCost || "0");
      const labor = parseFloat(item.laborCost || "0");
      const equipment = parseFloat(item.equipmentCost || "0");
      const service = parseFloat(item.serviceCost || "0");
      const other = parseFloat(item.otherCost || "0");
      const laborWithEncargos = labor * (1 + encargos);
      const subtotal = material + laborWithEncargos + equipment + service + other;
      const totalWithAllBdi = subtotal * (1 + lucro) * (1 + impostos) * (1 + risco) * (1 + garantia);
      return totalWithAllBdi * qty;
    };

    const measurableItems: any[] = [];
    datedStages.forEach((stage: any) => {
      (stage.items || []).forEach((item: any) => {
        if (item.type !== "composite") measurableItems.push(item);
        if (item.children) item.children.forEach((c: any) => measurableItems.push(c));
      });
    });

    const totalBudgetDated = datedStages.reduce((sum: number, s: any) => sum + parseFloat(s.totalWithBdi || "0"), 0);
    if (totalBudgetDated <= 0) return null;

    const sortedPeriods = [...(measurementPeriodsForChart as any[])].sort((a, b) => a.periodNumber - b.periodNumber);
    const itemAccumPercent: Record<number, number> = {};
    const measuredSnapshots: { date: Date; value: number }[] = [];
    sortedPeriods.forEach((p: any) => {
      (allMeasuredItemsForChart as any[])
        .filter((mi: any) => mi.periodId === p.id)
        .forEach((mi: any) => {
          itemAccumPercent[mi.budgetItemId] = Math.min(100, (itemAccumPercent[mi.budgetItemId] || 0) + Number(mi.percentMeasured));
        });
      let value = 0;
      measurableItems.forEach((item: any) => {
        const pct = itemAccumPercent[item.id] || 0;
        value += (itemTotalWithBdiLocal(item) * pct) / 100;
      });
      const periodDate = p.endDate || p.startDate;
      if (periodDate) measuredSnapshots.push({ date: new Date(periodDate), value });
    });

    const realizadoAt = (d: Date): number | null => {
      let last: number | null = null;
      for (const snap of measuredSnapshots) {
        if (snap.date <= d) last = snap.value;
      }
      return last;
    };

    const plannedValueAt = (d: Date): number => {
      let value = 0;
      datedStages.forEach((stage: any) => {
        const start = new Date(stage.startDate);
        const end = new Date(stage.endDate);
        const total = parseFloat(stage.totalWithBdi || "0");
        let frac: number;
        if (end <= start) {
          frac = d >= start ? 1 : 0;
        } else {
          frac = Math.min(1, Math.max(0, (d.getTime() - start.getTime()) / (end.getTime() - start.getTime())));
        }
        value += total * frac;
      });
      return value;
    };

    const minStart = new Date(Math.min(...datedStages.map((s: any) => new Date(s.startDate).getTime())));
    let maxEnd = new Date(Math.max(...datedStages.map((s: any) => new Date(s.endDate).getTime())));
    const today = new Date();
    const latestSnapshotDate = measuredSnapshots.length > 0 ? measuredSnapshots[measuredSnapshots.length - 1].date : minStart;
    maxEnd = new Date(Math.max(maxEnd.getTime(), today.getTime(), latestSnapshotDate.getTime()));

    const months: { label: string; monthEnd: Date }[] = [];
    let cursor = new Date(minStart.getFullYear(), minStart.getMonth(), 1);
    const last = new Date(maxEnd.getFullYear(), maxEnd.getMonth(), 1);
    while (cursor <= last) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      months.push({ label: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), monthEnd });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    const chartData: AvancoFisicoChartPoint[] = months.map(({ label, monthEnd }) => {
      const planejadoValue = plannedValueAt(monthEnd);
      const realizadoValue = monthEnd <= today ? realizadoAt(monthEnd) : null;
      return {
        period: label,
        planejado: (planejadoValue / totalBudgetDated) * 100,
        realizado: realizadoValue === null ? null : (realizadoValue / totalBudgetDated) * 100,
      };
    });

    const plannedTodayPercent = (plannedValueAt(today) / totalBudgetDated) * 100;
    const realizadoTodayValue = measuredSnapshots.length > 0 ? measuredSnapshots[measuredSnapshots.length - 1].value : 0;
    const realizadoTodayPercent = (realizadoTodayValue / totalBudgetDated) * 100;
    const deltaPercent = realizadoTodayPercent - plannedTodayPercent;

    return {
      chartData,
      totalBudgetDated,
      plannedTodayPercent,
      realizadoTodayPercent,
      deltaPercent,
      deltaValue: (deltaPercent / 100) * totalBudgetDated,
    };
  }, [stages, budget, measurementPeriodsForChart, allMeasuredItemsForChart]);
}
