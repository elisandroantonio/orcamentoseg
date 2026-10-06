import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import StagePicker from "@/components/StagePicker";
import { Camera, Plus, X } from "lucide-react";

export const WEATHER_LABEL: Record<string, string> = {
  bom: "Bom",
  chuva: "Chuva",
  nublado: "Nublado",
  impraticavel: "Impraticável",
};

export type DiaryEntryPayload = {
  entryDate: string;
  weatherMorning: any;
  weatherAfternoon: any;
  budgetStageId: number | null;
  equipmentUsed: string | null;
  activities: string;
  occurrences: string | null;
  labor: { role: string; count: number }[];
  photos: string[];
  /** Só na edição: ids das fotos já salvas que o usuário removeu. */
  removePhotoIds?: number[];
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

/**
 * Formulário de nova entrada do Diário de Obras — compartilhado entre a
 * página da equipe (SiteDiary) e a do login de campo (FieldDiary). Quem usa
 * decide o que fazer com o payload (qual mutation chamar).
 */
export default function DiaryEntryDialog({
  open,
  onOpenChange,
  stages,
  isPending,
  onSubmit,
  entry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages?: { id: number; name: string; parentStageId?: number | null; budgetTitle?: string | null }[];
  isPending: boolean;
  onSubmit: (payload: DiaryEntryPayload) => void;
  /** Se informado, a janela edita esta entrada em vez de criar uma nova. */
  entry?: any | null;
}) {
  const [existingPhotos, setExistingPhotos] = useState<{ id: number; url: string }[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<number[]>([]);
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

  // Ao abrir em modo edição, preenche com os dados da entrada.
  useEffect(() => {
    if (open && entry) {
      setEntryDate(String(entry.entryDate).slice(0, 10));
      setWeatherMorning(entry.weatherMorning || "bom");
      setWeatherAfternoon(entry.weatherAfternoon || "bom");
      setBudgetStageId(entry.budgetStageId ? String(entry.budgetStageId) : "none");
      setEquipmentUsed(entry.equipmentUsed || "");
      setActivities(entry.activities || "");
      setOccurrences(entry.occurrences || "");
      setLabor(
        entry.labor?.length
          ? entry.labor.map((l: any) => ({ role: l.role, count: String(l.count) }))
          : [{ role: "", count: "" }]
      );
      setPhotos([]);
      setExistingPhotos((entry.photos || []).map((p: any) => ({ id: p.id, url: p.url })));
      setRemovedPhotoIds([]);
    }
  }, [open, entry]);

  // Limpa o formulário sempre que a janela fecha (salvou ou cancelou).
  useEffect(() => {
    if (!open) {
      setExistingPhotos([]);
      setRemovedPhotoIds([]);
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
  }, [open]);

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
    onSubmit({
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
      ...(entry ? { removePhotoIds: removedPhotoIds } : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Editar entrada do diário" : "Nova entrada do diário"}</DialogTitle>
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
            <StagePicker
              stages={stages}
              value={budgetStageId !== "none" ? Number(budgetStageId) : null}
              onChange={(id) => setBudgetStageId(id ? String(id) : "none")}
            />
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
              onChange={e => {
                handlePhotoSelect(e.target.files);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
              <Camera className="h-4 w-4 mr-2" /> Tirar foto / escolher da galeria
            </Button>
            {!!existingPhotos.length && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {existingPhotos.map(p => (
                  <div key={p.id} className="relative">
                    <img src={p.url} className="aspect-square w-full rounded object-cover border" />
                    <button
                      type="button"
                      onClick={() => {
                        setExistingPhotos(prev => prev.filter(x => x.id !== p.id));
                        setRemovedPhotoIds(prev => [...prev, p.id]);
                      }}
                      className="absolute -top-1 -right-1 bg-background border rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Salvando..." : entry ? "Salvar alterações" : "Salvar registro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
