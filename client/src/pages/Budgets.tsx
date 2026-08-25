import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Plus, Eye, Pencil, Trash2, Copy, ChevronRight, ChevronDown, FolderOpen, Lock } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useState, useMemo } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export default function Budgets() {
  const utils = trpc.useUtils();
  const { data: budgets, isLoading } = trpc.budgets.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [selectedBudgetForMove, setSelectedBudgetForMove] = useState<number | null>(null);
  const [selectedClientForMove, setSelectedClientForMove] = useState<string | null>(null);
  
  const deleteMutation = trpc.budgets.delete.useMutation({
    onSuccess: () => {
      utils.budgets.list.invalidate();
      toast.success("Orçamento excluído com sucesso");
    },
    onError: () => {
      toast.error("Erro ao excluir orçamento");
    },
  });

  const duplicateMutation = trpc.budgets.duplicate.useMutation({
    onSuccess: (data) => {
      utils.budgets.list.invalidate();
      toast.success(`Orçamento duplicado com sucesso! Código: ${data.code}`);
    },
    onError: () => {
      toast.error("Erro ao duplicar orçamento");
    },
  });

  const moveToClientMutation = trpc.budgets.moveToClient.useMutation({
    onSuccess: () => {
      utils.budgets.list.invalidate();
      toast.success("Orçamento movido com sucesso");
      setMoveDialogOpen(false);
      setSelectedBudgetForMove(null);
      setSelectedClientForMove(null);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao mover orçamento");
    },
  });

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  const handleDuplicate = (id: number) => {
    duplicateMutation.mutate({ id });
  };

  const handleMoveToClient = () => {
    if (selectedBudgetForMove && selectedClientForMove) {
      moveToClientMutation.mutate({
        budgetId: selectedBudgetForMove,
        clientId: parseInt(selectedClientForMove),
      });
    }
  };

  const toggleClient = (clientId: number) => {
    setExpandedClients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clientId)) {
        newSet.delete(clientId);
      } else {
        newSet.add(clientId);
      }
      return newSet;
    });
  };

  // Agrupar orçamentos por cliente
  const groupedBudgets = useMemo(() => {
    if (!budgets) return [];
    
    const groups = new Map<number | null, { client: any; budgets: any[] }>();
    
    budgets.forEach((budget) => {
      const clientId = budget.clientId;
      if (!groups.has(clientId)) {
        groups.set(clientId, {
          client: budget.client,
          budgets: []
        });
      }
      groups.get(clientId)!.budgets.push(budget);
    });
    
    return Array.from(groups.entries()).map(([clientId, data]) => ({
      clientId,
      client: data.client,
      budgets: data.budgets
    }));
  }, [budgets]);

  // Status da Obra (o que é preenchido em cada orçamento, aba "Status da
  // Obra") — mesmas chaves/labels usados no dashboard ("Continuar de onde
  // parei"). Substituiu o antigo status de aprovação (Rascunho/Enviado/
  // Aprovado), que não era usado no dia a dia.
  const workStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    orcamento: { label: "Orçamento", variant: "outline" },
    contrato: { label: "Em contrato", variant: "secondary" },
    execucao: { label: "Em execução", variant: "default" },
    finalizada: { label: "Finalizada", variant: "secondary" },
    nao_fechada: { label: "Não fechada", variant: "destructive" },
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Orçamentos</h1>
            <p className="text-muted-foreground mt-2">
              Gerencie seus orçamentos de obra
            </p>
          </div>
          <Link href="/budgets/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Orçamento
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Orçamentos</CardTitle>
            <CardDescription>
              Todos os orçamentos cadastrados no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-2">
                    <Skeleton className="h-4 w-4 rounded-sm" />
                    <Skeleton className="h-4 flex-1 max-w-xs" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-28 ml-auto" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                ))}
              </div>
            ) : budgets && budgets.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                    <TableHead className="text-right">HH Total</TableHead>
                    <TableHead>Status da Obra</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedBudgets.map(({ clientId, client, budgets: clientBudgets }) => (
                    <>
                      {/* Linha do Cliente */}
                      <TableRow 
                        key={`client-${clientId}`}
                        className="bg-muted/50 hover:bg-muted/70 cursor-pointer font-medium"
                        onClick={() => clientId !== null && toggleClient(clientId)}
                      >
                        <TableCell>
                          {clientId !== null && (
                            expandedClients.has(clientId) ? 
                              <ChevronDown className="h-4 w-4" /> : 
                              <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell colSpan={6}>
                          {client ? (
                            <>
                              {client.name} - {client.document}
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({clientBudgets.length} {clientBudgets.length === 1 ? 'orçamento' : 'orçamentos'})
                              </span>
                            </>
                          ) : (
                            <>
                              Sem Cliente
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({clientBudgets.length} {clientBudgets.length === 1 ? 'orçamento' : 'orçamentos'})
                              </span>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                      
                      {/* Linhas dos Orçamentos (se expandido) */}
                      {(clientId === null || expandedClients.has(clientId)) && clientBudgets.map((budget) => (
                        <TableRow key={budget.id}>
                          <TableCell></TableCell>
                          <TableCell className="font-medium pl-8">
                            <Link href={`/budgets/${budget.id}`} className="hover:underline text-primary cursor-pointer">
                              {budget.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {budget.project?.name || "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            R$ {Number(budget.totalCost).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(budget.totalLaborHours).toFixed(2)} h
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {(() => {
                                const workStatus = workStatusLabels[(budget as any).workStatus] || workStatusLabels.orcamento;
                                return <Badge variant={workStatus.variant}>{workStatus.label}</Badge>;
                              })()}
                              {(budget as any).frozenAt && (
                                <span title={`Congelado em ${new Date((budget as any).frozenAt).toLocaleDateString('pt-BR')}`}>
                                  <Lock className="h-3.5 w-3.5 text-blue-500" />
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Link href={`/budgets/${budget.id}`}>
                                <Button variant="ghost" size="sm" title="Ver resumo">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Link href={`/budgets/${budget.id}/edit`}>
                                <Button variant="ghost" size="sm">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleDuplicate(budget.id)}
                                disabled={duplicateMutation.isPending}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  setSelectedBudgetForMove(budget.id);
                                  setMoveDialogOpen(true);
                                }}
                              >
                                <FolderOpen className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir este orçamento? Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(budget.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  Nenhum orçamento criado ainda
                </p>
                <Link href="/budgets/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar primeiro orçamento
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog para mover orçamento */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover Orçamento para Cliente</DialogTitle>
            <DialogDescription>
              Selecione o cliente para o qual deseja mover este orçamento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedClientForMove || ""} onValueChange={setSelectedClientForMove}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente..." />
              </SelectTrigger>
              <SelectContent>
                {clients?.map((client) => (
                  <SelectItem key={client.id} value={client.id.toString()}>
                    {client.name} - {client.document}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleMoveToClient}
                disabled={!selectedClientForMove || moveToClientMutation.isPending}
              >
                {moveToClientMutation.isPending ? "Movendo..." : "Mover"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
