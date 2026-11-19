import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const brDate = (d: string) => String(d).slice(0, 10).split("-").reverse().join("/");
const daysLabel = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function monthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: iso(start), to: iso(end) };
}

/**
 * Relatório de dias trabalhados por funcionário (a partir do Diário de Obras).
 * Pode ser fixo numa obra (aberto de dentro do diário) ou ter seletor de obra
 * (aberto do hub /diarios, "Todas as obras" por padrão).
 */
export function WorkedDaysReportDialog({
  open,
  onOpenChange,
  fixedBudgetId,
  fixedBudgetTitle,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fixedBudgetId?: number;
  fixedBudgetTitle?: string;
}) {
  const initial = monthRange(0);
  const [budgetSel, setBudgetSel] = useState<string>("all");
  const [workerSel, setWorkerSel] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);

  const { data: workers } = trpc.siteDiary.listWorkers.useQuery(undefined, { enabled: open });
  const { data: budgets } = trpc.siteDiary.listExecutingBudgets.useQuery(undefined, { enabled: open && !fixedBudgetId });

  const budgetId = fixedBudgetId ?? (budgetSel === "all" ? null : Number(budgetSel));
  const { data: rows, isLoading } = trpc.siteDiary.workedDaysReport.useQuery(
    {
      budgetId,
      workerId: workerSel === "all" ? null : Number(workerSel),
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    },
    { enabled: open }
  );

  const summary = useMemo(() => {
    const map = new Map<number, { workerId: number; name: string; role: string | null; rate: number | null; days: number; items: any[] }>();
    for (const r of (rows as any[]) || []) {
      const cur = map.get(r.workerId) ?? { workerId: r.workerId, name: r.workerName, role: r.workerRole, rate: r.dailyRate, days: 0, items: [] as any[] };
      cur.days += r.fraction;
      cur.items.push(r);
      map.set(r.workerId, cur);
    }
    return Array.from(map.values())
      .map((s) => ({ ...s, total: s.rate != null ? s.days * s.rate : null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const totalDays = summary.reduce((s, x) => s + x.days, 0);
  const totalPay = summary.reduce((s, x) => s + (x.total ?? 0), 0);
  const missingRate = summary.some((s) => s.rate == null);

  function exportExcel() {
    if (!summary.length) {
      toast.error("Nada para exportar neste filtro");
      return;
    }
    const resumo = summary.map((s) => ({
      Funcionário: s.name,
      Função: s.role || "",
      "Dias trabalhados": s.days,
      "Diária (R$)": s.rate ?? "",
      "Total a pagar (R$)": s.total ?? "",
    }));
    resumo.push({ Funcionário: "TOTAL", Função: "", "Dias trabalhados": totalDays, "Diária (R$)": "", "Total a pagar (R$)": totalPay } as any);
    const detalhe = ((rows as any[]) || []).map((r) => ({
      Data: brDate(r.entryDate),
      Funcionário: r.workerName,
      Função: r.workerRole || "",
      Obra: r.budgetTitle,
      Período: r.fraction === 1 ? "Dia inteiro" : "Meio dia",
      Dias: r.fraction,
    }));
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(resumo);
    ws1["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 20 }];
    const ws2 = XLSX.utils.json_to_sheet(detalhe);
    ws2["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Resumo");
    XLSX.utils.book_append_sheet(wb, ws2, "Detalhado");
    XLSX.writeFile(wb, `dias-trabalhados_${dateFrom || "inicio"}_${dateTo || "fim"}.xlsx`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dias trabalhados</DialogTitle>
          <DialogDescription>
            {fixedBudgetTitle ? `Obra: ${fixedBudgetTitle}. ` : ""}Calculado a partir dos funcionários marcados no Diário de Obras.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {!fixedBudgetId && (
            <div className="space-y-1">
              <Label className="text-xs">Obra</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={budgetSel} onChange={(e) => setBudgetSel(e.target.value)}>
                <option value="all">Todas as obras</option>
                {(budgets as any[] | undefined)?.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Funcionário</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={workerSel} onChange={(e) => setWorkerSel(e.target.value)}>
              <option value="all">Todos</option>
              {(workers as any[] | undefined)?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" className="h-9" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" className="h-9" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { const r = monthRange(0); setDateFrom(r.from); setDateTo(r.to); }}>Este mês</Button>
          <Button variant="outline" size="sm" onClick={() => { const r = monthRange(-1); setDateFrom(r.from); setDateTo(r.to); }}>Mês passado</Button>
          <Button variant="outline" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>Todo o período</Button>
          <div className="flex-1" />
          <Button size="sm" onClick={exportExcel} disabled={!summary.length}>
            <Download className="h-4 w-4 mr-1" /> Exportar Excel
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : !summary.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum dia trabalhado neste filtro. Marque os funcionários presentes ao lançar o diário do dia.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Funcionário</th>
                    <th className="text-left p-2">Função</th>
                    <th className="text-right p-2">Dias</th>
                    <th className="text-right p-2">Diária</th>
                    <th className="text-right p-2">A pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.workerId} className="border-t align-top">
                      <td className="p-2">
                        <details>
                          <summary className="cursor-pointer font-medium">{s.name}</summary>
                          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            {s.items.map((it: any, i: number) => (
                              <li key={i}>
                                {brDate(it.entryDate)} — {it.fraction === 1 ? "dia inteiro" : "meio dia"}
                                {!fixedBudgetId && it.budgetTitle ? ` · ${it.budgetTitle}` : ""}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </td>
                      <td className="p-2 text-muted-foreground">{s.role || "—"}</td>
                      <td className="p-2 text-right font-medium">{daysLabel(s.days)}</td>
                      <td className="p-2 text-right">{s.rate != null ? brl(s.rate) : "—"}</td>
                      <td className="p-2 text-right font-semibold">{s.total != null ? brl(s.total) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td className="p-2" colSpan={2}>Total</td>
                    <td className="p-2 text-right">{daysLabel(totalDays)}</td>
                    <td className="p-2" />
                    <td className="p-2 text-right">{brl(totalPay)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {missingRate && (
              <p className="text-xs text-amber-700">
                Alguns funcionários estão sem diária cadastrada (—). Informe o valor em "Funcionários" para calcular o total a pagar.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Clique no nome para ver os dias. Se o mesmo funcionário aparece em mais de um registro no mesmo dia e na mesma obra, o dia é contado uma vez só.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type WorkerRow = { id: number; name: string; role: string | null; dailyRate: string | number | null; active: number | boolean };

/** Cadastro único de funcionários: nome, função, diária e ativo/inativo. */
export function WorkersManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: workers, isLoading } = trpc.siteDiary.listWorkers.useQuery(undefined, { enabled: open });
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newRate, setNewRate] = useState("");

  const createWorker = trpc.siteDiary.createWorker.useMutation({
    onSuccess: () => {
      setNewName(""); setNewRole(""); setNewRate("");
      utils.siteDiary.listWorkers.invalidate();
      toast.success("Funcionário cadastrado");
    },
    onError: (e) => toast.error(e.message || "Erro ao cadastrar"),
  });
  const updateWorker = trpc.siteDiary.updateWorker.useMutation({
    onSuccess: () => {
      utils.siteDiary.listWorkers.invalidate();
      utils.siteDiary.workedDaysReport.invalidate();
      toast.success("Funcionário atualizado");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar"),
  });

  const parseRate = (v: string) => {
    const n = Number(String(v).replace(",", "."));
    return v.trim() === "" || Number.isNaN(n) ? null : n;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Funcionários</DialogTitle>
          <DialogDescription>
            Cadastro único da empresa — vale para todas as obras. A diária é usada no relatório de dias trabalhados.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_8rem_7rem_auto] gap-2 items-end">
          <div className="space-y-1"><Label className="text-xs">Nome</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Função</Label><Input value={newRole} onChange={(e) => setNewRole(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Diária (R$)</Label><Input inputMode="decimal" value={newRate} onChange={(e) => setNewRate(e.target.value)} /></div>
          <Button
            onClick={() => newName.trim() ? createWorker.mutate({ name: newName.trim(), role: newRole.trim() || null, dailyRate: parseRate(newRate) }) : toast.error("Digite o nome")}
            disabled={createWorker.isPending}
          >
            <Plus className="h-4 w-4 mr-1" /> Cadastrar
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
        ) : !(workers as any[])?.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum funcionário cadastrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {(workers as WorkerRow[]).map((w) => (
              <WorkerEditRow key={w.id} worker={w} pending={updateWorker.isPending} onSave={(data) => updateWorker.mutate({ id: w.id, ...data })} parseRate={parseRate} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WorkerEditRow({
  worker,
  onSave,
  pending,
  parseRate,
}: {
  worker: WorkerRow;
  onSave: (d: { name: string; role: string | null; dailyRate: number | null; active: boolean }) => void;
  pending: boolean;
  parseRate: (v: string) => number | null;
}) {
  const [name, setName] = useState(worker.name);
  const [role, setRole] = useState(worker.role || "");
  const [rate, setRate] = useState(worker.dailyRate == null ? "" : String(worker.dailyRate));
  const [active, setActive] = useState(!!Number(worker.active));
  const dirty =
    name !== worker.name || role !== (worker.role || "") || rate !== (worker.dailyRate == null ? "" : String(worker.dailyRate)) || active !== !!Number(worker.active);

  return (
    <div className={`grid grid-cols-[1fr_8rem_7rem_auto_auto] gap-2 items-center ${active ? "" : "opacity-60"}`}>
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Função" />
      <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Diária" />
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativo
      </label>
      <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || pending || !name.trim()} onClick={() => onSave({ name: name.trim(), role: role.trim() || null, dailyRate: parseRate(rate), active })}>
        Salvar
      </Button>
    </div>
  );
}
