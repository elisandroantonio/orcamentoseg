import { useMemo, useState } from "react";
import DiaryEntryCard from "@/components/DiaryEntryCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  generateEntryPdf,
  generatePeriodPdf,
  isoToBr,
  summarizeEntries,
  type DiaryPdfContext,
} from "@/lib/diaryPdf";
import { CalendarDays, ChevronLeft, ChevronRight, FileDown, Loader2 } from "lucide-react";

/* ---- helpers de data (strings YYYY-MM-DD, sem fuso) ---- */
function toIso(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function fromIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso: string, n: number) {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}
/** Segunda-feira da semana da data. */
function mondayOf(iso: string) {
  const d = fromIso(iso);
  const diff = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - diff);
  return toIso(d);
}

/**
 * Lista do diário com filtro por datas (atalhos de semana), resumo do período
 * e PDF — por dia (ícone em cada card) e do período filtrado. Usado pela
 * equipe, pelo login de campo e pelo portal do cliente.
 */
export default function DiaryEntriesPanel({
  entries,
  isLoading,
  pdfContext,
  onEdit,
  onDelete,
  canEdit,
  emptyMessage,
}: {
  entries?: any[];
  isLoading?: boolean;
  pdfContext: DiaryPdfContext;
  onEdit?: (entry: any) => void;
  onDelete?: (id: number) => void;
  /** Permite decidir por entrada se mostra o lápis (login de campo). */
  canEdit?: (entry: any) => boolean;
  emptyMessage?: string;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showSummary, setShowSummary] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = (entries ?? []).filter((e) => {
      const d = String(e.entryDate).slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    return list.sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)));
  }, [entries, from, to]);

  const summary = useMemo(() => summarizeEntries(filtered), [filtered]);
  const hasFilter = !!(from || to);

  function setWeek(mondayIso: string) {
    setFrom(mondayIso);
    setTo(addDays(mondayIso, 6));
  }
  function thisWeek() {
    setWeek(mondayOf(toIso(new Date())));
  }
  function shiftWeek(delta: number) {
    const base = from ? mondayOf(from) : mondayOf(toIso(new Date()));
    setWeek(addDays(base, delta * 7));
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível gerar o PDF");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="py-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => shiftWeek(-1)} title="Semana anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={thisWeek}>
              <CalendarDays className="h-4 w-4 mr-1" /> Esta semana
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => shiftWeek(1)} title="Próxima semana">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {hasFilter && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                Limpar filtro
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {hasFilter
                ? `${filtered.length} registro(s) · ${from ? isoToBr(from) : "início"} a ${to ? isoToBr(to) : "hoje"}`
                : `${filtered.length} registro(s) no total`}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={busy !== null || !filtered.length}
              onClick={() =>
                run("period", () => generatePeriodPdf(filtered, pdfContext, { from, to }, { includePhotos }))
              }
            >
              {busy === "period" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
              PDF do período
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4 text-xs">
            <label className="flex items-center gap-2">
              <Switch checked={showSummary} onCheckedChange={setShowSummary} /> Mostrar resumo
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={includePhotos} onCheckedChange={setIncludePhotos} /> Fotos no PDF
            </label>
          </div>
        </CardContent>
      </Card>

      {showSummary && filtered.length > 0 && (
        <Card>
          <CardContent className="py-3 space-y-2 text-sm">
            <div className="font-semibold">Resumo {hasFilter ? "do período" : "geral"}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Dias com registro</span>
              <span className="font-medium">{summary.daysWithRecord}</span>
              <span className="text-muted-foreground">Efetivo médio/dia</span>
              <span className="font-medium">{summary.avgWorkforcePerDay.toFixed(1).replace(".", ",")}</span>
              <span className="text-muted-foreground">Maior efetivo</span>
              <span className="font-medium">{summary.maxWorkforce}</span>
              <span className="text-muted-foreground">Dias de chuva</span>
              <span className="font-medium">{summary.rainyDays.length}</span>
              <span className="text-muted-foreground">Dias impraticáveis</span>
              <span className="font-medium">{summary.impracticableDays.length}</span>
              <span className="text-muted-foreground">Fotos</span>
              <span className="font-medium">{summary.photoCount}</span>
            </div>
            {!!summary.stages.length && (
              <p className="text-xs">
                <span className="text-muted-foreground">Etapas trabalhadas: </span>
                {summary.stages.join("; ")}
              </p>
            )}
            {!!summary.roles.length && (
              <p className="text-xs">
                <span className="text-muted-foreground">Efetivo por função (média/dia): </span>
                {summary.roles.map((r) => `${r.role} ${r.avgPerDay.toFixed(1).replace(".", ",")}`).join(" · ")}
              </p>
            )}
            {!!summary.occurrences.length && (
              <div className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                <div className="font-medium">Ocorrências</div>
                {summary.occurrences.map((o, i) => (
                  <div key={i}>
                    {isoToBr(o.date)}: {o.text}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {hasFilter ? "Nenhum registro neste período." : (emptyMessage ?? "Nenhum registro ainda.")}
          </CardContent>
        </Card>
      )}

      {filtered.map((entry) => (
        <DiaryEntryCard
          key={entry.id}
          entry={entry}
          onEdit={onEdit && (!canEdit || canEdit(entry)) ? onEdit : undefined}
          onDelete={onDelete}
          onPdf={(e) => run(`entry-${e.id}`, () => generateEntryPdf(e, pdfContext))}
          pdfBusy={busy === `entry-${entry.id}`}
        />
      ))}
    </div>
  );
}
