import React from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface CurveSDataPoint {
  period: string;
  monthly: number; // desembolso do mês (não acumulado)
  accumulated: number;
  percentage: number;
}

interface BudgetCurveSProps {
  data: CurveSDataPoint[];
  totalBudget: number;
}

const formatCurrency = (value: number) =>
  `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BudgetCurveS({ data, totalBudget }: BudgetCurveSProps) {
  return (
    <div className="w-full h-[420px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="period"
            label={{ value: "Período", position: "insideBottom", offset: -5 }}
          />
          <YAxis
            yAxisId="left"
            label={{ value: "Valor (R$)", angle: -90, position: "insideLeft" }}
            tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            label={{ value: "Percentual Acumulado (%)", angle: 90, position: "insideRight" }}
            tickFormatter={(value) => `${value.toFixed(0)}%`}
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === "Percentual Acumulado") return [`${value.toFixed(2)}%`, name];
              return [formatCurrency(value), name];
            }}
          />
          <Legend />
          <Bar
            yAxisId="left"
            dataKey="monthly"
            fill="#fbbf24"
            name="Desembolso Mensal"
            barSize={28}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="accumulated"
            stroke="#8884d8"
            strokeWidth={2}
            name="Valor Acumulado"
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="percentage"
            stroke="#82ca9d"
            strokeWidth={2}
            name="Percentual Acumulado"
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
