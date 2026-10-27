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
  excludeMaterialOverride?: boolean;
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
 * Total do item com BDI — fórmula ÚNICA usada pela aba Medições (Saldo
 * Medido) e pelo gráfico de Avanço Físico, para os dois sempre baterem.
 * Respeita bdiConfigs por item, includeMaterial do orçamento, overrides de
 * material, encargos e ajustes manuais.
 */
export function calcItemTotalWithBdiShared(
  item: any,
  bdiConfigs: Record<number, BdiConfigEntry>,
  params: BudgetBdiParams
): number {
  const { socialCharges, adminCentral, profit, taxes, risk, warranty, includeMaterial } = params;
  const qty = Number(item.quantity);
  const rawMaterial = Number(item.materialCost);
  const labor = Number(item.laborCost);
  const equipment = Number(item.equipmentCost);
  const service = Number(item.serviceCost);
  const other = Number(item.otherCost);
  const config = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0 };
  const material = Number(item.excludeMaterialOverride) === 1
    ? 0
    : (includeMaterial || Number(item.includeMaterialOverride) === 1) ? rawMaterial : 0;
  const aplicarEncargos = Number(item.aplicarEncargosSociais) !== 0;
  const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
  const denominator = 1 - profit / 100 - taxes / 100;
  const baseBDI = denominator > 0 ? (numerator / denominator - 1) : 0;
  const bdiMult = 1 + baseBDI + (config.additionalIncrement || 0) / 100 - (config.discount || 0) / 100;
  const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
  const matWithBdi = config.applyBdiToMaterial ? material * bdiMult : material;
  const laborWithBdi = config.applyBdiToLabor ? laborWithCharges * bdiMult : laborWithCharges;
  const laborBucket = laborWithBdi + equipment * bdiMult + service * bdiMult + other * bdiMult;
  const matAdjPct = Number(item.materialAdjustment) || 0;
  const laborAdjPct = Number(item.laborAdjustment) || 0;
  return (matWithBdi * (1 + matAdjPct / 100) + laborBucket * (1 + laborAdjPct / 100)) * qty;
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
    const calcItemTotalWithBdi = (item: any): number =>
      calcItemTotalWithBdiShared(item, bdiConfigs, params);

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
  // Mesmas configurações de BDI por item da aba Medições (para os números baterem)
  const { data: bdiConfigsRaw = [] } = trpc.budgetItemBdiConfig.getByBudgetId.useQuery(
    { budgetId },
    { enabled: !!budgetId }
  );

  return useMemo(() => {
    const datedStages = stages.filter((s: any) => s.startDate && s.endDate);
    if (datedStages.length === 0) return null;

    const encargos = parseFloat(budget?.socialCharges || "0") / 100;
    const adminCentral = parseFloat(budget?.adminCentral || "0") / 100;
    const lucro = parseFloat(budget?.profit || "0") / 100;
    const impostos = parseFloat(budget?.taxes || "0") / 100;
    const risco = parseFloat(budget?.risk || "0") / 100;
    const garantia = parseFloat(budget?.warranty || "0") / 100;
    // Fórmula de BDI estava estruturalmente errada: nunca lia adminCentral
    // (faltava por completo) e tratava lucro/impostos como fatores
    // multiplicativos (1+lucro)*(1+impostos) em vez do denominador
    // 1-lucro-impostos da fórmula real (Comp. BDI / server/db.ts). Isso fazia
    // a curva "Realizado" (que usa esta função) usar um percentual de BDI bem
    // diferente do usado na curva "Planejado" (que usa stage.totalWithBdi,
    // calculado corretamente no servidor) — inflando ou reduzindo o "Avanço
    // Físico" mostrado sem relação com o progresso real da obra.
    // Não replica overrides por item (bdiConfigs) de propósito — mesma
    // simplificação documentada acima, pra ficar leve numa lista com vários
    // orçamentos (Home.tsx) — mas a fórmula base agora bate com a real.
    const bdiConfigsMap: Record<number, BdiConfigEntry> = Object.fromEntries(
      (bdiConfigsRaw as any[]).map((c: any) => [
        c.budgetItemId,
        {
          applyBdiToMaterial: c.applyBdiToMaterial,
          applyBdiToLabor: c.applyBdiToLabor,
          additionalIncrement: Number(c.additionalIncrement || 0),
          discount: c.discount !== undefined ? Number(c.discount) : undefined,
          aplicarEncargosSociais: c.aplicarEncargosSociais,
          includeMaterialOverride: Number(c.includeMaterialOverride) === 1,
          excludeMaterialOverride: Number(c.excludeMaterialOverride) === 1,
        },
      ])
    );
    const bdiParams: BudgetBdiParams = {
      socialCharges: encargos * 100,
      adminCentral: adminCentral * 100,
      profit: lucro * 100,
      taxes: impostos * 100,
      risk: risco * 100,
      warranty: garantia * 100,
      includeMaterial: Number(budget?.includeMaterial ?? 1) !== 0,
    };
    const itemTotalWithBdiLocal = (item: any) => calcItemTotalWithBdiShared(item, bdiConfigsMap, bdiParams);

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
      // Sem data no período: considera "hoje" (medição salva conta mesmo assim)
      const periodDate = p.endDate || p.startDate;
      measuredSnapshots.push({ date: periodDate ? new Date(periodDate) : new Date(), value });
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

    // Valor medido acumulado até agora = última medição salva (aberta OU fechada).
    const realizadoNowValue = measuredSnapshots.length > 0 ? measuredSnapshots[measuredSnapshots.length - 1].value : null;
    const chartData: AvancoFisicoChartPoint[] = months.map(({ label, monthEnd }) => {
      const planejadoValue = plannedValueAt(monthEnd);
      // Meses passados: valor na data de fim do mês. Mês atual: sempre o valor
      // mais recente salvo (não depende do fim do período de medição, então o
      // gráfico avança assim que a medição é salva/atualizada, sem fechar).
      const isCurrentMonth = monthEnd > today && monthEnd.getFullYear() === today.getFullYear() && monthEnd.getMonth() === today.getMonth();
      const realizadoValue = isCurrentMonth ? realizadoNowValue : monthEnd <= today ? realizadoAt(monthEnd) : null;
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
  }, [stages, budget, measurementPeriodsForChart, allMeasuredItemsForChart, bdiConfigsRaw]);
}

// Aditivos aprovados: total contratado e valor já medido (todos os períodos).
// Usado pra a evolução da obra incluir os aditivos, igual ao portal do cliente.
export function useAdditivesProgress(budgetId: number) {
  const { data } = trpc.additives.progressSummary.useQuery(
    { budgetId },
    { enabled: !!budgetId }
  );
  return {
    approvedTotal: data?.approvedTotal ?? 0,
    measuredTotal: data?.measuredTotal ?? 0,
    count: data?.count ?? 0,
  };
}
