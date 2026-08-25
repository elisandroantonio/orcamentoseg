import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Wallet, Download, FileSpreadsheet } from "lucide-react";

const formatCurrency = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const formatDate = (d: string | Date) => {
  if (!d) return "-";
  const s = typeof d === "string" ? d : d.toISOString();
  const [y, m, day] = s.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
};

const COST_CENTER_LABELS: Record<string, string> = {
  obra: "Obra", administrativo: "Administrativo", frota: "Frota",
};

const COST_CENTER_COLORS: Record<string, string> = {
  obra: "bg-blue-100 text-blue-700",
  administrativo: "bg-purple-100 text-purple-700",
  frota: "bg-orange-100 text-orange-700",
};

export default function FinanceiroLancamentos() {
  const [filterCostCenter, setFilterCostCenter] = useState("all");
  const [filterType, setFilterType] = useState("todos");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const { data: transactions = [], isLoading } = trpc.corporateFinance.list.useQuery({
    costCenter: (filterCostCenter && filterCostCenter !== "all") ? filterCostCenter as any : undefined,
    type: filterType !== "todos" ? filterType as any : undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
  });

  const totalIn = (transactions as any[]).filter((t: any) => t.type === "entrada").reduce((s: number, t: any) => s + Number(t.value), 0);
  const totalOut = (transactions as any[]).filter((t: any) => t.type === "saida").reduce((s: number, t: any) => s + Number(t.value), 0);
  const balance = totalIn - totalOut;

  const handleExportCSV = () => {
    const headers = ["Data", "Centro de Custo", "Tipo", "Categoria", "Descrição", "Obra", "Veículo", "Conta", "Valor"];
    const rows = (transactions as any[]).map((t: any) => [
      formatDate(t.date),
      COST_CENTER_LABELS[t.costCenter] || t.costCenter,
      t.type === "entrada" ? "Entrada" : "Saída",
      t.category || "",
      t.description || "",
      t.budgetTitle || "",
      t.vehicleName || "",
      t.bankAccountName || "",
      Number(t.value).toFixed(2).replace(".", ","),
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lancamentos-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportado com sucesso!");
  };

  const handleExportPDF = () => {
    const printContent = `
      <html><head><meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        p { margin: 2px 0; color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #f3f4f6; padding: 6px 8px; text-align: left; border: 1px solid #ddd; font-size: 10px; }
        td { padding: 5px 8px; border: 1px solid #eee; }
        .entrada { color: #16a34a; } .saida { color: #dc2626; }
        .totals { margin-top: 12px; display: flex; gap: 24px; }
        .total-box { padding: 8px 12px; border-radius: 6px; }
        .total-in { background: #f0fdf4; color: #16a34a; }
        .total-out { background: #fef2f2; color: #dc2626; }
        .total-bal { background: #eff6ff; color: #1d4ed8; }
      </style></head><body>
      <h1>Lançamentos Financeiros Consolidados</h1>
      <p>Gerado em: ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}</p>
      <p>Total de registros: ${(transactions as any[]).length}</p>
      <div class="totals">
        <div class="total-box total-in">Entradas: ${formatCurrency(totalIn)}</div>
        <div class="total-box total-out">Saídas: ${formatCurrency(totalOut)}</div>
        <div class="total-box total-bal">Saldo: ${formatCurrency(balance)}</div>
      </div>
      <table>
        <thead><tr>
          <th>Data</th><th>Centro</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Obra/Veículo</th><th>Valor</th>
        </tr></thead>
        <tbody>
          ${(transactions as any[]).map((t: any) => `
            <tr>
              <td>${formatDate(t.date)}</td>
              <td>${COST_CENTER_LABELS[t.costCenter] || t.costCenter}</td>
              <td class="${t.type}">${t.type === "entrada" ? "Entrada" : "Saída"}</td>
              <td>${t.category || "-"}</td>
              <td>${t.description || ""}</td>
              <td>${t.budgetTitle || t.vehicleName || "-"}</td>
              <td class="${t.type}" style="text-align:right">${t.type === "entrada" ? "+" : "-"}${formatCurrency(t.value)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      </body></html>
    `;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(printContent);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); win.close(); }, 500);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Lançamentos Consolidados</h2>
          <p className="text-sm text-gray-500">Todos os lançamentos da empresa (obras + administrativo + frota)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Excel/CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="flex items-center gap-2">
            <Download className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-green-500" /><span className="text-xs text-green-600 font-medium">Total Entradas</span></div>
            <p className="text-xl font-bold text-green-700">{formatCurrency(totalIn)}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><TrendingDown className="w-4 h-4 text-red-500" /><span className="text-xs text-red-600 font-medium">Total Saídas</span></div>
            <p className="text-xl font-bold text-red-700">{formatCurrency(totalOut)}</p>
          </CardContent>
        </Card>
        <Card className={balance >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Wallet className="w-4 h-4 text-blue-500" /><span className="text-xs text-blue-600 font-medium">Resultado</span></div>
            <p className={`text-xl font-bold ${balance >= 0 ? "text-blue-700" : "text-orange-700"}`}>{formatCurrency(balance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Centro de Custo</Label>
              <Select value={filterCostCenter} onValueChange={setFilterCostCenter}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="obra">Obras</SelectItem>
                  <SelectItem value="administrativo">Administrativo</SelectItem>
                  <SelectItem value="frota">Frota</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="entrada">Entradas</SelectItem>
                  <SelectItem value="saida">Saídas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Data Inicial</Label>
              <Input type="date" className="h-8 text-sm" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Data Final</Label>
              <Input type="date" className="h-8 text-sm" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" size="sm" className="h-8 w-full" onClick={() => { setFilterCostCenter("all"); setFilterType("todos"); setFilterDateFrom(""); setFilterDateTo(""); }}>
                Limpar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : (transactions as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-gray-500">Nenhum lançamento encontrado</p>
              <p className="text-xs text-gray-400 mt-1">Os lançamentos das obras aparecem aqui automaticamente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Centro</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Descrição</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Obra / Veículo</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Conta</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(transactions as any[]).map((t: any) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${COST_CENTER_COLORS[t.costCenter] || "bg-gray-100 text-gray-600"}`}>
                          {COST_CENTER_LABELS[t.costCenter] || t.costCenter}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={t.type === "entrada" ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}>
                          {t.type === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{t.category || "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{t.description}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{t.budgetTitle || t.vehicleName || "-"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{t.bankAccountName || "-"}</td>
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${t.type === "entrada" ? "text-green-600" : "text-red-600"}`}>
                        {t.type === "entrada" ? "+" : "-"}{formatCurrency(t.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
