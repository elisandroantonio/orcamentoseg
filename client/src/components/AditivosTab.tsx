import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { handleExportPDF } from "@/lib/export-handlers";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, ChevronDown, ChevronRight, Lock, LockOpen, CheckCircle2, XCircle,
  Pencil, Trash2, FileText, AlertTriangle
} from "lucide-react";
import { AditivoEditor } from "./AditivoEditor";

interface AditivosTabProps {
  budgetId: number;
  // BDI params herdados do orçamento
  socialCharges: number;
  adminCentral: number;
  profit: number;
  taxes: number;
  risk: number;
  warranty: number;
  // Valor total do contrato original (c/ BDI)
  totalContrato?: number;
  // Dados do orçamento para exportação PDF
  budgetTitle?: string;
  clientData?: { id: number; name: string; document: string; address?: string | null } | null;
  projectData?: { id: number; name: string } | null;
  companySettings?: { companyName: string; cnpj: string; responsibleName: string; responsibleTitle: string; phone: string; email: string } | null;
}

type AditivoStatus = "elaboracao" | "aprovado" | "negado";

const STATUS_LABELS: Record<AditivoStatus, string> = {
  elaboracao: "Em Elaboração",
  aprovado: "Aprovado",
  negado: "Negado",
};

const STATUS_COLORS: Record<AditivoStatus, string> = {
  elaboracao: "bg-yellow-100 text-yellow-800 border-yellow-200",
  aprovado: "bg-green-100 text-green-800 border-green-200",
  negado: "bg-red-100 text-red-800 border-red-200",
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AditivosTab({
  budgetId,
  socialCharges,
  adminCentral,
  profit,
  taxes,
  risk,
  warranty,
  totalContrato = 0,
  budgetTitle = "Orçamento",
  clientData,
  projectData,
  companySettings,
}: AditivosTabProps) {
  const utils = trpc.useUtils();

  // Queries
  const { data: additives = [], isLoading } = trpc.additives.list.useQuery({ budgetId });

  // Recalcular todos os aditivos ao montar a aba (garante totalCostWithBdi atualizado)
  const recalcAll = trpc.additives.recalcAll.useMutation({
    onSuccess: () => utils.additives.list.invalidate({ budgetId }),
  });
  const hasRecalcRef = useRef(false);
  useEffect(() => {
    if (!hasRecalcRef.current && !isLoading) {
      hasRecalcRef.current = true;
      recalcAll.mutate({ budgetId });
    }
  }, [isLoading]); // eslint-disable-line

  // Mutations
  const createMutation = trpc.additives.create.useMutation({
    onSuccess: () => {
      utils.additives.list.invalidate({ budgetId });
      toast.success("Aditivo criado com sucesso!");
      setShowCreateDialog(false);
      setNewName("");
    },
    onError: (e) => toast.error("Erro ao criar aditivo: " + e.message),
  });

  const updateMutation = trpc.additives.update.useMutation({
    onSuccess: () => {
      utils.additives.list.invalidate({ budgetId });
      toast.success("Aditivo atualizado!");
      setEditingId(null);
    },
    onError: (e) => toast.error("Erro ao atualizar: " + e.message),
  });

  const deleteMutation = trpc.additives.delete.useMutation({
    onSuccess: () => {
      utils.additives.list.invalidate({ budgetId });
      toast.success("Aditivo excluído.");
      setDeleteConfirmId(null);
    },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });

  const freezeMutation = trpc.additives.freeze.useMutation({
    onSuccess: () => {
      utils.additives.list.invalidate({ budgetId });
      toast.success("Aditivo fechado!");
    },
    onError: (e) => toast.error("Erro ao fechar: " + e.message),
  });

  const unfreezeMutation = trpc.additives.unfreeze.useMutation({
    onSuccess: () => {
      utils.additives.list.invalidate({ budgetId });
      toast.success("Aditivo reaberto!");
    },
    onError: (e) => toast.error("Erro ao reabrir: " + e.message),
  });

  // UI state
  const [exportingPdfId, setExportingPdfId] = useState<number | null>(null);
  const [exportMenuId, setExportMenuId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<Record<number, "sem-bdi" | "com-bdi">>({});

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getViewMode = (id: number) => viewMode[id] || "sem-bdi";
  const setAditivoViewMode = (id: number, mode: "sem-bdi" | "com-bdi") => {
    setViewMode(prev => ({ ...prev, [id]: mode }));
  };

  // BDI multiplier
  const calcBDIMultiplier = () => {
    const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
    const denominator = 1 - profit / 100 - taxes / 100;
    if (denominator <= 0) return 1;
    return numerator / denominator;
  };
  const bdiMultiplier = calcBDIMultiplier();

  // Calcular totais consolidados
  const aprovados = additives.filter((a: any) => a.status === "aprovado");
  const emElaboracao = additives.filter((a: any) => a.status === "elaboracao");
  const negados = additives.filter((a: any) => a.status === "negado");
  const totalAprovado = aprovados.reduce((sum: number, a: any) => sum + (a.totalCostNoBdi || 0), 0);
  const totalAprovadoWithBdi = aprovados.reduce((sum: number, a: any) => sum + (a.totalCostWithBdi || 0), 0);
  const totalElaboracao = emElaboracao.reduce((sum: number, a: any) => sum + (a.totalCostNoBdi || 0), 0);
  const totalElaboracaoWithBdi = emElaboracao.reduce((sum: number, a: any) => sum + (a.totalCostWithBdi || 0), 0);

  // Exportar PDF de um aditivo específico
  const handleExportAdditivePDF = async (additive: any, withBDI: boolean) => {
    setExportingPdfId(additive.id);
    setExportMenuId(null);
    try {
      // Buscar etapas e itens do aditivo via tRPC
      const stagesData = await utils.additives.getStages.fetch({ additiveId: additive.id });
      if (!stagesData || stagesData.length === 0) {
        toast.error("Aditivo sem etapas para exportar");
        return;
      }

      // Mapear etapas para o formato StageData/ItemData
      const exportStages: any[] = [];
      const exportItems: any[] = [];

      // Mesma fórmula usada na tela (Ver c/ BDI, em AditivoEditor.tsx) —
      // aplica o BDI do orçamento + os ajustes individuais do item
      // (material/mão de obra por conta do cliente, encargos sociais,
      // incremento adicional, desconto). Sem isso, o PDF "c/ BDI" saía
      // igual ao "s/ BDI".
      const applyBdiToAdditiveItem = (item: any) => {
        const rawMaterial = Number(item.materialCost) || 0;
        const material = Number(item.includeMaterial) === 0 ? 0 : rawMaterial;
        const labor =
          (Number(item.laborCost) || 0) +
          (Number(item.equipmentCost) || 0) +
          (Number(item.serviceCost) || 0) +
          (Number(item.otherCost) || 0);
        const aplicarEncargos = Number(item.aplicarEncargosSociais) !== 0;
        const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
        const applyMat = Number(item.applyBdiToMaterial) !== 0;
        const applyLab = Number(item.applyBdiToLabor) !== 0;
        const combinedMultiplier =
          (1 + (Number(item.additionalIncrement) || 0) / 100) * (1 - (Number(item.discount) || 0) / 100);
        const matFinal = (applyMat ? material * bdiMultiplier : material) * combinedMultiplier;
        const labFinal = (applyLab ? laborWithCharges * bdiMultiplier : laborWithCharges) * combinedMultiplier;
        return { materialCost: matFinal, laborCost: labFinal };
      };

      const processStage = (stage: any, parentId?: number) => {
        exportStages.push({
          id: stage.id,
          name: stage.name,
          order: stage.order ?? 0,
          parentStageId: parentId ?? null,
        });
        // Itens desta etapa
        (stage.items || []).forEach((item: any) => {
          const costs = withBDI
            ? applyBdiToAdditiveItem(item)
            : {
                materialCost: Number(item.includeMaterial) === 0 ? 0 : Number(item.materialCost) || 0,
                laborCost:
                  (Number(item.laborCost) || 0) +
                  (Number(item.equipmentCost) || 0) +
                  (Number(item.serviceCost) || 0) +
                  (Number(item.otherCost) || 0),
              };
          exportItems.push({
            id: item.id,
            stageId: stage.id,
            description: item.description || item.compositionDescription || "",
            unit: item.unit || "",
            quantity: String(item.quantity ?? 1),
            materialCost: String(costs.materialCost),
            laborCost: String(costs.laborCost),
            equipmentCost: "0",
            serviceCost: "0",
            otherCost: "0",
            parentItemId: null,
          });
        });
        // Sub-etapas recursivamente
        (stage.children || []).forEach((child: any) => processStage(child, stage.id));
      };

      stagesData.forEach((stage: any) => processStage(stage));

      // Objeto BudgetData simulado para o aditivo
      const additiveBudget = {
        id: additive.id,
        title: `${budgetTitle} — ${additive.name}`,
        clientId: clientData?.id ?? null,
        projectId: projectData?.id ?? null,
        squareMeters: null,
        socialCharges: String(socialCharges),
        profit: String(profit),
        taxes: String(taxes),
        risk: String(risk),
        warranty: String(warranty),
      };

      await handleExportPDF(
        additiveBudget,
        exportStages,
        exportItems,
        clientData ?? undefined,
        projectData ?? undefined,
        companySettings ?? undefined,
        withBDI,
        true, // includeMaterial sempre true para aditivos
        "sintetico"
      );
    } catch (err: any) {
      toast.error("Erro ao exportar PDF: " + (err?.message || "Tente novamente"));
    } finally {
      setExportingPdfId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3" />
        Carregando aditivos...
      </div>
    );
  }

  return (
    <div className="space-y-4" onClick={() => exportMenuId && setExportMenuId(null)}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Aditivos do Contrato</h3>
          <p className="text-sm text-gray-500">
            Gerencie os aditivos vinculados a este orçamento.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Aditivo
        </Button>
      </div>

      {/* Resumo consolidado */}
      {additives.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-3">
            {/* Linha 1: Resumo do Contrato */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3 pb-3 border-b border-blue-200">
              <div>
                <span className="text-gray-500 block text-xs">Contrato Original (c/ BDI)</span>
                <span className="font-bold text-gray-800 text-base">{formatCurrency(totalContrato)}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs">Aditivos Aprovados (c/ BDI)</span>
                <span className="font-bold text-green-700 text-base">{formatCurrency(totalAprovadoWithBdi)}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs">Total Atualizado do Contrato</span>
                <span className="font-bold text-blue-700 text-lg">{formatCurrency(totalContrato + totalAprovadoWithBdi)}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs">Variação</span>
                <span className={`font-bold text-base ${totalAprovado > 0 ? 'text-orange-600' : totalAprovado < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                  {totalContrato > 0 ? `${((totalAprovadoWithBdi / totalContrato) * 100).toFixed(2)}%` : '—'}
                </span>
              </div>
            </div>
            {/* Linha 2: Status dos aditivos */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500 block text-xs">Aprovados (s/ BDI)</span>
                <span className="font-semibold text-green-700">{formatCurrency(totalAprovado)}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs">Em Negociação (s/ BDI)</span>
                <span className="font-semibold text-yellow-700">{formatCurrency(totalElaboracao)}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs">Em Negociação (c/ BDI)</span>
                <span className="font-semibold text-yellow-600">{formatCurrency(totalElaboracaoWithBdi)}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs">Situação</span>
                <div className="flex gap-2 mt-0.5 flex-wrap">
                  <span className="text-green-700 font-semibold text-xs">{aprovados.length} aprovado(s)</span>
                  {emElaboracao.length > 0 && <span className="text-yellow-700 text-xs">· {emElaboracao.length} em elaboração</span>}
                  {negados.length > 0 && <span className="text-red-500 text-xs">· {negados.length} negado(s)</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de aditivos */}
      {additives.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
          <Plus className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum aditivo cadastrado</p>
          <p className="text-sm mt-1">Clique em "Novo Aditivo" para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {additives.map((additive: any) => {
            const isExpanded = expandedIds.has(additive.id);
            const isFrozen = !!additive.frozenAt;
            const status = additive.status as AditivoStatus;
            const mode = getViewMode(additive.id);
            const isNegado = status === "negado";

            return (
              <Card
                key={additive.id}
                className={`border transition-all ${isNegado ? "opacity-60 border-red-200 bg-red-50" : isFrozen ? "border-blue-300 bg-blue-50/30" : "border-gray-200"}`}
              >
                {/* Cabeçalho do card */}
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Botão expandir */}
                    <button
                      onClick={() => !isNegado && toggleExpand(additive.id)}
                      className={`text-gray-400 hover:text-gray-700 transition-colors ${isNegado ? "cursor-not-allowed opacity-40" : ""}`}
                      title={isNegado ? "Aditivo negado" : isExpanded ? "Recolher" : "Expandir"}
                    >
                      {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </button>

                    {/* Nome do aditivo */}
                    {editingId === additive.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          className="h-7 text-sm"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              updateMutation.mutate({ id: additive.id, name: editingName });
                            } else if (e.key === "Escape") {
                              setEditingId(null);
                            }
                          }}
                        />
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => updateMutation.mutate({ id: additive.id, name: editingName })}>
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}>
                          <XCircle className="h-4 w-4 text-gray-400" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`font-semibold text-sm truncate ${isNegado ? "line-through text-gray-400" : "text-gray-900"}`}>
                          {additive.name}
                        </span>
                        {isFrozen && <Lock className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />}
                      </div>
                    )}

                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge className={`text-xs px-2 py-0.5 border ${STATUS_COLORS[status]}`}>
                        {STATUS_LABELS[status]}
                      </Badge>
                      {isFrozen && (
                        <Badge className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 border-blue-200">
                          Fechado
                        </Badge>
                      )}
                    </div>

                    {/* Valores */}
                    <div className="hidden md:flex items-center gap-4 text-sm flex-shrink-0">
                      <div className="text-right">
                        <span className="text-gray-400 text-xs block">s/ BDI</span>
                        <span className="font-semibold text-gray-700">{formatCurrency(additive.totalCostNoBdi || 0)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-400 text-xs block">c/ BDI</span>
                        <span className="font-semibold text-blue-700">{formatCurrency(additive.totalCostWithBdi || 0)}</span>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Editar nome */}
                      {!isNegado && (
                        <Button
                          size="sm" variant="ghost" className="h-7 w-7 p-0"
                          title="Editar nome"
                          onClick={() => { setEditingId(additive.id); setEditingName(additive.name); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      {/* Status: Aprovar / Negar / Reativar */}
                      {status === "elaboracao" && (
                        <>
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-green-600 hover:bg-green-50 text-xs"
                            onClick={() => updateMutation.mutate({ id: additive.id, status: "aprovado" })}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprovar
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:bg-red-50 text-xs"
                            onClick={() => updateMutation.mutate({ id: additive.id, status: "negado" })}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Negar
                          </Button>
                        </>
                      )}
                      {status === "aprovado" && !isFrozen && (
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:bg-red-50 text-xs"
                          onClick={() => updateMutation.mutate({ id: additive.id, status: "negado" })}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Negar
                        </Button>
                      )}
                      {status === "negado" && (
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-yellow-600 hover:bg-yellow-50 text-xs"
                          onClick={() => updateMutation.mutate({ id: additive.id, status: "elaboracao" })}
                        >
                          Reativar
                        </Button>
                      )}

                      {/* Fechar / Reabrir */}
                      {!isNegado && (
                        isFrozen ? (
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-orange-600 hover:bg-orange-50 text-xs"
                            onClick={() => unfreezeMutation.mutate({ id: additive.id })}
                          >
                            <LockOpen className="h-3.5 w-3.5 mr-1" /> Reabrir
                          </Button>
                        ) : (
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:bg-blue-50 text-xs"
                            onClick={() => freezeMutation.mutate({ id: additive.id })}
                          >
                            <Lock className="h-3.5 w-3.5 mr-1" /> Fechar
                          </Button>
                        )
                      )}

                      {/* Exportar PDF */}
                      {!isNegado && (
                        <div className="relative" onClick={e => e.stopPropagation()}>
                          <Button
                            size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-100"
                            title="Exportar PDF do aditivo"
                            disabled={exportingPdfId === additive.id}
                            onClick={() => setExportMenuId(exportMenuId === additive.id ? null : additive.id)}
                          >
                            {exportingPdfId === additive.id
                              ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                              : <FileText className="h-3.5 w-3.5" />}
                          </Button>
                          {exportMenuId === additive.id && (
                            <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[130px] py-1">
                              <button
                                className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 text-gray-700"
                                onClick={() => handleExportAdditivePDF(additive, false)}
                              >
                                <FileText className="h-3 w-3 inline mr-1.5" />PDF s/ BDI
                              </button>
                              <button
                                className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 text-gray-700"
                                onClick={() => handleExportAdditivePDF(additive, true)}
                              >
                                <FileText className="h-3 w-3 inline mr-1.5" />PDF c/ BDI
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Excluir */}
                      <Button
                        size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:bg-red-50"
                        title="Excluir aditivo"
                        onClick={() => setDeleteConfirmId(additive.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Info de congelamento */}
                  {isFrozen && additive.frozenAt && (
                    <div className="mt-2 ml-8 text-xs text-blue-600">
                      Fechado em {new Date(additive.frozenAt).toLocaleDateString("pt-BR")} por {additive.frozenBy}
                    </div>
                  )}
                </CardHeader>

                {/* Conteúdo expandido */}
                {isExpanded && !isNegado && (
                  <CardContent className="pt-0 px-4 pb-4">
                    {/* Sub-botões de visão */}
                    <div className="flex items-center gap-2 mb-4 border-b pb-3">
                      <Button
                        size="sm"
                        variant={mode === "sem-bdi" ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => setAditivoViewMode(additive.id, "sem-bdi")}
                      >
                        Ver s/ BDI
                      </Button>
                      <Button
                        size="sm"
                        variant={mode === "com-bdi" ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => setAditivoViewMode(additive.id, "com-bdi")}
                      >
                        Ver c/ BDI
                      </Button>
                      <div className="ml-auto text-xs text-gray-400">
                        BDI: {((bdiMultiplier - 1) * 100).toFixed(2)}%
                      </div>
                    </div>

                    {/* Editor do aditivo */}
                    <AditivoEditor
                      additiveId={additive.id}
                      budgetId={budgetId}
                      isFrozen={isFrozen}
                      viewMode={mode}
                      socialCharges={socialCharges}
                      adminCentral={adminCentral}
                      profit={profit}
                      taxes={taxes}
                      risk={risk}
                      warranty={warranty}
                      bdiMultiplier={bdiMultiplier}
                    />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog: Criar aditivo */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Aditivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Nome do Aditivo</label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ex: Aditivo 01 — Alvenaria sobre Janelas"
                className="mt-1"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter" && newName.trim()) {
                    createMutation.mutate({ budgetId, name: newName.trim() });
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate({ budgetId, name: newName.trim() })}
              disabled={!newName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Criando..." : "Criar Aditivo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Excluir Aditivo
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Tem certeza que deseja excluir este aditivo? Todas as etapas e composições serão removidas permanentemente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate({ id: deleteConfirmId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
