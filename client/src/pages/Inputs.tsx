import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Search, Check, X, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";

// Destaca o trecho que bateu com a busca, pra achar mais rápido numa lista longa
function highlightMatch(text: string, term: string) {
  if (!term.trim()) return text;
  const idx = text.toLowerCase().indexOf(term.trim().toLowerCase());
  if (idx === -1) return text;
  const end = idx + term.trim().length;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-inherit rounded-sm px-0.5">{text.slice(idx, end)}</mark>
      {text.slice(end)}
    </>
  );
}

export default function Inputs() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<string>("");
  
  const utils = trpc.useUtils();
  const { data: inputs, isLoading } = trpc.inputs.list.useQuery();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm();
  
  const createMutation = trpc.inputs.create.useMutation({
    onSuccess: () => {
      utils.inputs.list.invalidate();
      toast.success("Insumo criado com sucesso");
      setOpen(false);
      reset();
    },
    onError: () => toast.error("Erro ao criar insumo"),
  });
  
  const updateMutation = trpc.inputs.update.useMutation({
    onSuccess: () => {
      utils.inputs.list.invalidate();
      toast.success("Insumo atualizado com sucesso");
      setOpen(false);
      setEditingId(null);
      reset();
    },
    onError: () => toast.error("Erro ao atualizar insumo"),
  });
  
  // Mutation específica para atualização rápida de preço
  const updatePriceMutation = trpc.inputs.update.useMutation({
    onSuccess: () => {
      utils.inputs.list.invalidate();
      toast.success("Preço atualizado!");
      setEditingPriceId(null);
      setEditingPriceValue("");
    },
    onError: () => toast.error("Erro ao atualizar preço"),
  });
  
  const deleteMutation = trpc.inputs.delete.useMutation({
    onSuccess: () => {
      utils.inputs.list.invalidate();
      toast.success("Insumo excluído com sucesso");
    },
    onError: () => toast.error("Erro ao excluir insumo"),
  });
  
  // Filtrar e buscar insumos
  const filteredInputs = useMemo(() => {
    if (!inputs) return [];

    const term = searchTerm.trim().toLowerCase();

    const filtered = inputs.filter((input) => {
      const matchesSearch = term === "" ||
        input.description.toLowerCase().includes(term) ||
        (input.code && input.code.toLowerCase().includes(term));

      const matchesType = filterType === "all" || input.type === filterType;

      return matchesSearch && matchesType;
    });

    if (term === "") {
      // Sem busca: lista alfabética, mais fácil de escanear que por data de criação
      return [...filtered].sort((a, b) => a.description.localeCompare(b.description, "pt-BR"));
    }

    // Com busca: o que começa com o termo aparece primeiro, depois o que só contém;
    // dentro de cada grupo, ordem alfabética
    const relevance = (input: any) => {
      const desc = input.description.toLowerCase();
      const code = (input.code || "").toLowerCase();
      return desc.startsWith(term) || code.startsWith(term) ? 0 : 1;
    };

    return [...filtered].sort((a, b) => {
      const diff = relevance(a) - relevance(b);
      return diff !== 0 ? diff : a.description.localeCompare(b.description, "pt-BR");
    });
  }, [inputs, searchTerm, filterType]);
  
  const handleEdit = (input: any) => {
    setEditingId(input.id);
    reset(input);
    setOpen(true);
  };
  
  const handleStartPriceEdit = (input: any) => {
    setEditingPriceId(input.id);
    setEditingPriceValue(String(input.unitCost));
  };
  
  const handleSavePrice = (input: any) => {
    const newPrice = parseFloat(editingPriceValue);
    if (isNaN(newPrice) || newPrice < 0) {
      toast.error("Valor inválido");
      return;
    }
    
    updatePriceMutation.mutate({
      id: input.id,
      description: input.description,
      type: input.type,
      unit: input.unit,
      unitCost: editingPriceValue,
    });
  };
  
  const handleCancelPriceEdit = () => {
    setEditingPriceId(null);
    setEditingPriceValue("");
  };
  
  const onSubmit = (data: any) => {
    // Garantir que campos opcionais vazios sejam strings vazias
    const sanitizedData = {
      ...data,
      code: data.code || "",
      notes: data.notes || "",
    };
    
    // Validar código duplicado apenas ao criar novo insumo
    if (!editingId && sanitizedData.code) {
      const codeExists = inputs?.some(input => 
        input.code?.toLowerCase() === sanitizedData.code.toLowerCase()
      );
      
      if (codeExists) {
        toast.error(`Código "${sanitizedData.code}" já existe. Por favor, use um código diferente.`);
        return;
      }
    }
    
    if (editingId) {
      // Ao editar, verificar se o código mudou e se já existe
      if (sanitizedData.code) {
        const codeExists = inputs?.some(input => 
          input.id !== editingId && input.code?.toLowerCase() === sanitizedData.code.toLowerCase()
        );
        
        if (codeExists) {
          toast.error(`Código "${sanitizedData.code}" já existe. Por favor, use um código diferente.`);
          return;
        }
      }
      updateMutation.mutate({ id: editingId, ...sanitizedData });
    } else {
      createMutation.mutate(sanitizedData);
    }
  };
  
  const typeLabels: Record<string, string> = {
    material: "Material",
    labor: "Mão de Obra",
    equipment: "Equipamento",
  };
  
  const typeColors: Record<string, string> = {
    material: "bg-blue-100 text-blue-800",
    labor: "bg-green-100 text-green-800",
    equipment: "bg-orange-100 text-orange-800",
  };
  
  // Estatísticas
  const stats = useMemo(() => {
    if (!inputs) return { total: 0, material: 0, labor: 0, equipment: 0 };
    return {
      total: inputs.length,
      material: inputs.filter(i => i.type === "material").length,
      labor: inputs.filter(i => i.type === "labor").length,
      equipment: inputs.filter(i => i.type === "equipment").length,
    };
  }, [inputs]);
  
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Insumos</h1>
            <p className="text-muted-foreground mt-2">
              Gerencie materiais, mão de obra e equipamentos - Clique no preço para editar rapidamente
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingId(null); reset(); }}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Insumo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Novo"} Insumo</DialogTitle>
                <DialogDescription>Preencha os dados do insumo</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Tipo *</Label>
                  <Select onValueChange={(value) => setValue("type", value)} value={watch("type") || ""}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="material">Material</SelectItem>
                      <SelectItem value="labor">Mão de Obra</SelectItem>
                      <SelectItem value="equipment">Equipamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Código</Label>
                  <Input id="code" {...register("code")} placeholder="Ex: MAT-001" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição *</Label>
                  <Input id="description" {...register("description", { required: true })} placeholder="Descrição do insumo" />
                  {errors.description && <p className="text-sm text-destructive">Campo obrigatório</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unidade *</Label>
                    <Input id="unit" {...register("unit", { required: true })} placeholder="Ex: kg, h, un" />
                    {errors.unit && <p className="text-sm text-destructive">Campo obrigatório</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unitCost">Custo (R$) *</Label>
                    <Input id="unitCost" type="number" step="0.01" {...register("unitCost", { required: true })} placeholder="0.00" />
                    {errors.unitCost && <p className="text-sm text-destructive">Campo obrigatório</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Input id="notes" {...register("notes")} placeholder="Observações adicionais (opcional)" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingId ? "Atualizar" : "Criar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Estatísticas */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setFilterType("all")}>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-sm text-muted-foreground">Total de Insumos</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setFilterType("material")}>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">{stats.material}</div>
              <p className="text-sm text-muted-foreground">Materiais</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setFilterType("labor")}>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{stats.labor}</div>
              <p className="text-sm text-muted-foreground">Mão de Obra</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setFilterType("equipment")}>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-orange-600">{stats.equipment}</div>
              <p className="text-sm text-muted-foreground">Equipamentos</p>
            </CardContent>
          </Card>
        </div>
        
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Lista de Insumos</CardTitle>
                <CardDescription>
                  {filterType === "all" ? "Todos os insumos" : `Filtrando: ${typeLabels[filterType]}`}
                  {searchTerm && ` - Busca: "${searchTerm}"`}
                  {` (${filteredInputs.length} resultados)`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por código ou descrição..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-80"
                  />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filtrar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="labor">Mão de Obra</SelectItem>
                    <SelectItem value="equipment">Equipamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : filteredInputs.length > 0 ? (
              <div className="max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-24">Tipo</TableHead>
                      <TableHead className="w-32">Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-20">Unidade</TableHead>
                      <TableHead className="w-40 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DollarSign className="h-4 w-4" />
                          Custo Unitário
                        </div>
                      </TableHead>
                      <TableHead className="w-24 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInputs.map((input) => (
                      <TableRow key={input.id}>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColors[input.type]}`}>
                            {typeLabels[input.type]}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {input.code ? highlightMatch(input.code, searchTerm) : "-"}
                        </TableCell>
                        <TableCell className="max-w-md truncate" title={input.description}>
                          {highlightMatch(input.description, searchTerm)}
                        </TableCell>
                        <TableCell>{input.unit}</TableCell>
                        <TableCell className="text-right">
                          {editingPriceId === input.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-muted-foreground">R$</span>
                              <Input
                                type="number"
                                step="0.01"
                                value={editingPriceValue}
                                onChange={(e) => setEditingPriceValue(e.target.value)}
                                className="w-24 h-8 text-right"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSavePrice(input);
                                  if (e.key === "Escape") handleCancelPriceEdit();
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleSavePrice(input)}
                                disabled={updatePriceMutation.isPending}
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={handleCancelPriceEdit}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleStartPriceEdit(input)}
                              className="font-medium hover:bg-accent px-2 py-1 rounded cursor-pointer transition-colors"
                              title="Clique para editar o preço"
                            >
                              R$ {Number(input.unitCost).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(input)} title="Editar insumo">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: input.id })} title="Excluir insumo">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  {searchTerm || filterType !== "all" 
                    ? "Nenhum insumo encontrado com os filtros aplicados" 
                    : "Nenhum insumo cadastrado"}
                </p>
                {!searchTerm && filterType === "all" && (
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar primeiro insumo
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
