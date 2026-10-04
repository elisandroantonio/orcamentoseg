import { useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CloudRain, Sun, Users } from "lucide-react";

const WEATHER_LABEL: Record<string, string> = {
  bom: "Bom",
  chuva: "Chuva",
  nublado: "Nublado",
  impraticavel: "Impraticável",
};

export default function ClientPortalDiary() {
  const { projectId } = useParams();
  const [, setLocation] = useLocation();
  const pid = Number(projectId);

  const { data: entries, isLoading, error } = trpc.clientPortal.listEntries.useQuery({ projectId: pid }, { retry: false });

  // Só volta pro login se a sessão caiu; obra fora de execução (FORBIDDEN) mostra aviso.
  const notLoggedIn = (error as any)?.data?.code === "UNAUTHORIZED";
  useEffect(() => {
    if (notLoggedIn) setLocation("/portal/login");
  }, [notLoggedIn, setLocation]);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background px-4 py-3 flex items-center gap-2">
        <Link href="/portal">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <span className="font-semibold">Diário de Obras</span>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {error && !notLoggedIn && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">{error.message}</CardContent></Card>
        )}
        {!isLoading && !error && (!entries || entries.length === 0) && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Ainda não há registros neste projeto.</CardContent></Card>
        )}

        {entries?.map((entry: any) => (
          <Card key={entry.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {new Date(entry.entryDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </CardTitle>
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
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!!entry.labor?.length && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{entry.labor.map((l: any) => `${l.role}: ${l.count}`).join(" · ")}</span>
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
  );
}
