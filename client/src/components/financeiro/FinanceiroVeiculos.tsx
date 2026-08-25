import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Car, Wrench } from "lucide-react";
import { toast } from 'sonner';

const emptyForm = {
  type: "veiculo" as "veiculo" | "maquina",
  description: "", plate: "", model: "", year: "", notes: "",
};

export default function FinanceiroVeiculos() {
  
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: vehicles = [], isLoading } = trpc.fleetVehicles.list.useQuery();

  const createMutation = trpc.fleetVehicles.create.useMutation({
    onSuccess: () => { utils.fleetVehicles.list.invalidate(); setShowForm(false); setForm({ ...emptyForm }); toast.success('Cadastrado com sucesso!'); },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const updateMutation = trpc.fleetVehicles.update.useMutation({
    onSuccess: () => { utils.fleetVehicles.list.invalidate(); setShowForm(false); setEditId(null); setForm({ ...emptyForm }); toast.success('Atualizado!'); },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const deleteMutation = trpc.fleetVehicles.delete.useMutation({
    onSuccess: () => { utils.fleetVehicles.list.invalidate(); toast.success('Removido!'); },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const toggleStatus = (v: any) => {
    updateMutation.mutate({ id: v.id, status: v.status === "ativo" ? "inativo" : "ativo" });
  };

  const handleSubmit = () => {
    const payload = {
      type: form.type, description: form.description,
      plate: form.plate || undefined, model: form.model || undefined,
      year: form.year ? parseInt(form.year) : undefined,
      notes: form.notes || undefined,
    };
    if (editId) updateMutation.mutate({ id: editId, ...payload });
    else createMutation.mutate(payload);
  };

  const handleEdit = (v: any) => {
    setEditId(v.id);
    setForm({ type: v.type, description: v.description, plate: v.plate || "", model: v.model || "", year: v.year ? String(v.year) : "", notes: v.notes || "" });
    setShowForm(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Remover este veículo/máquina?")) deleteMutation.mutate({ id });
  };

  const active = vehicles.filter((v: any) => v.status === "ativo");
  const inactive = vehicles.filter((v: any) => v.status === "inativo");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Veículos e Máquinas</h2>
          <p className="text-sm text-gray-500">Cadastro da frota da empresa</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ ...emptyForm }); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" /> Novo Cadastro
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600 font-medium">Total da Frota</p>
            <p className="text-2xl font-bold text-blue-700">{vehicles.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <p className="text-xs text-green-600 font-medium">Ativos</p>
            <p className="text-2xl font-bold text-green-700">{active.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium">Inativos</p>
            <p className="text-2xl font-bold text-gray-600">{inactive.length}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : vehicles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Car className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Nenhum veículo ou máquina cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((v: any) => (
            <Card key={v.id} className={`hover:shadow-md transition-shadow ${v.status === "inativo" ? "opacity-60" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {v.type === "veiculo" ? <Car className="w-5 h-5 text-blue-500" /> : <Wrench className="w-5 h-5 text-orange-500" />}
                    <div>
                      <CardTitle className="text-sm font-semibold">{v.description}</CardTitle>
                      {v.model && <p className="text-xs text-gray-400">{v.model}{v.year ? ` (${v.year})` : ""}</p>}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">{v.type === "veiculo" ? "Veículo" : "Máquina"}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {v.plate && <p className="text-sm text-gray-600">Placa: <span className="font-mono font-semibold">{v.plate}</span></p>}
                  {v.notes && <p className="text-xs text-gray-400 italic">{v.notes}</p>}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <button onClick={() => toggleStatus(v)} className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer ${v.status === "ativo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {v.status === "ativo" ? "Ativo" : "Inativo"}
                    </button>
                    <div className="ml-auto flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(v)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDelete(v.id)}>
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

      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) { setEditId(null); setForm({ ...emptyForm }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Cadastro" : "Novo Veículo / Máquina"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="veiculo">Veículo</SelectItem>
                    <SelectItem value="maquina">Máquina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Placa</Label>
                <Input placeholder="ABC-1234" value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} />
              </div>
              <div className="col-span-2">
                <Label>Descrição *</Label>
                <Input placeholder="Ex: Caminhão Mercedes 1620" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <Label>Modelo</Label>
                <Input placeholder="Ex: Sprinter 415" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <div>
                <Label>Ano</Label>
                <Input type="number" placeholder="2020" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Observações</Label>
                <Textarea placeholder="Informações adicionais..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!form.description} className="bg-blue-600 hover:bg-blue-700">
              {editId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
