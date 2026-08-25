import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Landmark, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from 'sonner';

const BANK_TYPE_LABELS: Record<string, string> = {
  corrente: "Conta Corrente",
  poupanca: "Poupança",
  caixa: "Caixa Físico",
};

const formatCurrency = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const emptyForm = {
  name: "", bank: "", type: "corrente" as "corrente" | "poupanca" | "caixa",
  agency: "", accountNumber: "", initialBalance: "0",
};

export default function FinanceiroContas() {
  
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: accounts = [], isLoading } = trpc.bankAccounts.list.useQuery();

  const createMutation = trpc.bankAccounts.create.useMutation({
    onSuccess: () => { utils.bankAccounts.list.invalidate(); setShowForm(false); setForm({ ...emptyForm }); toast.success('Conta criada com sucesso!'); },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const updateMutation = trpc.bankAccounts.update.useMutation({
    onSuccess: () => { utils.bankAccounts.list.invalidate(); setShowForm(false); setEditId(null); setForm({ ...emptyForm }); toast.success('Conta atualizada!'); },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const deleteMutation = trpc.bankAccounts.delete.useMutation({
    onSuccess: () => { utils.bankAccounts.list.invalidate(); toast.success('Conta removida!'); },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const handleSubmit = () => {
    const payload = {
      name: form.name, bank: form.bank, type: form.type,
      agency: form.agency || undefined, accountNumber: form.accountNumber || undefined,
      initialBalance: parseFloat(form.initialBalance) || 0,
    };
    if (editId) updateMutation.mutate({ id: editId, ...payload });
    else createMutation.mutate(payload);
  };

  const handleEdit = (acc: any) => {
    setEditId(acc.id);
    setForm({
      name: acc.name, bank: acc.bank, type: acc.type,
      agency: acc.agency || "", accountNumber: acc.accountNumber || "",
      initialBalance: String(acc.initialBalance || "0"),
    });
    setShowForm(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Remover esta conta bancária?")) deleteMutation.mutate({ id });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Contas Bancárias</h2>
          <p className="text-sm text-gray-500">Gerencie as contas da empresa para vincular aos lançamentos</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ ...emptyForm }); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" /> Nova Conta
        </Button>
      </div>

      {/* Cards de contas */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Landmark className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Nenhuma conta cadastrada</p>
            <p className="text-sm text-gray-400 mt-1">Cadastre as contas bancárias da empresa para vincular aos lançamentos</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc: any) => (
            <Card key={acc.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">{acc.name}</CardTitle>
                    <p className="text-sm text-gray-500">{acc.bank}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{BANK_TYPE_LABELS[acc.type]}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(acc.agency || acc.accountNumber) && (
                    <p className="text-xs text-gray-400">
                      {acc.agency && `Ag: ${acc.agency}`}{acc.agency && acc.accountNumber && " | "}{acc.accountNumber && `CC: ${acc.accountNumber}`}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-gray-600">Saldo inicial:</span>
                    <span className="font-semibold text-green-600">{formatCurrency(acc.initialBalance)}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Badge className={acc.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                      {acc.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                    <div className="ml-auto flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(acc)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDelete(acc.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de formulário */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) { setEditId(null); setForm({ ...emptyForm }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Conta" : "Nova Conta Bancária"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome / Apelido *</Label>
                <Input placeholder="Ex: Conta Principal Itaú" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Banco *</Label>
                <Input placeholder="Ex: Itaú" value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} />
              </div>
              <div>
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Conta Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="caixa">Caixa Físico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Agência</Label>
                <Input placeholder="0000" value={form.agency} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))} />
              </div>
              <div>
                <Label>Conta</Label>
                <Input placeholder="00000-0" value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Saldo Inicial (R$)</Label>
                <Input type="number" step="0.01" placeholder="0,00" value={form.initialBalance} onChange={e => setForm(f => ({ ...f, initialBalance: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">Informe o saldo atual da conta no momento do cadastro</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!form.name || !form.bank} className="bg-blue-600 hover:bg-blue-700">
              {editId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
