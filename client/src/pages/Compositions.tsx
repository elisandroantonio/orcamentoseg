import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Plus, Search, ChevronDown, ChevronRight, Save, Pencil, Edit, Trash2, Copy, Download } from "lucide-react";
import * as XLSX from 'xlsx';
import { Link } from "wouter";

import { toast } from "sonner";
import { useState, useMemo } from "react";
// AlertDialog removido - não usado

export default function Compositions() {
  const utils = trpc.useUtils();
  const { data: compositions, isLoading } = trpc.compositions.list.useQuery();
  const { data: categories } = trpc.categories.list.useQuery();
  const { data: inputs } = trpc.inputs.list.useQuery();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedCompositions, setExpandedCompositions] = useState<Set<number>>(new Set());
  const [compositionInputs, setCompositionInputs] = useState<Record<number, any[]>>({});
  const [editingInput, setEditingInput] = useState<{compositionId: number, inputId: number, compositionInputId: number} | null>(null);
  const [editValues, setEditValues] = useState<{coefficient: string, unitCost: string}>({coefficient: "", unitCost: ""});
  

  
  const deleteMutation = trpc.compositions.delete.useMutation({
    onSuccess: () => {
      utils.compositions.list.invalidate();
      toast.success("Composição excluída com sucesso");
    },
    onError: () => {
      toast.error("Erro ao excluir composição");
    },
  });

  const updateInputMutation = trpc.inputs.updateUnitCost.useMutation({
    onSuccess: () => {
      toast.success("Custo unitário atualizado com sucesso");
      // Recarregar insumos da composição
      if (editingInput) {
        loadCompositionInputs(editingInput.compositionId);
      }
    },
    onError: () => {
      toast.error("Erro ao atualizar custo unitário");
    },
  });
  
  const updateCoefficientMutation = trpc.compositions.updateInputCoefficient.useMutation({
    onSuccess: () => {
      toast.success("Coeficiente atualizado com sucesso");
      setEditingInput(null);
      // Recarregar insumos da composição
      if (editingInput) {
        loadCompositionInputs(editingInput.compositionId);
      }
    },
    onError: () => {
      toast.error("Erro ao atualizar coeficiente");
    },
  });
  
  const duplicateMutation = trpc.compositions.duplicate.useMutation({
    onSuccess: () => {
      toast.success("Composição duplicada com sucesso");
      utils.compositions.list.invalidate();
    },
    onError: () => {
      toast.error("Erro ao duplicar composição");
    },
  });
  
  const addInputMutation = trpc.compositions.addInput.useMutation();
  const removeInputMutation = trpc.compositions.removeInput.useMutation();

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  const toggleExpand = async (compositionId: number) => {
    const newExpanded = new Set(expandedCompositions);
    if (newExpanded.has(compositionId)) {
      newExpanded.delete(compositionId);
    } else {
      newExpanded.add(compositionId);
      // Carregar insumos se ainda não foram carregados
      if (!compositionInputs[compositionId]) {
        await loadCompositionInputs(compositionId);
      }
    }
    setExpandedCompositions(newExpanded);
  };

  const loadCompositionInputs = async (compositionId: number) => {
    try {
      const result = await utils.client.compositions.get.query({ id: compositionId });
      if (result && result.inputs) {
        setCompositionInputs(prev => ({
          ...prev,
          [compositionId]: result.inputs
        }));
      }
    } catch (error) {
      toast.error("Erro ao carregar insumos");
    }
  };

  const startEdit = (compositionId: number, input: any) => {
    setEditingInput({ compositionId, inputId: input.inputId, compositionInputId: input.id });
    setEditValues({
      coefficient: input.coefficient?.toString() || "",
      unitCost: input.input?.unitCost?.toString() || ""
    });
  };

  const saveEdit = async () => {
    if (!editingInput) return;
    
    // Salvar coeficiente
    if (editValues.coefficient) {
      await updateCoefficientMutation.mutateAsync({
        compositionInputId: editingInput.compositionInputId,
        compositionId: editingInput.compositionId,
        coefficient: editValues.coefficient,
      });
    }
    
    // Salvar custo unitário
    if (editValues.unitCost) {
      await updateInputMutation.mutateAsync({
        id: editingInput.inputId,
        unitCost: editValues.unitCost,
      });
    }
    
    setEditingInput(null);
  };

  const cancelEdit = () => {
    setEditingInput(null);
    setEditValues({ coefficient: "", unitCost: "" });
  };
  

  // Duplicar composição
  const duplicateComposition = async (compositionId: number) => {
    try {
      await duplicateMutation.mutateAsync({ id: compositionId });
    } catch (error) {
      console.error("Erro ao duplicar composição:", error);
    }
  };
  
  // Exportar para Excel
  const exportToExcel = async () => {
    if (!filteredCompositions || filteredCompositions.length === 0) {
      toast.error("Nenhuma composição para exportar");
      return;
    }
    
    const data = [];
    
    for (const comp of filteredCompositions) {
      const inputs = compositionInputs[comp.id] || [];
      
      if (inputs.length === 0) {
        data.push({
          "Código": comp.code || "",
          "Descrição": comp.description,
          "Categoria": getCategoryName(comp.categoryId),
          "Unidade": comp.unit,
          "Custo Material": "",
          "Custo Mão de Obra": "",
          "Custo Equipamentos": "",
          "Custo Total": "",
        });
      } else {
        const materialCost = inputs.filter(i => i.input?.type === "material").reduce((sum, i) => sum + (Number(i.coefficient || 0) * Number(i.input?.unitCost || 0)), 0);
        const laborCost = inputs.filter(i => i.input?.type === "labor").reduce((sum, i) => sum + (Number(i.coefficient || 0) * Number(i.input?.unitCost || 0)), 0);
        const equipmentCost = inputs.filter(i => i.input?.type === "equipment").reduce((sum, i) => sum + (Number(i.coefficient || 0) * Number(i.input?.unitCost || 0)), 0);
        const totalCost = materialCost + laborCost + equipmentCost;
        
        data.push({
          "Código": comp.code || "",
          "Descrição": comp.description,
          "Categoria": getCategoryName(comp.categoryId),
          "Unidade": comp.unit,
          "Custo Material": `R$ ${materialCost.toFixed(2)}`,
          "Custo Mão de Obra": `R$ ${laborCost.toFixed(2)}`,
          "Custo Equipamentos": `R$ ${equipmentCost.toFixed(2)}`,
          "Custo Total": `R$ ${totalCost.toFixed(2)}`,
        });
        
        // Adicionar insumos
        for (const inp of inputs) {
          data.push({
            "Código": `  ${inp.input?.code || ""}`,
            "Descrição": `  ${inp.input?.description || ""}`,
            "Categoria": inp.input?.type === "material" ? "Material" : inp.input?.type === "labor" ? "Mão de Obra" : "Equipamento",
            "Unidade": inp.input?.unit || "",
            "Coeficiente": Number(inp.coefficient || 0).toFixed(6),
            "Custo Unitário": `R$ ${Number(inp.input?.unitCost || 0).toFixed(2)}`,
            "Custo Total": `R$ ${(Number(inp.coefficient || 0) * Number(inp.input?.unitCost || 0)).toFixed(2)}`,
          });
        }
      }
    }
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Composições");
    XLSX.writeFile(wb, `composicoes_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Arquivo Excel exportado com sucesso");
  };
  
  // Filtrar composições
  const filteredCompositions = useMemo(() => {
    if (!compositions) return [];
    
    return compositions.filter((comp) => {
      const matchesSearch = searchTerm === "" || 
        comp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (comp.code && comp.code.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCategory = selectedCategory === "all" || 
        comp.categoryId?.toString() === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [compositions, searchTerm, selectedCategory]);

  // Calcular totais
  const totalCost = (comp: typeof compositions extends (infer T)[] | undefined ? T : never) => {
    return Number(comp.materialCost) + Number(comp.laborCost);
  };

  // Obter nome da categoria
  const getCategoryName = (categoryId: number | null) => {
    if (!categoryId || !categories) return "-";
    const cat = categories.find(c => c.id === categoryId);
    return cat ? cat.code : "-";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Composições</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie as composições de serviços e seus insumos
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportToExcel} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>
            <Link href="/compositions/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Composição
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Busque e filtre composições</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por código ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.code} - {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Composições ({filteredCompositions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border rounded-lg p-4 flex items-center gap-4">
                    <Skeleton className="h-8 w-8 rounded-sm" />
                    <div className="flex-1 grid grid-cols-5 gap-4">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Skeleton key={j} className="h-4 w-full" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredCompositions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma composição encontrada
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCompositions.map((comp) => (
                  <div key={comp.id} className="border rounded-lg">
                    {/* Linha da composição */}
                    <div className="flex items-center gap-4 p-4 hover:bg-muted/50">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(comp.id)}
                        className="h-8 w-8 p-0"
                      >
                        {expandedCompositions.has(comp.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      
                      <div className="flex-1 grid grid-cols-5 gap-4">
                        <div>
                          <div className="text-sm font-medium">{comp.code}</div>
                          <div className="text-xs text-muted-foreground">Código</div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-sm font-medium">{comp.description}</div>
                          <div className="text-xs text-muted-foreground">Descrição</div>
                        </div>
                        <div>
                          <Badge variant="outline">{getCategoryName(comp.categoryId)}</Badge>
                          <div className="text-xs text-muted-foreground mt-1">Categoria</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium">{comp.unit}</div>
                          <div className="text-xs text-muted-foreground">Unidade</div>
                        </div>
                      </div>

                      {/* Botões de ação removidos - edição feita diretamente nos insumos */}
                    </div>

                    {/* Insumos expandidos */}
                    {expandedCompositions.has(comp.id) && (
                      <div className="border-t bg-muted/20 p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-semibold">Insumos da Composição</h4>
                          <div className="flex gap-2">
                            <Button onClick={() => duplicateComposition(comp.id)} variant="outline" size="sm">
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicar
                            </Button>
                            <Link href={`/compositions/${comp.id}`}>
                              <Button variant="outline" size="sm">
                                <Edit className="h-4 w-4 mr-2" />
                                Editar Composição
                              </Button>
                            </Link>
                          </div>
                        </div>
                        {compositionInputs[comp.id] && compositionInputs[comp.id].length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Código</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Unidade</TableHead>
                                <TableHead>Coeficiente</TableHead>
                                <TableHead>Custo Unitário</TableHead>
                                <TableHead>Custo Total</TableHead>
                                <TableHead>Ações</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {compositionInputs[comp.id].map((item) => {
                                const isEditing = editingInput?.compositionId === comp.id && editingInput?.inputId === item.inputId;
                                
                                return (
                                  <TableRow key={item.id}>
                                    <TableCell className="font-mono text-sm">{item.input?.code || "-"}</TableCell>
                                    <TableCell>{item.input?.description || "-"}</TableCell>
                                    <TableCell>
                                      <Badge variant={item.input?.type === "Mão de Obra" ? "default" : "secondary"}>
                                        {item.input?.type || "-"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{item.input?.unit || "-"}</TableCell>
                                    <TableCell>
                                      {isEditing ? (
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={editValues.coefficient}
                                          onChange={(e) => setEditValues(prev => ({ ...prev, coefficient: e.target.value }))}
                                          className="w-32"
                                        />
                                      ) : (
                                        item.coefficient || "-"
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {isEditing ? (
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={editValues.unitCost}
                                          onChange={(e) => setEditValues(prev => ({ ...prev, unitCost: e.target.value }))}
                                          className="w-32"
                                        />
                                      ) : (
                                        `R$ ${Number(item.input?.unitCost || 0).toFixed(2)}`
                                      )}
                                    </TableCell>
                                    <TableCell className="font-semibold">
                                      {isEditing ? (
                                        `R$ ${(Number(editValues.coefficient) * Number(editValues.unitCost)).toFixed(2)}`
                                      ) : (
                                        `R$ ${(Number(item.coefficient || 0) * Number(item.input?.unitCost || 0)).toFixed(2)}`
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {isEditing ? (
                                        <div className="flex gap-2">
                                          <Button size="sm" onClick={saveEdit}>
                                            <Save className="h-4 w-4" />
                                          </Button>
                                          <Button size="sm" variant="outline" onClick={cancelEdit}>
                                            Cancelar
                                          </Button>
                                        </div>
                                      ) : (
                                        <Button size="sm" variant="outline" onClick={() => startEdit(comp.id, item)}>
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            Nenhum insumo cadastrado para esta composição
                          </div>
                        )}
                        
                        {/* Resumo de Custos */}
                        {compositionInputs[comp.id] && compositionInputs[comp.id].length > 0 && (() => {
                          const items = compositionInputs[comp.id];
                          const materialCost = items
                            .filter(item => item.input?.type === "material")
                            .reduce((sum, item) => sum + (Number(item.coefficient || 0) * Number(item.input?.unitCost || 0)), 0);
                          const laborCost = items
                            .filter(item => item.input?.type === "labor")
                            .reduce((sum, item) => sum + (Number(item.coefficient || 0) * Number(item.input?.unitCost || 0)), 0);
                          const equipmentCost = items
                            .filter(item => item.input?.type === "equipment")
                            .reduce((sum, item) => sum + (Number(item.coefficient || 0) * Number(item.input?.unitCost || 0)), 0);
                          const totalCost = materialCost + laborCost + equipmentCost;
                          
                          return (
                            <div className="mt-6 pt-4 border-t">
                              <h5 className="font-semibold mb-3">Resumo de Custos (por {comp.unit})</h5>
                              <div className="grid grid-cols-4 gap-4">
                                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                                  <div className="text-sm text-muted-foreground">Material</div>
                                  <div className="text-lg font-bold text-blue-600">R$ {materialCost.toFixed(2)}</div>
                                </div>
                                <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                                  <div className="text-sm text-muted-foreground">Mão de Obra</div>
                                  <div className="text-lg font-bold text-green-600">R$ {laborCost.toFixed(2)}</div>
                                </div>
                                <div className="bg-orange-50 dark:bg-orange-950 p-3 rounded-lg">
                                  <div className="text-sm text-muted-foreground">Equipamentos</div>
                                  <div className="text-lg font-bold text-orange-600">R$ {equipmentCost.toFixed(2)}</div>
                                </div>
                                <div className="bg-primary/10 p-3 rounded-lg">
                                  <div className="text-sm text-muted-foreground">Total</div>
                                  <div className="text-lg font-bold text-primary">R$ {totalCost.toFixed(2)}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
    </DashboardLayout>
  );
}
