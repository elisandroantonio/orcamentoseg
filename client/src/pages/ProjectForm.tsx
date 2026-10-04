import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { Link, useLocation, useParams } from "wouter";
import { useEffect } from "react";
import { BookOpen } from "lucide-react";
import ClientDiaryAccessCard from "@/components/ClientDiaryAccessCard";
import FieldDiaryAccessCard from "@/components/FieldDiaryAccessCard";

interface FormData {
  name: string;
  client: string;
  clientId: string; // "" = nenhum vínculo
  location: string;
  description: string;
  startDate: string;
  endDate: string;
  status: "active" | "completed" | "archived";
}

export default function ProjectForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const isEditing = !!id;
  
  const { data: project } = trpc.projects.get.useQuery(
    { id: Number(id) },
    { enabled: isEditing }
  );
  const { data: clientsList } = trpc.clients.list.useQuery();

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormData>();

  useEffect(() => {
    if (project) {
      reset({
        name: project.name,
        client: project.client || "",
        clientId: project.clientId ? String(project.clientId) : "none",
        location: project.location || "",
        description: project.description || "",
        startDate: project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : "",
        endDate: project.endDate ? new Date(project.endDate).toISOString().split('T')[0] : "",
        status: project.status,
      });
    }
  }, [project, reset]);
  
  const createMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      toast.success("Projeto criado com sucesso");
      setLocation("/projects");
    },
    onError: () => toast.error("Erro ao criar projeto"),
  });
  
  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success("Projeto atualizado com sucesso");
      setLocation("/projects");
    },
    onError: () => toast.error("Erro ao atualizar projeto"),
  });
  
  const onSubmit = (data: FormData) => {
    const payload = {
      ...data,
      clientId: data.clientId && data.clientId !== "none" ? Number(data.clientId) : null,
    };
    if (isEditing) {
      updateMutation.mutate({ id: Number(id), ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };
  
  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">
            {isEditing ? "Editar Projeto" : "Novo Projeto"}
          </h1>
          <p className="text-muted-foreground mt-2">
            Preencha os dados do projeto/obra
          </p>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Dados do Projeto</CardTitle>
            <CardDescription>Informações básicas da obra</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Projeto *</Label>
                <Input 
                  id="name" 
                  {...register("name", { required: true })} 
                  placeholder="Ex: Ampliação Galpão Industrial" 
                />
                {errors.name && <p className="text-sm text-destructive">Campo obrigatório</p>}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="client">Cliente (nome livre)</Label>
                  <Input
                    id="client"
                    {...register("client")}
                    placeholder="Nome do cliente"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Controller
                    name="status"
                    control={control}
                    defaultValue="active"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="completed">Concluído</SelectItem>
                          <SelectItem value="archived">Arquivado</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientId">Cliente vinculado (cadastro)</Label>
                <Controller
                  name="clientId"
                  control={control}
                  defaultValue="none"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Nenhum" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {(clientsList || []).map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Necessário pra liberar acesso do cliente ao Diário de Obras deste projeto.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="location">Localização</Label>
                <Input 
                  id="location" 
                  {...register("location")} 
                  placeholder="Cidade, Estado" 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Data de Início</Label>
                  <Input 
                    id="startDate" 
                    type="date"
                    {...register("startDate")} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">Data de Término</Label>
                  <Input 
                    id="endDate" 
                    type="date"
                    {...register("endDate")} 
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea 
                  id="description" 
                  {...register("description")} 
                  placeholder="Descrição detalhada do projeto" 
                  rows={4}
                />
              </div>
              
              <div className="flex gap-4">
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {isEditing ? "Atualizar" : "Criar"} Projeto
                </Button>
                <Button type="button" variant="outline" onClick={() => setLocation("/projects")}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {isEditing && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Diário de Obras
              </CardTitle>
              <CardDescription>
                Registros diários (clima, efetivo, atividades e fotos) deste projeto.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Link href={`/projects/${id}/diario`}>
                <Button variant="outline" className="w-full sm:w-auto">
                  Abrir Diário de Obras
                </Button>
              </Link>

              <FieldDiaryAccessCard projectId={Number(id)} />

              {project?.clientId ? (
                <ClientDiaryAccessCard clientId={project.clientId} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Vincule um cliente do cadastro (acima) pra liberar o acesso dele ao Diário de Obras.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
