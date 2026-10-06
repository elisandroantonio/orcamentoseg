import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { CloudRain, FileDown, Loader2, Pencil, Sun, Trash2, Users } from "lucide-react";
import { WEATHER_LABEL } from "./DiaryEntryDialog";

/**
 * Card de uma entrada do diário. Sem `onDelete`, não mostra o botão de
 * excluir (usado no login de campo, que só cria e consulta).
 */
export default function DiaryEntryCard({
  entry,
  onDelete,
  onEdit,
  onPdf,
  pdfBusy,
}: {
  entry: any;
  onDelete?: (id: number) => void;
  onEdit?: (entry: any) => void;
  onPdf?: (entry: any) => void;
  pdfBusy?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {(() => {
              const [y, m, d] = String(entry.entryDate).slice(0, 10).split("-");
              return y && m && d ? `${d}/${m}/${y}` : "Sem data";
            })()}
          </CardTitle>
          <div className="flex items-center">
          {onPdf && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              title="Gerar PDF deste dia"
              disabled={pdfBusy}
              onClick={() => onPdf(entry)}
            >
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => onEdit(entry)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
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
                  <AlertDialogAction onClick={() => onDelete(entry.id)}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          </div>
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
  );
}
