import { useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import DiaryEntriesPanel from "@/components/DiaryEntriesPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import DiaryBrandHeader from "@/components/DiaryBrandHeader";
import { ArrowLeft } from "lucide-react";

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
          <DiaryEntriesPanel
            entries={entries}
            isLoading={isLoading}
            pdfContext={{
              title: budget?.title ?? "Obra",
              subtitle: [budget?.projectName, budget?.location].filter(Boolean).join(" · ") || undefined,
            }}
            emptyMessage="Ainda não há registros nesta obra."
          />
        )}
      </div>
    </div>
  );
}
