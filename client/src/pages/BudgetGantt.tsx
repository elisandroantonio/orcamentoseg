import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GanttChart, GanttTask } from "@/components/GanttChart";
import { BudgetCurveS } from "@/components/budget/BudgetCurveS";
import { PlanejadoRealizadoChart } from "@/components/budget/PlanejadoRealizadoChart";
import { useAvancoFisico } from "@/hooks/useBudgetProgress";
import { toast as showToast } from "sonner";
import { Calendar, Save, Trash2, FileDown } from "lucide-react";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Task } from "gantt-task-react";

export default function BudgetGantt() {
  const { id } = useParams<{ id: string }>();
  const budgetId = parseInt(id!);
  const toast = (opts: { title: string; variant?: string }) => {
    if (opts.variant === "destructive") {
      showToast.error(opts.title);
    } else {
      showToast.success(opts.title);
    }
  };

  const { data: budget } = trpc.budgets.get.useQuery({ id: budgetId });
  const { data: stagesData, refetch: refetchStages } = trpc.budgets.getStages.useQuery({ budgetId });
  const stages = stagesData || [];

  // Avanço físico: planejado (datas do Gantt) x realizado (medições) — cálculo
  // compartilhado com BudgetDashboard (mesma fonte, mesmo número nos dois lugares)
  const planejadoRealizado = useAvancoFisico(budgetId, stages, budget);

  // Árvore Etapa > Sub-etapa: `stages` já traz `parentStageId`, mas vinha
  // sendo renderizada como lista achatada nos seletores do Gantt (Etapa,
  // Predecessora, Sucessora), misturando etapas principais e sub-etapas sem
  // nenhuma indicação visual de hierarquia. Aqui a lista é reordenada em
  // pré-ordem (pai, depois seus filhos, recursivamente) e cada item ganha um
  // `depth` usado só pra indentar visualmente — não altera nada no banco.
  const orderedStages = useMemo(() => {
    const byParent = new Map<number | null, any[]>();
    for (const s of stages as any[]) {
      const key = s.parentStageId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(s);
    }
    for (const arr of Array.from(byParent.values())) {
      arr.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    }
    const result: any[] = [];
    const visited = new Set<number>();
    const walk = (parentId: number | null, depth: number) => {
      const children = byParent.get(parentId) || [];
      for (const child of children) {
        if (visited.has(child.id)) continue; // guarda contra dado inconsistente (ciclo)
        visited.add(child.id);
        result.push({ ...child, depth });
        walk(child.id, depth + 1);
      }
    };
    walk(null, 0);
    // Sub-etapas cujo parentStageId aponta pra algo fora da lista (órfãs) —
    // exibe no nível raiz em vez de sumir do seletor.
    for (const s of stages as any[]) {
      if (!visited.has(s.id)) result.push({ ...s, depth: 0 });
    }
    return result;
  }, [stages]);

  const stageDepth = useMemo(() => {
    const map = new Map<number, number>();
    orderedStages.forEach((s: any) => map.set(s.id, s.depth));
    return map;
  }, [orderedStages]);

  const [ganttTasks, setGanttTasks] = useState<GanttTask[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [stageStartDate, setStageStartDate] = useState("");
  const [stageEndDate, setStageEndDate] = useState("");
  const [stageDuration, setStageDuration] = useState<number>(0);
  const [predecessors, setPredecessors] = useState<number[]>([]);
  const [successors, setSuccessors] = useState<number[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [expandedStageId, setExpandedStageId] = useState<number | null>(null);
  const [monthlyDistribution, setMonthlyDistribution] = useState<Record<string, number>>({});
  const [loadedDistributions, setLoadedDistributions] = useState<Set<number>>(new Set());

  // Carregar TODAS as distribuições ao montar o componente (persistência ao navegar entre abas)
  const { data: allDistributions } = trpc.budgetSchedule.getAllMonthlyDistributions.useQuery(
    { budgetId },
    { enabled: !!budgetId }
  );
  useEffect(() => {
    if (allDistributions && allDistributions.length > 0) {
      const newDistribution: Record<string, number> = {};
      const loadedStages = new Set<number>();
      allDistributions.forEach((d: any) => {
        newDistribution[`${d.stageId}-${d.periodLabel}`] = d.percentage;
        loadedStages.add(d.stageId);
      });
      setMonthlyDistribution(newDistribution);
      setLoadedDistributions(loadedStages);
    }
  }, [allDistributions]);

  // Carregar distribuição salva ao expandir etapa (fallback individual)
  useEffect(() => {
    if (expandedStageId && !loadedDistributions.has(expandedStageId)) {
      const loadDistribution = async () => {
        try {
          const utils = trpc.useUtils();
          const savedDistribution = await utils.budgetSchedule.getMonthlyDistribution.fetch({
            budgetId,
            stageId: expandedStageId,
          });
          
          if (savedDistribution && savedDistribution.length > 0) {
            setMonthlyDistribution(prev => {
              const newDistribution = { ...prev };
              savedDistribution.forEach((d: any) => {
                newDistribution[`${expandedStageId}-${d.periodLabel}`] = d.percentage;
              });
              return newDistribution;
            });
          }
          
          setLoadedDistributions(prev => new Set(prev).add(expandedStageId));
        } catch (error) {
          console.error('Erro ao carregar distribuição:', error);
        }
      };
      loadDistribution();
    }
  }, [expandedStageId, budgetId]);

  // Função para gerar todos os meses do projeto
  const getAllMonths = () => {
    const allMonths: string[] = [];
    stages
      .filter((stage: any) => stage.startDate && stage.endDate)
      .forEach((stage: any) => {
        const months = generateMonthsForStage(stage);
        months.forEach((month) => {
          if (!allMonths.includes(month)) {
            allMonths.push(month);
          }
        });
      });
    return allMonths.sort((a, b) => {
      const [monthA, yearA] = a.split(" de ");
      const [monthB, yearB] = b.split(" de ");
      if (yearA !== yearB) return yearA.localeCompare(yearB);
      const monthsOrder = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      return monthsOrder.indexOf(monthA) - monthsOrder.indexOf(monthB);
    });
  };

  // Função para gerar meses entre start e end date
  const generateMonthsForStage = (stage: any) => {
    if (!stage.startDate || !stage.endDate) return [];
    const start = new Date(stage.startDate);
    const end = new Date(stage.endDate);
    const months: string[] = [];
    
    // Adicionar 1 mês de defasagem para refletir desembolso
    // (trabalho executado no mês N é pago no mês N+1)
    const current = new Date(start);
    current.setMonth(current.getMonth() + 1);
    current.setDate(1); // Normalizar para dia 1 para comparação de mês/ano
    
    const adjustedEnd = new Date(end);
    adjustedEnd.setMonth(adjustedEnd.getMonth() + 1);
    adjustedEnd.setDate(1); // Normalizar para dia 1 para comparação de mês/ano
    
    while (current <= adjustedEnd) {
      const monthName = current.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      months.push(monthName);
      current.setMonth(current.getMonth() + 1);
    }
    
    return months;
  };

  // Calcular total de percentuais
  const calculateTotalPercent = (stageId: number) => {
    const stage = stages.find((s: any) => s.id === stageId);
    if (!stage) return 0;
    
    const months = generateMonthsForStage(stage);
    const total = months.reduce((sum, month) => {
      return sum + (monthlyDistribution[`${stageId}-${month}`] || 0);
    }, 0);
    
    return Math.round(total * 100) / 100;
  };

  // Auto-preencher com distribuição uniforme
  const handleAutoFill = (stageId: number) => {
    const stage = stages.find((s: any) => s.id === stageId);
    if (!stage) return;
    
    const months = generateMonthsForStage(stage);
    const percentPerMonth = 100 / months.length;
    const newDistribution = { ...monthlyDistribution };
    
    months.forEach((month) => {
      newDistribution[`${stageId}-${month}`] = Math.round(percentPerMonth * 100) / 100;
    });
    
    setMonthlyDistribution(newDistribution);
    toast({ title: "Distribuição preenchida automaticamente!" });
  };

  const utils = trpc.useUtils();
  const saveMonthlyDistributionMutation = trpc.budgetSchedule.saveMonthlyDistribution.useMutation({
    onSuccess: (_, variables) => {
      toast({ title: "Distribuição salva com sucesso!" });
      // Marcar como carregado para não sobrescrever ao reabrir
      setLoadedDistributions(prev => new Set(prev).add(variables.stageId));
      // Invalidar cache para recarregar distribuições na próxima visita à aba
      utils.budgetSchedule.getAllMonthlyDistributions.invalidate({ budgetId });
    },
    onError: (error: any) => {
      toast({ title: `Erro ao salvar: ${error.message}`, variant: "destructive" });
    },
  });

  // Exportar para Excel
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Cronograma de Desembolso");
    
    const allMonths = getAllMonths();
    
    // Cabeçalho
    const headers = ["Atividade", ...allMonths, "Total"];
    worksheet.addRow(headers);
    
    // Estilizar cabeçalho
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };
    
    // Dados das atividades
    stages
      .filter((stage: any) => stage.startDate && stage.endDate)
      .forEach((stage: any) => {
        const row = [stage.name];
        allMonths.forEach((month) => {
          const percent = monthlyDistribution[`${stage.id}-${month}`] || 0;
          const value = (percent / 100) * parseFloat(stage.totalWithBdi || "0");
          row.push(value);
        });
        const total = parseFloat(stage.totalWithBdi || "0");
        row.push(total);
        worksheet.addRow(row);
      });
    
    // Linha de totais
    const totalRow = ["Total Mensal"];
    allMonths.forEach((month) => {
      const total = stages
        .filter((stage: any) => stage.startDate && stage.endDate)
        .reduce((sum: number, stage: any) => {
          const percent = monthlyDistribution[`${stage.id}-${month}`] || 0;
          return sum + (percent * parseFloat(stage.totalWithBdi || "0")) / 100;
        }, 0);
      totalRow.push(total as any);
    });
    const grandTotal = stages
      .filter((stage: any) => stage.startDate && stage.endDate)
      .reduce((sum: number, stage: any) => sum + parseFloat(stage.totalWithBdi || "0"), 0);
    totalRow.push(grandTotal as any);
    worksheet.addRow(totalRow);
    
    // Estilizar linha de totais
    const lastRow = worksheet.lastRow;
    if (lastRow) {
      lastRow.font = { bold: true };
      lastRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFB3D9FF" },
      };
    }
    
    // Formatar colunas de valores como moeda
    for (let col = 2; col <= headers.length; col++) {
      worksheet.getColumn(col).numFmt = 'R$ #,##0.00';
      worksheet.getColumn(col).width = 15;
    }
    worksheet.getColumn(1).width = 30;
    
    // Gerar arquivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cronograma_desembolso_${budget?.project?.name || "orcamento"}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast({ title: "Exportação Excel concluída!" });
  };
  
  // Exportar para PDF
  const handleExportPDF = () => {
    const doc = new jsPDF("landscape");
    
    // Título
    doc.setFontSize(16);
    doc.text("Cronograma de Desembolso", 14, 15);
    doc.setFontSize(10);
    doc.text(`Projeto: ${budget?.project?.name || "Orçamento"}`, 14, 22);
    
    const allMonths = getAllMonths();
    
    // Preparar dados para tabela
    const headers = [["Atividade", ...allMonths, "Total"]];
    const rows: any[] = [];
    
    stages
      .filter((stage: any) => stage.startDate && stage.endDate)
      .forEach((stage: any) => {
        const row = [stage.name];
        allMonths.forEach((month) => {
          const percent = monthlyDistribution[`${stage.id}-${month}`] || 0;
          const value = (percent / 100) * parseFloat(stage.totalWithBdi || "0");
          row.push(`R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
        });
        const total = parseFloat(stage.totalWithBdi || "0");
        row.push(`R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
        rows.push(row);
      });
    
    // Linha de totais
    const totalRow = ["Total Mensal"];
    allMonths.forEach((month) => {
      const total = stages
        .filter((stage: any) => stage.startDate && stage.endDate)
        .reduce((sum: number, stage: any) => {
          const percent = monthlyDistribution[`${stage.id}-${month}`] || 0;
          return sum + (percent * parseFloat(stage.totalWithBdi || "0")) / 100;
        }, 0);
      totalRow.push(`R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    });
    const grandTotal = stages
      .filter((stage: any) => stage.startDate && stage.endDate)
      .reduce((sum: number, stage: any) => sum + parseFloat(stage.totalWithBdi || "0"), 0);
    totalRow.push(`R$ ${grandTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    rows.push(totalRow);
    
    // Gerar tabela
    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [211, 211, 211], textColor: [0, 0, 0], fontStyle: "bold" },
      footStyles: { fillColor: [179, 217, 255], textColor: [0, 0, 0], fontStyle: "bold" },
      didParseCell: (data: any) => {
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fillColor = [179, 217, 255];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    
    doc.save(`cronograma_desembolso_${budget?.project?.name || "orcamento"}.pdf`);
    toast({ title: "Exportação PDF concluída!" });
  };

  // Salvar distribuição
  const handleSaveDistribution = (stageId: number) => {
    const total = calculateTotalPercent(stageId);
    if (Math.abs(total - 100) > 0.01) {
      toast({ title: "A soma dos percentuais deve ser 100%", variant: "destructive" });
      return;
    }
    
    const stage = stages.find((s: any) => s.id === stageId);
    if (!stage) return;
    
    const months = generateMonthsForStage(stage);
    const distributions = months.map((month, index) => {
      const percentage = monthlyDistribution[`${stageId}-${month}`] || 0;
      const totalWithBdi = parseFloat(stage.totalWithBdi || "0");
      const value = (percentage / 100) * totalWithBdi;
      return {
        periodIndex: index,
        periodLabel: month,
        percentage,
        value,
      };
    });
    
    saveMonthlyDistributionMutation.mutate({
      budgetId,
      stageId,
      distributions,
    });
  };

  const updateStageMutation = trpc.budgets.updateStage.useMutation({
    onSuccess: async (data, variables) => {
      // Verificar se as datas foram alteradas
      const oldStage = stages.find((s: any) => s.id === variables.id);
      const datesChanged = oldStage && (
        String(oldStage.startDate ?? '') !== String(variables.startDate ?? '') ||
        String(oldStage.endDate ?? '') !== String(variables.endDate ?? '')
      );

      if (datesChanged && variables.id) {
        // Deletar distribuições antigas (passar array vazio)
        try {
          await saveMonthlyDistributionMutation.mutateAsync({
            budgetId,
            stageId: variables.id,
            distributions: [],
          });
          
          // Limpar estado local para forçar recarga
          setMonthlyDistribution(prev => {
            const newDist = { ...prev };
            Object.keys(newDist).forEach(key => {
              if (key.startsWith(`${variables.id}-`)) {
                delete newDist[key];
              }
            });
            return newDist;
          });
          setLoadedDistributions(prev => {
            const newSet = new Set(prev);
            newSet.delete(variables.id!);
            return newSet;
          });
          
          toast({ title: "Etapa atualizada! Distribuição mensal recalculada automaticamente." });
        } catch (error) {
          console.error('Erro ao regenerar distribuição:', error);
          toast({ title: "Etapa atualizada, mas erro ao recalcular distribuição", variant: "destructive" });
        }
      } else {
        toast({ title: "Etapa atualizada com sucesso!" });
      }
      
      refetchStages();
    },
    onError: (error) => {
      toast({ title: `Erro: ${error.message}`, variant: "destructive" });
    },
  });

  // Converter stages para GanttTasks (inclui itens compostos como sub-tarefas)
  useEffect(() => {
    const tasks: GanttTask[] = [];
    
    const sortedStages = [...stages]
      .filter((stage: any) => stage.startDate && stage.endDate)
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    
    sortedStages.forEach((stage: any) => {
      // Adicionar a etapa como tarefa principal
      tasks.push({
        id: stage.id.toString(),
        name: stage.name,
        start: new Date(stage.startDate),
        end: new Date(stage.endDate),
        progress: 0,
        dependencies: stage.predecessors ? JSON.parse(stage.predecessors).map((p: any) => p.id.toString()) : [],
        type: "task" as const,
        styles: {
          backgroundColor: "#3b82f6",
          backgroundSelectedColor: "#2563eb",
          progressColor: "#1d4ed8",
          progressSelectedColor: "#1e40af",
        },
      });
      
      // Adicionar itens compostos da etapa como sub-tarefas
      const compositeItems = (stage.items || []).filter((item: any) => item.type === 'composite');
      compositeItems.forEach((item: any, idx: number) => {
        // Calcular duração do composto: soma das quantidades dos filhos / produtividade média
        // Como não temos produtividade, distribuímos proporcionalmente dentro do período da etapa
        const stageStart = new Date(stage.startDate);
        const stageEnd = new Date(stage.endDate);
        const stageDurationMs = stageEnd.getTime() - stageStart.getTime();
        const totalComposites = compositeItems.length;
        
        // Dividir o período da etapa igualmente entre os compostos
        const compositeStart = new Date(stageStart.getTime() + (stageDurationMs / totalComposites) * idx);
        const compositeEnd = new Date(stageStart.getTime() + (stageDurationMs / totalComposites) * (idx + 1));
        
        // Calcular custo total do composto para exibir no nome
        const children = item.children || [];
        let compositeTotalMat = 0;
        let compositeTotalLab = 0;
        children.forEach((child: any) => {
          const childQty = parseFloat(child.quantity || "0");
          compositeTotalMat += parseFloat(child.materialCost || "0") * childQty;
          compositeTotalLab += parseFloat(child.laborCost || "0") * childQty;
        });
        const compositeTotal = compositeTotalMat + compositeTotalLab;
        const qty = parseFloat(item.quantity || "1");
        const unitCost = qty > 0 ? compositeTotal / qty : 0;
        
        const taskName = `${item.description} (${qty} ${item.unit} · R$${unitCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/${item.unit})`;
        
        tasks.push({
          id: `composite-${item.id}`,
          name: taskName,
          start: compositeStart,
          end: compositeEnd,
          progress: 0,
          dependencies: [stage.id.toString()],
          type: "task" as const,
          styles: {
            backgroundColor: "#10b981",
            backgroundSelectedColor: "#059669",
            progressColor: "#047857",
            progressSelectedColor: "#065f46",
          },
        });
      });
    });
    
    setGanttTasks(tasks);
  }, [stages]);

  // Calcular duração automaticamente quando datas mudam
  useEffect(() => {
    if (stageStartDate && stageEndDate) {
      const start = new Date(stageStartDate);
      const end = new Date(stageEndDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setStageDuration(diffDays);
    }
  }, [stageStartDate, stageEndDate]);

  const handleStageSelect = (stageId: number) => {
    setSelectedStageId(stageId);
    const stage = stages.find((s: any) => s.id === stageId);
    if (stage) {
      setStageStartDate(stage.startDate ? (typeof stage.startDate === 'string' ? stage.startDate : stage.startDate.toISOString().split('T')[0]) : "");
      setStageEndDate(stage.endDate ? (typeof stage.endDate === 'string' ? stage.endDate : stage.endDate.toISOString().split('T')[0]) : "");
      setStageDuration(stage.duration || 0);
      // Parse predecessors from JSON string to array
      try {
        const preds = stage.predecessors ? JSON.parse(stage.predecessors) : [];
        setPredecessors(Array.isArray(preds) ? preds.map((p: any) => p.id || p) : []);
      } catch {
        setPredecessors([]);
      }
    }
  };

  const handleSaveDates = () => {
    if (!selectedStageId) {
      toast({ title: "Selecione uma etapa primeiro", variant: "destructive" });
      return;
    }

    const stage = stages.find((s: any) => s.id === selectedStageId);
    if (!stage) return;

    // Ler valores diretamente do DOM
    const startDateInput = document.getElementById("startDate") as HTMLInputElement;
    const endDateInput = document.getElementById("endDate") as HTMLInputElement;
    const predecessorsInput = document.getElementById("predecessors") as HTMLInputElement;

    const startDateValue = startDateInput?.value || "";
    const endDateValue = endDateInput?.value || "";
    const predecessorsValue = predecessorsInput?.value || "";

    // Calcular duração
    let durationValue = 0;
    if (startDateValue && endDateValue) {
      const start = new Date(startDateValue);
      const end = new Date(endDateValue);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      durationValue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Convert predecessors array to JSON string
    const predecessorsJson = predecessors.length > 0 
      ? JSON.stringify(predecessors.map(id => ({ id, type: "FS", lag: 0 })))
      : undefined;

    updateStageMutation.mutate({
      id: selectedStageId,
      name: stage.name,
      description: stage.description || undefined,
      startDate: startDateValue || undefined,
      endDate: endDateValue || undefined,
      duration: durationValue,
      predecessors: predecessorsJson,
    });
  };

  const handleDateChange = (task: Task, start: Date, end: Date) => {
    console.log("Gantt date changed:", task, start, end);
    const stageId = parseInt(task.id);
    const stage = stages.find((s: any) => s.id === stageId);
    if (!stage) return;

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Atualizar etapa atual
    updateStageMutation.mutate({
      id: stageId,
      name: stage.name,
      description: stage.description || undefined,
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
      duration: diffDays,
      predecessors: stage.predecessors || undefined,
    });

    // Reorganizar sucessores automaticamente
    reorganizeSuccessors(stageId, end);
  };

  const reorganizeSuccessors = (predecessorId: number, predecessorEndDate: Date) => {
    // Encontrar todas as etapas que dependem desta
    const successors = stages.filter((s: any) => {
      if (!s.predecessors) return false;
      try {
        const preds = JSON.parse(s.predecessors);
        return preds.some((p: any) => (p.id || p) === predecessorId);
      } catch {
        return false;
      }
    });

    // Atualizar cada sucessor para começar após o predecessor terminar
    successors.forEach((successor: any) => {
      const newStartDate = new Date(predecessorEndDate);
      newStartDate.setDate(newStartDate.getDate() + 1); // Começa no dia seguinte

      const currentDuration = successor.duration || 1;
      const newEndDate = new Date(newStartDate);
      newEndDate.setDate(newEndDate.getDate() + currentDuration);

      updateStageMutation.mutate({
        id: successor.id,
        name: successor.name,
        description: successor.description || undefined,
        startDate: newStartDate.toISOString().split("T")[0],
        endDate: newEndDate.toISOString().split("T")[0],
        duration: currentDuration,
        predecessors: successor.predecessors || undefined,
      });

      // Reorganizar recursivamente os sucessores deste sucessor
      reorganizeSuccessors(successor.id, newEndDate);
    });
  };

  const handleEditStage = (stageId: number) => {
    setIsEditMode(true);
    handleStageSelect(stageId);
    // Scroll para o formulário
    window.scrollTo({ top: 0, behavior: 'smooth' });
   };
  
  const reorderStageMutation = trpc.budgets.reorderStage.useMutation({
    onSuccess: async (data) => {
      toast({ title: "Etapa reordenada com sucesso!" });
      // Invalidar e refetch imediatamente
      await utils.budgets.getStages.invalidate({ budgetId });
      await refetchStages();
    },
    onError: (error) => {
      toast({ title: `Erro: ${error.message}`, variant: "destructive" });
    },
  });

  const moveToPositionMutation = trpc.budgets.moveStageToPosition.useMutation({
    onSuccess: async (data) => {
      toast({ title: "Etapa movida com sucesso!" });
      // Invalidar e refetch imediatamente
      await utils.budgets.getStages.invalidate({ budgetId });
      await refetchStages();
    },
    onError: (error) => {
      toast({ title: `Erro: ${error.message}`, variant: "destructive" });
    },
  });

  const recalculateAllMutation = trpc.budgetSchedule.recalculateAllDistributions.useMutation({
    onSuccess: (data) => {
      toast({ title: `Distribuições recalculadas para ${data.count} etapas!` });
      // Limpar distribuições carregadas para forçar reload
      setLoadedDistributions(new Set());
      setMonthlyDistribution({});
    },
    onError: (error) => {
      toast({ title: `Erro: ${error.message}`, variant: "destructive" });
    },
  });

  const reloadStagesMutation = trpc.budgetSchedule.reloadStages.useMutation({
    onSuccess: (data) => {
      showToast.success(`Etapas rearranjadas! ${data.count} etapas atualizadas.`);
      utils.budgets.getStages.invalidate({ budgetId });
      // Limpar distribuições carregadas para forçar recalculo
      setLoadedDistributions(new Set());
      setMonthlyDistribution({});
    },
    onError: (error) => {
      showToast.error(`Erro ao rearranjar etapas: ${error.message}`);
    },
  });

  const handleMoveToPosition = async (stageId: number, targetPosition: number) => {
    try {
      await moveToPositionMutation.mutateAsync({
        budgetId,
        stageId,
        targetPosition,
      });
    } catch (error) {
      console.error('Erro ao mover etapa:', error);
    }
  };

  const handleRecalculateAllDistributions = async () => {
    try {
      await recalculateAllMutation.mutateAsync({ budgetId });
    } catch (error) {
      console.error('Erro ao recalcular distribuições:', error);
    }
  };

  const handleReloadStages = async () => {
    try {
      await reloadStagesMutation.mutateAsync({ budgetId });
    } catch (error) {
      console.error('Erro ao rearranjar etapas:', error);
    }
  };

  const handleReorderStage = async (stageId: number, direction: 'up' | 'down') => {
    try {
      await reorderStageMutation.mutateAsync({
        budgetId,
        stageId,
        direction,
      });
      
      toast({ title: "Etapa reordenada com sucesso!" });
      await utils.budgets.getStages.invalidate({ budgetId });
      await refetchStages();
    } catch (error: any) {
      toast({ title: `Erro: ${error.message}`, variant: "destructive" });
    }
  };

  const handleDeleteStage = (stageId: number) => {
    if (!confirm("Tem certeza que deseja deletar esta etapa? Esta ação não pode ser desfeita.")) {
      return;
    }

    // Limpar datas e dependências da etapa
    const stage = stages.find((s: any) => s.id === stageId);
    if (!stage) return;

    updateStageMutation.mutate({
      id: stageId,
      name: stage.name,
      description: stage.description || undefined,
      startDate: undefined,
      endDate: undefined,
      duration: undefined,
      predecessors: undefined,
    });

    toast({ title: "Etapa removida do cronograma" });
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cronograma Gantt</h1>
          <p className="text-muted-foreground">
            {budget?.title || "Carregando..."}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuração de Datas e Dependências</CardTitle>
          <CardDescription>
            Defina as datas de início e término de cada etapa, e configure as dependências entre atividades
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stage">Etapa</Label>
              <Select
                value={selectedStageId?.toString() || ""}
                onValueChange={(value) => handleStageSelect(parseInt(value))}
              >
                <SelectTrigger id="stage">
                  <SelectValue placeholder="Selecione uma etapa" />
                </SelectTrigger>
                <SelectContent>
                  {orderedStages.map((stage: any) => (
                    <SelectItem key={stage.id} value={stage.id.toString()}>
                      <span
                        className="inline-flex items-center"
                        style={{ paddingLeft: stage.depth * 16 }}
                      >
                        {stage.depth > 0 && <span className="text-muted-foreground mr-1">↳</span>}
                        <span className={stage.depth === 0 ? "font-medium" : ""}>{stage.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="predecessors">Etapas Predecessoras</Label>
              <Select
                value={predecessors.length > 0 ? predecessors[0].toString() : ""}
                onValueChange={(value) => {
                  const stageId = parseInt(value);
                  if (stageId && !predecessors.includes(stageId)) {
                    setPredecessors([...predecessors, stageId]);
                  }
                }}
              >
                <SelectTrigger id="predecessors">
                  <SelectValue placeholder="Selecione etapas predecessoras" />
                </SelectTrigger>
                <SelectContent>
                  {orderedStages
                    .filter((s: any) => s.id !== selectedStageId)
                    .map((stage: any) => (
                      <SelectItem key={stage.id} value={stage.id.toString()}>
                        <span
                          className="inline-flex items-center"
                          style={{ paddingLeft: stage.depth * 16 }}
                        >
                          {stage.depth > 0 && <span className="text-muted-foreground mr-1">↳</span>}
                          <span className={stage.depth === 0 ? "font-medium" : ""}>{stage.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {predecessors.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {predecessors.map((predId) => {
                    const predStage = stages.find((s: any) => s.id === predId);
                    return predStage ? (
                      <div
                        key={predId}
                        className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"
                      >
                        <span>{predStage.name}</span>
                        <button
                          type="button"
                          onClick={() => setPredecessors(predecessors.filter((id) => id !== predId))}
                          className="hover:text-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="successors">Etapas Sucessoras</Label>
              <Select
                value={successors.length > 0 ? successors[0].toString() : ""}
                onValueChange={(value) => {
                  const stageId = parseInt(value);
                  if (stageId && !successors.includes(stageId)) {
                    setSuccessors([...successors, stageId]);
                  }
                }}
              >
                <SelectTrigger id="successors">
                  <SelectValue placeholder="Selecione etapas sucessoras" />
                </SelectTrigger>
                <SelectContent>
                  {orderedStages
                    .filter((s: any) => s.id !== selectedStageId)
                    .map((stage: any) => (
                      <SelectItem key={stage.id} value={stage.id.toString()}>
                        <span
                          className="inline-flex items-center"
                          style={{ paddingLeft: stage.depth * 16 }}
                        >
                          {stage.depth > 0 && <span className="text-muted-foreground mr-1">↳</span>}
                          <span className={stage.depth === 0 ? "font-medium" : ""}>{stage.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {successors.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {successors.map((succId) => {
                    const succStage = stages.find((s: any) => s.id === succId);
                    return succStage ? (
                      <div
                        key={succId}
                        className="flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded text-sm"
                      >
                        <span>{succStage.name}</span>
                        <button
                          type="button"
                          onClick={() => setSuccessors(successors.filter((id) => id !== succId))}
                          className="hover:text-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Data de Início</Label>
              <Input
                id="startDate"
                type="date"
                value={stageStartDate}
                onChange={(e) => setStageStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">Data de Término</Label>
              <Input
                id="endDate"
                type="date"
                value={stageEndDate}
                onChange={(e) => setStageEndDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duração (dias)</Label>
              <Input
                id="duration"
                type="number"
                value={stageDuration}
                readOnly
                className="bg-muted"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSaveDates} disabled={!selectedStageId}>
              <Save className="w-4 h-4 mr-2" />
              {isEditMode ? "Atualizar Etapa" : "Salvar Datas"}
            </Button>
            {(selectedStageId || isEditMode) && (
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedStageId(null);
                  setStageStartDate("");
                  setStageEndDate("");
                  setStageDuration(0);
                  setPredecessors([]);
                  setSuccessors([]);
                  setIsEditMode(false);
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Etapas Configuradas</CardTitle>
              <CardDescription>
                Gerencie as etapas do cronograma: edite datas, dependências ou delete etapas
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleReloadStages}
                variant="default"
                size="sm"
                disabled={reloadStagesMutation.isPending || stages.filter((s: any) => s.startDate && s.endDate).length === 0}
              >
                {reloadStagesMutation.isPending ? "Rearranjando..." : "Reload"}
              </Button>
              <Button
                onClick={handleRecalculateAllDistributions}
                variant="outline"
                size="sm"
                disabled={recalculateAllMutation.isPending || stages.filter((s: any) => s.startDate && s.endDate).length === 0}
              >
                {recalculateAllMutation.isPending ? "Recalculando..." : "Recalcular Todas as Distribuições"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Etapa</th>
                  <th className="text-left p-3 font-medium">Data Início</th>
                  <th className="text-left p-3 font-medium">Data Término</th>
                  <th className="text-left p-3 font-medium">Duração</th>
                  <th className="text-left p-3 font-medium">Predecessoras</th>
                  <th className="text-right p-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filteredStages = stages.filter((stage: any) => stage.startDate && stage.endDate);

                  return filteredStages.map((stage: any, index: number) => {
                    const preds = stage.predecessors ? JSON.parse(stage.predecessors) : [];
                    const predNames = preds
                      .map((p: any) => {
                        const predStage = stages.find((s: any) => s.id === (p.id || p));
                        return predStage?.name;
                      })
                      .filter(Boolean)
                      .join(", ");

                    return (
                      <React.Fragment key={stage.id}>
                        <tr className="border-t hover:bg-muted/50">
                          <td className="p-3 font-medium">
                            <span style={{ paddingLeft: (stageDepth.get(stage.id) || 0) * 16 }} className="inline-flex items-center">
                              {(stageDepth.get(stage.id) || 0) > 0 && <span className="text-muted-foreground mr-1">↳</span>}
                              {stage.name}
                            </span>
                          </td>
                          <td className="p-3 text-sm">
                            {new Date(stage.startDate).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="p-3 text-sm">
                            {new Date(stage.endDate).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="p-3 text-sm">{stage.duration || 0} dias</td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {predNames || "Nenhuma"}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReorderStage(stage.id, 'up')}
                                disabled={index === 0}
                                title="Mover para cima"
                              >
                                ↑
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReorderStage(stage.id, 'down')}
                                disabled={index === filteredStages.length - 1}
                                title="Mover para baixo"
                              >
                                ↓
                              </Button>
                              <Select
                                value={index.toString()}
                                onValueChange={(value) => handleMoveToPosition(stage.id, parseInt(value))}
                              >
                                <SelectTrigger className="w-[140px] h-8">
                                  <SelectValue placeholder="Mover para..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {filteredStages.map((_: any, i: number) => (
                                    <SelectItem key={i} value={i.toString()}>
                                      Posição {i + 1}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setExpandedStageId(expandedStageId === stage.id ? null : stage.id)}
                              >
                                📊 Distribuir %
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditStage(stage.id)}
                              >
                                Editar
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteStage(stage.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expandedStageId === stage.id && (
                          <tr className="border-t bg-blue-50">
                            <td colSpan={6} className="p-4">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-semibold text-sm">Distribuição Mensal - {stage.name}</h4>
                                  <span className="text-sm text-muted-foreground">
                                    Valor Total: R$ {parseFloat(stage.totalWithBdi || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div className="grid grid-cols-6 gap-3">
                                  {generateMonthsForStage(stage).map((month) => (
                                    <div key={month} className="space-y-1">
                                      <Label className="text-xs">{month}</Label>
                                      <Input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        placeholder="%"
                                        value={monthlyDistribution[`${stage.id}-${month}`] || ""}
                                        onChange={(e) => {
                                          const value = parseFloat(e.target.value) || 0;
                                          setMonthlyDistribution({
                                            ...monthlyDistribution,
                                            [`${stage.id}-${month}`]: value
                                          });
                                        }}
                                        className="h-8 text-sm"
                                      />
                                      <div className="text-xs text-muted-foreground">
                                        R$ {((monthlyDistribution[`${stage.id}-${month}`] || 0) * parseFloat(stage.totalWithBdi || "0") / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t">
                                  <span className="text-sm font-medium">
                                    Total: {calculateTotalPercent(stage.id)}%
                                    {calculateTotalPercent(stage.id) !== 100 && (
                                      <span className="text-red-600 ml-2">(Deve somar 100%)</span>
                                    )}
                                  </span>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => handleAutoFill(stage.id)}>
                                      Auto-preencher
                                    </Button>
                                    <Button size="sm" onClick={() => handleSaveDistribution(stage.id)}>
                                      Salvar Distribuição
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gráfico de Gantt Interativo</CardTitle>
          <CardDescription>
            Arraste as barras para ajustar datas. As dependências são mostradas com setas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GanttChart
            tasks={ganttTasks}
            onDateChange={handleDateChange}
            exportTitle={budget?.project?.name || "Orçamento"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Cronograma de Desembolso</CardTitle>
              <CardDescription>
                Visão consolidada de todas as atividades e valores mensais
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleExportExcel} variant="outline" size="sm">
                <FileDown className="h-4 w-4 mr-2" />
                Exportar Excel
              </Button>
              <Button onClick={handleExportPDF} variant="outline" size="sm">
                <FileDown className="h-4 w-4 mr-2" />
                Exportar PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2 font-medium sticky left-0 bg-muted">Atividade</th>
                  {getAllMonths().map((month) => (
                    <th key={month} className="text-center p-2 font-medium min-w-[80px]">
                      {month}
                    </th>
                  ))}
                  <th className="text-right p-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {stages
                  .filter((stage: any) => stage.startDate && stage.endDate)
                  .map((stage: any) => {
                    const stageMonths = generateMonthsForStage(stage);
                    return (
                      <tr key={stage.id} className="border-t hover:bg-muted/50">
                        <td className="p-2 font-medium sticky left-0 bg-background">
                          {stage.name}
                        </td>
                        {getAllMonths().map((month) => {
                          const percent = monthlyDistribution[`${stage.id}-${month}`] || 0;
                          const value = (percent * parseFloat(stage.totalWithBdi || "0")) / 100;
                          const isActive = stageMonths.includes(month);
                          return (
                            <td
                              key={month}
                              className={`text-center p-2 ${
                                isActive ? "bg-blue-50" : "bg-gray-50"
                              }`}
                            >
                              {percent > 0 ? (
                                <div>
                                  <div className="font-medium text-blue-600">{percent}%</div>
                                  <div className="text-xs text-muted-foreground">
                                    R$ {value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="text-right p-2 font-medium">
                          R$ {parseFloat(stage.totalWithBdi || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                <tr className="border-t-2 bg-blue-100 font-bold">
                  <td className="p-2 sticky left-0 bg-blue-100">Total Mensal</td>
                  {getAllMonths().map((month) => {
                    const total = stages
                      .filter((stage: any) => stage.startDate && stage.endDate)
                      .reduce((sum: number, stage: any) => {
                        const percent = monthlyDistribution[`${stage.id}-${month}`] || 0;
                        return sum + (percent * parseFloat(stage.totalWithBdi || "0")) / 100;
                      }, 0);
                    return (
                      <td key={month} className="text-center p-2">
                        <div className="text-blue-700">
                          R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-right p-2">
                    R${" "}
                    {stages
                      .filter((stage: any) => stage.startDate && stage.endDate)
                      .reduce((sum: number, stage: any) => sum + parseFloat(stage.totalWithBdi || "0"), 0)
                      .toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Curva S */}
      <Card>
        <CardHeader>
          <CardTitle>Curva S - Desembolso Acumulado</CardTitle>
          <CardDescription>
            Visualização do desembolso acumulado ao longo do tempo
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const allMonths = getAllMonths();
            let accumulated = 0;
            const totalBudget = stages
              .filter((stage: any) => stage.startDate && stage.endDate)
              .reduce((sum: number, stage: any) => sum + parseFloat(stage.totalWithBdi || "0"), 0);
            
            const curveSData = allMonths.map((month) => {
              const monthlyTotal = stages
                .filter((stage: any) => stage.startDate && stage.endDate)
                .reduce((sum: number, stage: any) => {
                  const percent = monthlyDistribution[`${stage.id}-${month}`] || 0;
                  return sum + (percent * parseFloat(stage.totalWithBdi || "0")) / 100;
                }, 0);
              
              accumulated += monthlyTotal;
              const percentage = totalBudget > 0 ? (accumulated / totalBudget) * 100 : 0;
              
              return {
                period: month,
                accumulated,
                percentage,
              };
            });
            
            return curveSData.length > 0 ? (
              <BudgetCurveS data={curveSData} totalBudget={totalBudget} />
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Nenhum dado disponível. Configure as datas das etapas e distribua os percentuais mensais.
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Avanço Físico: Planejado x Realizado */}
      <Card>
        <CardHeader>
          <CardTitle>Avanço Físico: Planejado x Realizado</CardTitle>
          <CardDescription>
            Planejado calculado pelas datas das etapas no Gantt; Realizado vem das medições salvas (aba Medições)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {planejadoRealizado ? (
            <>
              {(() => {
                const { plannedTodayPercent, realizadoTodayPercent, deltaPercent, deltaValue } = planejadoRealizado;
                const atrasada = deltaPercent < -3;
                const adiantada = deltaPercent > 3;
                const badgeClass = atrasada
                  ? "bg-red-50 border-red-200 text-red-700"
                  : adiantada
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-green-50 border-green-200 text-green-700";
                const label = atrasada ? "Obra atrasada" : adiantada ? "Obra adiantada" : "Obra no prazo";
                return (
                  <div className={`rounded-lg border p-3 flex flex-wrap items-center justify-between gap-2 ${badgeClass}`}>
                    <div>
                      <div className="font-bold text-sm">{label}</div>
                      <div className="text-xs opacity-80">
                        Planejado até hoje: {plannedTodayPercent.toFixed(1)}% · Realizado: {realizadoTodayPercent.toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm">
                        {deltaPercent >= 0 ? "+" : ""}{deltaPercent.toFixed(1)} p.p.
                      </div>
                      <div className="text-xs opacity-80">
                        {deltaValue >= 0 ? "+" : "-"}R$ {Math.abs(deltaValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                );
              })()}
              <PlanejadoRealizadoChart data={planejadoRealizado.chartData} />
            </>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              Configure as datas de início e fim das etapas no Gantt para calcular o avanço planejado.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
