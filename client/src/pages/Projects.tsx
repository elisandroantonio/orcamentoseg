import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function Projects() {
  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();
  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      toast.success("Projeto excluído com sucesso");
    },
    onError: () => {
      toast.error("Erro ao excluir projeto");
    },
  });

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    active: { label: "Ativo", variant: "default" },
    completed: { label: "Concluído", variant: "secondary" },
    archived: { label: "Arquivado", variant: "outline" },
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Projetos</h1>
            <p className="text-muted-foreground mt-2">
              Gerencie suas obras e projetos
            </p>
          </div>
          <Link href="/projects/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Projeto
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Projetos</CardTitle>
            <CardDescription>
              Todos os projetos cadastrados no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 flex-1 max-w-xs" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : projects && projects.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className="font-medium">
                        {project.name}
                      </TableCell>
                      <TableCell>{project.client || "-"}</TableCell>
                      <TableCell>{project.location || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={statusLabels[project.status].variant}>
                          {statusLabels[project.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/projects/${project.id}`}>
                            <Button variant="ghost" size="sm">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(project.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  Nenhum projeto cadastrado ainda
                </p>
                <Link href="/projects/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar primeiro projeto
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
