import { useMemo } from "react";
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Cell,
} from "recharts";
import { Card } from "@/components/ui/card";

interface AbcItem {
  rank: number;
  inputId: number;
  code: string;
  description: string;
  type: string;
  totalValue: number;
  percentage: number;
  accumulatedPercentage: number;
  classification: "A" | "B" | "C";
}

interface AbcCurveChartProps {
  data: {
    totalValue: number;
    items: AbcItem[];
  };
}

export function AbcCurveChart({ data }: AbcCurveChartProps) {
  const chartData = useMemo(() => {
    // Pegar top 20 materiais para não poluir o gráfico
    return data.items.slice(0, 20).map((item) => {
      // Exibir código + descrição (truncada se necessário)
      const label = item.code 
        ? `${item.code} - ${item.description.substring(0, 25)}${item.description.length > 25 ? '...' : ''}`
        : item.description.length > 30 
          ? item.description.substring(0, 30) + "..." 
          : item.description;
      
      return {
        name: label,
        fullDescription: `${item.code || ''} - ${item.description}`,
        value: item.totalValue,
        percentage: item.percentage,
        accumulated: item.accumulatedPercentage,
        classification: item.classification,
      };
    });
  }, [data]);

  const getColor = (classification: "A" | "B" | "C") => {
    switch (classification) {
      case "A":
        return "#ef4444"; // red-500
      case "B":
        return "#f59e0b"; // amber-500
      case "C":
        return "#10b981"; // emerald-500
      default:
        return "#6b7280"; // gray-500
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Curva ABC de Materiais</h3>
          <p className="text-sm text-muted-foreground">
            Análise de Pareto dos materiais mais custosos da obra
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground">Classe A (80%)</div>
            <div className="text-2xl font-bold text-red-500">
              {data.items.filter((i) => i.classification === "A").length}
            </div>
            <div className="text-xs text-muted-foreground">Materiais críticos</div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground">Classe B (15%)</div>
            <div className="text-2xl font-bold text-amber-500">
              {data.items.filter((i) => i.classification === "B").length}
            </div>
            <div className="text-xs text-muted-foreground">Importância intermediária</div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground">Classe C (5%)</div>
            <div className="text-2xl font-bold text-emerald-500">
              {data.items.filter((i) => i.classification === "C").length}
            </div>
            <div className="text-xs text-muted-foreground">Menor impacto</div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              interval={0}
              style={{ fontSize: "12px" }}
            />
            <YAxis
              yAxisId="left"
              label={{ value: "Valor (R$)", angle: -90, position: "insideLeft" }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              label={{ value: "% Acumulado", angle: 90, position: "insideRight" }}
              domain={[0, 100]}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === "Valor") {
                  return `R$ ${value.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`;
                }
                if (name === "% Acumulado") {
                  return `${value.toFixed(1)}%`;
                }
                return value;
              }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="value" name="Valor" radius={[8, 8, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(entry.classification)} />
              ))}
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="accumulated"
              name="% Acumulado"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="text-sm text-muted-foreground">
          <p>
            <strong>Classe A:</strong> Materiais que representam até 80% do valor total - merecem atenção especial na gestão e negociação.
          </p>
          <p>
            <strong>Classe B:</strong> Materiais que representam de 80% a 95% do valor total - importância intermediária.
          </p>
          <p>
            <strong>Classe C:</strong> Materiais que representam de 95% a 100% do valor total - menor impacto financeiro.
          </p>
        </div>
      </div>
    </Card>
  );
}
