import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { parseBudgetWorkbook, type ParsedSheet, type SheetItem } from "@/lib/budgetSheetParser";

type Candidate = {
  compositionId: number; score: number; byCode: boolean; code: string | null;
  description: string; unit: string; materialCost: number; laborCost: number; equipmentCost: number;
};
// "c:<id>" = composição da plataforma | "s" = serviço com preço da planilha
type Choice = string;

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const sheetUnit = (i: SheetItem) => i.matUnit + i.laborUnit + i.equipUnit;

/**
 * Importa uma planilha Excel (capítulos + itens) para um ORÇAMENTO NOVO.
 * Fluxo: escolher arquivo → conferir (composição sugerida por linha) → criar.
 * Nunca altera orçamentos existentes.
 */
export default function ImportBudgetSheetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [cands, setCands] = useState<Record<string, Candidate[]>>({});
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [params, setParams] = useState({ socialCharges: "0", adminCentral: "0", risk: "0", warranty: "0", profit: "0", taxes: "0" });
  const [busy, setBusy] = useState(false);

  const { data: clients } = trpc.clients.list.useQuery(undefined, { enabled: open });
  const matchItems = trpc.budgetImport.matchItems.useMutation();
  const importBudget = trpc.budgetImport.importBudget.useMutation();
  const utils = trpc.useUtils();

  function reset() {
    setParsed(null); setCands({}); setChoice({}); setTitle(""); setClientId(""); setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const p = parseBudgetWorkbook(await file.arrayBuffer());
      if (p.items.length === 0) throw new Error("Nenhum item encontrado na planilha.");
      const res = await matchItems.mutateAsync({
        items: p.items.map((i) => ({ key: i.key, code: i.code || null, description: i.description, unit: i.unit })),
      });
      const cm: Record<string, Candidate[]> = {};
      const ch: Record<string, Choice> = {};
      for (const r of res as any[]) {
        cm[r.key] = r.candidates;
        const it = p.items.find((x) => x.key === r.key)!;
        const best = r.candidates[0] as Candidate | undefined;
        if (best && (best.byCode || best.score >= 0.75)) ch[r.key] = `c:${best.compositionId}`;
        else if (sheetUnit(it) > 0) ch[r.key] = "s";
        else if (best && best.score >= 0.55) ch[r.key] = `c:${best.compositionId}`;
        else ch[r.key] = "s";
      }
      setParsed(p); setCands(cm); setChoice(ch);
      setTitle(p.title.slice(0, 200));
      const pr = p.params;
      setParams({
        socialCharges: String(pr.socialCharges ?? 0), adminCentral: String(pr.adminCentral ?? 0),
        risk: String(pr.risk ?? 0), warranty: String(pr.warranty ?? 0),
        profit: String(pr.profit ?? 0), taxes: String(pr.taxes ?? 0),
      });
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível ler a planilha");
      reset();
    } finally {
      setBusy(false);
    }
  }

  // custo unitário efetivo da escolha atual de uma linha
  function unitCostOf(it: SheetItem): { cost: number; kind: "comp" | "svc" | "blank" } {
    const ch = choice[it.key];
    if (ch?.startsWith("c:")) {
      const id = Number(ch.slice(2));
      const c = (cands[it.key] || []).find((x) => x.compositionId === id);
      if (c) return { cost: c.materialCost + c.laborCost + c.equipmentCost, kind: "comp" };
    }
    const sp = sheetUnit(it);
    return { cost: sp, kind: sp > 0 ? "svc" : "blank" };
  }

  const summary = useMemo(() => {
    if (!parsed) return null;
    let comp = 0, svc = 0, blank = 0, platform = 0, sheet = 0;
    for (const it of parsed.items) {
      const u = unitCostOf(it);
      if (u.kind === "comp") comp++; else if (u.kind === "svc") svc++; else blank++;
      platform += u.cost * it.quantity;
      sheet += sheetUnit(it) * it.quantity;
    }
    return { comp, svc, blank, platform, sheet };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, choice, cands]);

  async function handleCreate() {
    if (!parsed) return;
    if (!title.trim()) { toast.error("Informe o nome do orçamento"); return; }
    setBusy(true);
    try {
      const stages = parsed.stages.map((s, si) => ({
        name: s.name,
        parentIndex: s.parentIndex,
        items: parsed.items.filter((i) => i.stageIdx === si).map((it) => {
          const ch = choice[it.key];
          const compId = ch?.startsWith("c:") ? Number(ch.slice(2)) : null;
          return {
            description: it.description,
            unit: it.unit,
            quantity: it.quantity,
            compositionId: compId,
            materialCost: it.matUnit, laborCost: it.laborUnit, equipmentCost: it.equipUnit,
            needsReview: compId === null && sheetUnit(it) <= 0,
          };
        }),
      }));
      const n = (v: string) => Number(String(v).replace(",", ".")) || 0;
      const r = await importBudget.mutateAsync({
        title: title.trim(),
        clientId: clientId ? Number(clientId) : undefined,
        params: {
          socialCharges: n(params.socialCharges), adminCentral: n(params.adminCentral), risk: n(params.risk),
          warranty: n(params.warranty), profit: n(params.profit), taxes: n(params.taxes),
        },
        stages,
      });
      utils.budgets.list.invalidate();
      toast.success(`Orçamento ${r.code} criado: ${r.compositions} composições, ${r.services} serviços (${r.pending} para conferir)`);
      onOpenChange(false);
      reset();
      setLocation(`/budgets/${r.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar o orçamento");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[96vw] w-[96vw] h-[94vh] max-h-[94vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Importar orçamento de planilha Excel</DialogTitle>
          <DialogDescription>
            Cria um orçamento NOVO com as etapas e os itens da planilha. Confira abaixo a composição escolhida para cada linha antes de criar.
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 border-2 border-dashed rounded-lg">
            {busy ? (
              <><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><p className="text-sm text-muted-foreground">Lendo a planilha e buscando composições…</p></>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Escolha o arquivo .xlsx. A planilha precisa ter as colunas Item, Descrição, Un e Qtd (Código e preços unitários são opcionais).
                  Se houver uma aba "Premissas", os parâmetros de BDI são preenchidos.
                </p>
                <Button onClick={() => fileRef.current?.click()}>Escolher planilha</Button>
              </>
            )}
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="shrink-0 grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="md:col-span-3 space-y-1">
                <Label>Nome do orçamento</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="md:col-span-3 space-y-1">
                <Label>Cliente (opcional)</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">— sem cliente —</option>
                  {(clients as any[] | undefined)?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {([
                ["socialCharges", "Encargos %"], ["adminCentral", "Adm. central %"], ["risk", "Risco %"],
                ["warranty", "Garantia %"], ["profit", "Lucro %"], ["taxes", "Impostos %"],
              ] as const).map(([k, label]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input className="h-8" value={(params as any)[k]} onChange={(e) => setParams((p) => ({ ...p, [k]: e.target.value }))} />
                </div>
              ))}
            </div>

            {summary && (
              <div className="shrink-0 text-xs rounded-md bg-muted px-3 py-2 flex flex-wrap gap-x-5 gap-y-1">
                <span><b>{parsed.stages.length}</b> etapas · <b>{parsed.items.length}</b> itens</span>
                <span className="text-green-700"><b>{summary.comp}</b> com composição da plataforma</span>
                <span className="text-blue-700"><b>{summary.svc}</b> serviço c/ preço da planilha</span>
                <span className="text-amber-700"><b>{summary.blank}</b> sem preço (entram a R$ 0,00 marcados CONFERIR)</span>
                <span>Custo direto s/ BDI: plataforma <b>{brl(summary.platform)}</b> · planilha <b>{brl(summary.sheet)}</b></span>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background border-b z-10">
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2 w-12">Item</th>
                    <th className="p-2">Linha da planilha</th>
                    <th className="p-2 w-24 text-right">Qtd</th>
                    <th className="p-2 w-[42%]">O que entra no orçamento</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.stages.map((st, si) => (
                    <FragmentRows key={si} stageName={st.name} stageNo={st.itemNo}
                      items={parsed.items.filter((i) => i.stageIdx === si)}
                      cands={cands} choice={choice}
                      onChoice={(k, v) => setChoice((c) => ({ ...c, [k]: v }))} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0">
          {parsed && <Button variant="ghost" onClick={reset} disabled={busy}>Trocar planilha</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          {parsed && (
            <Button onClick={handleCreate} disabled={busy}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando…</> : "Criar orçamento"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FragmentRows({ stageName, stageNo, items, cands, choice, onChoice }: {
  stageName: string; stageNo: string; items: SheetItem[];
  cands: Record<string, Candidate[]>; choice: Record<string, Choice>;
  onChoice: (key: string, v: Choice) => void;
}) {
  return (
    <>
      <tr className="bg-slate-800 text-white">
        <td className="p-2 font-semibold">{stageNo}</td>
        <td className="p-2 font-semibold" colSpan={3}>{stageName}</td>
      </tr>
      {items.map((it) => {
        const cs = cands[it.key] || [];
        const ch = choice[it.key] || "s";
        const sp = sheetUnit(it);
        const isComp = ch.startsWith("c:");
        const blank = !isComp && sp <= 0;
        return (
          <tr key={it.key} className={blank ? "bg-amber-50" : "border-b"}>
            <td className="p-2 align-top text-muted-foreground">{it.itemNo}</td>
            <td className="p-2 align-top">
              <div>{it.description}</div>
              {it.code && <div className="text-[10px] text-muted-foreground">Cód. {it.code}</div>}
            </td>
            <td className="p-2 align-top text-right whitespace-nowrap">{it.quantity.toLocaleString("pt-BR")} {it.unit}</td>
            <td className="p-2 align-top">
              <select
                className={`w-full rounded-md border px-1 py-1 text-xs ${isComp ? "border-green-400 bg-green-50" : blank ? "border-amber-400 bg-amber-100" : "border-blue-300 bg-blue-50"}`}
                value={ch}
                onChange={(e) => onChoice(it.key, e.target.value)}
              >
                {cs.map((c) => (
                  <option key={c.compositionId} value={`c:${c.compositionId}`}>
                    {c.byCode ? "[código] " : `[${Math.round(c.score * 100)}%] `}{c.code ? `${c.code} — ` : ""}{c.description.slice(0, 90)} · {c.unit} · {brl(c.materialCost + c.laborCost + c.equipmentCost)}
                  </option>
                ))}
                <option value="s">{sp > 0 ? `Serviço com preço da planilha · ${brl(sp)}/${it.unit}` : "Serviço sem preço (R$ 0,00 — CONFERIR)"}</option>
              </select>
              {isComp && sp > 0 && (
                <div className="text-[10px] text-muted-foreground mt-0.5">Planilha: {brl(sp)}/{it.unit}</div>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
