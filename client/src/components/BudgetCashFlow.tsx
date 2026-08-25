"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

// Função para formatar valores em moeda
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

interface BudgetCashFlowProps {
  budgetId: number;
  stagesData?: any;
}

export function BudgetCashFlow({ budgetId, stagesData }: BudgetCashFlowProps) {
  const { data: cashFlowData, isLoading } = trpc.measurements.getCashFlow.useQuery({ budgetId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Se não há dados, mostrar mensagem
  if (!cashFlowData || cashFlowData.length === 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-green-50 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Fluxo Positivo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">R$ 0,00</div>
              <p className="text-xs text-green-500 mt-1">Desembolsos acima do previsto</p>
            </CardContent>
          </Card>
          <Card className="bg-red-50 border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Fluxo Negativo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-700">R$ 0,00</div>
              <p className="text-xs text-red-500 mt-1">Desembolsos abaixo do previsto</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600">Adiantamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700">0 dias</div>
              <p className="text-xs text-blue-500 mt-1">Dias de adiantamento</p>
            </CardContent>
          </Card>
          <Card className="bg-orange-50 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-orange-600">Atraso</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-700">0 dias</div>
              <p className="text-xs text-orange-500 mt-1">Dias de atraso</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Fluxo de Caixa</CardTitle>
            <CardDescription>Comparação entre desembolsos previstos e realizados</CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12 text-gray-500">
            <p>Nenhum dado de fluxo de caixa disponível.</p>
            <p className="text-sm mt-2">Adicione períodos de medição e dados do Gantt para visualizar o fluxo de caixa.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calcular totais
  const totalPrevisto = cashFlowData.reduce((sum, item) => sum + (item.previsto || 0), 0);
  const totalRealizado = cashFlowData.reduce((sum, item) => sum + (item.realizado || 0), 0);
  const totalAditivos = cashFlowData.reduce((sum, item) => sum + (item.aditivos || 0), 0);
  const fluxoPositivo = totalRealizado > totalPrevisto ? totalRealizado - totalPrevisto : 0;
  const fluxoNegativo = totalRealizado < totalPrevisto ? totalPrevisto - totalRealizado : 0;

  return (
    <div className="space-y-6">
      {/* Cards de Resumo */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Fluxo Positivo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatCurrency(fluxoPositivo)}</div>
            <p className="text-xs text-green-500 mt-1">Desembolsos acima do previsto</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Fluxo Negativo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{formatCurrency(fluxoNegativo)}</div>
            <p className="text-xs text-red-500 mt-1">Desembolsos abaixo do previsto</p>
          </CardContent>
        </Card>
        <Card className={totalAditivos >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm font-medium ${totalAditivos >= 0 ? 'text-green-600' : 'text-red-600'}`}>Aditivos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalAditivos >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatCurrency(totalAditivos)}
            </div>
            <p className={`text-xs mt-1 ${totalAditivos >= 0 ? 'text-green-500' : 'text-red-500'}`}>Impacto de aditivos</p>
          </CardContent>
        </Card>
        <Card className={totalRealizado >= totalPrevisto ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm font-medium ${totalRealizado >= totalPrevisto ? 'text-green-600' : 'text-red-600'}`}>Diferença Acumulada</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalRealizado >= totalPrevisto ? 'text-green-700' : 'text-red-700'}`}>
              {formatCurrency(totalRealizado - totalPrevisto)}
            </div>
            <p className={`text-xs mt-1 ${totalRealizado >= totalPrevisto ? 'text-green-500' : 'text-red-500'}`}>Realizado vs. Previsto</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico Comparativo */}
      <Card>
        <CardHeader>
          <CardTitle>Gráfico Comparativo - Previsto vs. Realizado</CardTitle>
          <CardDescription>Desembolsos mensais previstos e realizados</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="previsto" fill="#3b82f6" name="Previsto" />
              <Bar dataKey="realizado" fill="#10b981" name="Realizado" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfico de Acumulado */}
      <Card>
        <CardHeader>
          <CardTitle>Acumulado Mensal</CardTitle>
          <CardDescription>Evolução acumulada do fluxo de caixa</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Line type="monotone" dataKey="acumPrevisto" stroke="#3b82f6" name="Acum. Previsto" strokeWidth={2} />
              <Line type="monotone" dataKey="acumRealizado" stroke="#10b981" name="Acum. Realizado" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabela Detalhada */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento Mensal</CardTitle>
          <CardDescription>Desembolsos previsto, realizado e aditivos por mês</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Previsto</TableHead>
                  <TableHead className="text-right">Realizado</TableHead>
                  <TableHead className="text-right">Aditivos</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="text-right">Acum. Previsto</TableHead>
                  <TableHead className="text-right">Acum. Realizado</TableHead>
                  <TableHead className="text-right">Acum. Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashFlowData.map((row: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.previsto || 0)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(row.realizado || 0)}</TableCell>
                    <TableCell className={`text-right ${(row.aditivos || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(row.aditivos || 0)}
                    </TableCell>
                    <TableCell className={`text-right ${(row.diferenca || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(row.diferenca || 0)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.acumPrevisto || 0)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(row.acumRealizado || 0)}</TableCell>
                    <TableCell className={`text-right font-semibold ${(row.acumDiferenca || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(row.acumDiferenca || 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
