import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { useEffect, useState } from "react";
import { Plus, Trash2, Check, ChevronsUpDown, Pencil, Save, X, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface FormData {
  code: string;
  categoryId: string;
  description: string;
  unit: string;
  notes: string;
}

interface CompositionInput {
  inputId: number;
  input?: {
    code?: string | null;
    description: string;
    type: string;
    unit: string;
    unitCost: string;
  } | null;
  coefficient: string;
  quantity: string;
}

export default function CompositionForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const isEditing = !!id;
  
  const { data: composition } = trpc.compositions.get.useQuery(
    { id: Number(id) },
    { enabled: isEditing }
  );
  
  const { data: categories } = trpc.categories.list.useQuery();
  const { data: availableInputs } = trpc.inputs.list.useQuery();
  const { data: availableCompositions } = trpc.compositions.list.useQuery();
  
  const { register, handleSubmit, reset, control, formState: { errors }, setValue, watch } = useForm<FormData>();
  
  // Watch categoryId para gerar código automaticamente
  const categoryId = watch("categoryId");
  
  // Query para gerar código
  const { data: generatedCodeData } = trpc.compositions.generateCode.useQuery(
    { categoryId: Number(categoryId) },
    { enabled: !!categoryId && !isEditing && categoryId !== "" }
  );
  
  // Atualizar código quando gerado
  useEffect(() => {
    if (generatedCodeData && !isEditing) {
      setValue("code", generatedCodeData.code);
    }
  }, [generatedCodeData, isEditing, setValue]);
  
  const [compositionInputs, setCompositionInputs] = useState<CompositionInput[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [newCoefficient, setNewCoefficient] = useState<string>("1.0");
  const [newQuantity, setNewQuantity] = useState<string>("1.0");
  const [inputSearchTerm, setInputSearchTerm] = useState<string>("");
  const [isInputSelectorOpen, setIsInputSelectorOpen] = useState(false);
  const [isCategorySelectorOpen, setIsCategorySelectorOpen] = useState(false);
  const [editingInputId, setEditingInputId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ coefficient: string; unitCost: string }>({ coefficient: "", unitCost: "" });
  const [isBaseCompositionDialogOpen, setIsBaseCompositionDialogOpen] = useState(false);
  const [baseCompositionSearchTerm, setBaseCompositionSearchTerm] = useState("");
  
  useEffect(() => {
    if (composition) {
      reset({
        code: composition.code || "",
        categoryId: composition.categoryId?.toString() || "",
        description: composition.description,
        unit: composition.unit,
        notes: composition.notes || "",
      });
      
      // Carregar insumos existentes
      if (composition.inputs) {
        setCompositionInputs(composition.inputs.map(inp => ({
          inputId: inp.inputId,
          input: inp.input,
          coefficient: inp.coefficient,
          quantity: inp.quantity || "1.0",
        })));
      }
    }
  }, [composition, reset]);
  
  const createMutation = trpc.compositions.create.useMutation({
    onSuccess: async (result) => {
      // Adicionar insumos à composição criada
      if (compositionInputs.length > 0) {
        try {
          for (const inp of compositionInputs) {
            await addInputMutation.mutateAsync({
              compositionId: result.id,
              inputId: inp.inputId,
              coefficient: inp.coefficient,
              quantity: inp.quantity,
            });
          }
          toast.success("Composição criada com sucesso");
          setLocation("/compositions");
        } catch (error) {
          toast.error("Erro ao adicionar insumos");
        }
      } else {
        toast.success("Composição criada com sucesso");
        setLocation("/compositions");
      }
    },
    onError: () => toast.error("Erro ao criar composição"),
  });
  
  const updateMutation = trpc.compositions.update.useMutation({
    onSuccess: async () => {
      // Sincronizar insumos: comparar insumos atuais com os originais
      if (isEditing && composition?.inputs) {
        try {
          const originalInputIds = composition.inputs.map(inp => inp.inputId);
          const currentInputIds = compositionInputs.map(inp => inp.inputId);
          
          // Remover insumos que foram deletados
          const inputsToRemove = composition.inputs.filter(
            inp => !currentInputIds.includes(inp.inputId)
          );
          for (const inp of inputsToRemove) {
            await removeInputMutation.mutateAsync({
              id: inp.id,
              compositionId: Number(id),
            });
          }
          
          // Adicionar novos insumos
          const inputsToAdd = compositionInputs.filter(
            inp => !originalInputIds.includes(inp.inputId)
          );
          for (const inp of inputsToAdd) {
            await addInputMutation.mutateAsync({
              compositionId: Number(id),
              inputId: inp.inputId,
              coefficient: inp.coefficient,
              quantity: inp.quantity,
            });
          }
          
          toast.success("Composição atualizada com sucesso");
          setLocation("/compositions");
        } catch (error) {
          toast.error("Erro ao sincronizar insumos");
        }
      } else {
        toast.success("Composição atualizada com sucesso");
        setLocation("/compositions");
      }
    },
    onError: () => toast.error("Erro ao atualizar composição"),
  });
  
  const addInputMutation = trpc.compositions.addInput.useMutation();
  const removeInputMutation = trpc.compositions.removeInput.useMutation();
  
  const onSubmit = (data: FormData) => {
    const payload = {
      ...data,
      categoryId: data.categoryId ? Number(data.categoryId) : undefined,
      materialCost: calculateMaterialCost(),
      laborCost: calculateLaborCost(),
      laborHours: calculateLaborHours(),
    };
    
    if (isEditing) {
      updateMutation.mutate({ id: Number(id), ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };
  
  const addInput = () => {
    if (!selectedInputId) {
      toast.error("Selecione um insumo");
      return;
    }
    
    const input = availableInputs?.find(i => i.id === Number(selectedInputId));
    if (!input) return;
    
    // Verificar se já foi adicionado
    if (compositionInputs.some(ci => ci.inputId === input.id)) {
      toast.error("Insumo já adicionado");
      return;
    }
    
    setCompositionInputs([
      ...compositionInputs,
      {
        inputId: input.id,
        input: {
          code: input.code || "",
          description: input.description,
          type: input.type,
          unit: input.unit,
          unitCost: input.unitCost,
        },
        coefficient: newCoefficient,
        quantity: newQuantity,
      },
    ]);
    
    // Resetar campos
    setSelectedInputId("");
    setNewCoefficient("1.0");
    setNewQuantity("1.0");
  };
  
  const removeInput = (inputId: number) => {
    setCompositionInputs(compositionInputs.filter(ci => ci.inputId !== inputId));
  };
  
  const startEditingInput = (inputId: number, coefficient: string, unitCost: string) => {
    setEditingInputId(inputId);
    setEditValues({ coefficient, unitCost });
  };
  
  const saveEditingInput = (inputId: number) => {
    setCompositionInputs(compositionInputs.map(ci => {
      if (ci.inputId === inputId) {
        return {
          ...ci,
          coefficient: editValues.coefficient,
          input: ci.input ? {
            ...ci.input,
            unitCost: editValues.unitCost,
          } : null,
        };
      }
      return ci;
    }));
    setEditingInputId(null);
    setEditValues({ coefficient: "", unitCost: "" });
  };
  
  const cancelEditingInput = () => {
    setEditingInputId(null);
    setEditValues({ coefficient: "", unitCost: "" });
  };
  
  const calculateMaterialCost = () => {
    return compositionInputs
      .filter(ci => ci.input?.type === "material")
      .reduce((sum, ci) => sum + (Number(ci.coefficient) * Number(ci.input?.unitCost || 0)), 0)
      .toFixed(2);
  };
  
  const calculateLaborCost = () => {
    return compositionInputs
      .filter(ci => ci.input?.type === "labor")
      .reduce((sum, ci) => sum + (Number(ci.coefficient) * Number(ci.input?.unitCost || 0)), 0)
      .toFixed(2);
  };
  
  const calculateLaborHours = () => {
    // Assumindo que 1 HH = custo de mão de obra / custo médio por hora
    const laborCost = Number(calculateLaborCost());
    const avgHourCost = 50; // Custo médio por hora (pode ser ajustado)
    return (laborCost / avgHourCost).toFixed(3);
  };
  
  const [selectedBaseCompositionId, setSelectedBaseCompositionId] = useState<number | null>(null);
  
  const { data: baseComposition } = trpc.compositions.get.useQuery(
    { id: selectedBaseCompositionId! },
    { enabled: !!selectedBaseCompositionId }
  );
  
  useEffect(() => {
    if (baseComposition && baseComposition.inputs && selectedBaseCompositionId) {
      // Carregar todos os insumos da composição base
      const copiedInputs = baseComposition.inputs.map((inp: any) => ({
        inputId: inp.inputId,
        input: inp.input,
        coefficient: inp.coefficient,
        quantity: inp.quantity || "1.0",
      }));
      
      setCompositionInputs(copiedInputs);
      toast.success(`${copiedInputs.length} insumos copiados da composição base`);
      
      setIsBaseCompositionDialogOpen(false);
      setBaseCompositionSearchTerm("");
      setSelectedBaseCompositionId(null);
    }
  }, [baseComposition, selectedBaseCompositionId]);
  
  const handleCopyFromBaseComposition = (baseCompositionId: number) => {
    setSelectedBaseCompositionId(baseCompositionId);
  };
  
  const materialCost = calculateMaterialCost();
  const laborCost = calculateLaborCost();
  const totalCost = Number(materialCost) + Number(laborCost);
  
  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">
            {isEditing ? "Editar Composição" : "Nova Composição"}
          </h1>
          <p className="text-muted-foreground mt-2">
            Preencha os dados da composição e adicione os insumos necessários
          </p>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados da Composição</CardTitle>
              <CardDescription>Informações básicas da composição</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código {!isEditing && "(Gerado Automaticamente)"}</Label>
                  <Input 
                    id="code" 
                    {...register("code")} 
                    placeholder="Ex: ALV-001" 
                    disabled={!isEditing}
                    className={!isEditing ? "bg-muted" : ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="categoryId">Categoria</Label>
                  <Controller
                    name="categoryId"
                    control={control}
                    render={({ field }) => {
                      const selectedCategory = categories?.find(cat => cat.id.toString() === field.value);
                      return (
                        <Popover open={isCategorySelectorOpen} onOpenChange={setIsCategorySelectorOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={isCategorySelectorOpen}
                              className="w-full justify-between"
                            >
                              {selectedCategory ? (
                                <span className="flex items-center gap-2 truncate">
                                  <span className="font-mono font-semibold">{selectedCategory.code}</span>
                                  <span className="text-muted-foreground">-</span>
                                  <span className="truncate">{selectedCategory.name}</span>
                                </span>
                              ) : (
                                "Selecione uma categoria..."
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[600px] p-0">
                            <Command>
                              <CommandInput placeholder="Buscar categoria..." />
                              <CommandList>
                                <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                                <CommandGroup>
                                  {categories?.map((cat) => (
                                    <CommandItem
                                      key={cat.id}
                                      value={`${cat.code} ${cat.name}`}
                                       onSelect={() => {
                                        field.onChange(cat.id.toString());
                                        setIsCategorySelectorOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          field.value === cat.id.toString() ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <span className="font-mono font-semibold text-sm mr-2">{cat.code}</span>
                                      <span className="text-muted-foreground mr-2">-</span>
                                      <span>{cat.name}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      );
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unidade *</Label>
                  <Input id="unit" {...register("unit", { required: true })} placeholder="Ex: m², m³, un" />
                  {errors.unit && <p className="text-sm text-destructive">Campo obrigatório</p>}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Descrição *</Label>
                <Textarea id="description" {...register("description", { required: true })} placeholder="Descrição detalhada da composição" />
                {errors.description && <p className="text-sm text-destructive">Campo obrigatório</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" {...register("notes")} placeholder="Observações adicionais" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Insumos da Composição</CardTitle>
                  <CardDescription>Adicione os insumos necessários e seus coeficientes</CardDescription>
                </div>
                {!isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsBaseCompositionDialogOpen(true)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar de Composição Base
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Adicionar novo insumo */}
              <div className="flex gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <Label>Insumo</Label>
                  <Popover open={isInputSelectorOpen} onOpenChange={setIsInputSelectorOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={isInputSelectorOpen}
                        className="w-full justify-between"
                      >
                        <span className="truncate">
                          {selectedInputId
                            ? (() => {
                                const input = availableInputs?.find((i) => i.id.toString() === selectedInputId);
                                return input ? `${input.code ? `${input.code} - ` : ""}${input.description}` : "Selecione um insumo...";
                              })()
                            : "Selecione um insumo..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[600px] p-0">
                      <Command>
                        <CommandInput placeholder="Buscar insumo..." />
                        <CommandList>
                          <CommandEmpty>Nenhum insumo encontrado.</CommandEmpty>
                          <CommandGroup>
                            {availableInputs?.map((input) => (
                              <CommandItem
                                key={input.id}
                                value={`${input.code || ""} ${input.description} ${input.unit}`}
                                onSelect={() => {
                                  setSelectedInputId(input.id.toString());
                                  setIsInputSelectorOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedInputId === input.id.toString() ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex-1">
                                  <span className="font-mono text-sm text-muted-foreground mr-2">
                                    {input.code || ""}
                                  </span>
                                  <span>{input.description}</span>
                                  <span className="text-muted-foreground ml-2">({input.unit})</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="w-32 space-y-2">
                  <Label>Coeficiente</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newCoefficient}
                    onChange={(e) => setNewCoefficient(e.target.value)}
                    placeholder="1.0"
                  />
                </div>
                <div className="w-32 space-y-2">
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    placeholder="1.0"
                  />
                </div>
                <Button type="button" onClick={addInput}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </div>
              
              {/* Lista de insumos adicionados */}
              {compositionInputs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Coeficiente</TableHead>
                      <TableHead>Custo Unit.</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compositionInputs.map((ci) => {
                      const isEditing = editingInputId === ci.inputId;
                      const displayCoefficient = isEditing ? editValues.coefficient : ci.coefficient;
                      const displayUnitCost = isEditing ? editValues.unitCost : (ci.input?.unitCost || "0");
                      
                      return (
                        <TableRow key={ci.inputId}>
                          <TableCell className="font-mono text-sm">{ci.input?.code || "-"}</TableCell>
                          <TableCell className="whitespace-normal max-w-md">{ci.input?.description}</TableCell>
                          <TableCell>
                            <Badge variant={ci.input?.type === "labor" ? "default" : "secondary"}>
                              {ci.input?.type === "material" ? "Material" : ci.input?.type === "labor" ? "Mão de Obra" : "Equipamento"}
                            </Badge>
                          </TableCell>
                          <TableCell>{ci.input?.unit}</TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={editValues.coefficient}
                                onChange={(e) => setEditValues({ ...editValues, coefficient: e.target.value })}
                                className="w-24"
                              />
                            ) : (
                              displayCoefficient
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={editValues.unitCost}
                                onChange={(e) => setEditValues({ ...editValues, unitCost: e.target.value })}
                                className="w-28"
                              />
                            ) : (
                              `R$ ${Number(displayUnitCost).toFixed(2)}`
                            )}
                          </TableCell>
                          <TableCell className="font-semibold">
                            R$ {(Number(displayCoefficient) * Number(displayUnitCost)).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {isEditing ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => saveEditingInput(ci.inputId)}
                                  >
                                    <Save className="h-4 w-4 text-green-600" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={cancelEditingInput}
                                  >
                                    <X className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => startEditingInput(ci.inputId, ci.coefficient, ci.input?.unitCost || "0")}
                                  >
                                    <Pencil className="h-4 w-4 text-blue-600" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeInput(ci.inputId)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum insumo adicionado ainda
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Resumo de Custos</CardTitle>
              <CardDescription>Custos calculados automaticamente com base nos insumos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Custo Material</Label>
                  <div className="h-10 px-3 py-2 rounded-md border bg-muted font-mono text-sm flex items-center">
                    R$ {Number(materialCost).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Custo Mão de Obra</Label>
                  <div className="h-10 px-3 py-2 rounded-md border bg-muted font-mono text-sm flex items-center">
                    R$ {Number(laborCost).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Custo Total</Label>
                  <div className="h-10 px-3 py-2 rounded-md border bg-primary/10 font-mono text-sm flex items-center font-semibold">
                    R$ {totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Homem-Hora (HH)</Label>
                  <div className="h-10 px-3 py-2 rounded-md border bg-muted font-mono text-sm flex items-center">
                    {calculateLaborHours()} h
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="flex gap-4">
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {isEditing ? "Atualizar" : "Criar"} Composição
            </Button>
            <Button type="button" variant="outline" onClick={() => setLocation("/compositions")}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
      
      {/* Dialog de Seleção de Composição Base */}
      <Dialog open={isBaseCompositionDialogOpen} onOpenChange={setIsBaseCompositionDialogOpen}>
        <DialogContent className="w-[90vw] max-w-[90vw] sm:max-w-[90vw] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Copiar de Composição Base</DialogTitle>
            <DialogDescription>
              Selecione uma composição existente para copiar seus insumos
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Input
              placeholder="Buscar por código ou descrição..."
              value={baseCompositionSearchTerm}
              onChange={(e) => setBaseCompositionSearchTerm(e.target.value)}
            />
            
            <div className="border rounded-lg max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableCompositions
                    ?.filter(comp => {
                      const search = baseCompositionSearchTerm.toLowerCase();
                      return (
                        comp.code?.toLowerCase().includes(search) ||
                        comp.description.toLowerCase().includes(search)
                      );
                    })
                    .map((comp) => (
                      <TableRow key={comp.id}>
                        <TableCell className="font-mono font-semibold">{comp.code || "-"}</TableCell>
                        <TableCell>{comp.description}</TableCell>
                        <TableCell>
                          {comp.categoryId ? (
                            <Badge variant="outline">
                              {categories?.find(c => c.id === comp.categoryId)?.code} - {categories?.find(c => c.id === comp.categoryId)?.name}
                            </Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => handleCopyFromBaseComposition(comp.id)}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copiar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  {(!availableCompositions || availableCompositions.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Nenhuma composição disponível
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
