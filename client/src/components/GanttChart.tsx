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
import { FileDown, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import {
  drawPdfCorporateHeader,
  addExcelCorporateHeader,
  type CorporateCompanyInfo,
  type CorporateClientInfo,
} from "@/lib/documentHeader";

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
  meta: GanttCaptureMeta | null,
  headerHeightMm: number = 16
) {
  const margin = 10;
  const topMargin = headerHeightMm; // reserva espaço pro cabeçalho (logo + dados), só desenhado na 1ª página
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

// Granularidade das colunas de tempo na exportação Excel. Por padrão
// acompanha a "Visualização" já selecionada na tela (Dia/Semana/Mês) — mas
// cronogramas longos (obras de vários anos) ficam mais legíveis com colunas
// mais grossas do que a tela permite, daí as opções extras só pro Excel.
type ExcelGranularity = "dia" | "semana" | "mes" | "trimestre" | "semestre" | "ano";

const EXCEL_GRANULARITY_LABELS: Record<ExcelGranularity, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
  trimestre: "Trimestre",
  semestre: "Semestre",
  ano: "Ano",
};

// Largura de coluna (em "caracteres" do Excel) por granularidade — quanto
// mais grosso o período, mais larga a coluna, pra caber o rótulo.
const EXCEL_GRANULARITY_COL_WIDTH: Record<ExcelGranularity, number> = {
  dia: 2.6,
  semana: 6,
  mes: 9,
  trimestre: 12,
  semestre: 14,
  ano: 12,
};

function viewModeToExcelGranularity(vm: ViewMode): ExcelGranularity {
  if (vm === ViewMode.Day) return "dia";
  if (vm === ViewMode.Week) return "semana";
  return "mes";
}

interface ExcelBucket {
  start: Date; // meia-noite, início do período (inclusive)
  end: Date; // meia-noite, fim do período (inclusive)
  group: string; // rótulo da linha de cima (ano, ou mês/ano no modo dia)
  unit: string; // rótulo da linha de baixo (dia, mês, trimestre, semestre ou ano)
}

const MONTH_SHORT_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Gera a lista de "colunas de tempo" (buckets) entre duas datas, de acordo
// com a granularidade escolhida — cada bucket vira uma coluna na planilha.
// No modo "dia" cada bucket é um dia (comportamento anterior); nos modos mais
// grossos, um bucket cobre várias semanas/meses e uma etapa é marcada nele
// se o período dela tocar em qualquer parte do bucket (mesma lógica que um
// Gantt visual "compactado" mostra).
function buildExcelBuckets(startDay: Date, endDay: Date, granularity: ExcelGranularity): ExcelBucket[] {
  const buckets: ExcelBucket[] = [];

  if (granularity === "dia") {
    for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
      const cur = new Date(d);
      buckets.push({
        start: cur,
        end: cur,
        group: `${MONTH_SHORT_PT[cur.getMonth()]}/${String(cur.getFullYear()).slice(2)}`,
        unit: String(cur.getDate()),
      });
    }
    return buckets;
  }

  if (granularity === "semana") {
    // Volta pra segunda-feira da semana que contém startDay (ISO week).
    const d = new Date(startDay);
    const back = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - back);
    while (d <= endDay) {
      const wStart = new Date(d);
      const wEnd = new Date(d);
      wEnd.setDate(wEnd.getDate() + 6);
      buckets.push({
        start: wStart,
        end: wEnd,
        group: String(wStart.getFullYear()),
        unit: `${String(wStart.getDate()).padStart(2, "0")}/${String(wStart.getMonth() + 1).padStart(2, "0")}`,
      });
      d.setDate(d.getDate() + 7);
    }
    return buckets;
  }

  // mes / trimestre / semestre / ano — todos avançam em blocos de N meses,
  // só muda o N e o texto do rótulo.
  const monthsPerBucket = granularity === "mes" ? 1 : granularity === "trimestre" ? 3 : granularity === "semestre" ? 6 : 12;
  let y = startDay.getFullYear();
  let m = startDay.getMonth() - (startDay.getMonth() % monthsPerBucket);
  const endTotal = endDay.getFullYear() * 12 + endDay.getMonth();
  while (y * 12 + m <= endTotal) {
    const bStart = new Date(y, m, 1);
    const bEnd = new Date(y, m + monthsPerBucket, 0); // último dia do bloco
    let unit: string;
    if (granularity === "mes") unit = MONTH_SHORT_PT[m];
    else if (granularity === "trimestre") unit = `T${Math.floor(m / 3) + 1}`;
    else if (granularity === "semestre") unit = `S${Math.floor(m / 6) + 1}`;
    else unit = String(y);
    buckets.push({
      start: bStart,
      end: bEnd,
      group: granularity === "ano" ? "" : String(y),
      unit,
    });
    m += monthsPerBucket;
    if (m > 11) {
      y += Math.floor(m / 12);
      m = m % 12;
    }
  }
  return buckets;
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
  // Dados pro cabeçalho corporativo (logo + painel) nos PDFs/Excel
  // exportados — mesmo estilo do PDF do orçamento. Sem isso, exporta sem
  // logo (fallback pro logo padrão da EG) e sem painel de proprietário.
  companyInfo?: CorporateCompanyInfo;
  clientInfo?: CorporateClientInfo | null;
  budgetCode?: string;
}

const EMPTY_COMPANY_INFO: CorporateCompanyInfo = {
  companyName: "",
  cnpj: "",
  responsibleName: "",
  responsibleTitle: "",
  phone: "",
  email: "",
  logoUrl: null,
};

export function GanttChart({
  tasks,
  onTaskChange,
  onTaskDelete,
  onProgressChange,
  onDateChange,
  exportTitle,
  companyInfo = EMPTY_COMPANY_INFO,
  clientInfo = null,
  budgetCode,
}: GanttChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Month);
  const [ganttTasks, setGanttTasks] = useState<Task[]>([]);
  const ganttRef = useRef<HTMLDivElement>(null);

  // Exportação em Excel — plano B pro PDF: em vez de "fotografar" o gráfico
  // (html2canvas/SVG), monta um Gantt de verdade em células, com uma coluna
  // por dia e o preenchimento colorido representando a barra. Sem nenhuma
  // captura de tela envolvida, então não sofre dos problemas de corte/áreas
  // em branco do PDF — e fica 100% editável no Excel depois.
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [excelGranularity, setExcelGranularity] = useState<ExcelGranularity>(() => viewModeToExcelGranularity(viewMode));

  // Acompanha a "Visualização" da tela por padrão (Dia/Semana/Mês) — o
  // usuário pode depois trocar manualmente pra Trimestre/Semestre/Ano no
  // seletor ao lado do botão "Exportar Excel", pra cronogramas longos.
  useEffect(() => {
    setExcelGranularity(viewModeToExcelGranularity(viewMode));
  }, [viewMode]);

  // Janela de exportação de PDF (papel + escala + prévia)
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedCanvas, setCapturedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [capturedMeta, setCapturedMeta] = useState<GanttCaptureMeta | null>(null);
  const [paperSize, setPaperSize] = useState<PaperSizeKey>("a4");
  const [fitMode, setFitMode] = useState<"auto" | "manual">("auto");
  const [manualScale, setManualScale] = useState(100);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Altura (em mm) reservada no topo da 1ª página pro cabeçalho corporativo
  // (logo + painel de dados) — medida de verdade desenhando o cabeçalho num
  // jsPDF descartável, já que a altura varia com o quanto de texto cada
  // campo (endereço, e-mail etc.) ocupa. Usa uma largura de referência (A4
  // paisagem) só pra medir; papéis mais largos quebram menos linha, então
  // essa altura tende a sobrar um pouco em vez de faltar — nunca o
  // contrário.
  const [headerHeightMm, setHeaderHeightMm] = useState(16);

  const headerOpts = {
    documentLabel: "CRONOGRAMA — GRÁFICO DE GANTT",
    mainTitle: exportTitle || "Orçamento",
    companyInfo,
    clientInfo,
    budgetCode,
  };

  const measureHeaderHeight = async (): Promise<number> => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const measureDoc = new jsPDF({ orientation: "landscape", unit: "mm", format: [297, 210] });
      return await drawPdfCorporateHeader(measureDoc, headerOpts);
    } catch (error) {
      console.warn("Não foi possível medir a altura do cabeçalho, usando o padrão:", error);
      return 16;
    }
  };

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
      const [result, headerH] = await Promise.all([captureGanttCanvas(), measureHeaderHeight()]);
      setCapturedCanvas(result?.canvas ?? null);
      setCapturedMeta(result?.meta ?? null);
      setHeaderHeightMm(headerH);
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
      const layout = computePdfLayout(capturedCanvas, paper, fitMode, manualScale, capturedMeta, headerHeightMm);
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
            await drawPdfCorporateHeader(doc, headerOpts);
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

  // Plano B / alternativa ao PDF: monta o mesmo cronograma numa planilha
  // Excel de verdade, célula a célula — uma coluna por dia, do início da
  // tarefa mais cedo ao fim da tarefa mais tarde, e preenche de cor sólida
  // (a mesma cor da barra na tela, vinda de task.styles.backgroundColor) o
  // intervalo de dias de cada etapa. Como não passa por html2canvas nem por
  // captura de tela nenhuma, não sofre dos problemas de corte/área em branco
  // do PDF — e fica totalmente editável no Excel depois (o usuário pode
  // ajustar cores, largura de coluna, adicionar formatação etc.).
  const handleExportExcel = async () => {
    if (ganttTasks.length === 0) {
      toast.error("Nenhuma atividade para exportar.");
      return;
    }
    setIsExportingExcel(true);
    try {
      // Intervalo total do projeto, em dias (normalizado pra meia-noite pra
      // não perder/duplicar dia por causa de hora do dia diferente).
      const toMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const minDate = ganttTasks.reduce(
        (min, t) => (t.start < min ? t.start : min),
        ganttTasks[0].start
      );
      const maxDate = ganttTasks.reduce(
        (max, t) => (t.end > max ? t.end : max),
        ganttTasks[0].end
      );
      const startDay = toMidnight(minDate);
      const endDay = toMidnight(maxDate);
      const buckets = buildExcelBuckets(startDay, endDay, excelGranularity);
      const colWidth = EXCEL_GRANULARITY_COL_WIDTH[excelGranularity];

      const COL_START = 4; // A=Atividade, B=Início, C=Término, D em diante = colunas de tempo

      const hexToArgb = (hex?: string, fallback = "FF60A5FA") => {
        if (!hex) return fallback;
        const clean = hex.replace("#", "").toUpperCase();
        if (clean.length !== 6) return fallback;
        return `FF${clean}`;
      };
      const defaultColorFor = (type?: string) =>
        type === "project" ? "FF1E3A8A" : type === "milestone" ? "FF111827" : "FF60A5FA";

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Cronograma");

      // Cabeçalho corporativo (logo + painel) — mesmo estilo em todos os
      // documentos exportados fora do orçamento principal.
      const headerStartRow = await addExcelCorporateHeader(workbook, worksheet, {
        ...headerOpts,
        fillWidthCols: COL_START - 1 + buckets.length,
      });
      const HEADER_GROUP_ROW = headerStartRow;
      const HEADER_UNIT_ROW = headerStartRow + 1;
      const FIRST_TASK_ROW = headerStartRow + 2;
      worksheet.views = [{ state: "frozen", xSplit: COL_START - 1, ySplit: HEADER_UNIT_ROW }];

      // Cabeçalhos fixos (Atividade / Início / Término)
      worksheet.getCell(HEADER_UNIT_ROW, 1).value = "Atividade";
      worksheet.getCell(HEADER_UNIT_ROW, 2).value = "Início";
      worksheet.getCell(HEADER_UNIT_ROW, 3).value = "Término";
      for (let c = 1; c <= 3; c++) {
        const cell = worksheet.getCell(HEADER_UNIT_ROW, c);
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      }
      worksheet.mergeCells(HEADER_GROUP_ROW, 1, HEADER_UNIT_ROW, 1);
      worksheet.mergeCells(HEADER_GROUP_ROW, 2, HEADER_UNIT_ROW, 2);
      worksheet.mergeCells(HEADER_GROUP_ROW, 3, HEADER_UNIT_ROW, 3);

      // Cabeçalho em 2 linhas: agrupamento em cima (ano, ou mês/ano no modo
      // dia) mesclado por trecho contínuo, e a unidade embaixo (dia, semana,
      // mês, trimestre, semestre ou ano) — uma coluna por bucket.
      let colCursor = COL_START;
      let i = 0;
      while (i < buckets.length) {
        const group = buckets[i].group;
        let span = 1;
        while (i + span < buckets.length && buckets[i + span].group === group) span++;
        const startCol = colCursor;
        const endCol = colCursor + span - 1;
        if (group && endCol > startCol) {
          worksheet.mergeCells(HEADER_GROUP_ROW, startCol, HEADER_GROUP_ROW, endCol);
        }
        if (group) {
          const groupCell = worksheet.getCell(HEADER_GROUP_ROW, startCol);
          groupCell.value = group;
          groupCell.font = { bold: true, size: 9 };
          groupCell.alignment = { horizontal: "center", vertical: "middle" };
          groupCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
        }
        for (let c = startCol; c <= endCol; c++) {
          const unitCell = worksheet.getCell(HEADER_UNIT_ROW, c);
          unitCell.value = buckets[i + (c - startCol)].unit;
          unitCell.font = { size: 7, color: { argb: "FF6B7280" } };
          unitCell.alignment = { horizontal: "center", vertical: "middle" };
          worksheet.getColumn(c).width = colWidth;
        }
        colCursor = endCol + 1;
        i += span;
      }

      worksheet.getColumn(1).width = 42;
      worksheet.getColumn(2).width = 11;
      worksheet.getColumn(3).width = 11;

      // Uma linha por tarefa — nome, datas e as células coloridas do
      // período (a "barra"), preenchidas com a mesma cor usada na tela.
      // Num bucket mais grosso que 1 dia (semana/mês/trimestre/...), a
      // célula é pintada se a etapa tocar QUALQUER parte do período —
      // mesmo critério que um Gantt visual compactado usa.
      ganttTasks.forEach((task, idx) => {
        const rowNum = FIRST_TASK_ROW + idx;
        worksheet.getCell(rowNum, 1).value = task.name;
        worksheet.getCell(rowNum, 2).value = task.start;
        worksheet.getCell(rowNum, 2).numFmt = "dd/mm/yyyy";
        worksheet.getCell(rowNum, 3).value = task.end;
        worksheet.getCell(rowNum, 3).numFmt = "dd/mm/yyyy";
        if (task.type === "project") {
          worksheet.getCell(rowNum, 1).font = { bold: true };
        }

        const taskStart = toMidnight(task.start);
        const taskEnd = toMidnight(task.end);
        const argb = hexToArgb((task as any).styles?.backgroundColor, defaultColorFor(task.type));

        buckets.forEach((bucket, bIdx) => {
          if (bucket.start <= taskEnd && bucket.end >= taskStart) {
            const col = COL_START + bIdx;
            worksheet.getCell(rowNum, col).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb },
            };
          }
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gantt_${(exportTitle || "cronograma").replace(/[^a-zA-Z0-9]+/g, "_")}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Excel do gráfico de Gantt exportado!");
    } catch (err) {
      console.error("Erro ao exportar Excel do Gantt:", err);
      toast.error("Erro ao gerar o Excel do gráfico.");
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Recalcula o preview (canvas em tela) toda vez que a captura, o papel, o
  // modo de ajuste ou a escala mudam — puramente redesenhando a imagem já
  // capturada, sem tocar em html2canvas de novo.
  useEffect(() => {
    if (!capturedCanvas || !previewCanvasRef.current) return;
    const paper = PAPER_SIZES[paperSize];
    const layout = computePdfLayout(capturedCanvas, paper, fitMode, manualScale, capturedMeta, headerHeightMm);
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
          ctx.fillStyle = "#94a3b8";
          ctx.font = `${Math.max(7, 4 * pxPerMm)}px sans-serif`;
          ctx.fillText("(cabeçalho com logo)", pageXpx + layout.margin * pxPerMm, pageYpx + 6 * pxPerMm);
        }
      }
    }
  }, [capturedCanvas, capturedMeta, paperSize, fitMode, manualScale, exportTitle, headerHeightMm]);

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
          <Select
            value={excelGranularity}
            onValueChange={(v) => setExcelGranularity(v as ExcelGranularity)}
          >
            <SelectTrigger className="w-28" title="Agrupamento das colunas no Excel exportado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(EXCEL_GRANULARITY_LABELS) as ExcelGranularity[]).map((g) => (
                <SelectItem key={g} value={g}>
                  {EXCEL_GRANULARITY_LABELS[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={ganttTasks.length === 0 || isExportingExcel}
          >
            {isExportingExcel ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Exportar Excel
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
                const layout = computePdfLayout(capturedCanvas, PAPER_SIZES[paperSize], fitMode, manualScale, capturedMeta, headerHeightMm);
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
