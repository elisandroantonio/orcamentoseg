import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast as showToast } from "sonner";
import { Calendar, RefreshCw } from "lucide-react";

export default function BudgetSchedule() {
  const { id } = useParams<{ id: string }>();
  const budgetId = parseInt(id!);
  const toast = (opts: { title: string; variant?: string }) => {
    if (opts.variant === "destructive") {
      showToast.error(opts.title);
    } else {
      showToast.success(opts.title);
    }
  };

  const { data: budget } = trpc.budgets.get.useQuery({ id: budgetId });
  const { data: periods, refetch: refetchPeriods } = trpc.budgetSchedule.getPeriods.useQuery({ budgetId });
  const { data: stagesData } = trpc.budgets.getStages.useQuery({ budgetId });
  const stages = stagesData || [];
  const { data: distribution, refetch: refetchDistribution } = trpc.budgetSchedule.getDistribution.useQuery({ budgetId });

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [periodType, setPeriodType] = useState<"monthly" | "biweekly" | "weekly">("monthly");

  const saveDatesMutation = trpc.budgetSchedule.saveDates.useMutation({
    onSuccess: () => {
      toast({ title: "Datas salvas com sucesso!" });
    },
  });

  const generatePeriodsMutation = trpc.budgetSchedule.generatePeriods.useMutation({
    onSuccess: (data) => {
      toast({ title: `${data.periodsCount} períodos gerados com sucesso!` });
      refetchPeriods();
    },
  });

  const saveDistributionMutation = trpc.budgetSchedule.saveDistribution.useMutation({
    onSuccess: () => {
      refetchDistribution();
    },
  });

  const generateSmartDistributionMutation = trpc.budgetSchedule.generateSmartDistribution.useMutation({
    onSuccess: (data) => {
      toast({ title: `Distribuição automática gerada! ${data.distributionsCount} distribuições criadas.` });
      refetchDistribution();
    },
  });

  const updateValuesMutation = trpc.budgetSchedule.updateValues.useMutation({
    onSuccess: () => {
      toast({ title: "Valores atualizados com sucesso!" });
      refetchDistribution();
    },
  });

  const handleSaveDates = async () => {
    if (!startDate || !endDate) {
      toast({ title: "Preencha as datas de início e término", variant: "destructive" });
      return;
    }

    await saveDatesMutation.mutateAsync({
      budgetId,
      startDate,
      endDate,
      periodType,
    });
  };

  const handleGeneratePeriods = async () => {
    // Ler valores diretamente do DOM (workaround para problema de sincronização do estado)
    const startDateInput = document.getElementById('startDate') as HTMLInputElement;
    const endDateInput = document.getElementById('endDate') as HTMLInputElement;
    const startDateValue = startDateInput?.value || startDate;
    const endDateValue = endDateInput?.value || endDate;
    
    console.log('handleGeneratePeriods called', { startDateValue, endDateValue, budgetId });
    // Verificar se as datas estão preenchidas nos campos
    if (!startDateValue || !endDateValue) {
      toast({ title: "Preencha as datas de início e término", variant: "destructive" });
      return;
    }
    
    // Atualizar estado React para manter sincronizado
    if (startDateValue !== startDate) setStartDate(startDateValue);
    if (endDateValue !== endDate) setEndDate(endDateValue);

    // Se as datas não estão salvas no banco, salvar primeiro
    const budgetStartDate = budget?.startDate ? new Date(budget.startDate).toISOString().split('T')[0] : null;
    const budgetEndDate = budget?.endDate ? new Date(budget.endDate).toISOString().split('T')[0] : null;
    
    console.log('Checking if need to save dates', { budgetStartDate, budgetEndDate, startDateValue, endDateValue });
    
    if (!budgetStartDate || !budgetEndDate || 
        budgetStartDate !== startDateValue || 
        budgetEndDate !== endDateValue ||
        budget?.periodType !== periodType) {
      console.log('Saving dates first...');
      await saveDatesMutation.mutateAsync({
        budgetId,
        startDate: startDateValue,
        endDate: endDateValue,
        periodType,
      });
      console.log('Dates saved!');
    }

    console.log('Generating periods...');
    await generatePeriodsMutation.mutateAsync({ budgetId });
    console.log('Periods generated!');
  };

  const handleGenerateSmartDistribution = async () => {
    if (!periods || periods.length === 0) {
      toast({ title: "Gere os períodos primeiro", variant: "destructive" });
      return;
    }

    await generateSmartDistributionMutation.mutateAsync({ budgetId });
  };

  const handleUpdateValues = async () => {
    await updateValuesMutation.mutateAsync({ budgetId });
  };

  const handlePercentChange = async (stageId: number, periodId: number, value: string) => {
    const percentValue = parseFloat(value) || 0;
    if (percentValue < 0 || percentValue > 100) {
      toast({ title: "Percentual deve estar entre 0 e 100", variant: "destructive" });
      return;
    }

    await saveDistributionMutation.mutateAsync({
      budgetId,
      stageId,
      periodId,
      percentPlanned: value,
    });
  };

  const getDistributionValue = (stageId: number, periodId: number) => {
    const item = distribution?.find(d => d.stageId === stageId && d.periodId === periodId);
    return item?.percentPlanned || "0";
  };

  // Função recursiva para construir hierarquia completa
  const buildHierarchy = (parentId: number | null = null, level: number = 0): any[] => {
    const children = stages
      .filter((s: any) => s.parentStageId === parentId)
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0)); // Ordenar por campo order
    return children.flatMap((stage: any) => [
      { ...stage, level },
      ...buildHierarchy(stage.id, level + 1)
    ]);
  };

  // Obter todas as etapas em hierarquia (expandido por padrão)
  const allStagesHierarchy = buildHierarchy();

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Cronograma Físico-Financeiro</h1>
        <p className="text-muted-foreground mt-2">
          {budget?.title}
        </p>
      </div>

      {/* Configuração de Datas */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Configuração do Projeto
          </CardTitle>
          <CardDescription>
            Defina as datas de início e término do projeto e o tipo de período
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="startDate">Data de Início</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => {
                  console.log('startDate onChange called:', e.target.value);
                  setStartDate(e.target.value);
                }}
              />
            </div>
            <div>
              <Label htmlFor="endDate">Data de Término</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => {
                  console.log('endDate onChange called:', e.target.value);
                  setEndDate(e.target.value);
                }}
              />
            </div>
            <div>
              <Label htmlFor="periodType">Tipo de Período</Label>
              <Select value={periodType} onValueChange={(v: any) => setPeriodType(v)}>
                <SelectTrigger id="periodType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="biweekly">Quinzenal</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <Button type="button" onClick={handleSaveDates} disabled={saveDatesMutation.isPending}>
                Salvar Datas
              </Button>
              <Button 
                type="button"
                onClick={handleGeneratePeriods} 
                variant="outline"
                disabled={generatePeriodsMutation.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Gerar Períodos
              </Button>
              <Button 
                type="button"
                onClick={handleGenerateSmartDistribution} 
                variant="default"
                disabled={generateSmartDistributionMutation.isPending || !periods || periods.length === 0}
              >
                ✨ Distribuir Automaticamente
              </Button>
              <Button 
                type="button"
                onClick={handleUpdateValues} 
                variant="secondary"
                disabled={updateValuesMutation.isPending}
              >
                🔄 Atualizar Valores
              </Button>
            </div>
          </div>
          {budget?.durationMonths && (
            <p className="text-sm text-muted-foreground mt-4">
              Duração: {budget.durationMonths} meses ({periods?.length || 0} períodos)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tabela de Distribuição */}
      {periods && periods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Distribuição Temporal das Etapas</CardTitle>
            <CardDescription>
              Defina o percentual de execução de cada etapa por período (%)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-semibold">Etapa</th>
                    {periods.map(period => (
                      <th key={period.id} className="text-center p-2 font-semibold min-w-[100px]">
                        {period.periodName}
                        <div className="text-xs font-normal text-muted-foreground">
                          {new Date(period.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </div>
                      </th>
                    ))}
                    <th className="text-center p-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {allStagesHierarchy.map((stage: any) => {
                    const stageDistribution = periods.map(p => parseFloat(getDistributionValue(stage.id, p.id)) || 0);
                    const total = stageDistribution.reduce((sum, val) => sum + val, 0);
                    
                    return (
                      <tr key={stage.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-medium" style={{ paddingLeft: `${8 + stage.level * 24}px` }}>
                          {stage.level > 0 && <span className="text-muted-foreground mr-2">{'└─'}</span>}
                          {stage.name}
                        </td>
                        {periods.map(period => (
                          <td key={period.id} className="p-2">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={getDistributionValue(stage.id, period.id)}
                              onChange={(e) => handlePercentChange(stage.id, period.id, e.target.value)}
                              className="text-center"
                            />
                          </td>
                        ))}
                        <td className="p-2 text-center font-semibold">
                          <span className={total !== 100 ? "text-destructive" : "text-green-600"}>
                            {total.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              💡 O total de cada etapa deve somar 100%
            </p>
          </CardContent>
        </Card>
      )}

      {(!periods || periods.length === 0) && budget?.startDate && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Clique em "Gerar Períodos" para criar o cronograma</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
