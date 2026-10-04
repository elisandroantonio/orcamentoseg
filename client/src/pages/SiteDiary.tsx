import { useState } from "react";
import { useParams, Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import DiaryEntryCard from "@/components/DiaryEntryCard";
import DiaryEntryDialog, { type DiaryEntryPayload } from "@/components/DiaryEntryDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";

export default function SiteDiary() {
  const { id } = useParams();
  const projectId = Number(id);
  const utils = trpc.useUtils();

  const { data: project } = trpc.projects.get.useQuery({ id: projectId });
  // O diário só vale para obras em execução (ver isProjectInExecution no servidor).
  const { data: diaryStatus, isLoading: statusLoading } = trpc.siteDiary.status.useQuery({ projectId });
  const inExecution = !!diaryStatus?.inExecution;
  const { data: entries, isLoading } = trpc.siteDiary.list.useQuery({ projectId }, { enabled: inExecution });
  const { data: stages } = trpc.siteDiary.listStagesForProject.useQuery({ projectId }, { enabled: inExecution });

  const [formOpen, setFormOpen] = useState(false);

  const createEntry = trpc.siteDiary.create.useMutation({
    onSuccess: () => {
      toast.success("Registro salvo");
      setFormOpen(false);
      utils.siteDiary.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message || "Erro ao salvar registro"),
  });

  const deleteEntry = trpc.siteDiary.delete.useMutation({
    onSuccess: () => {
      toast.success("Registro excluído");
      utils.siteDiary.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message || "Erro ao excluir"),
  });

  function handleSubmit(payload: DiaryEntryPayload) {
    createEntry.mutate({ projectId, ...payload });
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-4 pb-24">
        <div className="flex items-center gap-2">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Diário de Obras</h1>
            <p className="text-sm text-muted-foreground">{project?.name}</p>
          </div>
        </div>

        {!statusLoading && !inExecution && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              O Diário de Obras só está disponível para obras <strong>em execução</strong>. Mude o status de um
              orçamento deste projeto para "Em execução" para liberar.
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

        <div className="space-y-3">
          {entries?.map((entry: any) => (
            <DiaryEntryCard key={entry.id} entry={entry} onDelete={(entryId) => deleteEntry.mutate({ id: entryId })} />
          ))}
        </div>
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
        open={formOpen}
        onOpenChange={setFormOpen}
        stages={stages as any}
        isPending={createEntry.isPending}
        onSubmit={handleSubmit}
      />
    </DashboardLayout>
  );
}
