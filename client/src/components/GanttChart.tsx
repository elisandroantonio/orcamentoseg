import { useEffect, useState, useRef } from "react";
import { Gantt, Task, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

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
}

export function GanttChart({
  tasks,
  onTaskChange,
  onTaskDelete,
  onProgressChange,
  onDateChange,
}: GanttChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Month);
  const [ganttTasks, setGanttTasks] = useState<Task[]>([]);
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
