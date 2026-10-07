import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import DiaryBrandHeader from "@/components/DiaryBrandHeader";
import { LogOut } from "lucide-react";

export default function ClientPortalProjects() {
  const [, setLocation] = useLocation();
  const { data: me, error: meError } = trpc.clientPortal.me.useQuery(undefined, { retry: false });
  const { data: projects, isLoading } = trpc.clientPortal.listBudgets.useQuery(undefined, { retry: false });

  useEffect(() => {
    if (meError) setLocation("/portal/login");
  }, [meError, setLocation]);

  async function handleLogout() {
    await fetch("/api/client-portal/logout", { method: "POST", credentials: "include" });
    setLocation("/portal/login");
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <DiaryBrandHeader
        subtitle={me ? `Olá, ${me.name || me.username}` : undefined}
        actions={
          <Button variant="ghost" size="sm" onClick={handleLogout} title="Sair">
            <LogOut className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Sair</span>
          </Button>
        }
      />

      <div className="max-w-2xl mx-auto p-4 space-y-3">
        <h1 className="text-xl font-bold">Suas obras</h1>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && (!projects || projects.length === 0) && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma obra em execução no momento.</CardContent></Card>
        )}

        {projects?.map((p: any) => (
          <Link key={p.id} href={`/portal/${p.id}`}>
            <Card className="cursor-pointer hover:border-primary transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{p.title}</CardTitle>
                {(p.projectName || p.location) && <CardDescription>{[p.projectName, p.location].filter(Boolean).join(" · ")}</CardDescription>}
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
