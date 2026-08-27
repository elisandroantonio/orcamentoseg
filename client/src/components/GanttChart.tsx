import { useEffect, useState, useRef } from "react";
import { Gantt, Task, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Slider } from "./ui/slider";
import { Input } from "./ui/input";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Tamanhos de papel disponíveis pra exportação do Gantt, já em orientação
// paisagem (largura = lado maior). Mesmos nomes que o jsPDF aceita como
// "format" na hora de gerar o PDF de verdade.
const PAPER_SIZES = {
  a4: { label: "A4 (297 × 210 mm)", w: 297, h: 210 },
  a3: { label: "A3 (420 × 297 mm)", w: 420, h: 297 },
  a2: { label: "A2 (594 × 420 mm)", w: 594, h: 420 },
  a1: { label: "A1 (841 × 594 mm)", w: 841, h: 594 },
  letter: { label: "Carta (279 × 216 mm)", w: 279.4, h: 215.9 },
} as const;
type PaperSizeKey = keyof typeof PAPER_SIZES;

// Metadados medidos no DOM no momento da captura — usados só pra evitar que
// a paginação vertical corte uma barra/linha de etapa ao meio no meio de uma
// página (ver computePdfLayout).
export interface GanttCaptureMeta {
  rowHeightPx: number; // altura de uma linha de etapa, já em pixel do canvas capturado (escala 2x)
  headerOffsetPx: number; // altura da área de cabeçalho do calendário, antes da 1ª linha
}

// Matemática de paginação compartilhada entre a prévia (canvas na tela) e o
// PDF final — garante que os dois mostrem exatamente o mesmo resultado.
// "Ajustar à largura" (auto) sempre cabe numa largura de página só (o
// comportamento de antes); "manual" aplica uma % em cima dessa largura
// base, podendo precisar de mais de uma página tanto na largura quanto na
// altura — igual a imprimir um desenho técnico grande em várias folhas.
//
// A quebra vertical é "esperta": em vez de repartir a altura em fatias de
// tamanho igual (que cortam uma barra de etapa bem no meio quando a divisão
// não é exata — a reclamação de "corta a folha"), ela avança página por
// página encaixando quantas LINHAS INTEIRAS couberem, e só quebra a página
// no início da próxima linha. Sempre a mesma altura de página no máximo,
// nunca mais — só ajusta pra baixo até a linha anterior completa.
function computePdfLayout(
  canvas: HTMLCanvasElement,
  paper: { w: number; h: number },
  fitMode: "auto" | "manual",
  manualScale: number,
  meta: GanttCaptureMeta | null
) {
  const margin = 10;
  const topMargin = 16; // reserva espaço pro título, só desenhado na 1ª página
  const usableWidth = paper.w - margin * 2;
  const usableHeight = paper.h - topMargin - margin;

  const baseScale = usableWidth / canvas.width; // mm por px da captura, "100%" = cabe na largura de 1 página
  const finalScale = fitMode === "auto" ? baseScale : baseScale * (manualScale / 100);

  const totalWidthMm = canvas.width * finalScale;
  const totalHeightMm = canvas.height * finalScale;
  const cols = Math.max(1, Math.ceil(totalWidthMm / usableWidth));

  // Pontos de corte verticais, em pixel do canvas fonte (não em mm) — cada
  // item é o Y onde uma página termina e a próxima começa.
  const rowHeightPx = meta && meta.rowHeightPx > 0 ? meta.rowHeightPx : 0;
  const headerOffsetPx = meta?.headerOffsetPx ?? 0;
  const maxSlicePx = usableHeight / finalScale; // altura útil de uma página, em px do canvas fonte
  const rowBreaksPx: number[] = [0];
  let y = 0;
  while (y < canvas.height) {
    let nextY = Math.min(canvas.height, y + maxSlicePx);
    if (nextY < canvas.height && rowHeightPx > 0 && nextY > headerOffsetPx) {
      // Recuar até o início da linha completa mais próxima, sem cortar uma
      // etapa ao meio — só se isso ainda deixar pelo menos 1 linha inteira
      // nesta página.
      const rowsFromHeader = Math.floor((nextY - headerOffsetPx) / rowHeightPx);
      const snapped = headerOffsetPx + rowsFromHeader * rowHeightPx;
      if (snapped > y) nextY = snapped;
    }
    rowBreaksPx.push(nextY);
    y = nextY;
  }
  const rows = rowBreaksPx.length - 1;

  return { margin, topMargin, usableWidth, usableHeight, finalScale, totalWidthMm, totalHeightMm, cols, rows, rowBreaksPx };
}

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
  const ganttRef = useRef<HTMLDivElement>(null);

  // Janela de exportação de PDF (papel + escala + prévia)
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedCanvas, setCapturedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [capturedMeta, setCapturedMeta] = useState<GanttCaptureMeta | null>(null);
  const [paperSize, setPaperSize] = useState<PaperSizeKey>("a4");
  const [fitMode, setFitMode] = useState<"auto" | "manual">("auto");
  const [manualScale, setManualScale] = useState(100);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

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

  // "Fotografa" o gráfico inteiro (barras + dependências) com html2canvas,
  // pra depois ser recortado em páginas de PDF. Extraído numa função à parte
  // porque agora é usado tanto pra montar a pré-visualização (uma vez só, ao
  // abrir a janela de exportação) quanto pro PDF final — sem isso, mudar o
  // tamanho do papel ou a escala na janela exigiria refazer a captura da
  // tela a cada clique, o que é lento e re-mostra o cronograma piscando.
  const captureGanttCanvas = async (): Promise<{ canvas: HTMLCanvasElement; meta: GanttCaptureMeta } | null> => {
    if (!ganttRef.current) return null;
    // html2canvas-pro (não o html2canvas original): o projeto usa cores
    // modernas (oklch/oklab/color-mix) no CSS, que o html2canvas 1.4.1 não
    // sabe interpretar e travava a exportação com erro. O -pro é o mesmo
    // pacote com suporte a essas funções de cor, mesma API.
    const { default: html2canvas } = await import("html2canvas-pro");
    const el = ganttRef.current;
    const SCALE = 2;

    // Cronogramas mais longos que a largura visível do painel ficavam
    // cortados no PDF (o calendário simplesmente parava num mês no meio do
    // projeto, não importa a escala escolhida na janela de exportação).
    // Causa raiz: a biblioteca do Gantt desenha o calendário inteiro (dois
    // <svg>: um de cabeçalho com os meses, outro com as linhas/barras) mas
    // mostra só uma "janela" dele através de um painel de largura FIXA com
    // "overflow: hidden" (rolagem por JS/drag, não é scroll nativo do
    // navegador) — os <svg> em si já têm o conteúdo completo, só ficam
    // clipados visualmente pelo painel.
    //
    // Já tentamos: (1) alargar esse painel via CSS antes de capturar, e (2)
    // encolher a largura das colunas pra caber tudo sem precisar de scroll.
    // As duas pioraram ou não resolveram — o html2canvas-pro (confirmado na
    // versão exata usada aqui) simplesmente não desenha corretamente o
    // trecho que só existe fora da largura originalmente visível, seja lá
    // qual for o motivo (medidas de layout que ele guarda antes de aplicar
    // qualquer hack de CSS, aparentemente).
    //
    // Solução que funciona de verdade: os dois <svg> do calendário são
    // desenho vetorial autocontido (não dependem de layout de fora deles) —
    // então, em vez de pedir pro html2canvas capturar essa parte, a gente
    // serializa os próprios <svg> (com os estilos computados, cor etc.,
    // "gravados" em cada elemento antes de serializar, já que um SVG
    // isolado não enxerga mais o CSS da página) e desenha isso direto num
    // canvas via uma <img> comum — o jeito NATIVO do navegador de rasterizar
    // SVG, sem passar pelo html2canvas nessa parte. Isso captura o
    // calendário INTEIRO, sem nenhum corte, não importa o tamanho do
    // cronograma. A lista de tarefas (à esquerda) continua sendo capturada
    // pelo html2canvas normalmente — nela nunca houve problema.
    const svgToCanvas = async (svgEl: SVGSVGElement): Promise<HTMLCanvasElement> => {
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      const props = [
        "fill",
        "stroke",
        "stroke-width",
        "font-family",
        "font-size",
        "font-weight",
        "opacity",
        "text-anchor",
        "fill-opacity",
        "stroke-opacity",
      ];
      const applyInlineStyle = (src: Element, dest: Element) => {
        const cs = getComputedStyle(src);
        let styleStr = "";
        for (const prop of props) {
          const value = cs.getPropertyValue(prop);
          if (value) styleStr += `${prop}:${value};`;
        }
        if (styleStr) dest.setAttribute("style", styleStr);
      };
      // "Gravar" o estilo computado de cada elemento (cor, fonte etc.) como
      // atributo inline, porque um SVG serializado sozinho não tem mais
      // acesso às classes CSS da página (o navegador rasteriza sem elas,
      // caindo nos padrões — por isso fundos/linhas apareciam pretos antes
      // dessa etapa).
      applyInlineStyle(svgEl, clone);
      const srcAll = svgEl.querySelectorAll("*");
      const destAll = clone.querySelectorAll("*");
      for (let i = 0; i < srcAll.length; i++) {
        applyInlineStyle(srcAll[i], destAll[i]);
      }
      const width = parseFloat(svgEl.getAttribute("width") || "0") || svgEl.clientWidth;
      const height = parseFloat(svgEl.getAttribute("height") || "0") || svgEl.clientHeight;
      // Aumentar a largura/altura DECLARADA do SVG (mantendo o viewBox) pra
      // rasterizar direto em alta resolução, em vez de desenhar pequeno e
      // esticar depois (o que ficaria borrado).
      clone.setAttribute("width", String(width * SCALE));
      clone.setAttribute("height", String(height * SCALE));

      const svgStr = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Falha ao rasterizar SVG do calendário"));
          img.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = width * SCALE;
        canvas.height = height * SCALE;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas;
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    // Medir a altura de uma linha de etapa e o deslocamento do cabeçalho do
    // calendário — usado depois pra paginar sem cortar uma barra de etapa
    // ao meio entre duas páginas. Cada etapa é um filho direto do grupo
    // <g class="bar"> da biblioteca (essa classe não é ofuscada), na mesma
    // ordem das tarefas — não depende de nomes de classe internos, que
    // mudam a cada build da lib.
    let rowHeightPx = 0;
    let headerOffsetPx = 0;
    const barGroup = el.querySelector(".bar");
    if (barGroup && barGroup.children.length >= 1) {
      const rowEls = Array.from(barGroup.children);
      const containerTop = el.getBoundingClientRect().top;
      const firstTop = rowEls[0].getBoundingClientRect().top;
      headerOffsetPx = firstTop - containerTop;
      if (rowEls.length >= 2) {
        rowHeightPx = rowEls[1].getBoundingClientRect().top - firstTop;
      } else {
        rowHeightPx = rowEls[0].getBoundingClientRect().height;
      }
    }

    // Captura normal da lista de tarefas + o que já está visível do
    // calendário (só usada como base pra lista de tarefas — a parte do
    // calendário é totalmente substituída abaixo).
    const baseCanvas = await html2canvas(el, {
      backgroundColor: "#ffffff",
      scale: SCALE,
      width: el.scrollWidth,
      height: el.scrollHeight,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    });

    const svgs = Array.from(el.querySelectorAll("svg")) as SVGSVGElement[];
    // Sem <svg> (cronograma vazio) — devolve a captura normal.
    if (svgs.length === 0) {
      return { canvas: baseCanvas, meta: { rowHeightPx: rowHeightPx * SCALE, headerOffsetPx: headerOffsetPx * SCALE } };
    }

    const elRect = el.getBoundingClientRect();
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = baseCanvas.width;
    finalCanvas.height = baseCanvas.height;
    // Se o calendário completo for mais largo que a captura base (caso
    // comum — é exatamente o corte que estamos corrigindo), o canvas final
    // precisa ser mais largo pra caber tudo.
    const lastSvgRect = svgs[svgs.length - 1].getBoundingClientRect();
    const calendarEndXCss = lastSvgRect.left - elRect.left + lastSvgRect.width;
    finalCanvas.width = Math.max(baseCanvas.width, Math.round(calendarEndXCss * SCALE));

    const ctx = finalCanvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    ctx.drawImage(baseCanvas, 0, 0);

    for (const svg of svgs) {
      const svgRect = svg.getBoundingClientRect();
      const xCss = svgRect.left - elRect.left;
      const yCss = svgRect.top - elRect.top;
      const svgCanvas = await svgToCanvas(svg);
      ctx.drawImage(svgCanvas, Math.round(xCss * SCALE), Math.round(yCss * SCALE));
    }

    // O canvas final foi montado em escala 2 (SCALE) — os pixels são sempre
    // o dobro dos pixels CSS medidos acima, independente da densidade de
    // tela real do usuário.
    return { canvas: finalCanvas, meta: { rowHeightPx: rowHeightPx * SCALE, headerOffsetPx: headerOffsetPx * SCALE } };
  };

  // Abre a janela de configuração de exportação (papel + escala + prévia).
  // A captura da tela acontece só UMA VEZ aqui — trocar papel/escala depois
  // só redesenha o preview e recorta o PDF final a partir dessa mesma
  // imagem, sem "fotografar" de novo.
  const handleOpenExportDialog = async () => {
    if (!ganttRef.current || ganttTasks.length === 0) {
      toast.error("Nenhuma atividade para exportar.");
      return;
    }
    setShowExportDialog(true);
    setIsCapturing(true);
    setCapturedCanvas(null);
    setCapturedMeta(null);
    try {
      const result = await captureGanttCanvas();
      setCapturedCanvas(result?.canvas ?? null);
      setCapturedMeta(result?.meta ?? null);
    } catch (err) {
      console.error("Erro ao preparar pré-visualização do PDF do Gantt:", err);
      toast.error("Erro ao preparar a pré-visualização do PDF.");
      setShowExportDialog(false);
    } finally {
      setIsCapturing(false);
    }
  };

  // Gera o PDF final a partir da imagem já capturada, ladrilhando em quantas
  // páginas forem necessárias (largura x altura) pro papel e escala
  // escolhidos — igual a mandar imprimir um desenho técnico grande em várias
  // folhas A3/A1 e depois montar.
  const handleConfirmExport = async () => {
    if (!capturedCanvas) return;
    try {
      const { default: jsPDF } = await import("jspdf");
      const paper = PAPER_SIZES[paperSize];
      const layout = computePdfLayout(capturedCanvas, paper, fitMode, manualScale, capturedMeta);
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [paper.w, paper.h] });

      let isFirstPage = true;
      for (let r = 0; r < layout.rows; r++) {
        for (let c = 0; c < layout.cols; c++) {
          if (!isFirstPage) doc.addPage([paper.w, paper.h], "landscape");

          const winXmm = c * layout.usableWidth;
          const winWmm = Math.min(layout.usableWidth, layout.totalWidthMm - winXmm);
          // Corte vertical "esperto": usa os pontos de quebra já calculados
          // por linha inteira de etapa, em vez de uma altura fixa igual pra
          // todas as páginas — evita cortar uma barra ao meio.
          const srcY = layout.rowBreaksPx[r];
          const srcH = layout.rowBreaksPx[r + 1] - srcY;
          const winHmm = srcH * layout.finalScale;
          const srcX = winXmm / layout.finalScale;
          const srcW = winWmm / layout.finalScale;

          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = Math.max(1, Math.round(srcW));
          sliceCanvas.height = Math.max(1, Math.round(srcH));
          const ctx = sliceCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(capturedCanvas, srcX, srcY, srcW, srcH, 0, 0, sliceCanvas.width, sliceCanvas.height);
          }

          const topY = isFirstPage ? layout.topMargin : layout.margin;
          if (isFirstPage) {
            doc.setFontSize(14);
            doc.text("Cronograma — Gráfico de Gantt", layout.margin, 10);
            if (exportTitle) {
              doc.setFontSize(9);
              doc.text(exportTitle, layout.margin, 14);
            }
          }
          doc.addImage(sliceCanvas, "PNG", layout.margin, topY, winWmm, winHmm);

          if (layout.rows * layout.cols > 1) {
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(
              `Página ${r * layout.cols + c + 1} de ${layout.rows * layout.cols}`,
              paper.w - layout.margin,
              paper.h - 4,
              { align: "right" }
            );
            doc.setTextColor(0);
          }

          isFirstPage = false;
        }
      }

      doc.save(`gantt_${(exportTitle || "cronograma").replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`);
      toast.success("PDF do gráfico de Gantt exportado!");
      setShowExportDialog(false);
    } catch (err) {
      console.error("Erro ao exportar PDF do Gantt:", err);
      toast.error("Erro ao gerar o PDF do gráfico.");
    }
  };

  // Recalcula o preview (canvas em tela) toda vez que a captura, o papel, o
  // modo de ajuste ou a escala mudam — puramente redesenhando a imagem já
  // capturada, sem tocar em html2canvas de novo.
  useEffect(() => {
    if (!capturedCanvas || !previewCanvasRef.current) return;
    const paper = PAPER_SIZES[paperSize];
    const layout = computePdfLayout(capturedCanvas, paper, fitMode, manualScale, capturedMeta);
    const previewCanvas = previewCanvasRef.current;
    const ctx = previewCanvas.getContext("2d");
    if (!ctx) return;

    const gapMm = 6; // espaço visual entre folhas separadas na prévia
    const totalGridWmm = layout.cols * paper.w + (layout.cols - 1) * gapMm;
    const totalGridHmm = layout.rows * paper.h + (layout.rows - 1) * gapMm;
    const maxPreviewWidthPx = 560;
    const pxPerMm = Math.min(maxPreviewWidthPx / totalGridWmm, 3);
    previewCanvas.width = Math.max(1, Math.round(totalGridWmm * pxPerMm));
    previewCanvas.height = Math.max(1, Math.round(totalGridHmm * pxPerMm));

    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        const pageXpx = c * (paper.w + gapMm) * pxPerMm;
        const pageYpx = r * (paper.h + gapMm) * pxPerMm;
        const pageWpx = paper.w * pxPerMm;
        const pageHpx = paper.h * pxPerMm;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(pageXpx, pageYpx, pageWpx, pageHpx);
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 1;
        ctx.strokeRect(pageXpx, pageYpx, pageWpx, pageHpx);

        const winXmm = c * layout.usableWidth;
        const winWmm = Math.min(layout.usableWidth, layout.totalWidthMm - winXmm);
        const srcY = layout.rowBreaksPx[r];
        const srcH = layout.rowBreaksPx[r + 1] - srcY;
        const winHmm = srcH * layout.finalScale;
        if (winWmm <= 0 || winHmm <= 0) continue;

        const srcX = winXmm / layout.finalScale;
        const srcW = winWmm / layout.finalScale;
        const topMarginMm = r === 0 && c === 0 ? layout.topMargin : layout.margin;
        const destX = pageXpx + layout.margin * pxPerMm;
        const destY = pageYpx + topMarginMm * pxPerMm;
        const destW = winWmm * pxPerMm;
        const destH = winHmm * pxPerMm;
        ctx.drawImage(capturedCanvas, srcX, srcY, srcW, srcH, destX, destY, destW, destH);

        if (r === 0 && c === 0) {
          ctx.fillStyle = "#111827";
          ctx.font = `${Math.max(8, 5 * pxPerMm)}px sans-serif`;
          ctx.fillText("Cronograma — Gráfico de Gantt", pageXpx + layout.margin * pxPerMm, pageYpx + 6 * pxPerMm);
        }
      }
    }
  }, [capturedCanvas, capturedMeta, paperSize, fitMode, manualScale, exportTitle]);

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
            onClick={handleOpenExportDialog}
            disabled={ganttTasks.length === 0}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Exportar PDF
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

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Exportar PDF do Gráfico de Gantt</DialogTitle>
            <DialogDescription>
              Escolha o tamanho do papel e a escala antes de baixar. A prévia abaixo mostra exatamente como o PDF vai sair.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Tamanho do papel</Label>
                <Select value={paperSize} onValueChange={(v) => setPaperSize(v as PaperSizeKey)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAPER_SIZES).map(([key, p]) => (
                      <SelectItem key={key} value={key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Escala</Label>
                <RadioGroup value={fitMode} onValueChange={(v) => setFitMode(v as "auto" | "manual")} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="auto" id="gantt-pdf-fit-auto" />
                    <Label htmlFor="gantt-pdf-fit-auto" className="font-normal cursor-pointer">
                      Ajustar à largura da página
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="manual" id="gantt-pdf-fit-manual" />
                    <Label htmlFor="gantt-pdf-fit-manual" className="font-normal cursor-pointer">
                      Escala manual
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {fitMode === "manual" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[manualScale]}
                      min={25}
                      max={300}
                      step={5}
                      onValueChange={([v]) => setManualScale(v)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={manualScale}
                      onChange={(e) => setManualScale(Math.min(300, Math.max(10, Number(e.target.value) || 100)))}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Acima de 100% o cronograma fica maior e pode precisar de mais de uma folha.
                  </p>
                </div>
              )}

              {capturedCanvas && (() => {
                const layout = computePdfLayout(capturedCanvas, PAPER_SIZES[paperSize], fitMode, manualScale, capturedMeta);
                const totalPages = layout.rows * layout.cols;
                return (
                  <p className="text-xs text-muted-foreground border-t pt-3">
                    {totalPages === 1
                      ? "Vai caber em 1 página."
                      : `Vai gerar ${totalPages} páginas (${layout.cols} de largura × ${layout.rows} de altura).`}
                  </p>
                );
              })()}
            </div>

            <div className="border rounded-lg bg-muted/30 p-4 flex items-center justify-center overflow-auto max-h-[420px] min-h-[280px]">
              {isCapturing ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Gerando prévia...
                </div>
              ) : (
                <canvas ref={previewCanvasRef} className="shadow-sm max-w-full" />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmExport} disabled={!capturedCanvas || isCapturing}>
              <FileDown className="h-4 w-4 mr-2" />
              Baixar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
