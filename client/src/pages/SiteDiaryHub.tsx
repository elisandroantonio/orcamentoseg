import { useState } from "react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { BookOpen, CalendarDays, ChevronRight, MapPin, Users } from "lucide-react";
import { WorkedDaysReportDialog, WorkersManagerDialog } from "@/components/DiaryWorkers";

function formatDate(value: any) {
  if (!value) return null;
  const s = typeof value === "string" ? value : new Date(value).toISOString();
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Hub do dono: todas as obras em execução, cada uma abre o seu Diário. */
export default function SiteDiaryHub() {
  const { data: budgets, isLoading } = trpc.siteDiary.listExecutingBudgets.useQuery();
  const [reportOpen, setReportOpen] = useState(false);
  const [workersOpen, setWorkersOpen] = useState(false);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6" /> Diários de Obras
            </h1>
            <p className="text-sm text-muted-foreground">Obras em execução — escolha a obra para abrir ou lançar no diário.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
              <CalendarDays className="h-4 w-4 mr-1" /> Dias trabalhados
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWorkersOpen(true)}>
              <Users className="h-4 w-4 mr-1" /> Funcionários
            </Button>
          </div>
        </div>
        <WorkedDaysReportDialog open={reportOpen} onOpenChange={setReportOpen} />
        <WorkersManagerDialog open={workersOpen} onOpenChange={setWorkersOpen} />

        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

        {!isLoading && (!budgets || budgets.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum orçamento em execução. Mude o status de um orçamento para "Em execução" para liberar o diário.
            </CardContent>
          </Card>
        )}

        {budgets?.map((b: any) => (
          <Link key={b.id} href={`/budgets/${b.id}/diario`}>
            <Card className="cursor-pointer hover:bg-accent/40 transition-colors">
              <CardContent className="py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{b.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    {(b.clientName || b.projectName || b.location) && <MapPin className="h-3 w-3 shrink-0" />}
                    {[b.clientName, b.projectName, b.location].filter(Boolean).join(" · ")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {Number(b.entryCount)} registro(s)
                    {b.lastEntryDate ? ` · último em ${formatDate(b.lastEntryDate)}` : ""}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </DashboardLayout>
  );
}
