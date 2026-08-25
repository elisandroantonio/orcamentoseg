import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import "../print.css";

export default function BudgetView() {
  const { id } = useParams<{ id: string }>();
  const budgetId = parseInt(id || "0");
  const [showBDI, setShowBDI] = useState(false);

  const { data: budget, isLoading } = trpc.budgets.get.useQuery({ id: budgetId });
  const { data: stages } = trpc.budgets.getStages.useQuery({ budgetId });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="container py-8 space-y-6">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="container py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Orçamento não encontrado</h2>
          <Link href="/budgets">
            <Button>Voltar para Lista</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Calcular totais
  const totalMaterial = Number(budget.totalCost) * 0.308; // 30.8%
  const totalLabor = Number(budget.totalCost) * 0.037; // 3.7%
  const totalEquipment = Number(budget.totalCost) * 0.204; // 20.4%
  const totalServices = Number(budget.totalCost) * 0.387; // 38.7%
  const totalOther = Number(budget.totalCost) * 0.065; // 6.5%

  // Calcular BDI
  const socialCharges = Number(budget.socialCharges || 120);
  const profit = Number(budget.profit || 10);
  const taxes = Number(budget.taxes || 25);
  const risk = Number(budget.risk || 5);
  const warranty = Number(budget.warranty || 2);
  
  const bdiPercentage = socialCharges + profit + taxes + risk + warranty;
  const totalWithBDI = Number(budget.totalCost) * (1 + bdiPercentage / 100);

  const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    draft: { label: "Rascunho", variant: "outline" },
    sent: { label: "Enviado", variant: "secondary" },
    approved: { label: "Aprovado", variant: "default" },
    rejected: { label: "Rejeitado", variant: "destructive" },
  };

  // Organizar itens por etapa (já vem organizado em stages)
  const itemsByStage = new Map<number | null, any[]>();
  stages?.forEach((stage: any) => {
    if (stage.items) {
      itemsByStage.set(stage.id, stage.items);
    }
  });

  // Função recursiva para renderizar etapas
  const renderStage = (stage: any, level: number = 0) => {
    const stageItems = itemsByStage.get(stage.id) || [];
    const childStages = stages?.filter((s: any) => s.parentStageId === stage.id) || [];
    
    // Calcular total da etapa
    const stageTotal = stageItems.reduce((sum: number, item: any) => sum + Number(item.totalCost), 0);
    const stageTotalWithBDI = stageTotal * (1 + bdiPercentage / 100);

    return (
      <div key={stage.id} className={`${level > 0 ? 'ml-6 mt-2' : 'mt-4'}`}>
        <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg mb-2">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-lg">{stage.name}</h4>
            <span className="font-mono font-bold">
              {showBDI 
                ? `R$ ${stageTotalWithBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                : `R$ ${stageTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
              }
            </span>
          </div>
          {stage.description && (
            <p className="text-sm text-muted-foreground mt-1">{stage.description}</p>
          )}
        </div>

        {/* Itens da etapa */}
        {stageItems.length > 0 && (
          <div className="ml-4 space-y-1">
            {stageItems.map((item: any) => {
              const itemTotalWithBDI = Number(item.totalCost) * (1 + bdiPercentage / 100);
              return (
                <div key={item.id} className="flex justify-between items-start py-2 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex-1">
                    <span className="text-sm">{item.description}</span>
                    <div className="text-xs text-muted-foreground mt-1">
                      Qtd: {Number(item.quantity).toFixed(2)} {item.unit} × R$ {Number(item.unitCost).toFixed(2)}
                    </div>
                  </div>
                  <span className="font-mono text-sm ml-4">
                    {showBDI
                      ? `R$ ${itemTotalWithBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : `R$ ${Number(item.totalCost).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    }
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Sub-etapas */}
        {childStages.map((childStage: any) => renderStage(childStage, level + 1))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Toolbar - oculto na impressão */}
      <div className="print:hidden border-b bg-card sticky top-0 z-10">
        <div className="container py-4 flex items-center justify-between">
          <Link href="/budgets">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBDI(!showBDI)}
            >
              {showBDI ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {showBDI ? "Ocultar BDI" : "Mostrar BDI"}
            </Button>
            <Link href={`/budgets/${budgetId}/edit`}>
              <Button variant="outline" size="sm">
                Editar
              </Button>
            </Link>
            <Button onClick={handlePrint} size="sm">
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
          </div>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="container py-8 max-w-5xl">
        {/* Cabeçalho da empresa */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">EG Projetos e Consultoria em Construções Ltda</h1>
          <p className="text-muted-foreground mt-2">Orçamento de Obra</p>
        </div>

        <Separator className="my-6" />

        {/* Informações do orçamento */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">{budget.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-2">Código: {(budget as any).code}</p>
              </div>
              <Badge variant={statusLabels[budget.status].variant}>
                {statusLabels[budget.status].label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Cliente</p>
                <p className="text-base">{budget.clientId ? `Cliente #${budget.clientId}` : "Não especificado"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Projeto</p>
                <p className="text-base">{budget.projectId ? `Projeto #${budget.projectId}` : "Não especificado"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Metragem</p>
                <p className="text-base">{Number(budget.squareMeters).toFixed(2)} m²</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Data de Criação</p>
                <p className="text-base">{new Date(budget.createdAt).toLocaleDateString("pt-BR")}</p>
              </div>
            </div>

            {budget.description && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Descrição</p>
                <p className="text-base mt-1">{budget.description}</p>
              </div>
            )}

            {(budget as any).observations && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Observações</p>
                <p className="text-base mt-1">{(budget as any).observations}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Composições */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Composições de Custos</CardTitle>
          </CardHeader>
          <CardContent>
            {stages && stages.filter((s: any) => !s.parentStageId).length > 0 ? (
              <div>
                {stages.filter((s: any) => !s.parentStageId).map((stage: any) => renderStage(stage))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma etapa cadastrada
              </p>
            )}
          </CardContent>
        </Card>

        {/* Resumo Financeiro */}
        <Card>
          <CardHeader>
            <CardTitle>Resumo Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Breakdown de custos */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Material</span>
                <span className="font-mono">R$ {totalMaterial.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Mão de Obra</span>
                <span className="font-mono">R$ {totalLabor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Equipamentos</span>
                <span className="font-mono">R$ {totalEquipment.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Serviços</span>
                <span className="font-mono">R$ {totalServices.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Outros</span>
                <span className="font-mono">R$ {totalOther.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <Separator />

            {/* Subtotal */}
            <div className="flex justify-between font-semibold">
              <span>Subtotal (sem BDI)</span>
              <span className="font-mono">R$ {Number(budget.totalCost).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>

            {showBDI && (
              <>
                <Separator />
                
                {/* BDI Breakdown */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Composição do BDI</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Encargos Sociais ({socialCharges}%)</span>
                    <span className="font-mono">R$ {(Number(budget.totalCost) * socialCharges / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Lucro ({profit}%)</span>
                    <span className="font-mono">R$ {(Number(budget.totalCost) * profit / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Impostos ({taxes}%)</span>
                    <span className="font-mono">R$ {(Number(budget.totalCost) * taxes / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Risco ({risk}%)</span>
                    <span className="font-mono">R$ {(Number(budget.totalCost) * risk / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Garantia ({warranty}%)</span>
                    <span className="font-mono">R$ {(Number(budget.totalCost) * warranty / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <Separator />

                {/* Total com BDI */}
                <div className="flex justify-between font-bold text-lg">
                  <span>TOTAL COM BDI ({bdiPercentage.toFixed(2)}%)</span>
                  <span className="font-mono text-primary">R$ {totalWithBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            )}

            {/* Horas homem */}
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total de Horas Homem</span>
              <span className="font-mono">{Number(budget.totalLaborHours).toFixed(2)} h</span>
            </div>
          </CardContent>
        </Card>

        {/* Rodapé para impressão */}
        <div className="hidden print:block mt-8 pt-4 border-t text-center text-sm text-muted-foreground">
          <p>Este orçamento é válido por 30 dias a partir da data de emissão.</p>
          <p className="mt-2">EG Projetos e Consultoria em Construções Ltda - CNPJ: XX.XXX.XXX/XXXX-XX</p>
        </div>
      </div>
    </div>
  );
}
