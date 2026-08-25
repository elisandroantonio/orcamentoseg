import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AbcCurveChart } from "@/components/budget/AbcCurveChart";

export default function BudgetCharts() {
  const { id } = useParams<{ id: string }>();
  const budgetId = parseInt(id || "0");

  const { data: budget, isLoading: budgetLoading } = trpc.budgets.get.useQuery({ id: budgetId });
  const { data: abcData, isLoading: abcLoading } = trpc.budgets.getAbcCurve.useQuery({ budgetId });

  if (budgetLoading) {
    return (
      <div className="container py-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="container py-8">
        <p className="text-muted-foreground">Orçamento não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Gráficos e Análises</h1>
        <p className="text-muted-foreground mt-2">
          Visualizações analíticas do orçamento: {budget.project?.name || 'Sem nome'}
        </p>
      </div>

      <div className="space-y-6">
        {/* Curva ABC de Materiais */}
        {abcLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : abcData && abcData.items.length > 0 ? (
          <AbcCurveChart data={abcData} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Curva ABC de Materiais</CardTitle>
              <CardDescription>
                Análise de Pareto dos materiais mais custosos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96 flex items-center justify-center text-muted-foreground">
                Nenhum material encontrado neste orçamento.
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Custos</CardTitle>
            <CardDescription>
              Proporção entre Material, Mão de Obra e BDI
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-96 flex items-center justify-center text-muted-foreground">
              Gráfico em implementação...
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
