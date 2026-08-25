import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

interface PlanejadoRealizadoPoint {
  period: string;
  planejado: number;
  realizado: number | null;
}

interface PlanejadoRealizadoChartProps {
  data: PlanejadoRealizadoPoint[];
}

// Curva de avanço físico: compara o % planejado (calculado a partir das datas
// das etapas no Gantt) com o % realmente medido (aba Medições), mês a mês.
// Onde a linha "Realizado" fica abaixo da "Planejado", a obra está atrasada.
export function PlanejadoRealizadoChart({ data }: PlanejadoRealizadoChartProps) {
  return (
    <div className="w-full h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            tick={{ fontSize: 12 }}
          />
          <Tooltip formatter={(value: number) => (value === null ? "—" : `${value.toFixed(1)}%`)} />
          <Legend />
          <ReferenceLine y={100} stroke="#e5e7eb" />
          <Line
            type="monotone"
            dataKey="planejado"
            stroke="#64748b"
            strokeWidth={2}
            strokeDasharray="5 4"
            name="Planejado"
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="realizado"
            stroke="#0e7490"
            strokeWidth={2.5}
            name="Realizado"
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
