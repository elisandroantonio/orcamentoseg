import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useSaldoMedido, useAvancoFisico } from "@/hooks/useBudgetProgress";
import { PlanejadoRealizadoChart } from "@/components/budget/PlanejadoRealizadoChart";
import {
  ArrowLeft,
  Pencil,
  BarChart2,
  CalendarRange,
  DollarSign,
  Layers,
  FileText,
  Clock,
  User,
  MapPin,
  TrendingUp,
  ClipboardList,
  Lock,
  Building2,
} from "lucide-react";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Rascunho", variant: "outline" },
  sent: { label: "Enviado", variant: "secondary" },
  approved: { label: "Aprovado", variant: "default" },
  rejected: { label: "Rejeitado", variant: "destructive" },
};

const workStatusLabels: Record<string, { label: string; color: string }> = {
  orcamento: { label: "Orçamento", color: "text-slate-600" },
  contrato: { label: "Em Contrato", color: "text-blue-600" },
  execucao: { label: "Em Execução", color: "text-green-600" },
  concluido: { label: "Concluído", color: "text-emerald-700" },
  cancelado: { label: "Cancelado", color: "text-red-600" },
};

export default function BudgetDashboard() {
  const { id } = useParams<{ id: string }>();
  const budgetId = parseInt(id || "0");

  const { data: budget, isLoading } = trpc.budgets.get.useQuery({ id: budgetId });
  const { data: stagesData = [] } = trpc.budgets.getStages.useQuery({ budgetId });
  const { data: clients } = trpc.clients.list.useQuery();
  const { data: measurementPeriods } = trpc.measurements.listPeriods.useQuery({ budgetId });
  const { data: additives } = trpc.additives.list.useQuery({ budgetId });
  const { data: freezeStatus } = trpc.budgetFreeze.getStatus.useQuery({ budgetId });
  const { data: bdiConfigsData = [] } = trpc.budgetItemBdiConfig.getByBudgetId.useQuery(
    { budgetId },
    { enabled: !!budgetId }
  );

  // Avanço da obra (Saldo Medido / Avanço Físico) — precisam rodar ANTES dos
  // "return" de loading/não-encontrado abaixo, porque são hooks (regra dos
  // hooks: não pode chamar hook depois de um return condicional).
  const bdiConfigsMap = Object.fromEntries(
    (bdiConfigsData as any[]).map((c: any) => [
      c.budgetItemId,
      {
        applyBdiToMaterial: c.applyBdiToMaterial,
        applyBdiToLabor: c.applyBdiToLabor,
        additionalIncrement: Number(c.additionalIncrement || 0),
        discount: c.discount !== undefined ? Number(c.discount) : undefined,
        aplicarEncargosSociais: c.aplicarEncargosSociais,
      },
    ])
  );
  const includeMaterialForProgress = Number((budget as any)?.includeMaterial ?? 1) !== 0;
  const saldoMedidoTotal = useSaldoMedido(budgetId, stagesData, bdiConfigsMap, {
    socialCharges: Number(budget?.socialCharges || 0),
    adminCentral: Number((budget as any)?.adminCentral || 0),
    profit: Number(budget?.profit || 0),
    taxes: Number(budget?.taxes || 0),
    risk: Number(budget?.risk || 0),
    warranty: Number(budget?.warranty || 0),
    includeMaterial: includeMaterialForProgress,
  });
  const avancoFisico = useAvancoFisico(budgetId, stagesData, budget);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-72" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!budget) {
    return (
      <DashboardLayout>
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold mb-4">Orçamento não encontrado</h2>
          <Link href="/budgets">
            <Button>Voltar para Lista</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  // Dados do orçamento
  const client = clients?.find((c) => c.id === budget.clientId);
  const totalLaborHours = Number(budget.totalLaborHours || 0);
  const squareMeters = Number(budget.squareMeters || 0);

  // BDI (só para exibir os parâmetros no card "Informações Gerais")
  const socialCharges = Number(budget.socialCharges || 0);
  const adminCentral = Number((budget as any).adminCentral || 0);
  const profit = Number(budget.profit || 0);
  const taxes = Number(budget.taxes || 0);
  const risk = Number(budget.risk || 0);
  const warranty = Number(budget.warranty || 0);

  // budget.totalCost, no banco, JÁ vem COM BDI aplicado (é assim que o
  // servidor recalcula e grava, apesar do nome do campo) — usar isso como
  // "Total s/ BDI" e multiplicar de novo pelo BDI% (como este card fazia
  // antes) contava o BDI duas vezes, inflando bastante o "Total c/ BDI".
  // Agora: usamos budget.totalCost como o Total c/ BDI (valor preciso,
  // calculado no servidor considerando as configurações de BDI de cada
  // item) e recalculamos o Total s/ BDI a partir dos itens crus — mesma
  // lógica usada na tela de edição do orçamento.
  const totalWithBDI = Number(budget.totalCost || 0);
  const flatItemsForTotals = stagesData.flatMap((s: any) =>
    (s.items || []).flatMap((item: any) =>
      item.type === "composite" ? (item.children || []) : [item]
    )
  );
  const totalCost = flatItemsForTotals.reduce((sum: number, item: any) => {
    const qty = parseFloat(item.quantity || "0");
    const material = parseFloat(item.materialCost || "0");
    const labor = parseFloat(item.laborCost || "0");
    const equipment = parseFloat(item.equipmentCost || "0");
    const service = parseFloat(item.serviceCost || "0");
    const other = parseFloat(item.otherCost || "0");
    return sum + (material + labor + equipment + service + other) * qty;
  }, 0);
  const bdiValue = totalWithBDI - totalCost;
  const bdiPct = totalCost > 0 ? (bdiValue / totalCost) * 100 : 0;
  const costPerM2 = squareMeters > 0 ? totalWithBDI / squareMeters : 0;

  // Contagem de etapas e itens
  const rootStages = stagesData.filter((s: any) => !s.parentStageId);
  const totalItems = stagesData.reduce((acc: number, s: any) => acc + (s.items?.length || 0), 0);

  // Aditivos aprovados
  const additivesApproved = (additives || []).filter((a: any) => a.status === "approved");
  const additivesTotal = additivesApproved.reduce((acc: number, a: any) => acc + Number(a.totalCostWithBdi || 0), 0);

  // Última medição
  const lastPeriod = measurementPeriods && measurementPeriods.length > 0
    ? measurementPeriods[measurementPeriods.length - 1]
    : null;

  // Status de congelamento
  const isFrozen = !!freezeStatus?.frozen;
  const frozenAt = freezeStatus?.frozenAt
    ? new Date(String(freezeStatus.frozenAt)).toLocaleDateString("pt-BR")
    : null;

  const workStatus = (budget as any).workStatus || "orcamento";
  const workStatusInfo = workStatusLabels[workStatus] || workStatusLabels["orcamento"];
  const statusInfo = statusLabels[budget.status] || statusLabels["draft"];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Link href="/budgets">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Orçamentos
              </Button>
            </Link>
          </div>
          <div className="flex gap-2">
            <Link href={`/budgets/${budgetId}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-2" />
                Editar Orçamento
              </Button>
            </Link>
            <Link href={`/budgets/${budgetId}/charts`}>
              <Button variant="outline" size="sm">
                <BarChart2 className="h-4 w-4 mr-2" />
                Gráficos
              </Button>
            </Link>
            <Link href={`/budgets/${budgetId}/gantt`}>
              <Button variant="outline" size="sm">
                <CalendarRange className="h-4 w-4 mr-2" />
                Gantt
              </Button>
            </Link>
          </div>
        </div>

        {/* Título e status */}
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{budget.title}</h1>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              {isFrozen && (
                <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  <Lock className="h-3 w-3" />
                  Congelado em {frozenAt}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
              <span className="font-mono font-semibold text-primary">
                {(budget as any).code || `ORC-${budgetId}`}
              </span>
              <span className={`font-medium ${workStatusInfo.color}`}>
                {workStatusInfo.label}
              </span>
              <span>
                Criado em {new Date(budget.createdAt).toLocaleDateString("pt-BR")}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Cards de valores principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-slate-500">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Total s/ BDI
                  </p>
                  <p className="text-lg font-bold font-mono">
                    R$ {totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Total c/ BDI ({bdiPct.toFixed(2)}%)
                  </p>
                  <p className="text-lg font-bold font-mono text-blue-700">
                    R$ {totalWithBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Building2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Custo/m²
                  </p>
                  <p className="text-lg font-bold font-mono">
                    R$ {costPerM2.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {squareMeters.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m²
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Horas Homem
                  </p>
                  <p className="text-lg font-bold font-mono">
                    {totalLaborHours.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} h
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Avanço da obra: Saldo Medido / Saldo Residual / Evolução + Planejado x Realizado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-800 rounded-lg p-3 text-white">
            <div className="text-xs text-slate-300 mb-1">Valor do Contrato</div>
            <div className="text-base font-bold">
              R$ {totalWithBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-blue-700 rounded-lg p-3 text-white">
            <div className="text-xs text-blue-200 mb-1">Saldo Medido</div>
            <div className="text-base font-bold">
              R$ {saldoMedidoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-orange-700 rounded-lg p-3 text-white">
            <div className="text-xs text-orange-200 mb-1">Saldo Residual (a medir)</div>
            <div className="text-base font-bold">
              R$ {Math.max(0, totalWithBDI - saldoMedidoTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-emerald-700 rounded-lg p-3 text-white">
            <div className="text-xs text-emerald-200 mb-1">Evolução da Obra</div>
            <div className="text-base font-bold">
              {(totalWithBDI > 0 ? (saldoMedidoTotal / totalWithBDI) * 100 : 0).toFixed(1)}%
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-emerald-900/50 overflow-hidden">
              <div
                className="h-full bg-white/80 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, totalWithBDI > 0 ? (saldoMedidoTotal / totalWithBDI) * 100 : 0))}%` }}
              />
            </div>
          </div>
        </div>

        {avancoFisico && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Avanço Físico: Planejado x Realizado</CardTitle>
              <CardDescription>
                Planejado calculado pelas datas das etapas no Gantt; Realizado vem das medições salvas (aba Medições)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const { plannedTodayPercent, realizadoTodayPercent, deltaPercent, deltaValue } = avancoFisico;
                const atrasada = deltaPercent < -3;
                const adiantada = deltaPercent > 3;
                const badgeClass = atrasada
                  ? "bg-red-50 border-red-200 text-red-700"
                  : adiantada
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-green-50 border-green-200 text-green-700";
                const label = atrasada ? "Obra atrasada" : adiantada ? "Obra adiantada" : "Obra no prazo";
                return (
                  <div className={`rounded-lg border p-3 flex flex-wrap items-center justify-between gap-2 ${badgeClass}`}>
                    <div>
                      <div className="font-bold text-sm">{label}</div>
                      <div className="text-xs opacity-80">
                        Planejado até hoje: {plannedTodayPercent.toFixed(1)}% · Realizado: {realizadoTodayPercent.toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm">
                        {deltaPercent >= 0 ? "+" : ""}{deltaPercent.toFixed(1)} p.p.
                      </div>
                      <div className="text-xs opacity-80">
                        {deltaValue >= 0 ? "+" : "-"}R$ {Math.abs(deltaValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                );
              })()}
              <PlanejadoRealizadoChart data={avancoFisico.chartData} />
            </CardContent>
          </Card>
        )}

        {/* Informações gerais + Estrutura */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Informações gerais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Informações Gerais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-0.5">
                    Cliente
                  </p>
                  <p className="font-medium flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    {client ? client.name : "Não informado"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-0.5">
                    Projeto
                  </p>
                  <p className="font-medium flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {(budget as any).project?.name || "Não informado"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-0.5">
                    Encargos Sociais
                  </p>
                  <p className="font-medium">{socialCharges.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-0.5">
                    Adm. Central
                  </p>
                  <p className="font-medium">{adminCentral.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-0.5">
                    Lucro
                  </p>
                  <p className="font-medium">{profit.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-0.5">
                    Impostos
                  </p>
                  <p className="font-medium">{taxes.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-0.5">
                    Risco
                  </p>
                  <p className="font-medium">{risk.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-0.5">
                    Garantia
                  </p>
                  <p className="font-medium">{warranty.toFixed(2)}%</p>
                </div>
              </div>

              {(budget.description || (budget as any).observations) && (
                <>
                  <Separator />
                  {budget.description && (
                    <div>
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">
                        Descrição
                      </p>
                      <p className="text-sm">{budget.description}</p>
                    </div>
                  )}
                  {(budget as any).observations && (
                    <div>
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">
                        Observações
                      </p>
                      <p className="text-sm">{(budget as any).observations}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Estrutura do orçamento */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Estrutura do Orçamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted/40 rounded-lg">
                  <p className="text-3xl font-bold text-primary">{rootStages.length}</p>
                  <p className="text-sm text-muted-foreground mt-1">Etapas principais</p>
                </div>
                <div className="text-center p-4 bg-muted/40 rounded-lg">
                  <p className="text-3xl font-bold text-primary">{totalItems}</p>
                  <p className="text-sm text-muted-foreground mt-1">Composições/Serviços</p>
                </div>
                <div className="text-center p-4 bg-muted/40 rounded-lg">
                  <p className="text-3xl font-bold text-primary">
                    {(measurementPeriods || []).length}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Períodos de medição</p>
                </div>
                <div className="text-center p-4 bg-muted/40 rounded-lg">
                  <p className="text-3xl font-bold text-primary">
                    {additivesApproved.length}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Aditivos aprovados</p>
                </div>
              </div>

              {additivesApproved.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                    Valor total dos aditivos aprovados
                  </p>
                  <p className="text-base font-bold font-mono text-amber-800">
                    R$ {additivesTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}

              {lastPeriod && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-1">
                    Último período de medição
                  </p>
                  <p className="text-sm font-semibold text-green-800">
                    {(lastPeriod as any).name || `Período ${(measurementPeriods || []).length}`}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {(lastPeriod as any).status === "closed" ? "Fechado" : "Em aberto"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Atalhos para as abas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Acessar seções do orçamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Link href={`/budgets/${budgetId}/edit?tab=composicoes`}>
                <Button variant="outline" className="w-full h-auto py-3 flex flex-col gap-1.5">
                  <Layers className="h-5 w-5 text-blue-600" />
                  <span className="text-xs font-medium">Composições</span>
                </Button>
              </Link>
              <Link href={`/budgets/${budgetId}/edit?tab=medicoes`}>
                <Button variant="outline" className="w-full h-auto py-3 flex flex-col gap-1.5">
                  <ClipboardList className="h-5 w-5 text-green-600" />
                  <span className="text-xs font-medium">Medições</span>
                </Button>
              </Link>
              <Link href={`/budgets/${budgetId}/edit?tab=aditivos`}>
                <Button variant="outline" className="w-full h-auto py-3 flex flex-col gap-1.5">
                  <TrendingUp className="h-5 w-5 text-amber-600" />
                  <span className="text-xs font-medium">Aditivos</span>
                </Button>
              </Link>
              <Link href={`/budgets/${budgetId}/gantt`}>
                <Button variant="outline" className="w-full h-auto py-3 flex flex-col gap-1.5">
                  <CalendarRange className="h-5 w-5 text-purple-600" />
                  <span className="text-xs font-medium">Gantt</span>
                </Button>
              </Link>
              <Link href={`/budgets/${budgetId}/charts`}>
                <Button variant="outline" className="w-full h-auto py-3 flex flex-col gap-1.5">
                  <BarChart2 className="h-5 w-5 text-rose-600" />
                  <span className="text-xs font-medium">Gráficos</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
