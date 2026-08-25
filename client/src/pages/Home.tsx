import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { TrendingUp, TrendingDown, RefreshCw, Pencil, HardHat, Wallet, History, LineChart as LineChartIcon } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAvancoFisico } from "@/hooks/useBudgetProgress";

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WORK_STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  orcamento: { label: "Orçamento", variant: "outline" },
  contrato: { label: "Em contrato", variant: "secondary" },
  execucao: { label: "Em execução", variant: "default" },
  finalizada: { label: "Finalizada", variant: "secondary" },
  nao_fechada: { label: "Não fechada", variant: "destructive" },
};

const formatCurrency = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

function getCurrentMonthRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function CubScCard() {
  const utils = trpc.useUtils();
  const { data: summary, isLoading } = trpc.cubSc.getSummary.useQuery();
  const refresh = trpc.cubSc.refresh.useMutation({
    onSuccess: (result) => {
      utils.cubSc.getSummary.invalidate();
      toast.success(
        result.upserted > 0
          ? `CUB/SC atualizado (${result.upserted} valores).`
          : "CUB/SC já estava atualizado."
      );
    },
    onError: (err) => {
      toast.error(err.message || "Não consegui buscar o CUB/SC automaticamente. Cadastre manualmente.");
    },
  });

  const now = new Date();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [value, setValue] = useState("");

  const setManual = trpc.cubSc.setManual.useMutation({
    onSuccess: () => {
      utils.cubSc.getSummary.invalidate();
      toast.success("Valor do CUB/SC salvo.");
      setDialogOpen(false);
      setValue("");
    },
    onError: (err) => {
      toast.error(err.message || "Não consegui salvar o valor.");
    },
  });

  function handleSaveManual() {
    const parsed = parseFloat(value.replace(/\./g, "").replace(",", "."));
    if (!parsed || parsed <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    setManual.mutate({ year, month, value: parsed });
  }

  function formatPct(pct: number | null) {
    if (pct === null || pct === undefined || Number.isNaN(pct)) return "—";
    const sign = pct > 0 ? "+" : "";
    return `${sign}${pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  function VariationRow({ label, pct }: { label: string; pct: number | null }) {
    const isUp = pct !== null && pct > 0;
    const isDown = pct !== null && pct < 0;
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={`flex items-center gap-1 font-medium ${
            isUp ? "text-red-600" : isDown ? "text-green-600" : "text-muted-foreground"
          }`}
        >
          {isUp && <TrendingUp className="h-3.5 w-3.5" />}
          {isDown && <TrendingDown className="h-3.5 w-3.5" />}
          {formatPct(pct)}
        </span>
      </div>
    );
  }

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-medium text-blue-900">CUB/SC</CardTitle>
          <CardDescription className="text-blue-600">Custo Unitário Básico — Santa Catarina</CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Cadastrar/corrigir valor manualmente">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar valor do CUB/SC</DialogTitle>
                <DialogDescription>
                  Use isso se a busca automática falhar, ou pra corrigir um valor. Valores cadastrados
                  manualmente nunca são sobrescritos pela busca automática.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-2">
                <div className="space-y-2">
                  <Label>Mês</Label>
                  <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_LABELS.map((label, idx) => (
                        <SelectItem key={idx} value={String(idx + 1)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ano</Label>
                  <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Valor (R$/m²)</Label>
                  <Input
                    placeholder="Ex: 3.151,24"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSaveManual} disabled={setManual.isPending}>
                  {setManual.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Buscar valor mais recente"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ) : summary ? (
          <>
            <div>
              <div className="text-2xl font-bold text-blue-700">
                R$ {summary.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                <span className="text-sm font-normal text-blue-500">/m²</span>
              </div>
              <p className="text-xs text-blue-500 mt-1">
                Referência: {summary.monthLabel}/{summary.year}
                {summary.source === "manual" ? " (ajustado manualmente)" : ""}
              </p>
            </div>
            <div className="space-y-1.5 pt-1 border-t border-blue-200">
              <VariationRow label="Variação no mês" pct={summary.monthlyVariationPct} />
              <VariationRow label="Acumulado no ano" pct={summary.yearToDateVariationPct} />
              <VariationRow label="Variação em 12 meses" pct={summary.twelveMonthVariationPct} />
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">Nenhum valor cadastrado ainda.</p>
            <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? "Buscando..." : "Buscar valor mais recente"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ValorEmExecucaoCard({ budgets }: { budgets: any[] | undefined }) {
  const [expanded, setExpanded] = useState(false);

  const list = useMemo(() => {
    return (budgets || []).filter((b) => b.workStatus === "execucao" || b.workStatus === "contrato");
  }, [budgets]);

  const total = useMemo(() => list.reduce((sum, b) => sum + Number(b.totalCost || 0), 0), [list]);
  const count = list.length;

  return (
    <Card className="bg-cyan-50 border-cyan-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-medium text-cyan-900">Valor em execução</CardTitle>
          <CardDescription className="text-cyan-600">Obras em contrato ou em execução</CardDescription>
        </div>
        <HardHat className="h-4 w-4 text-cyan-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-cyan-700">{formatCurrency(total)}</div>
        <button
          type="button"
          disabled={count === 0}
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-cyan-500 mt-1 hover:text-cyan-700 hover:underline disabled:hover:no-underline disabled:cursor-default"
        >
          {count === 0 ? "Nenhum orçamento em execução/contrato" : `${count} orçamento${count > 1 ? "s" : ""} ${expanded ? "▲" : "▼"}`}
        </button>

        {expanded && count > 0 && (
          <div className="mt-3 pt-3 border-t border-cyan-200 space-y-1">
            {list.map((budget) => {
              const statusInfo = WORK_STATUS_LABELS[budget.workStatus] || WORK_STATUS_LABELS.orcamento;
              return (
                <Link key={budget.id} href={`/budgets/${budget.id}`}>
                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-cyan-100 cursor-pointer">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate text-sm text-cyan-950">{budget.title}</p>
                        <Badge variant={statusInfo.variant} className="shrink-0">{statusInfo.label}</Badge>
                      </div>
                      <p className="text-xs text-cyan-600 truncate">
                        {budget.client?.name || "Sem cliente"}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="font-semibold text-sm text-cyan-900">{formatCurrency(budget.totalCost)}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResumoDoMesCard() {
  const { from, to } = useMemo(() => getCurrentMonthRange(), []);
  const { data: summary, isLoading } = trpc.corporateFinance.summary.useQuery({ dateFrom: from, dateTo: to });

  const { entradas, saidas } = useMemo(() => {
    const rows = (summary?.kpiRows as any[]) || [];
    return {
      entradas: rows.filter((r) => r.type === "entrada").reduce((sum, r) => sum + parseFloat(r.total || "0"), 0),
      saidas: rows.filter((r) => r.type === "saida").reduce((sum, r) => sum + parseFloat(r.total || "0"), 0),
    };
  }, [summary]);

  const saldo = entradas - saidas;
  const monthLabel = MONTH_LABELS[new Date().getMonth()];

  const positive = saldo >= 0;
  return (
    <Card className={positive ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className={`text-sm font-medium ${positive ? "text-green-900" : "text-red-900"}`}>Resumo do mês</CardTitle>
          <CardDescription className={positive ? "text-green-600" : "text-red-600"}>{monthLabel} — entradas x saídas</CardDescription>
        </div>
        <Wallet className={`h-4 w-4 ${positive ? "text-green-500" : "text-red-500"}`} />
      </CardHeader>
      <CardContent className="space-y-1.5">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <>
            <div className={`text-2xl font-bold ${positive ? "text-green-700" : "text-red-700"}`}>
              {formatCurrency(saldo)}
            </div>
            <div className={`flex items-center justify-between text-sm pt-1 border-t ${positive ? "border-green-200" : "border-red-200"}`}>
              <span className={positive ? "text-green-600" : "text-red-600"}>Entradas</span>
              <span className="font-medium text-green-600">{formatCurrency(entradas)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className={positive ? "text-green-600" : "text-red-600"}>Saídas</span>
              <span className="font-medium text-red-600">{formatCurrency(saidas)}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Curva S das obras ativas — grade de mini-curvas (planejado x realizado)
// pra cada orçamento em contrato/execução, ordenada da mais atrasada pra
// mais adiantada. Mesmo cálculo de "Avanço Físico" já usado na aba Gantt e
// na visão geral do orçamento (hook compartilhado useAvancoFisico).
// ─────────────────────────────────────────────────────────────────────────

const SPARK_W = 220;
const SPARK_H = 44;
const SPARK_PAD = 3;

function buildSparkPath(values: (number | null)[], w: number, h: number, pad: number) {
  const n = values.length;
  if (n < 2) return "";
  let d = "";
  values.forEach((v, i) => {
    if (v === null || v === undefined || Number.isNaN(v)) return;
    const x = pad + (i / (n - 1)) * (w - pad * 2);
    const clamped = Math.max(0, Math.min(100, v));
    const y = h - pad - (clamped / 100) * (h - pad * 2);
    d += (d === "" ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1) + " ";
  });
  return d.trim();
}

function CurvaSMiniCard({
  budget,
  onProgress,
}: {
  budget: any;
  onProgress: (id: number, delta: number | null) => void;
}) {
  const { data: budgetDetail } = trpc.budgets.get.useQuery({ id: budget.id });
  const { data: stagesData } = trpc.budgets.getStages.useQuery({ budgetId: budget.id });
  const stages = stagesData || [];
  const avanco = useAvancoFisico(budget.id, stages, budgetDetail);

  useEffect(() => {
    onProgress(budget.id, avanco ? avanco.deltaPercent : null);
  }, [avanco?.deltaPercent, budget.id, onProgress]);

  if (!avanco) {
    return (
      <Link href={`/budgets/${budget.id}`}>
        <div className="border rounded-lg p-4 bg-muted/30 hover:border-muted-foreground/40 transition-colors cursor-pointer h-full flex flex-col justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{budget.title}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{budget.client?.name || "Sem cliente"}</p>
          </div>
          <p className="text-xs text-muted-foreground">Configure as datas das etapas no Gantt pra ver a curva aqui.</p>
        </div>
      </Link>
    );
  }

  const delta = avanco.deltaPercent;
  const atrasada = delta < -3;
  const adiantada = delta > 3;
  const pillClass = atrasada
    ? "bg-red-50 text-red-700"
    : adiantada
    ? "bg-blue-50 text-blue-700"
    : "bg-green-50 text-green-700";
  const pillLabel = atrasada ? "Atrasada" : adiantada ? "Adiantada" : "No prazo";
  const deltaClass = atrasada ? "text-red-600" : adiantada ? "text-blue-600" : "text-green-600";

  const planejadoPath = buildSparkPath(avanco.chartData.map((d) => d.planejado), SPARK_W, SPARK_H, SPARK_PAD);
  const realizadoPath = buildSparkPath(avanco.chartData.map((d) => d.realizado), SPARK_W, SPARK_H, SPARK_PAD);

  return (
    <Link href={`/budgets/${budget.id}`}>
      <div className="border rounded-lg p-4 hover:border-foreground/30 transition-colors cursor-pointer h-full flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{budget.title}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{budget.client?.name || "Sem cliente"}</p>
          </div>
          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${pillClass}`}>
            {pillLabel}
          </span>
        </div>
        <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" className="w-full h-11">
          {planejadoPath && (
            <path
              d={planejadoPath}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeDasharray="3 3"
              strokeLinecap="round"
              className="text-muted-foreground/50"
            />
          )}
          {realizadoPath && (
            <path d={realizadoPath} fill="none" stroke="#0e7490" strokeWidth="2.2" strokeLinecap="round" />
          )}
        </svg>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">Realizado</p>
            <span className="text-lg font-semibold tabular-nums leading-none">
              {avanco.realizadoTodayPercent.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
            </span>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">Previsto p/ hoje</p>
            <span className="text-sm font-medium tabular-nums text-muted-foreground leading-none">
              {avanco.plannedTodayPercent.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
            </span>
          </div>
        </div>
        <div className={`text-xs font-medium tabular-nums text-right ${deltaClass}`}>
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(1)} p.p. {delta >= 0 ? "à frente" : "atrás"} do previsto
        </div>
      </div>
    </Link>
  );
}

function CurvaSGrid({ budgets }: { budgets: any[] | undefined }) {
  const active = useMemo(
    () => (budgets || []).filter((b) => b.workStatus === "execucao" || b.workStatus === "contrato"),
    [budgets]
  );

  const [progress, setProgress] = useState<Record<number, number | null>>({});
  const handleProgress = useCallback((id: number, delta: number | null) => {
    setProgress((prev) => (prev[id] === delta ? prev : { ...prev, [id]: delta }));
  }, []);

  const allReady = active.length > 0 && active.every((b) => b.id in progress);

  const ordered = useMemo(() => {
    if (!allReady) return active;
    return [...active].sort((a, b) => {
      const da = progress[a.id];
      const db_ = progress[b.id];
      if (da === null && db_ === null) return 0;
      if (da === null) return 1;
      if (db_ === null) return -1;
      return (da as number) - (db_ as number);
    });
  }, [allReady, progress, active]);

  if (active.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <LineChartIcon className="h-4 w-4 text-muted-foreground" />
        <div>
          <CardTitle>Curva S das obras ativas</CardTitle>
          <CardDescription>
            Planejado x realizado — obras em contrato ou execução, da mais atrasada pra mais adiantada
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((budget) => (
            <CurvaSMiniCard key={budget.id} budget={budget} onProgress={handleProgress} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ContinuarDeOndeParei({ budgets }: { budgets: any[] | undefined }) {
  const recent = useMemo(() => {
    return [...(budgets || [])]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6);
  }, [budgets]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <History className="h-4 w-4 text-muted-foreground" />
        <div>
          <CardTitle>Continuar de onde parei</CardTitle>
          <CardDescription>Últimos orçamentos editados</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {recent.length > 0 ? (
          <div className="space-y-1">
            {recent.map((budget) => {
              const statusInfo = WORK_STATUS_LABELS[budget.workStatus] || WORK_STATUS_LABELS.orcamento;
              return (
                <Link key={budget.id} href={`/budgets/${budget.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg hover:bg-accent cursor-pointer">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{budget.title}</p>
                        <Badge variant={statusInfo.variant} className="shrink-0">{statusInfo.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {budget.client?.name || "Sem cliente"}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="font-semibold">{formatCurrency(budget.totalCost)}</p>
                      <p className="text-xs text-muted-foreground">
                        editado {formatDistanceToNow(new Date(budget.updatedAt), { locale: ptBR, addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            Nenhum orçamento criado ainda
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { data: budgets } = trpc.budgets.list.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <img
            src="/logo-eg.png"
            alt="EG Construtora"
            className="h-16 w-16 object-contain shrink-0"
          />
          <div>
            <h1 className="text-3xl font-bold">EG Projetos e Consultoria em Construções Ltda</h1>
            <p className="text-muted-foreground mt-2">
              Visão geral do sistema de orçamentos de obra
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <CubScCard />
          <ValorEmExecucaoCard budgets={budgets} />
          <ResumoDoMesCard />
        </div>

        <CurvaSGrid budgets={budgets} />

        <ContinuarDeOndeParei budgets={budgets} />
      </div>
    </DashboardLayout>
  );
}
