import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import DiaryEntryCard from "@/components/DiaryEntryCard";
import DiaryEntryDialog, { type DiaryEntryPayload } from "@/components/DiaryEntryDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeftRight, BookOpen, ChevronRight, HardHat, LogOut, MapPin, Plus } from "lucide-react";

const LAST_BUDGET_KEY = "field-diary:last-budget";

function readLastBudget(): number | null {
  try {
    const v = localStorage.getItem(LAST_BUDGET_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function saveLastBudget(id: number | null) {
  try {
    if (id) localStorage.setItem(LAST_BUDGET_KEY, String(id));
    else localStorage.removeItem(LAST_BUDGET_KEY);
  } catch {
    // sem storage — só não lembra a última obra
  }
}

/**
 * Diário de Obras para o pessoal de campo (mestre/encarregado). Um login pode
 * ter várias obras: se tiver só uma, abre direto; se tiver mais, mostra o
 * seletor de obra (e o botão "Trocar obra" no topo). O servidor revalida o
 * vínculo com a obra em toda chamada. Não acessa orçamentos nem exclui registros.
 */
export default function FieldDiary() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: me, error: meError } = trpc.fieldDiary.me.useQuery(undefined, { retry: false });
  const { data: budgets, isLoading: budgetsLoading } = trpc.fieldDiary.listBudgets.useQuery(undefined, {
    retry: false,
    enabled: !!me,
  });

  const [pickedId, setPickedId] = useState<number | null>(() => readLastBudget());
  const [formOpen, setFormOpen] = useState(false);

  // Obra efetiva: a escolhida (se ainda for válida) ou a única disponível.
  const selected =
    budgets?.find((b: any) => b.id === pickedId) ?? (budgets?.length === 1 ? budgets[0] : null);
  const selectedId: number | null = selected?.id ?? null;

  const { data: entries, isLoading } = trpc.fieldDiary.list.useQuery(
    { budgetId: selectedId! },
    { retry: false, enabled: selectedId != null }
  );
  const { data: stages } = trpc.fieldDiary.listStages.useQuery(
    { budgetId: selectedId! },
    { retry: false, enabled: selectedId != null }
  );

  useEffect(() => {
    if (meError) setLocation("/campo/login");
  }, [meError, setLocation]);

  const createEntry = trpc.fieldDiary.create.useMutation({
    onSuccess: () => {
      toast.success("Registro salvo");
      setFormOpen(false);
      utils.fieldDiary.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Erro ao salvar registro"),
  });

  async function handleLogout() {
    await fetch("/api/field-diary/logout", { method: "POST", credentials: "include" });
    saveLastBudget(null);
    setLocation("/campo/login");
  }

  function pickBudget(id: number | null) {
    setPickedId(id);
    saveLastBudget(id);
  }

  function handleSubmit(payload: DiaryEntryPayload) {
    if (selectedId == null) return;
    createEntry.mutate({ ...payload, budgetId: selectedId });
  }

  const hasMany = (budgets?.length ?? 0) > 1;
  const showPicker = !!budgets && budgets.length > 1 && !selected;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold leading-tight">Diário de Obras</div>
            {selected && <div className="text-xs text-muted-foreground truncate">{selected.title}</div>}
            {!selected && me && (
              <div className="text-xs text-muted-foreground truncate">{me.name || me.username}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasMany && selected && (
            <Button variant="outline" size="sm" onClick={() => pickBudget(null)}>
              <ArrowLeftRight className="h-4 w-4 mr-1" /> Trocar obra
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-3 pb-24">
        {budgetsLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

        {budgets && budgets.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma obra em execução disponível para o seu acesso no momento. Fale com o escritório.
            </CardContent>
          </Card>
        )}

        {showPicker && (
          <>
            <div className="flex items-center gap-2 text-sm font-medium">
              <HardHat className="h-4 w-4" /> Em qual obra você quer lançar?
            </div>
            {budgets!.map((b: any) => (
              <Card
                key={b.id}
                className="cursor-pointer hover:bg-accent/40 transition-colors"
                onClick={() => pickBudget(b.id)}
              >
                <CardContent className="py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{b.title}</div>
                    {(b.projectName || b.location) && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {[b.projectName, b.location].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </>
        )}

        {selected && isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {selected && !isLoading && (!entries || entries.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum registro ainda. Toque no botão + para criar o primeiro.
            </CardContent>
          </Card>
        )}

        {selected && entries?.map((entry: any) => <DiaryEntryCard key={entry.id} entry={entry} />)}
      </div>

      {selected && (
        <Button
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40"
          onClick={() => setFormOpen(true)}
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      <DiaryEntryDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        stages={stages as any}
        isPending={createEntry.isPending}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
