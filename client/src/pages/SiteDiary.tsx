import { useState } from "react";
import { useParams, Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import DiaryEntriesPanel from "@/components/DiaryEntriesPanel";
import DiaryEntryDialog, { type DiaryEntryPayload } from "@/components/DiaryEntryDialog";
import FieldDiaryAccessCard from "@/components/FieldDiaryAccessCard";
import ClientDiaryAccessCard from "@/components/ClientDiaryAccessCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, Plus } from "lucide-react";

/**
 * Diário de Obras de um ORÇAMENTO em execução (/budgets/:id/diario).
 * Os acessos (login de campo e do cliente) também são geridos aqui.
 */
export default function SiteDiary() {
  const { id } = useParams();
  const budgetId = Number(id);
  const utils = trpc.useUtils();

  // O diário só vale para orçamentos em execução (ver isBudgetInExecution no servidor).
  const { data: diaryStatus, isLoading: statusLoading } = trpc.siteDiary.status.useQuery({ budgetId });
  const inExecution = !!diaryStatus?.inExecution;
  const { data: entries, isLoading } = trpc.siteDiary.list.useQuery({ budgetId }, { enabled: inExecution });
  const { data: stages } = trpc.siteDiary.listStages.useQuery({ budgetId }, { enabled: inExecution });

  const [formOpen, setFormOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  const createEntry = trpc.siteDiary.create.useMutation({
    onSuccess: () => {
      toast.success("Registro salvo");
      setFormOpen(false);
      utils.siteDiary.list.invalidate({ budgetId });
    },
    onError: (err) => toast.error(err.message || "Erro ao salvar registro"),
  });

  const deleteEntry = trpc.siteDiary.delete.useMutation({
    onSuccess: () => {
      toast.success("Registro excluído");
      utils.siteDiary.list.invalidate({ budgetId });
    },
    onError: (err) => toast.error(err.message || "Erro ao excluir"),
  });

  const [editing, setEditing] = useState<any | null>(null);

  const updateEntry = trpc.siteDiary.update.useMutation({
    onSuccess: () => {
      toast.success("Registro atualizado");
      setEditing(null);
      utils.siteDiary.list.invalidate({ budgetId });
    },
    onError: (err) => toast.error(err.message || "Erro ao atualizar registro"),
  });

  function handleSubmit(payload: DiaryEntryPayload) {
    if (editing) {
      updateEntry.mutate({ entryId: editing.id, ...payload, removePhotoIds: payload.removePhotoIds ?? [] });
    } else {
      createEntry.mutate({ budgetId, ...payload });
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-4 pb-24">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/budgets">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">Diário de Obras</h1>
              <p className="text-sm text-muted-foreground truncate">{diaryStatus?.title}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAccessOpen(true)}>
            <KeyRound className="h-4 w-4 mr-1" /> Acessos
          </Button>
        </div>

        {!statusLoading && !inExecution && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              O Diário de Obras só está disponível para orçamentos <strong>em execução</strong>. Mude o status
              deste orçamento para "Em execução" para liberar.
            </CardContent>
          </Card>
        )}

        {inExecution && (
          <DiaryEntriesPanel
            entries={entries}
            isLoading={isLoading}
            pdfContext={{
              title: diaryStatus?.title ?? "Obra",
              subtitle: [diaryStatus?.clientName, diaryStatus?.projectName].filter(Boolean).join(" · ") || undefined,
            }}
            onEdit={setEditing}
            onDelete={(entryId) => deleteEntry.mutate({ id: entryId })}
            emptyMessage="Nenhum registro ainda. Toque no botão + para criar o primeiro."
          />
        )}
      </div>

      {/* FAB */}
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
        open={formOpen || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setFormOpen(false);
            setEditing(null);
          }
        }}
        entry={editing}
        stages={stages as any}
        isPending={createEntry.isPending || updateEntry.isPending}
        onSubmit={handleSubmit}
      />

      <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Acessos ao Diário de Obras</DialogTitle>
            <DialogDescription>
              Quem pode alimentar (campo) e quem pode acompanhar (cliente) o diário deste orçamento.
            </DialogDescription>
          </DialogHeader>

          <FieldDiaryAccessCard budgetId={budgetId} />

          {diaryStatus?.clientId ? (
            <ClientDiaryAccessCard clientId={diaryStatus.clientId} budgetId={budgetId} clientName={diaryStatus.clientName ?? undefined} />
          ) : (
            <p className="text-sm text-muted-foreground border-t pt-4">
              Este orçamento não tem cliente cadastrado. Defina o cliente no orçamento para liberar o acesso dele ao diário.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
