import { useRef, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Camera, CloudRain, Plus, Sun, Trash2, Users, X } from "lucide-react";

const WEATHER_LABEL: Record<string, string> = {
  bom: "Bom",
  chuva: "Chuva",
  nublado: "Nublado",
  impraticavel: "Impraticável",
};

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type LaborRow = { role: string; count: string };

export default function SiteDiary() {
  const { id } = useParams();
  const projectId = Number(id);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: project } = trpc.projects.get.useQuery({ id: projectId });
  const { data: entries, isLoading } = trpc.siteDiary.list.useQuery({ projectId });
  const { data: stages } = trpc.siteDiary.listStagesForProject.useQuery({ projectId });

  const [formOpen, setFormOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(todayIso());
  const [weatherMorning, setWeatherMorning] = useState<string>("bom");
  const [weatherAfternoon, setWeatherAfternoon] = useState<string>("bom");
  const [budgetStageId, setBudgetStageId] = useState<string>("none");
  const [equipmentUsed, setEquipmentUsed] = useState("");
  const [activities, setActivities] = useState("");
  const [occurrences, setOccurrences] = useState("");
  const [labor, setLabor] = useState<LaborRow[]>([{ role: "", count: "" }]);
  const [photos, setPhotos] = useState<{ dataUrl: string; previewUrl: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setEntryDate(todayIso());
    setWeatherMorning("bom");
    setWeatherAfternoon("bom");
    setBudgetStageId("none");
    setEquipmentUsed("");
    setActivities("");
    setOccurrences("");
    setLabor([{ role: "", count: "" }]);
    setPhotos([]);
  }

  const createEntry = trpc.siteDiary.create.useMutation({
    onSuccess: () => {
      toast.success("Registro salvo");
      setFormOpen(false);
      resetForm();
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

  async function handlePhotoSelect(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList).slice(0, 20 - photos.length);
    const results = await Promise.all(
      files.map(async (file) => {
        const dataUrl = await fileToDataUrl(file);
        return { dataUrl, previewUrl: dataUrl };
      })
    );
    setPhotos(prev => [...prev, ...results]);
  }

  function handleSubmit() {
    if (!activities.trim()) {
      toast.error("Descreva as atividades do dia");
      return;
    }
    createEntry.mutate({
      projectId,
      entryDate,
      weatherMorning: weatherMorning as any,
      weatherAfternoon: weatherAfternoon as any,
      budgetStageId: budgetStageId !== "none" ? Number(budgetStageId) : null,
      equipmentUsed: equipmentUsed || null,
      activities,
      occurrences: occurrences || null,
      labor: labor
        .filter(l => l.role.trim() && Number(l.count) > 0)
        .map(l => ({ role: l.role.trim(), count: Number(l.count) })),
      photos: photos.map(p => p.dataUrl),
    });
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

        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && (!entries || entries.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum registro ainda. Toque no botão + para criar o primeiro.
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {entries?.map((entry: any) => (
            <Card key={entry.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {new Date(entry.entryDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </CardTitle>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Remove o registro do dia e todas as fotos anexadas. Não pode ser desfeito.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteEntry.mutate({ id: entry.id })}>
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {entry.stageName && <span className="rounded bg-muted px-2 py-0.5">{entry.stageName}</span>}
                  {entry.weatherMorning && (
                    <span className="flex items-center gap-1">
                      {entry.weatherMorning === "chuva" ? <CloudRain className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                      Manhã: {WEATHER_LABEL[entry.weatherMorning]}
                    </span>
                  )}
                  {entry.weatherAfternoon && (
                    <span className="flex items-center gap-1">
                      {entry.weatherAfternoon === "chuva" ? <CloudRain className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                      Tarde: {WEATHER_LABEL[entry.weatherAfternoon]}
                    </span>
                  )}
                  {entry.userName && <span>Registrado por {entry.userName}</span>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {!!entry.labor?.length && (
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {entry.labor.map((l: any) => `${l.role}: ${l.count}`).join(" · ")}
                      {" "}(total {entry.labor.reduce((s: number, l: any) => s + l.count, 0)})
                    </span>
                  </div>
                )}
                {entry.equipmentUsed && (
                  <p className="text-sm"><span className="text-muted-foreground">Equipamentos: </span>{entry.equipmentUsed}</p>
                )}
                <p className="text-sm whitespace-pre-wrap">{entry.activities}</p>
                {entry.occurrences && (
                  <p className="text-sm text-amber-700 dark:text-amber-400 whitespace-pre-wrap">
                    <span className="font-medium">Ocorrências: </span>{entry.occurrences}
                  </p>
                )}
                {!!entry.photos?.length && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {entry.photos.map((p: any) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                        <img src={p.url} className="aspect-square w-full rounded object-cover border" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* FAB */}
      <Button
        size="icon"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40"
        onClick={() => setFormOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova entrada do diário</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Clima — manhã</Label>
                <Select value={weatherMorning} onValueChange={setWeatherMorning}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(WEATHER_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Clima — tarde</Label>
                <Select value={weatherAfternoon} onValueChange={setWeatherAfternoon}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(WEATHER_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Efetivo de mão de obra</Label>
              <div className="space-y-2">
                {labor.map((row, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      placeholder="Função (ex: Pedreiro)"
                      value={row.role}
                      onChange={e => setLabor(prev => prev.map((r, i) => i === idx ? { ...r, role: e.target.value } : r))}
                    />
                    <Input
                      type="number"
                      min={0}
                      className="w-20"
                      placeholder="Qtd"
                      value={row.count}
                      onChange={e => setLabor(prev => prev.map((r, i) => i === idx ? { ...r, count: e.target.value } : r))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLabor(prev => prev.filter((_, i) => i !== idx))}
                      disabled={labor.length === 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setLabor(prev => [...prev, { role: "", count: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar função
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Equipamentos em uso</Label>
              <Input value={equipmentUsed} onChange={e => setEquipmentUsed(e.target.value)} placeholder="Ex: 1 betoneira, 1 andaime fachadeiro" />
            </div>

            <div className="space-y-1">
              <Label>Etapa do cronograma (opcional)</Label>
              <Select value={budgetStageId} onValueChange={setBudgetStageId}>
                <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {stages?.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name} {s.budgetTitle ? `(${s.budgetTitle})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Atividades executadas *</Label>
              <Textarea value={activities} onChange={e => setActivities(e.target.value)} rows={3} placeholder="O que foi feito no dia" />
            </div>

            <div className="space-y-1">
              <Label>Ocorrências / observações</Label>
              <Textarea value={occurrences} onChange={e => setOccurrences(e.target.value)} rows={2} placeholder="Atrasos, visitas, problemas..." />
            </div>

            <div className="space-y-1">
              <Label>Fotos</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={e => handlePhotoSelect(e.target.files)}
              />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
                <Camera className="h-4 w-4 mr-2" /> Tirar foto / escolher da galeria
              </Button>
              {!!photos.length && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {photos.map((p, idx) => (
                    <div key={idx} className="relative">
                      <img src={p.previewUrl} className="aspect-square w-full rounded object-cover border" />
                      <button
                        type="button"
                        onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-1 -right-1 bg-background border rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createEntry.isPending}>
              {createEntry.isPending ? "Salvando..." : "Salvar registro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
