import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2, Eye, RefreshCw, Package, FileText, Calendar } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function MaterialLists() {
  const utils = trpc.useUtils();
  const { data: lists, isLoading } = trpc.materialLists.getAll.useQuery();
  const { data: budgets } = trpc.budgets.list.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [selectedBudgetIds, setSelectedBudgetIds] = useState<number[]>([]);

  const createMutation = trpc.materialLists.create.useMutation({
    onSuccess: () => {
      utils.materialLists.getAll.invalidate();
      toast.success("Lista de materiais criada com sucesso!");
      setCreateOpen(false);
      setForm({ name: "", description: "" });
      setSelectedBudgetIds([]);
    },
    onError: (e) => toast.error(e.message || "Erro ao criar lista"),
  });

  const deleteMutation = trpc.materialLists.delete.useMutation({
    onSuccess: () => {
      utils.materialLists.getAll.invalidate();
      toast.success("Lista excluída");
    },
    onError: () => toast.error("Erro ao excluir lista"),
  });

  const handleToggleBudget = (budgetId: number) => {
    setSelectedBudgetIds((prev) =>
      prev.includes(budgetId) ? prev.filter((id) => id !== budgetId) : [...prev, budgetId]
    );
  };

  const handleCreate = () => {
    if (!form.name.trim()) return toast.error("Informe um nome para a lista");
    if (selectedBudgetIds.length === 0) return toast.error("Selecione ao menos um orçamento");
    createMutation.mutate({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      budgetIds: selectedBudgetIds,
    });
  };

  // Flatten budgets list (pode estar agrupado por cliente)
  const allBudgets = budgets
    ? (budgets as any[]).flatMap((group: any) =>
        Array.isArray(group.budgets) ? group.budgets : [group]
      )
    : [];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="h-6 w-6 text-blue-600" />
              Lista de Materiais
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Extraia e gerencie quantitativos de materiais dos seus orçamentos
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Lista
          </Button>
        </div>

        {/* Conteúdo */}
        {isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : !lists || lists.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Nenhuma lista criada ainda</p>
              <p className="text-gray-400 text-sm mt-1">
                Crie uma lista para extrair os materiais de um ou mais orçamentos
              </p>
              <Button onClick={() => setCreateOpen(true)} className="mt-4 gap-2" variant="outline">
                <Plus className="h-4 w-4" />
                Criar primeira lista
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {lists.map((list: any) => (
              <Card key={list.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-semibold text-gray-900 truncate">
                        {list.name}
                      </CardTitle>
                      {list.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{list.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <Link href={`/material-lists/${list.id}`}>
                        <Button size="sm" variant="outline" className="gap-1.5 h-8">
                          <Eye className="h-3.5 w-3.5" />
                          Abrir
                        </Button>
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir lista?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Todos os itens da lista "{list.name}" serão excluídos permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => deleteMutation.mutate({ id: list.id })}
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {list.budgets?.length || 0} orçamento(s):{" "}
                      <span className="text-gray-700 font-medium">
                        {list.budgets?.map((b: any) => b.budgetTitle).join(", ")}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Package className="h-3.5 w-3.5" />
                      {list.itemCount} item(s)
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(list.updatedAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Dialog: Criar nova lista */}
        <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setSelectedBudgetIds([]); setForm({ name: "", description: "" }); } }}>
          <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Lista de Materiais</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs font-medium">Nome da lista *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Materiais — Obra Rua das Flores"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Descrição (opcional)</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Observações sobre esta lista..."
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-medium mb-2 block">
                  Selecionar orçamento(s) *
                </Label>
                {allBudgets.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhum orçamento disponível</p>
                ) : (
                  <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                    {allBudgets.map((budget: any) => (
                      <label
                        key={budget.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                      >
                        <Checkbox
                          checked={selectedBudgetIds.includes(budget.id)}
                          onCheckedChange={() => handleToggleBudget(budget.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{budget.title}</p>
                          {budget.code && (
                            <p className="text-xs text-gray-400">{budget.code}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {selectedBudgetIds.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1">
                    {selectedBudgetIds.length} orçamento(s) selecionado(s)
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="gap-2"
              >
                {createMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Criar Lista
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
