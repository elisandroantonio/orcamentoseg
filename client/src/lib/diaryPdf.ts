import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const PETROL_DARK: [number, number, number] = [8, 15, 38];
const PETROL_LIGHT: [number, number, number] = [26, 42, 82];
const PANEL_TINT: [number, number, number] = [233, 236, 243];
const TEXT: [number, number, number] = [55, 65, 81];

const WEATHER_LABEL: Record<string, string> = {
  bom: "Bom",
  chuva: "Chuva",
  nublado: "Nublado",
  impraticavel: "Impraticável",
};

export type DiaryPdfContext = {
  /** Título do orçamento/obra. */
  title: string;
  /** Linha menor (cliente · projeto · local), opcional. */
  subtitle?: string;
};

/* ----------------------------- datas ----------------------------- */

export function isoToBr(iso: string) {
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "Sem data";
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function weekdayName(iso: string) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? "";
}

/* ------------------------- resumo do período ------------------------- */

export type DiarySummary = {
  recordCount: number;
  daysWithRecord: number;
  photoCount: number;
  avgWorkforcePerDay: number;
  maxWorkforce: number;
  roles: { role: string; avgPerDay: number; max: number }[];
  rainyDays: string[]; // datas com chuva em algum período
  impracticableDays: string[];
  stages: string[];
  occurrences: { date: string; text: string }[];
};

export function summarizeEntries(entries: any[]): DiarySummary {
  const dates = new Set<string>();
  const workforceByDay = new Map<string, number>();
  const roleByDay = new Map<string, Map<string, number>>(); // role -> (date -> qtd)
  const rainy = new Set<string>();
  const impracticable = new Set<string>();
  const stages = new Set<string>();
  const occurrences: { date: string; text: string }[] = [];
  let photos = 0;

  for (const e of entries) {
    const date = String(e.entryDate).slice(0, 10);
    dates.add(date);
    photos += e.photos?.length ?? 0;
    if (e.stageName) stages.add(e.stageName);
    if (e.occurrences) occurrences.push({ date, text: e.occurrences });
    for (const w of [e.weatherMorning, e.weatherAfternoon]) {
      if (w === "chuva") rainy.add(date);
      if (w === "impraticavel") impracticable.add(date);
    }
    for (const l of e.labor ?? []) {
      workforceByDay.set(date, (workforceByDay.get(date) ?? 0) + l.count);
      const perRole = roleByDay.get(l.role) ?? new Map<string, number>();
      perRole.set(date, (perRole.get(date) ?? 0) + l.count);
      roleByDay.set(l.role, perRole);
    }
  }

  const days = dates.size || 1;
  const dayTotals = Array.from(workforceByDay.values());
  const avg = dayTotals.length ? dayTotals.reduce((s, n) => s + n, 0) / dayTotals.length : 0;

  return {
    recordCount: entries.length,
    daysWithRecord: dates.size,
    photoCount: photos,
    avgWorkforcePerDay: avg,
    maxWorkforce: dayTotals.length ? Math.max(...dayTotals) : 0,
    roles: Array.from(roleByDay.entries())
      .map(([role, perDay]) => {
        const vals = Array.from(perDay.values());
        return { role, avgPerDay: vals.reduce((s, n) => s + n, 0) / days, max: Math.max(...vals) };
      })
      .sort((a, b) => b.avgPerDay - a.avgPerDay),
    rainyDays: Array.from(rainy).sort(),
    impracticableDays: Array.from(impracticable).sort(),
    stages: Array.from(stages),
    occurrences: occurrences.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/* ------------------------------ imagens ------------------------------ */

type LoadedImage = { dataUrl: string; width: number; height: number };

// Baixa a foto (rota autenticada, mesmo domínio → cookie vai junto), reduz e
// converte pra JPEG pra o PDF não ficar gigante.
async function loadPhoto(url: string, maxSide = 900): Promise<LoadedImage | null> {
  try {
    const resp = await fetch(url, { credentials: "include" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = objectUrl;
      });
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return { dataUrl: canvas.toDataURL("image/jpeg", 0.78), width: w, height: h };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

async function loadLogo(): Promise<string | null> {
  for (const url of ["/logo-eg-pdf.png", "/logo-eg.png"]) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      if (!blob.type.startsWith("image/")) continue;
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } catch {
      // tenta o próximo
    }
  }
  return null;
}

/* ------------------------------ layout ------------------------------ */

const MARGIN = 12;

type Cursor = { doc: jsPDF; y: number; pageW: number; pageH: number };

async function drawHeader(doc: jsPDF, label: string, ctx: DiaryPdfContext, periodLine?: string): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PETROL_DARK);
  doc.rect(0, 0, pageW, 2.5, "F");

  const logo = await loadLogo();
  const logoW = 30;
  const logoH = 24;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", pageW - MARGIN - logoW, MARGIN, logoW, logoH);
    } catch {
      // segue sem logo
    }
  }

  const maxW = pageW - MARGIN * 2 - logoW - 6;
  let y = MARGIN + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PETROL_LIGHT);
  doc.text(label, MARGIN, y);
  y += 7;

  doc.setFontSize(15);
  doc.setTextColor(...PETROL_DARK);
  const titleLines = doc.splitTextToSize(ctx.title || "Obra", maxW);
  doc.text(titleLines, MARGIN, y);
  y += Math.max(7, titleLines.length * 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT);
  if (ctx.subtitle) {
    const lines = doc.splitTextToSize(ctx.subtitle, maxW);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.5;
  }
  if (periodLine) {
    doc.setFont("helvetica", "bold");
    doc.text(periodLine, MARGIN, y);
    y += 5;
  }

  y = Math.max(y, MARGIN + logoH) + 2;
  doc.setDrawColor(...PETROL_LIGHT);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  doc.setTextColor(0, 0, 0);
  return y + 5;
}

function ensureSpace(c: Cursor, needed: number) {
  if (c.y + needed > c.pageH - MARGIN - 6) {
    c.doc.addPage();
    c.y = MARGIN + 4;
  }
}

function writeParagraph(c: Cursor, text: string, opts?: { bold?: boolean; color?: [number, number, number]; size?: number }) {
  c.doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  c.doc.setFontSize(opts?.size ?? 9.5);
  c.doc.setTextColor(...(opts?.color ?? TEXT));
  const lines = c.doc.splitTextToSize(text, c.pageW - MARGIN * 2);
  const lineH = (opts?.size ?? 9.5) * 0.45;
  for (const line of lines) {
    ensureSpace(c, lineH + 1);
    c.doc.text(line, MARGIN, c.y);
    c.y += lineH;
  }
  c.y += 1.5;
}

function sectionTitle(c: Cursor, text: string) {
  ensureSpace(c, 12);
  c.doc.setFillColor(...PANEL_TINT);
  c.doc.rect(MARGIN, c.y - 4.5, c.pageW - MARGIN * 2, 6.5, "F");
  c.doc.setFont("helvetica", "bold");
  c.doc.setFontSize(9.5);
  c.doc.setTextColor(...PETROL_DARK);
  c.doc.text(text, MARGIN + 2, c.y);
  c.y += 6;
}

async function drawPhotos(c: Cursor, entries: any[], perRow: number, maxHeight: number) {
  const photos = entries.flatMap((e) => e.photos ?? []);
  if (!photos.length) return;
  const gap = 3;
  const cellW = (c.pageW - MARGIN * 2 - gap * (perRow - 1)) / perRow;
  let col = 0;
  let rowH = 0;
  for (const p of photos) {
    const img = await loadPhoto(p.url);
    if (!img) continue;
    const ratio = img.height / img.width;
    let w = cellW;
    let h = w * ratio;
    if (h > maxHeight) {
      h = maxHeight;
      w = h / ratio;
    }
    if (col === 0) ensureSpace(c, Math.max(h, maxHeight * 0.5) + 2);
    else if (c.y + h > c.pageH - MARGIN - 6) {
      c.doc.addPage();
      c.y = MARGIN + 4;
      col = 0;
      rowH = 0;
    }
    const x = MARGIN + col * (cellW + gap);
    try {
      c.doc.addImage(img.dataUrl, "JPEG", x, c.y, w, h);
    } catch {
      continue;
    }
    rowH = Math.max(rowH, h);
    col++;
    if (col >= perRow) {
      c.y += rowH + gap;
      col = 0;
      rowH = 0;
    }
  }
  if (col > 0) c.y += rowH + gap;
}

function weatherText(e: any) {
  const parts = [
    e.weatherMorning ? `Manhã: ${WEATHER_LABEL[e.weatherMorning] ?? e.weatherMorning}` : null,
    e.weatherAfternoon ? `Tarde: ${WEATHER_LABEL[e.weatherAfternoon] ?? e.weatherAfternoon}` : null,
  ].filter(Boolean);
  return parts.join("   ·   ");
}

function addFooters(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Diário de Obras · gerado em ${new Date().toLocaleDateString("pt-BR")}`, MARGIN, pageH - 6);
    doc.text(`Página ${i} de ${total}`, pageW - MARGIN, pageH - 6, { align: "right" });
  }
}

function slug(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "obra"
  );
}

/** Desenha UMA entrada (dia) no cursor atual. */
async function drawEntry(c: Cursor, e: any, photosPerRow: number, photoMaxH: number) {
  const total = (e.labor ?? []).reduce((s: number, l: any) => s + l.count, 0);

  ensureSpace(c, 20);
  c.doc.setFont("helvetica", "bold");
  c.doc.setFontSize(11);
  c.doc.setTextColor(...PETROL_DARK);
  c.doc.text(`${isoToBr(e.entryDate)} — ${weekdayName(e.entryDate)}`, MARGIN, c.y);
  c.y += 5;

  const meta = [weatherText(e), e.stageName ? `Etapa: ${e.stageName}` : null, e.userName ? `Registrado por ${e.userName}` : null]
    .filter(Boolean)
    .join("   ·   ");
  if (meta) writeParagraph(c, meta, { size: 8.5 });

  if (e.labor?.length) {
    ensureSpace(c, 16);
    autoTable(c.doc, {
      startY: c.y,
      head: [["Função", "Qtd"]],
      body: [...e.labor.map((l: any) => [l.role, String(l.count)]), ["Total", String(total)]],
      styles: { fontSize: 8.5, cellPadding: 1.6 },
      headStyles: { fillColor: PETROL_LIGHT, textColor: 255 },
      columnStyles: { 1: { halign: "center", cellWidth: 22 } },
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: 90,
      didParseCell: (d) => {
        if (d.section === "body" && d.row.index === e.labor.length) d.cell.styles.fontStyle = "bold";
      },
    });
    c.y = (c.doc as any).lastAutoTable.finalY + 4;
  }

  if (e.equipmentUsed) writeParagraph(c, `Equipamentos: ${e.equipmentUsed}`);
  writeParagraph(c, "Atividades executadas", { bold: true, color: PETROL_DARK });
  writeParagraph(c, e.activities || "—");
  if (e.occurrences) {
    writeParagraph(c, "Ocorrências / observações", { bold: true, color: [146, 64, 14] });
    writeParagraph(c, e.occurrences, { color: [146, 64, 14] });
  }
  if (e.photos?.length) {
    writeParagraph(c, `Fotos (${e.photos.length})`, { bold: true, color: PETROL_DARK });
    await drawPhotos(c, [e], photosPerRow, photoMaxH);
  }
}

/* ------------------------------ PDFs ------------------------------ */

/** PDF de um único dia do diário. */
export async function generateEntryPdf(entry: any, ctx: DiaryPdfContext) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const y = await drawHeader(doc, "DIÁRIO DE OBRAS — REGISTRO DO DIA", ctx);
  const c: Cursor = {
    doc,
    y,
    pageW: doc.internal.pageSize.getWidth(),
    pageH: doc.internal.pageSize.getHeight(),
  };
  await drawEntry(c, entry, 2, 85);
  addFooters(doc);
  doc.save(`diario-${slug(ctx.title)}-${String(entry.entryDate).slice(0, 10)}.pdf`);
}

/** PDF do período: resumo + cada dia (cronológico). */
export async function generatePeriodPdf(
  entries: any[],
  ctx: DiaryPdfContext,
  range: { from: string; to: string },
  opts: { includePhotos: boolean }
) {
  const sorted = [...entries].sort((a, b) => String(a.entryDate).localeCompare(String(b.entryDate)));
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const period =
    range.from && range.to
      ? `Período: ${isoToBr(range.from)} a ${isoToBr(range.to)}`
      : range.from
        ? `A partir de ${isoToBr(range.from)}`
        : range.to
          ? `Até ${isoToBr(range.to)}`
          : "Todos os registros";
  const y = await drawHeader(doc, "DIÁRIO DE OBRAS — RESUMO DO PERÍODO", ctx, period);
  const c: Cursor = {
    doc,
    y,
    pageW: doc.internal.pageSize.getWidth(),
    pageH: doc.internal.pageSize.getHeight(),
  };

  const s = summarizeEntries(sorted);

  sectionTitle(c, "Resumo do período");
  autoTable(doc, {
    startY: c.y,
    body: [
      ["Dias com registro", String(s.daysWithRecord)],
      ["Registros lançados", String(s.recordCount)],
      ["Efetivo médio por dia", s.avgWorkforcePerDay.toFixed(1).replace(".", ",")],
      ["Maior efetivo em um dia", String(s.maxWorkforce)],
      ["Dias com chuva", s.rainyDays.length ? `${s.rainyDays.length} (${s.rainyDays.map(isoToBr).join(", ")})` : "0"],
      ["Dias impraticáveis", s.impracticableDays.length ? `${s.impracticableDays.length} (${s.impracticableDays.map(isoToBr).join(", ")})` : "0"],
      ["Fotos", String(s.photoCount)],
      ["Etapas trabalhadas", s.stages.length ? s.stages.join("; ") : "—"],
    ],
    styles: { fontSize: 9, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, textColor: PETROL_DARK } },
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN },
  });
  c.y = (doc as any).lastAutoTable.finalY + 5;

  if (s.roles.length) {
    sectionTitle(c, "Efetivo por função");
    autoTable(doc, {
      startY: c.y,
      head: [["Função", "Média por dia", "Máximo"]],
      body: s.roles.map((r) => [r.role, r.avgPerDay.toFixed(1).replace(".", ","), String(r.max)]),
      styles: { fontSize: 8.5, cellPadding: 1.6 },
      headStyles: { fillColor: PETROL_LIGHT, textColor: 255 },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "center" } },
      margin: { left: MARGIN, right: MARGIN },
    });
    c.y = (doc as any).lastAutoTable.finalY + 5;
  }

  if (s.occurrences.length) {
    sectionTitle(c, "Ocorrências do período");
    for (const o of s.occurrences) {
      writeParagraph(c, `${isoToBr(o.date)}: ${o.text}`, { color: [146, 64, 14] });
    }
    c.y += 2;
  }

  if (!sorted.length) {
    writeParagraph(c, "Nenhum registro no período selecionado.");
  } else {
    sectionTitle(c, "Registros dia a dia");
    c.y += 2;
    for (const e of sorted) {
      await drawEntry(c, opts.includePhotos ? e : { ...e, photos: [] }, 3, 55);
      c.y += 3;
      ensureSpace(c, 4);
      c.doc.setDrawColor(200, 200, 200);
      c.doc.setLineWidth(0.2);
      c.doc.line(MARGIN, c.y, c.pageW - MARGIN, c.y);
      c.y += 5;
    }
  }

  addFooters(doc);
  const tag = range.from && range.to ? `${range.from}_a_${range.to}` : "periodo";
  doc.save(`diario-resumo-${slug(ctx.title)}-${tag}.pdf`);
}
