import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Truck, TrendingUp, TrendingDown, Wallet } from "lucide-react";

const CATEGORIES_OUT = ["Combustível", "Manutenção/Revisão", "Seguro/IPVA", "Pneus", "Aluguel de Máquina", "Outros"];
const CATEGORIES_IN = ["Venda de Veículo/Máquina", "Outros"];

const formatCurrency = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const formatDate = (d: string | Date) => {
  if (!d) return "-";
  const s = typeof d === "string" ? d : d.toISOString();
  const [y, m, day] = s.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
};

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  type: "saida" as "entrada" | "saida",
  category: "", description: "", value: "", bankAccountId: "none", vehicleId: "none", payeeName: "",
};

export default function FinanceiroFrota() {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [filterType, setFilterType] = useState("todos");
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const { data: accounts = [] } = trpc.bankAccounts.list.useQuery();
  const { data: vehicles = [] } = trpc.fleetVehicles.list.useQuery();
  const { data: transactions = [], isLoading, refetch } = trpc.corporateFinance.list.useQuery({ costCenter: "frota" });

  const createMutation = trpc.corporateFinance.create.useMutation({
    onSuccess: () => { refetch(); utils.corporateFinance.summary.invalidate(); setShowForm(false); setForm({ ...emptyForm }); toast.success("Lançamento criado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const updateMutation = trpc.corporateFinance.update.useMutation({
    onSuccess: () => { refetch(); utils.corporateFinance.summary.invalidate(); setShowForm(false); setEditId(null); setForm({ ...emptyForm }); toast.success("Atualizado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deleteMutation = trpc.corporateFinance.delete.useMutation({
    onSuccess: () => { refetch(); utils.corporateFinance.summary.invalidate(); toast.success("Removido!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const filtered = useMemo(() => {
    return (transactions as any[]).filter(t => {
      if (filterType !== "todos" && t.type !== filterType) return false;
      if (filterVehicle && filterVehicle !== "all" && String(t.vehicleId) !== filterVehicle) return false;
      if (filterDateFrom && t.date < filterDateFrom) return false;
      if (filterDateTo && t.date > filterDateTo) return false;
      return true;
    });
  }, [transactions, filterType, filterVehicle, filterDateFrom, filterDateTo]);

  const totalIn = filtered.filter((t: any) => t.type === "entrada").reduce((s: number, t: any) => s + Number(t.value), 0);
  const totalOut = filtered.filter((t: any) => t.type === "saida").reduce((s: number, t: any) => s + Number(t.value), 0);
  const balance = totalIn - totalOut;

  const handleSubmit = () => {
    const payload = {
      costCenter: "frota" as const,
      date: form.date, type: form.type, category: form.category,
      description: form.description, value: parseFloat(form.value),
      bankAccountId: (form.bankAccountId && form.bankAccountId !== "none") ? parseInt(form.bankAccountId) : undefined,
      vehicleId: (form.vehicleId && form.vehicleId !== "none") ? parseInt(form.vehicleId) : undefined,
      payeeName: form.payeeName || undefined,
    };
    if (editId) updateMutation.mutate({ id: editId, ...payload });
    else createMutation.mutate(payload);
  };

  const handleEdit = (t: any) => {
    setEditId(t.id);
    const dateStr = typeof t.date === "string" ? t.date.split("T")[0] : new Date(t.date).toISOString().split("T")[0];
    setForm({
      date: dateStr, type: t.type, category: t.category || "",
      description: t.description || "", value: String(t.value),
      bankAccountId: t.bankAccountId ? String(t.bankAccountId) : "none",
      vehicleId: t.vehicleId ? String(t.vehicleId) : "none",
      payeeName: t.payeeName || "",
    });
    setShowForm(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Remover este lançamento?")) deleteMutation.mutate({ id });
  };

  const categories = form.type === "entrada" ? CATEGORIES_IN : CATEGORIES_OUT;
  const activeVehicles = (vehicles as any[]).filter((v: any) => v.status === "ativo");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Frota — Veículos e Máquinas</h2>
          <p className="text-sm text-gray-500">Lançamentos de combustível, manutenção, seguro e outros custos de frota</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ ...emptyForm }); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" /> Novo Lançamento
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-green-500" /><span className="text-xs text-green-600 font-medium">Entradas</span></div>
            <p className="text-xl font-bold text-green-700">{formatCurrency(totalIn)}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><TrendingDown className="w-4 h-4 text-red-500" /><span className="text-xs text-red-600 font-medium">Saídas</span></div>
            <p className="text-xl font-bold text-red-700">{formatCurrency(totalOut)}</p>
          </CardContent>
        </Card>
        <Card className={balance >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Wallet className="w-4 h-4 text-blue-500" /><span className="text-xs text-blue-600 font-medium">Saldo</span></div>
            <p className={`text-xl font-bold ${balance >= 0 ? "text-blue-700" : "text-orange-700"}`}>{formatCurrency(balance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
              <Label className="text-xs">Veículo</Label>
              <Select value={filterVehicle} onValueChange={setFilterVehicle}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(vehicles as any[]).map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.description}</SelectItem>)}
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
              <Button variant="outline" size="sm" className="h-8 w-full" onClick={() => { setFilterType("todos"); setFilterVehicle("all"); setFilterDateFrom(""); setFilterDateTo(""); }}>
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
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Truck className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-gray-500">Nenhum lançamento de frota encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Veículo</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Descrição</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Valor</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((t: any) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{formatDate(t.date)}</td>
                      <td className="px-4 py-3">
                        <Badge className={t.type === "entrada" ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}>
                          {t.type === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{t.vehicleName || "-"}</td>
                      <td className="px-4 py-3 text-gray-600">{t.category || "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{t.description}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${t.type === "entrada" ? "text-green-600" : "text-red-600"}`}>
                        {t.type === "entrada" ? "+" : "-"}{formatCurrency(t.value)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(t)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDelete(t.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) { setEditId(null); setForm({ ...emptyForm }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Lançamento" : "Novo Lançamento de Frota"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any, category: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saida">Saída</SelectItem>
                    <SelectItem value="entrada">Entrada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Veículo / Máquina</Label>
                <Select value={form.vehicleId} onValueChange={v => setForm(f => ({ ...f, vehicleId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {activeVehicles.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.description}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoria *</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Descrição *</Label>
                <Input placeholder="Descreva o lançamento" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input type="number" step="0.01" placeholder="0,00" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
              </div>
              <div>
                <Label>Conta Bancária</Label>
                <Select value={form.bankAccountId} onValueChange={v => setForm(f => ({ ...f, bankAccountId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {(accounts as any[]).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!form.date || !form.category || !form.description || !form.value} className="bg-blue-600 hover:bg-blue-700">
              {editId ? "Salvar" : "Lançar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
