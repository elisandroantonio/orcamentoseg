import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { useEffect, useState, useMemo } from "react";
import { Plus, Search, Trash2, Save, Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import CompositionInputsExpansion from "@/components/CompositionInputsExpansion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface BudgetFormData {
  title: string;
  clientId: string;
  projectId: string;
  squareMeters: string;
  description: string;
  status: "draft" | "sent" | "approved" | "rejected";
  socialCharges: string;
  profit: string;
  taxes: string;
  risk: string;
  warranty: string;
}

interface BudgetItem {
  id?: number;
  compositionId: number;
  composition: {
    code: string;
    description: string;
    unit: string;
    materialCost: string;
    laborCost: string;
    laborHours: string;
  };
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  laborHours: string;
}

export default function BudgetForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const isEditing = !!id;
  
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  const { data: budget } = trpc.budgets.get.useQuery(
    { id: Number(id) },
    { enabled: isEditing }
  );
  
  const { data: projects } = trpc.projects.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const { data: compositions } = trpc.compositions.list.useQuery(
    { search: searchTerm },
    { enabled: searchTerm.length >= 2 } // Só busca com 2+ caracteres
  );
  
  const [isClientSelectorOpen, setIsClientSelectorOpen] = useState(false);
  
  const { register, handleSubmit, reset, control, watch, formState: { errors } } = useForm<BudgetFormData>({
    defaultValues: {
      socialCharges: "120",
      profit: "10",
      taxes: "25",
      risk: "5",
      warranty: "2",
    }
  });
  
  const socialCharges = Number(watch("socialCharges") || 0);
  const profit = Number(watch("profit") || 0);
  const taxes = Number(watch("taxes") || 0);
  const risk = Number(watch("risk") || 0);
  const warranty = Number(watch("warranty") || 0);
  
  const bdiTotal = profit + taxes + risk + warranty;
  
  useEffect(() => {
    if (budget) {
      reset({
        title: budget.title,
        clientId: budget.clientId?.toString() || "",
        projectId: budget.projectId?.toString() || "",
        squareMeters: budget.squareMeters || "",
        description: budget.description || "",
        status: budget.status,
        socialCharges: budget.socialCharges,
        profit: budget.profit,
        taxes: budget.taxes,
        risk: budget.risk,
        warranty: budget.warranty,
      });
      
      if (budget.items) {
        setItems(budget.items.map((item: any) => ({
          id: item.id,
          compositionId: item.compositionId,
          composition: item.composition,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          laborHours: item.laborHours,
        })));
      }
    }
  }, [budget, reset]);
  
  const calculateItemPrice = (composition: BudgetItem["composition"], quantity: string) => {
    const materialCost = Number(composition.materialCost) || 0;
    const laborCost = Number(composition.laborCost) || 0;
    const laborWithCharges = laborCost * (1 + socialCharges / 100);
    const directCost = materialCost + laborWithCharges;
    const unitPrice = directCost * (1 + bdiTotal / 100);
    const qty = Number(quantity) || 0;
    const totalPrice = unitPrice * qty;
    const laborHours = (Number(composition.laborHours) || 0) * qty;
    
    return {
      unitPrice: unitPrice.toFixed(2),
      totalPrice: totalPrice.toFixed(2),
      laborHours: laborHours.toFixed(2),
    };
  };
  
  const recalculateItems = () => {
    setItems(prevItems => prevItems.map(item => {
      const calculated = calculateItemPrice(item.composition, item.quantity);
      return { ...item, ...calculated };
    }));
  };
  
  useEffect(() => {
    recalculateItems();
  }, [socialCharges, profit, taxes, risk, warranty]);
  
  // Busca agora é feita no backend via API
  const filteredCompositions = compositions || [];
  
  const addItem = (composition: NonNullable<typeof compositions>[number]) => {
    const calculated = calculateItemPrice({
      code: composition.code || "",
      description: composition.description,
      unit: composition.unit,
      materialCost: composition.materialCost,
      laborCost: composition.laborCost,
      laborHours: composition.laborHours,
    }, "1");
    
    const newItem: BudgetItem = {
      compositionId: composition.id,
      composition: {
        code: composition.code || "",
        description: composition.description,
        unit: composition.unit,
        materialCost: composition.materialCost,
        laborCost: composition.laborCost,
        laborHours: composition.laborHours,
      },
      quantity: "1",
      ...calculated,
    };
    
    setItems([...items, newItem]);
    setIsSearchOpen(false);
    setSearchTerm("");
    toast.success("Item adicionado ao orçamento");
  };
  
  const updateItemQuantity = (index: number, quantity: string) => {
    setItems(prevItems => {
      const newItems = [...prevItems];
      const item = newItems[index];
      const calculated = calculateItemPrice(item.composition, quantity);
      newItems[index] = { ...item, quantity, ...calculated };
      return newItems;
    });
  };
  
  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
    toast.success("Item removido");
  };
  
  const totals = useMemo(() => {
    return items.reduce((acc, item) => ({
      totalCost: acc.totalCost + Number(item.totalPrice),
      totalLaborHours: acc.totalLaborHours + Number(item.laborHours),
    }), { totalCost: 0, totalLaborHours: 0 });
  }, [items]);
  
  const createMutation = trpc.budgets.create.useMutation({
    onSuccess: (data) => {
      toast.success("Orçamento criado com sucesso");
      setLocation(`/budgets/${data.id}`);
    },
    onError: () => toast.error("Erro ao criar orçamento"),
  });
  
  const updateMutation = trpc.budgets.update.useMutation({
    onSuccess: () => {
      toast.success("Orçamento atualizado com sucesso");
      setLocation("/budgets");
    },
    onError: () => toast.error("Erro ao atualizar orçamento"),
  });
  
  const onSubmit = (data: BudgetFormData) => {
    const payload = {
      ...data,
      clientId: data.clientId ? Number(data.clientId) : undefined,
      projectId: data.projectId ? Number(data.projectId) : undefined,
      totalCost: totals.totalCost.toFixed(2),
      totalLaborHours: totals.totalLaborHours.toFixed(2),
      items: items.map(item => ({
        compositionId: item.compositionId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        laborHours: item.laborHours,
      })),
    };
    
    if (isEditing) {
      updateMutation.mutate({ id: Number(id), ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };
  
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">
            {isEditing ? "Editar Orçamento" : "Novo Orçamento"}
          </h1>
          <p className="text-muted-foreground mt-2">
            Configure os parâmetros e adicione itens ao orçamento
          </p>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados do Orçamento</CardTitle>
              <CardDescription>Informações básicas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input 
                    id="title" 
                    {...register("title", { required: true })} 
                    placeholder="Ex: Orçamento Galpão Industrial" 
                  />
                  {errors.title && <p className="text-sm text-destructive">Campo obrigatório</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientId">Cliente</Label>
                  <Controller
                    name="clientId"
                    control={control}
                    render={({ field }) => {
                      const selectedClient = clients?.find(client => client.id.toString() === field.value);
                      return (
                        <Popover open={isClientSelectorOpen} onOpenChange={setIsClientSelectorOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={isClientSelectorOpen}
                              className="w-full justify-between"
                            >
                              {selectedClient ? (
                                <span className="flex items-center gap-2">
                                  <span className="font-semibold">{selectedClient.name}</span>
                                  {selectedClient.document && (
                                    <>
                                      <span className="text-muted-foreground">-</span>
                                      <span className="text-muted-foreground text-sm">{selectedClient.document}</span>
                                    </>
                                  )}
                                </span>
                              ) : (
                                "Selecione um cliente..."
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0">
                            <Command>
                              <CommandInput placeholder="Buscar cliente..." />
                              <CommandList>
                                <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                                <CommandGroup>
                                  {clients?.map((client) => (
                                    <CommandItem
                                      key={client.id}
                                      value={`${client.name} ${client.document || ''}`}
                                      onSelect={() => {
                                        field.onChange(client.id.toString());
                                        setIsClientSelectorOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          field.value === client.id.toString() ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <div className="flex flex-col">
                                        <span className="font-semibold">{client.name}</span>
                                        {client.document && (
                                          <span className="text-sm text-muted-foreground">{client.document}</span>
                                        )}
                                      </div>
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
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="projectId">Projeto</Label>
                  <Controller
                    name="projectId"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um projeto..." />
                        </SelectTrigger>
                        <SelectContent>
                          {projects?.map((project) => (
                            <SelectItem key={project.id} value={project.id.toString()}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="squareMeters">Metragem Quadrada (m²)</Label>
                  <Input 
                    id="squareMeters" 
                    type="number"
                    step="0.01"
                    {...register("squareMeters")} 
                    placeholder="Ex: 150.50" 
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea 
                  id="description" 
                  {...register("description")} 
                  placeholder="Descrição do orçamento" 
                />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Parâmetros de BDI</CardTitle>
              <CardDescription>
                Encargos e percentuais aplicados sobre os custos diretos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="socialCharges">Encargos Sociais (%)</Label>
                  <Input 
                    id="socialCharges" 
                    type="number" 
                    step="0.01"
                    {...register("socialCharges")} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profit">Lucro (%)</Label>
                  <Input 
                    id="profit" 
                    type="number" 
                    step="0.01"
                    {...register("profit")} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxes">Impostos (%)</Label>
                  <Input 
                    id="taxes" 
                    type="number" 
                    step="0.01"
                    {...register("taxes")} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="risk">Risco Sacado (%)</Label>
                  <Input 
                    id="risk" 
                    type="number" 
                    step="0.01"
                    {...register("risk")} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warranty">Garantia (%)</Label>
                  <Input 
                    id="warranty" 
                    type="number" 
                    step="0.01"
                    {...register("warranty")} 
                  />
                </div>
              </div>
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="text-sm">
                  <strong>BDI Total:</strong> {bdiTotal.toFixed(2)}% (Lucro + Impostos + Risco + Garantia)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Encargos sociais são aplicados sobre a mão de obra antes do BDI
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Itens do Orçamento</CardTitle>
                  <CardDescription>
                    Adicione composições e informe as quantidades
                  </CardDescription>
                </div>
                <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                  <DialogTrigger asChild>
                    <Button type="button">
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle>Buscar Composição</DialogTitle>
                      <DialogDescription>
                        Digite para buscar por código ou descrição
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar composição..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-96 overflow-y-auto border rounded-lg">
                        {filteredCompositions?.slice(0, 50).map((composition) => (
                          <div
                            key={composition.id}
                            className="p-3 border-b hover:bg-accent cursor-pointer transition-colors"
                            onClick={() => addItem(composition)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">
                                  {composition.code && <span className="text-primary">{composition.code} - </span>}
                                  {composition.description}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Unidade: {composition.unit} | 
                                  Material: R$ {Number(composition.materialCost).toFixed(2)} | 
                                  MO: R$ {Number(composition.laborCost).toFixed(2)}
                                </p>
                              </div>
                              <Button type="button" size="sm" variant="ghost">
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {filteredCompositions?.length === 0 && (
                          <div className="p-8 text-center text-muted-foreground">
                            Nenhuma composição encontrada
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {items.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Descrição</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Preço Unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">HH</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <>
                        <TableRow key={index}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">
                                {item.composition.code && <span className="text-primary">{item.composition.code} - </span>}
                                {item.composition.description}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{item.composition.unit}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(index, e.target.value)}
                              className="w-24 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            R$ {Number(item.unitPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            R$ {Number(item.totalPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(item.laborHours).toFixed(2)} h
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={7} className="p-0">
                            <div className="px-4 py-2 bg-gray-50">
                              <CompositionInputsExpansion
                                compositionId={item.compositionId}
                                budgetItemId={item.id}
                                quantity={Number(item.quantity)}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      </>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Nenhum item adicionado ainda</p>
                  <p className="text-sm mt-2">Clique em "Adicionar Item" para buscar composições</p>
                </div>
              )}
              
              {items.length > 0 && (
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-muted-foreground">Total de itens: {items.length}</p>
                      <p className="text-sm text-muted-foreground">
                        HH Total: <span className="font-mono font-medium">{totals.totalLaborHours.toFixed(2)} h</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Valor Total</p>
                      <p className="text-2xl font-bold font-mono">
                        R$ {totals.totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          <div className="flex gap-4">
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {isEditing ? "Atualizar" : "Salvar"} Orçamento
            </Button>
            <Button type="button" variant="outline" onClick={() => setLocation("/budgets")}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
