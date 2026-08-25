import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, List, Building2, Truck, Landmark, Car } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import FinanceiroPainelGeral from "@/components/financeiro/FinanceiroPainelGeral";
import FinanceiroLancamentos from "@/components/financeiro/FinanceiroLancamentos";
import FinanceiroAdministrativo from "@/components/financeiro/FinanceiroAdministrativo";
import FinanceiroFrota from "@/components/financeiro/FinanceiroFrota";
import FinanceiroContas from "@/components/financeiro/FinanceiroContas";
import FinanceiroVeiculos from "@/components/financeiro/FinanceiroVeiculos";

export default function Financeiro() {
  const [activeTab, setActiveTab] = useState("painel");

  return (
    <DashboardLayout>
      <div className="flex flex-col bg-gray-50 -m-4 md:-m-6 lg:-m-8">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Financeiro Corporativo</h1>
          <p className="text-sm text-gray-500 mt-1">Visão financeira consolidada da empresa</p>
        </div>

        {/* Tabs */}
        <div className="flex-1 px-6 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <TabsList className="mb-6 bg-white border shadow-sm h-auto p-2 flex flex-wrap gap-3 rounded-xl w-full justify-start">
              <TabsTrigger value="painel" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <LayoutDashboard className="w-4 h-4" />
                Painel Geral
              </TabsTrigger>
              <TabsTrigger value="lancamentos" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <List className="w-4 h-4" />
                Lançamentos Consolidados
              </TabsTrigger>
              <TabsTrigger value="administrativo" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Building2 className="w-4 h-4" />
                Administrativo
              </TabsTrigger>
              <TabsTrigger value="frota" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Truck className="w-4 h-4" />
                Frota
              </TabsTrigger>
              <TabsTrigger value="contas" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Landmark className="w-4 h-4" />
                Contas Bancárias
              </TabsTrigger>
              <TabsTrigger value="veiculos" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Car className="w-4 h-4" />
                Veículos e Máquinas
              </TabsTrigger>
            </TabsList>

            <TabsContent value="painel" className="mt-0">
              <FinanceiroPainelGeral />
            </TabsContent>
            <TabsContent value="lancamentos" className="mt-0">
              <FinanceiroLancamentos />
            </TabsContent>
            <TabsContent value="administrativo" className="mt-0">
              <FinanceiroAdministrativo />
            </TabsContent>
            <TabsContent value="frota" className="mt-0">
              <FinanceiroFrota />
            </TabsContent>
            <TabsContent value="contas" className="mt-0">
              <FinanceiroContas />
            </TabsContent>
            <TabsContent value="veiculos" className="mt-0">
              <FinanceiroVeiculos />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
