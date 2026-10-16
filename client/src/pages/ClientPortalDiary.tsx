import { useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import DiaryEntriesPanel from "@/components/DiaryEntriesPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import DiaryBrandHeader from "@/components/DiaryBrandHeader";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const fmtPct = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

function EvolutionPanel({ budgetId }: { budgetId: number }) {
  const { data, isLoading, error } = trpc.clientPortal.progress.useQuery({ budgetId }, { retry: false });
  if (isLoading) return <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando evolução...</CardContent></Card>;
  if (error || !data) return <Card><CardContent className="py-8 text-center text-muted-foreground">Evolução indisponível.</CardContent></Card>;
  return (
    <div className="space-y-3">
      <Card><CardContent className="py-5 space-y-2">
        <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">Evolução geral da obra</span><span className="text-3xl font-bold">{fmtPct(data.geral)}</span></div>
        <Progress value={data.geral} className="h-3" />
      </CardContent></Card>
      {data.etapas.length > 0 && (
        <Card><CardContent className="py-4 space-y-3">
          <div className="text-sm font-semibold">Por etapa</div>
          {data.etapas.map((e: any) => (
            <div key={e.nome} className="space-y-1">
              <div className="flex justify-between text-xs"><span>{e.nome}</span><span className="font-medium">{fmtPct(e.percent)}</span></div>
              <Progress value={e.percent} className="h-2" />
            </div>
          ))}
        </CardContent></Card>
      )}
      {data.historico.length > 0 && (
        <Card><CardContent className="py-4 space-y-2">
          <div className="text-sm font-semibold">Medições realizadas</div>
          {data.historico.map((h: any) => (
            <div key={h.numero} className="flex justify-between text-xs border-b last:border-0 py-1.5">
              <span>{h.nome}</span>
              <span className="text-muted-foreground">período {fmtPct(h.percentPeriodo)} · acumulado <b className="text-foreground">{fmtPct(h.percentAcumulado)}</b></span>
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  );
}

export default function ClientPortalDiary() {
  const { budgetId } = useParams();
  const [, setLocation] = useLocation();
  const pid = Number(budgetId);

  const { data: entries, isLoading, error } = trpc.clientPortal.listEntries.useQuery({ budgetId: pid }, { retry: false });
  const { data: budgets } = trpc.clientPortal.listBudgets.useQuery(undefined, { retry: false });
  const budget = budgets?.find((b: any) => b.id === pid);

  // Só volta pro login se a sessão caiu; obra sem acesso/fora de execução (FORBIDDEN) mostra aviso.
  const notLoggedIn = (error as any)?.data?.code === "UNAUTHORIZED";
  useEffect(() => {
    if (notLoggedIn) setLocation("/portal/login");
  }, [notLoggedIn, setLocation]);

  return (
    <div className="min-h-screen bg-muted/20">
      <DiaryBrandHeader
        left={
          <Link href="/portal">
            <Button variant="ghost" size="icon" title="Voltar às obras"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
        }
        subtitle={budget?.title}
      />

      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {error && !notLoggedIn && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">{error.message}</CardContent></Card>
        )}

        {!error && (
          <Tabs defaultValue="evolucao">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="evolucao">Evolução da obra</TabsTrigger>
              <TabsTrigger value="diario">Diário de obras</TabsTrigger>
            </TabsList>
            <TabsContent value="evolucao" className="mt-3"><EvolutionPanel budgetId={pid} /></TabsContent>
            <TabsContent value="diario" className="mt-3">
              <DiaryEntriesPanel
                entries={entries}
                isLoading={isLoading}
                pdfContext={{
                  title: budget?.title ?? "Obra",
                  subtitle: [budget?.projectName, budget?.location].filter(Boolean).join(" · ") || undefined,
                }}
                emptyMessage="Ainda não há registros nesta obra."
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
