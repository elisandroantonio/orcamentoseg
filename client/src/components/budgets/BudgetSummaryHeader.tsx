import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, Wallet } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface BudgetSummaryHeaderProps {
  totalWithoutBDI: number;
  bdiValue: number;
  bdiPercentage: number;
  totalWithBDI: number;
  materialPercentage: number;
  laborPercentage: number;
  equipmentPercentage: number;
  servicePercentage: number;
  otherPercentage: number;
  // Valores absolutos para detalhamento nos cards
  materialValue: number;
  laborValue: number;
  equipmentValue: number;
  serviceValue: number;
  otherValue: number;
  // Valores com BDI aplicado
  materialWithBDI: number;
  laborWithBDI: number;
  equipmentWithBDI: number;
  serviceWithBDI: number;
  otherWithBDI: number;
  onDetailsClick?: () => void;
  squareMeters?: number;
  // Melhoria 18: Detalhamento do BDI
  encargosSociaisValue?: number;
  lucroValue?: number;
  impostosValue?: number;
  riscoValue?: number;
  garantiaValue?: number;
}

const COLORS = {
  material: "#f97316", // laranja
  labor: "#3b82f6", // azul
  equipment: "#8b5cf6", // roxo
  service: "#10b981", // verde
  other: "#6b7280", // cinza
};

export function BudgetSummaryHeader({
  totalWithoutBDI,
  bdiValue,
  bdiPercentage,
  totalWithBDI,
  materialPercentage,
  laborPercentage,
  equipmentPercentage,
  servicePercentage,
  otherPercentage,
  materialValue,
  laborValue,
  equipmentValue,
  serviceValue,
  otherValue,
  materialWithBDI,
  laborWithBDI,
  equipmentWithBDI,
  serviceWithBDI,
  otherWithBDI,
  onDetailsClick,
  squareMeters,
  encargosSociaisValue = 0,
  lucroValue = 0,
  impostosValue = 0,
  riscoValue = 0,
  garantiaValue = 0,
}: BudgetSummaryHeaderProps) {
  const chartData = [
    { name: "Material", value: materialPercentage, color: COLORS.material },
    { name: "Mão de Obra", value: laborPercentage, color: COLORS.labor },
    { name: "Equipamentos", value: equipmentPercentage, color: COLORS.equipment },
    { name: "Serviços", value: servicePercentage, color: COLORS.service },
    { name: "Outros", value: otherPercentage, color: COLORS.other },
  ].filter(item => item.value > 0);

  // Calcular BDI por categoria
  const materialBDI = materialWithBDI - materialValue;
  const laborBDI = laborWithBDI - laborValue;
  const equipmentBDI = equipmentWithBDI - equipmentValue;
  const serviceBDI = serviceWithBDI - serviceValue;
  const otherBDI = otherWithBDI - otherValue;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
      {/* Gráfico de Pizza */}
      <Card className="lg:col-span-1">
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `${value.toFixed(1)}%`}
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1">
            {chartData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
                <span className="font-medium">{item.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Card Valor sem BDI */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="space-y-0.5">
            <p className="text-base font-bold break-all">
              R$ {totalWithoutBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">VALOR SEM BDI</p>
            
            {/* Custo por m² (Sem BDI) */}
            {squareMeters && squareMeters > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Total/m²:</span>
                  <span className="font-medium">R$ {(totalWithoutBDI / squareMeters).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/m²</span>
                </div>
                {materialValue > 0 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Material/m²:</span>
                    <span className="font-medium">R$ {(materialValue / squareMeters).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/m²</span>
                  </div>
                )}
                {laborValue > 0 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Mão de Obra/m²:</span>
                    <span className="font-medium">R$ {(laborValue / squareMeters).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/m²</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Detalhamento */}
            <div className="mt-2 pt-2 border-t border-border space-y-0.5">
              {materialValue > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Material:</span>
                  <span className="font-medium">R$ {materialValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {laborValue > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Mão de Obra:</span>
                  <span className="font-medium">R$ {laborValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {equipmentValue > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Equipamentos:</span>
                  <span className="font-medium">R$ {equipmentValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {serviceValue > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Serviços:</span>
                  <span className="font-medium">R$ {serviceValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {otherValue > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Outros:</span>
                  <span className="font-medium">R$ {otherValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Valor do BDI */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="p-1.5 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
              <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <div className="space-y-0.5">
            <p className="text-base font-bold break-all">
              R$ {bdiValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">({bdiPercentage.toFixed(1)}%)</p>
            <p className="text-xs text-muted-foreground">VALOR DO BDI</p>
            
            {/* Custo BDI por m² */}
            {squareMeters && squareMeters > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Valor BDI/m²:</span>
                  <span className="font-medium">R$ {(bdiValue / squareMeters).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/m²</span>
                </div>
              </div>
            )}
            
            {/* Detalhamento do BDI */}
            <div className="mt-2 pt-2 border-t border-border space-y-0.5">
              {materialBDI > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Material:</span>
                  <span className="font-medium">R$ {materialBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {laborBDI > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Mão de Obra:</span>
                  <span className="font-medium">R$ {laborBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {equipmentBDI > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Equipamentos:</span>
                  <span className="font-medium">R$ {equipmentBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {serviceBDI > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Serviços:</span>
                  <span className="font-medium">R$ {serviceBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {otherBDI > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Outros:</span>
                  <span className="font-medium">R$ {otherBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Total Geral */}
      <Card className="border-2 border-green-500/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="p-1.5 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <Wallet className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            {onDetailsClick && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs bg-green-500 text-white hover:bg-green-600 border-0"
                onClick={onDetailsClick}
              >
                Detalhes
              </Button>
            )}
          </div>
          <div className="space-y-0.5">
            <p className="text-base font-bold text-green-600 dark:text-green-400 break-all">
              R$ {totalWithBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">TOTAL GERAL</p>
            
            {/* Detalhamento do Total com BDI */}
            <div className="mt-2 pt-2 border-t border-border space-y-0.5">
              {materialWithBDI > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Material:</span>
                  <span className="font-medium">R$ {materialWithBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {laborWithBDI > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Mão de Obra:</span>
                  <span className="font-medium">R$ {laborWithBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {equipmentWithBDI > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Equipamentos:</span>
                  <span className="font-medium">R$ {equipmentWithBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {serviceWithBDI > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Serviços:</span>
                  <span className="font-medium">R$ {serviceWithBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {otherWithBDI > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Outros:</span>
                  <span className="font-medium">R$ {otherWithBDI.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
            {/* Melhoria 18: Detalhamento do BDI */}
            {(encargosSociaisValue > 0 || lucroValue > 0 || impostosValue > 0 || riscoValue > 0 || garantiaValue > 0) && (
              <div className="mt-2 pt-2 border-t border-border space-y-0.5">
                <div className="text-[9px] font-semibold text-muted-foreground mb-1">DETALHAMENTO DO BDI</div>
                {encargosSociaisValue > 0 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Encargos Sociais:</span>
                    <span className="font-medium">R$ {encargosSociaisValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {lucroValue > 0 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Lucro:</span>
                    <span className="font-medium">R$ {lucroValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {impostosValue > 0 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Impostos:</span>
                    <span className="font-medium">R$ {impostosValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {riscoValue > 0 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Risco:</span>
                    <span className="font-medium">R$ {riscoValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {garantiaValue > 0 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Garantia:</span>
                    <span className="font-medium">R$ {garantiaValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Valor por m² */}
            <div className="mt-2 pt-2 border-t border-border">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Valor da Obra/m²:</span>
                <span className="font-medium">R$ {(totalWithBDI / (squareMeters || 1)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/m²</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
