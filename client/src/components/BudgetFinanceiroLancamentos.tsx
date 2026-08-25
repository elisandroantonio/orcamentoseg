import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit2, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface BudgetFinanceiroLancamentosProps {
  budgetId: number;
}

export function BudgetFinanceiroLancamentos({ budgetId }: BudgetFinanceiroLancamentosProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    type: '',
    category: '',
  });
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'entrada' as 'entrada' | 'saida',
    category: '',
    description: '',
    payeeName: '',
    value: '',
  });

  // tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Queries
  const { data: transactions = [], refetch: refetchTransactions, isLoading } = trpc.transactions.list.useQuery({
    budgetId,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    type: (filters.type as any) || undefined,
    category: filters.category || undefined,
  });

  const { data: summary = { totalEntradas: 0, totalSaidas: 0, saldoLiquido: 0 } } = trpc.transactions.getSummary.useQuery({
    budgetId,
  });

  // Mutations
  const createMutation = trpc.transactions.create.useMutation({
    onSuccess: () => {
      refetchTransactions();
      utils.transactions.getSummary.invalidate({ budgetId });
      toast.success('Lançamento criado com sucesso!');
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao criar lançamento: ' + error.message);
    },
  });

  const updateMutation = trpc.transactions.update.useMutation({
    onSuccess: () => {
      refetchTransactions();
      utils.transactions.getSummary.invalidate({ budgetId });
      toast.success('Lançamento atualizado com sucesso!');
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar lançamento: ' + error.message);
    },
  });

  const deleteMutation = trpc.transactions.delete.useMutation({
    onSuccess: () => {
      refetchTransactions();
      utils.transactions.getSummary.invalidate({ budgetId });
      toast.success('Lançamento deletado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao deletar lançamento: ' + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      type: 'entrada',
      category: '',
      description: '',
      payeeName: '',
      value: '',
    });
    setEditingId(null);
    setFormOpen(false);
  };

  const handleSubmit = async () => {
    console.log('DEBUG: formData =', formData);
    console.log('DEBUG: formData.type =', formData.type);
    console.log('DEBUG: formData.type type =', typeof formData.type);
    
    if (!formData.description || !formData.value || !formData.category) {
      toast.error('Preencha todos os campos obrigatórios (Descrição, Categoria e Valor)');
      return;
    }
    
    // Validar que o tipo é válido
    if (formData.type !== 'entrada' && formData.type !== 'saida') {
      toast.error('Tipo inválido. Selecione "Entrada" ou "Saída"');
      console.error('Tipo inválido:', formData.type);
      return;
    }

    const value = parseFloat(formData.value);
    if (isNaN(value) || value <= 0) {
      toast.error('Valor deve ser maior que zero');
      return;
    }

    if (editingId) {
      await updateMutation.mutateAsync({
        id: editingId,
        date: formData.date,
        type: formData.type,
        category: formData.category,
        description: formData.description,
        payeeName: formData.payeeName || undefined,
        value,
      });
    } else {
      await createMutation.mutateAsync({
        budgetId,
        date: formData.date,
        type: formData.type,
        category: formData.category,
        description: formData.description,
        payeeName: formData.payeeName || undefined,
        value,
      });
    }
  };

  const handleEdit = (transaction: any) => {
    const desc = transaction.description;
    let description = desc;
    let payeeName = '';
    
    if (desc.includes('(')) {
      const parts = desc.split('(');
      description = parts[0].trim();
      payeeName = parts[1].replace(')', '').trim();
    }
    
    setFormData({
      date: format(new Date(transaction.date), 'yyyy-MM-dd'),
      type: transaction.type,
      category: transaction.category || '',
      description: description,
      payeeName: payeeName,
      value: transaction.value.toString(),
    });
    setEditingId(transaction.id);
    setFormOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Tem certeza que deseja deletar este lançamento?')) {
      await deleteMutation.mutateAsync({ id });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const categoryOptions = [
    { value: 'pagamento_cliente', label: 'Pagamento Cliente' },
    { value: 'folha_obra', label: 'Folha de Obra' },
    { value: 'empreiteiro', label: 'Empreiteiro' },
    { value: 'terceiro', label: 'Terceiro' },
    { value: 'materiais', label: 'Materiais' },
    { value: 'insumos', label: 'Insumos' },
    { value: 'aluguel_equipamentos', label: 'Aluguel de Equipamentos' },
    { value: 'impostos', label: 'Impostos' },
    { value: 'fornecedor', label: 'Fornecedor' },
    { value: 'servico_extra', label: 'Serviço Extra' },
  ];

  return (
    <div className="space-y-6">
      {/* Cards de Resumo */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Entradas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalEntradas)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Saídas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(summary.totalSaidas)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Líquido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.saldoLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(summary.saldoLiquido)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={summary.saldoLiquido >= 0 ? 'default' : 'destructive'}>
              {summary.saldoLiquido >= 0 ? '✓ Positivo' : '✗ Negativo'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Formulário de Lançamento */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Novo Lançamento</CardTitle>
            <Button
              onClick={() => setFormOpen(!formOpen)}
              variant={formOpen ? 'outline' : 'default'}
              size="sm"
            >
              {formOpen ? 'Cancelar' : <Plus className="w-4 h-4 mr-2" />}
              {formOpen ? 'Cancelar' : 'Novo Lançamento'}
            </Button>
          </div>
        </CardHeader>

        {formOpen && (
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-6 gap-4">
                <div>
                  <label className="text-sm font-medium">Data *</label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Tipo *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as 'entrada' | 'saida' })}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                  >
                    <option value="entrada">🟢 Entrada</option>
                    <option value="saida">🔴 Saída</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Categoria</label>
                  <Select value={formData.category} onValueChange={(value) => {
                    console.log('Categoria selecionada:', value);
                    setFormData({ ...formData, category: value });
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">
                  <label className="text-sm font-medium">Descrição *</label>
                  <Input
                    placeholder="Descrição do lançamento"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Nome</label>
                  <Input
                    placeholder="Quem foi pago/recebido"
                    value={formData.payeeName}
                    onChange={(e) => setFormData({ ...formData, payeeName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-sm font-medium">Valor *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="button" onClick={() => {
                  console.log('Botão Lançar clicado');
                  handleSubmit();
                }} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? 'Atualizar' : 'Lançar'}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium">Data Inicial</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-medium">Data Final</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-medium">Tipo</label>
              <Select value={filters.type} onValueChange={(value) => setFilters({ ...filters, type: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">🟢 Entradas</SelectItem>
                  <SelectItem value="saida">🔴 Saídas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium">Categoria</label>
              <Select value={filters.category} onValueChange={(value) => setFilters({ ...filters, category: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Fluxo de Caixa */}
      <Card>
        <CardHeader>
          <CardTitle>Fluxo de Caixa ({transactions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Entrada</TableHead>
                  <TableHead className="text-right">Saída</TableHead>
                  <TableHead className="text-right">Saldo Acumulado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum lançamento registrado
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((transaction: any, index: number) => {
                    // Calcular saldo acumulado até este lançamento
                    const saldoAcumulado = transactions.slice(0, index + 1).reduce((acc: number, t: any) => {
                      return acc + (t.type === 'entrada' ? parseFloat(t.value) : -parseFloat(t.value));
                    }, 0);
                    
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="font-medium">
                          {(() => {
                            const dateStr = transaction.date instanceof Date 
                              ? transaction.date.toISOString().split('T')[0]
                              : transaction.date;
                            return dateStr.split('-').reverse().join('/');
                          })()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={transaction.type === 'entrada' ? 'default' : 'destructive'}>
                            {transaction.type === 'entrada' ? '🟢 Entrada' : '🔴 Saída'}
                          </Badge>
                        </TableCell>
                        <TableCell>{transaction.category ? categoryOptions.find(c => c.value === transaction.category)?.label : '-'}</TableCell>
                        <TableCell className="max-w-xs truncate">{transaction.description.split('(')[0].trim()}</TableCell>
                        <TableCell className="max-w-xs truncate">{transaction.description.includes('(') ? transaction.description.split('(')[1].replace(')', '') : '-'}</TableCell>
                        <TableCell className="text-right font-medium">
                          {transaction.type === 'entrada' ? (
                            <span className="text-green-600">+ {formatCurrency(transaction.value)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {transaction.type === 'saida' ? (
                            <span className="text-red-600">- {formatCurrency(transaction.value)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          <span className={saldoAcumulado >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(saldoAcumulado)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(transaction)}
                            disabled={updateMutation.isPending}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(transaction.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
