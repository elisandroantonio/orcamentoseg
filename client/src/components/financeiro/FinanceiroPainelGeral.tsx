import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Wallet, BarChart3, Building2, Truck, CheckCircle, AlertCircle } from "lucide-react";

const formatCurrency = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

function getMonthRange(offset: number = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  const d = new Date(year, month, 1);
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
  return { from, to };
}

function getYearRange() {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

const PERIOD_OPTIONS = [
  { label: "Mês Atual", value: "current_month" },
  { label: "Mês Anterior", value: "last_month" },
  { label: "Ano Atual", value: "current_year" },
];

export default function FinanceiroPainelGeral() {
  const [period, setPeriod] = useState("current_month");

  const dateRange = useMemo(() => {
    if (period === "current_month") return getMonthRange(0);
    if (period === "last_month") return getMonthRange(-1);
    return getYearRange();
  }, [period]);

  const { data: summary, isLoading } = trpc.corporateFinance.summary.useQuery({
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
  });

  // Calcular KPIs a partir dos dados brutos
  const kpis = useMemo(() => {
    if (!summary) return { receitaObras: 0, custoObras: 0, receitaAdmin: 0, despesaAdmin: 0, despesaFrota: 0, receitaFrota: 0 };
    const rows = summary.kpiRows as any[];
    const get = (cc: string, type: string) => {
      const r = rows.find((r: any) => r.costCenter === cc && r.type === type);
      return parseFloat(r?.total || "0");
    };
    return {
      receitaObras: get("obra", "entrada"),
      custoObras: get("obra", "saida"),
      receitaAdmin: get("administrativo", "entrada"),
      despesaAdmin: get("administrativo", "saida"),
      receitaFrota: get("frota", "entrada"),
      despesaFrota: get("frota", "saida"),
    };
  }, [summary]);

  const resultadoLiquido = kpis.receitaObras + kpis.receitaAdmin + kpis.receitaFrota - kpis.custoObras - kpis.despesaAdmin - kpis.despesaFrota;
  const totalReceita = kpis.receitaObras + kpis.receitaAdmin + kpis.receitaFrota;
  const margem = totalReceita > 0 ? (resultadoLiquido / totalReceita) * 100 : 0;

  const byBudget = (summary?.byBudget as any[]) || [];
  const adminByCategory = (summary?.adminByCategory as any[]) || [];
  const monthly = (summary?.monthly as any[]) || [];

  // Agrupar categorias admin
  const adminCatMap: Record<string, { in: number; out: number }> = {};
  adminByCategory.forEach((r: any) => {
    if (!adminCatMap[r.category]) adminCatMap[r.category] = { in: 0, out: 0 };
    if (r.type === "entrada") adminCatMap[r.category].in += parseFloat(r.total);
    else adminCatMap[r.category].out += parseFloat(r.total);
  });

  // Agrupar mensal
  const monthlyMap: Record<string, { in: number; out: number }> = {};
  monthly.forEach((r: any) => {
    if (!monthlyMap[r.month]) monthlyMap[r.month] = { in: 0, out: 0 };
    if (r.type === "entrada") monthlyMap[r.month].in += parseFloat(r.total);
    else monthlyMap[r.month].out += parseFloat(r.total);
  });
  const monthlyData = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  const maxMonthly = Math.max(...monthlyData.map(([, v]) => Math.max(v.in, v.out)), 1);

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Painel Financeiro Geral</h2>
          <p className="text-sm text-gray-500">Visão consolidada da empresa</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* KPI Cards principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-green-600 font-medium">Receita Total</span>
                </div>
                <p className="text-xl font-bold text-green-700">{formatCurrency(totalReceita)}</p>
                <p className="text-xs text-green-500 mt-1">Obras + Admin + Frota</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-red-600 font-medium">Custo Total</span>
                </div>
                <p className="text-xl font-bold text-red-700">{formatCurrency(kpis.custoObras + kpis.despesaAdmin + kpis.despesaFrota)}</p>
                <p className="text-xs text-red-500 mt-1">Obras + Admin + Frota</p>
              </CardContent>
            </Card>
            <Card className={resultadoLiquido >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-blue-500" />
                  <span className="text-xs text-blue-600 font-medium">Resultado Líquido</span>
                </div>
                <p className={`text-xl font-bold ${resultadoLiquido >= 0 ? "text-blue-700" : "text-orange-700"}`}>{formatCurrency(resultadoLiquido)}</p>
                <p className="text-xs text-gray-400 mt-1">Receita − Custos</p>
              </CardContent>
            </Card>
            <Card className={margem >= 0 ? "bg-indigo-50 border-indigo-200" : "bg-red-50 border-red-200"}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs text-indigo-600 font-medium">Margem Operacional</span>
                </div>
                <p className={`text-xl font-bold ${margem >= 0 ? "text-indigo-700" : "text-red-700"}`}>{margem.toFixed(1)}%</p>
                <p className="text-xs text-gray-400 mt-1">Resultado / Receita</p>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown por centro de custo */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" /> Obras
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Receita</span>
                  <span className="font-semibold text-green-600">{formatCurrency(kpis.receitaObras)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Custo</span>
                  <span className="font-semibold text-red-600">{formatCurrency(kpis.custoObras)}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-700 font-medium">Resultado</span>
                  <span className={`font-bold ${kpis.receitaObras - kpis.custoObras >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                    {formatCurrency(kpis.receitaObras - kpis.custoObras)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-500" /> Administrativo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Receita</span>
                  <span className="font-semibold text-green-600">{formatCurrency(kpis.receitaAdmin)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Despesas</span>
                  <span className="font-semibold text-red-600">{formatCurrency(kpis.despesaAdmin)}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-700 font-medium">Resultado</span>
                  <span className={`font-bold ${kpis.receitaAdmin - kpis.despesaAdmin >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                    {formatCurrency(kpis.receitaAdmin - kpis.despesaAdmin)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Truck className="w-4 h-4 text-orange-500" /> Frota
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Receita</span>
                  <span className="font-semibold text-green-600">{formatCurrency(kpis.receitaFrota)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Despesas</span>
                  <span className="font-semibold text-red-600">{formatCurrency(kpis.despesaFrota)}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-700 font-medium">Resultado</span>
                  <span className={`font-bold ${kpis.receitaFrota - kpis.despesaFrota >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                    {formatCurrency(kpis.receitaFrota - kpis.despesaFrota)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Obras ativas */}
          {byBudget.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" /> Resultado por Obra Ativa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {byBudget.map((b: any) => {
                    const totalIn = parseFloat(b.totalIn || "0");
                    const totalOut = parseFloat(b.totalOut || "0");
                    const result = totalIn - totalOut;
                    const maxVal = Math.max(totalIn, totalOut, 1);
                    return (
                      <div key={b.budgetId} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {result >= 0
                              ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                              : <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                            }
                            <span className="text-sm font-medium text-gray-700 truncate max-w-xs">{b.budgetTitle}</span>
                            <Badge className="text-xs bg-blue-50 text-blue-600 border-blue-200">{{
              orcamento: 'Em Orçamento',
              contrato: 'Em Contrato',
              execucao: 'Em Execução',
              finalizada: 'Finalizada',
              nao_fechada: 'Não Fechada',
            }[b.workStatus as string] || b.workStatus}</Badge>
                          </div>
                          <span className={`text-sm font-bold ${result >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(result)}
                          </span>
                        </div>
                        <div className="flex gap-1 h-2">
                          <div className="bg-green-200 rounded-l" style={{ width: `${(totalIn / maxVal) * 50}%`, minWidth: totalIn > 0 ? "4px" : "0" }} title={`Entrada: ${formatCurrency(totalIn)}`} />
                          <div className="bg-red-200 rounded-r" style={{ width: `${(totalOut / maxVal) * 50}%`, minWidth: totalOut > 0 ? "4px" : "0" }} title={`Saída: ${formatCurrency(totalOut)}`} />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Entradas: {formatCurrency(totalIn)}</span>
                          <span>Saídas: {formatCurrency(totalOut)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Evolução mensal */}
          {monthlyData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500" /> Evolução Mensal (últimos 12 meses)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-32 overflow-x-auto pb-2">
                  {monthlyData.map(([month, vals]) => {
                    const [y, m] = month.split("-");
                    const label = `${m}/${y.slice(2)}`;
                    return (
                      <div key={month} className="flex flex-col items-center gap-1 min-w-[40px]">
                        <div className="flex items-end gap-0.5 h-24">
                          <div
                            className="w-4 bg-green-400 rounded-t"
                            style={{ height: `${(vals.in / maxMonthly) * 96}px` }}
                            title={`Entrada: ${formatCurrency(vals.in)}`}
                          />
                          <div
                            className="w-4 bg-red-400 rounded-t"
                            style={{ height: `${(vals.out / maxMonthly) * 96}px` }}
                            title={`Saída: ${formatCurrency(vals.out)}`}
                          />
                        </div>
                        <span className="text-xs text-gray-400">{label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded inline-block" /> Entradas</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded inline-block" /> Saídas</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Despesas admin por categoria */}
          {Object.keys(adminCatMap).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-500" /> Despesas Administrativas por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(adminCatMap)
                    .sort(([, a], [, b]) => b.out - a.out)
                    .map(([cat, vals]) => {
                      const totalAdmin = Object.values(adminCatMap).reduce((s, v) => s + v.out, 0);
                      const pct = totalAdmin > 0 ? (vals.out / totalAdmin) * 100 : 0;
                      return (
                        <div key={cat} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-700">{cat}</span>
                            <span className="font-semibold text-red-600">{formatCurrency(vals.out)}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full">
                            <div className="h-1.5 bg-purple-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-xs text-gray-400 text-right">{pct.toFixed(1)}% do total admin</p>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
