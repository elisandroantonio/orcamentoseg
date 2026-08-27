import { useEffect, useState, useRef } from "react";
import { Gantt, Task, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

export interface GanttTask {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress: number;
  dependencies?: string[];
  type?: "task" | "milestone" | "project";
  styles?: {
    backgroundColor?: string;
    backgroundSelectedColor?: string;
    progressColor?: string;
    progressSelectedColor?: string;
  };
}

interface GanttChartProps {
  tasks: GanttTask[];
  onTaskChange?: (task: Task) => void;
  onTaskDelete?: (task: Task) => void;
  onProgressChange?: (task: Task) => void;
  onDateChange?: (task: Task, start: Date, end: Date) => void;
  // Título usado no cabeçalho do PDF exportado (ex: nome do orçamento/projeto)
  exportTitle?: string;
}

export function GanttChart({
  tasks,
  onTaskChange,
  onTaskDelete,
  onProgressChange,
  onDateChange,
  exportTitle,
}: GanttChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Month);
  const [ganttTasks, setGanttTasks] = useState<Task[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const ganttRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Converter GanttTask para Task (formato da biblioteca)
    const converted: Task[] = tasks.map((task) => ({
      id: task.id,
      name: task.name,
      start: task.start,
      end: task.end,
      progress: task.progress,
      type: task.type || "task",
      dependencies: task.dependencies,
      styles: task.styles,
    }));
    setGanttTasks(converted);
  }, [tasks]);

  // Customizar formato dos meses no cabeçalho
  useEffect(() => {
    const formatMonthHeaders = () => {
      if (!ganttRef.current || ganttTasks.length === 0) return;

      // Mapeamento de nome completo (pt-BR) para abreviado
      const monthMap: Record<string, number> = {
        'Janeiro': 0, 'Fevereiro': 1, 'Março': 2, 'Abril': 3,
        'Maio': 4, 'Junho': 5, 'Julho': 6, 'Agosto': 7,
        'Setembro': 8, 'Outubro': 9, 'Novembro': 10, 'Dezembro': 11,
      };
      const monthShort = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

      // Calcular data mínima (início) de todas as tarefas
      const minDate = ganttTasks.reduce((min, t) =>
        t.start < min ? t.start : min, ganttTasks[0].start);
      const startYear = minDate.getFullYear();
      const startMonth = minDate.getMonth(); // 0-based

      // Coletar todos os elementos de texto que são nomes de mês (na ordem do DOM = ordem visual)
      const allTextEls = Array.from(ganttRef.current.querySelectorAll('text'));
      const monthEls = allTextEls.filter(el => {
        const t = (el.textContent || '').trim();
        return Object.prototype.hasOwnProperty.call(monthMap, t);
      });

      // Ordenar pela posição X no DOM (esquerda para direita)
      monthEls.sort((a, b) => {
        const ax = parseFloat(a.getAttribute('x') || '0');
        const bx = parseFloat(b.getAttribute('x') || '0');
        return ax - bx;
      });

      // Substituir cada elemento pelo mês/ano correto na sequência cronológica
      monthEls.forEach((el, idx) => {
        const totalMonths = startMonth + idx;
        const year = startYear + Math.floor(totalMonths / 12);
        const month = totalMonths % 12;
        const shortYear = year.toString().slice(2);
        el.textContent = `${monthShort[month]}/${shortYear}`;
      });
    };

    // Executar após renderização com delay para garantir que o SVG foi montado
    const timer = setTimeout(formatMonthHeaders, 300);
    return () => clearTimeout(timer);
  }, [ganttTasks, viewMode]);

  const handleTaskChange = (task: Task) => {
    console.log("Task changed:", task);
    if (onTaskChange) {
      onTaskChange(task);
    }
  };

  const handleTaskDelete = (task: Task) => {
    console.log("Task deleted:", task);
    if (onTaskDelete) {
      onTaskDelete(task);
    }
  };

  const handleProgressChange = (task: Task) => {
    console.log("Progress changed:", task);
    if (onProgressChange) {
      onProgressChange(task);
    }
  };

  const handleDateChange = (task: Task) => {
    console.log("Date changed:", task);
    if (onDateChange) {
      onDateChange(task, task.start, task.end);
    }
  };

  // Exporta o gráfico visual (barras + dependências) como PDF — diferente do
  // PDF de "Cronograma de Desembolso" (que é uma tabela de valores mensais).
  // Como a biblioteca de Gantt renderiza em SVG/HTML sem opção nativa de
  // exportação, a barra é "fotografada" com html2canvas e a imagem colada
  // num PDF, paginando verticalmente se o cronograma tiver muitas linhas.
  const handleExportPdf = async () => {
    if (!ganttRef.current || ganttTasks.length === 0) {
      toast.error("Nenhuma atividade para exportar.");
      return;
    }
    setIsExportingPdf(true);
    try {
      // html2canvas-pro (não o html2canvas original): o projeto usa cores
      // modernas (oklch/oklab/color-mix) no CSS, que o html2canvas 1.4.1 não
      // sabe interpretar e travava a exportação com erro. O -pro é o mesmo
      // pacote com suporte a essas funções de cor, mesma API.
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const el = ganttRef.current;

      // A biblioteca do Gantt implementa o scroll horizontal do calendário
      // com um painel interno de largura FIXA e "overflow: hidden" (rolagem
      // por JS/drag, não pelo scroll nativo do navegador) — por isso
      // el.scrollWidth sozinho não basta: esse painel interno fica menor que
      // o SVG do calendário inteiro, e o html2canvas corta tudo que passa da
      // largura visível dele. Aqui, antes de capturar, qualquer elemento
      // dentro do gráfico cuja largura de conteúdo (scrollWidth) seja maior
      // que a largura visível é temporariamente esticado pra caber tudo, e
      // desfeito logo depois — não altera nada pra quem está usando a tela.
      const widened: { el: HTMLElement; width: string; overflow: string }[] = [];
      const unclipOverflow = (root: HTMLElement) => {
        const all = root.querySelectorAll<HTMLElement>("*");
        all.forEach((node) => {
          if (node.scrollWidth > node.clientWidth + 2) {
            widened.push({ el: node, width: node.style.width, overflow: node.style.overflow });
            node.style.width = `${node.scrollWidth}px`;
            node.style.overflow = "visible";
          }
        });
      };
      unclipOverflow(el);

      let canvas;
      try {
        canvas = await html2canvas(el, {
          backgroundColor: "#ffffff",
          scale: 2,
          // Captura o conteúdo inteiro (inclusive o que fica fora da área
          // visível por causa do scroll horizontal/overflow do gráfico).
          width: el.scrollWidth,
          height: el.scrollHeight,
          windowWidth: el.scrollWidth,
          windowHeight: el.scrollHeight,
        });
      } finally {
        // Desfazer a "esticada" temporária, sempre — mesmo se a captura falhar.
        widened.forEach(({ el: node, width, overflow }) => {
          node.style.width = width;
          node.style.overflow = overflow;
        });
      }

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2 - 12; // reserva espaço pro título

      const scale = usableWidth / canvas.width;
      const scaledHeight = canvas.height * scale;

      doc.setFontSize(14);
      doc.text("Cronograma — Gráfico de Gantt", margin, margin);
      if (exportTitle) {
        doc.setFontSize(9);
        doc.text(exportTitle, margin, margin + 5);
      }

      if (scaledHeight <= usableHeight) {
        // Cabe tudo numa página só
        doc.addImage(canvas, "PNG", margin, margin + 10, usableWidth, scaledHeight);
      } else {
        // Fatia a imagem em blocos horizontais, um por página, do tamanho
        // que cabe na altura útil da página.
        const sliceHeightPx = Math.floor(usableHeight / scale);
        let offsetY = 0;
        let firstPage = true;
        while (offsetY < canvas.height) {
          const thisSliceHeightPx = Math.min(sliceHeightPx, canvas.height - offsetY);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = thisSliceHeightPx;
          const ctx = sliceCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(
              canvas,
              0, offsetY, canvas.width, thisSliceHeightPx,
              0, 0, canvas.width, thisSliceHeightPx
            );
          }
          if (!firstPage) doc.addPage();
          const topY = firstPage ? margin + 10 : margin;
          if (firstPage) {
            doc.setFontSize(14);
            doc.text("Cronograma — Gráfico de Gantt", margin, margin);
          }
          doc.addImage(sliceCanvas, "PNG", margin, topY, usableWidth, thisSliceHeightPx * scale);
          offsetY += thisSliceHeightPx;
          firstPage = false;
        }
      }

      doc.save(`gantt_${(exportTitle || "cronograma").replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`);
      toast.success("PDF do gráfico de Gantt exportado!");
    } catch (err) {
      console.error("Erro ao exportar PDF do Gantt:", err);
      toast.error("Erro ao gerar o PDF do gráfico.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (ganttTasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border border-dashed rounded-lg">
        <p className="text-muted-foreground">
          Nenhuma atividade para exibir. Adicione datas às etapas para visualizar o cronograma.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Gráfico de Gantt</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={isExportingPdf || ganttTasks.length === 0}
          >
            <FileDown className="h-4 w-4 mr-2" />
            {isExportingPdf ? "Gerando PDF..." : "Exportar PDF"}
          </Button>
          <span className="text-sm text-muted-foreground">Visualização:</span>
          <Select
            value={viewMode}
            onValueChange={(value) => setViewMode(value as ViewMode)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ViewMode.Day}>Dia</SelectItem>
              <SelectItem value={ViewMode.Week}>Semana</SelectItem>
              <SelectItem value={ViewMode.Month}>Mês</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div ref={ganttRef} className="border rounded-lg overflow-hidden bg-background">
        <Gantt
          tasks={ganttTasks}
          viewMode={viewMode}
          onDateChange={handleDateChange}
          onDelete={handleTaskDelete}
          onProgressChange={handleProgressChange}
          listCellWidth="200px"
          columnWidth={viewMode === ViewMode.Month ? 60 : viewMode === ViewMode.Week ? 80 : 40}
          locale="pt-BR"
        />
      </div>
    </div>
  );
}
