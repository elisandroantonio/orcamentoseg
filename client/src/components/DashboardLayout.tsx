import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, Menu, FolderKanban, Calculator, Package, ClipboardList, Tag, Users, TrendingUp, Percent, Boxes } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: ClipboardList, label: "Composições", path: "/compositions" },
  { icon: Package, label: "Insumos", path: "/inputs" },
  { icon: Tag, label: "Categorias", path: "/categories" },
  { icon: Users, label: "Clientes", path: "/clients" },
  { icon: FolderKanban, label: "Projetos", path: "/projects" },
  { icon: Calculator, label: "Orçamentos", path: "/budgets" },
  { icon: TrendingUp, label: "Financeiro", path: "/financeiro" },
  { icon: Percent, label: "Calculadora BDI", path: "/bdi-calculator" },
  { icon: Boxes, label: "Lista de Materiais", path: "/material-lists" },
];



export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Local dev / self-hosted without Manus OAuth configured: skip the
  // "Sign in" button and go straight to the local login bypass. In
  // production (real Manus OAuth configured) this is a no-op and the
  // manual "Sign in" screen below still shows, unchanged.
  useEffect(() => {
    if (loading || user) return;
    if (getLoginUrl() === "/api/dev-login") {
      window.location.href = getLoginUrl();
    }
  }, [loading, user]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayoutContent isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen}>
      {children}
    </DashboardLayoutContent>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
};

function DashboardLayoutContent({
  children,
  isMenuOpen,
  setIsMenuOpen,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const activeMenuItem = menuItems.find(item => item.path === location);

  return (
    <div className="min-h-screen bg-background">
      {/* Header com botão de menu */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 gap-4">
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Abrir menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex h-full flex-col">
                {/* Header do menu */}
                <div className="flex h-16 items-center border-b px-6">
                  <span className="font-semibold tracking-tight">Navegação</span>
                </div>

                {/* Menu items */}
                <div className="flex-1 overflow-auto py-4">
                  <nav className="grid gap-1 px-3">
                    {menuItems.map(item => {
                      const isActive = location === item.path;
                      return (
                        <Button
                          key={item.path}
                          variant={isActive ? "secondary" : "ghost"}
                          className="justify-start h-10 px-3"
                          onClick={() => {
                            setLocation(item.path);
                            setIsMenuOpen(false);
                          }}
                        >
                          <item.icon className="mr-3 h-4 w-4" />
                          {item.label}
                        </Button>
                      );
                    })}
                  </nav>
                </div>

                {/* Footer com perfil do usuário */}
                <div className="border-t p-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Avatar className="h-9 w-9 border">
                          <AvatarFallback className="text-xs font-medium">
                            {user?.name?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {user?.name || "-"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {user?.email || "-"}
                          </p>
                        </div>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={logout}
                        className="cursor-pointer text-destructive focus:text-destructive"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Sair</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Título da página atual */}
          <div className="flex items-center gap-2">
            {activeMenuItem && (
              <>
                <activeMenuItem.icon className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-lg font-semibold">{activeMenuItem.label}</h1>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}
