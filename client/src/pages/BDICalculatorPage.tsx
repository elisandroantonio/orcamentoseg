import DashboardLayout from "@/components/DashboardLayout";
import { BDICalculator } from "@/components/BDICalculator";

export default function BDICalculatorPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Calculadora BDI</h2>
          <p className="text-sm text-gray-500 mt-1">
            Calcule o BDI (Benefícios e Despesas Indiretas) para seus orçamentos de obra.
          </p>
        </div>
        <BDICalculator />
      </div>
    </DashboardLayout>
  );
}
