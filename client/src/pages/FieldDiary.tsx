import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import DiaryEntryCard from "@/components/DiaryEntryCard";
import DiaryEntryDialog, { type DiaryEntryPayload } from "@/components/DiaryEntryDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BookOpen, LogOut, Plus } from "lucide-react";

/**
 * Diário de Obras para o pessoal de campo (mestre/encarregado). Login por
 * obra: só enxerga e lança no diário da própria obra. Não tem acesso a
 * orçamentos, outras obras nem a exclusão de registros.
 */
export default function FieldDiary() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: me, error: meError } = trpc.fieldDiary.me.useQuery(undefined, { retry: false });
  const inExecution = !!me?.inExecution;
  const { data: entries, isLoading } = trpc.fieldDiary.list.useQuery(undefined, { retry: false, enabled: inExecution });
  const { data: stages } = trpc.fieldDiary.listStages.useQuery(undefined, { retry: false, enabled: inExecution });

  const [formOpen, setFormOpen] = useState(false);

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
    setLocation("/campo/login");
  }

  function handleSubmit(payload: DiaryEntryPayload) {
    createEntry.mutate(payload);
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold leading-tight">Diário de Obras</div>
            {me?.budgetTitle && <div className="text-xs text-muted-foreground truncate">{me.budgetTitle}</div>}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-1" /> Sair
        </Button>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-3 pb-24">
        {me && !inExecution && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              O Diário de Obras desta obra está indisponível no momento (a obra não está em execução).
              Fale com o escritório.
            </CardContent>
          </Card>
        )}

        {inExecution && isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {inExecution && !isLoading && (!entries || entries.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum registro ainda. Toque no botão + para criar o primeiro.
            </CardContent>
          </Card>
        )}

        {entries?.map((entry: any) => (
          <DiaryEntryCard key={entry.id} entry={entry} />
        ))}
      </div>

      {inExecution && (
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
