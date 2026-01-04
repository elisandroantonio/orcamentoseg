import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orçamentos EG",
  description: "Dashboard de Orçamentos da Construtora EG",
};

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 hover:text-white transition"
    >
      {label}
    </Link>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-white text-gray-900">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-64 border-r bg-gray-900 text-gray-100 p-4">
            <div className="mb-6">
              <div className="text-sm font-semibold">Navigation</div>
            </div>

            <nav className="space-y-1">
              <NavItem href="/" label="Dashboard" />
              <NavItem href="/composicoes" label="Composições" />
              <NavItem href="/insumos" label="Insumos" />
              <NavItem href="/projetos" label="Projetos" />
              <NavItem href="/orcamentos" label="Orçamentos" />
            </nav>

            <div className="mt-10 border-t border-gray-700 pt-4 text-xs text-gray-400">
              <div className="font-medium">Elisandro Gasparrini</div>
              <div>orcamentos@construtoraeg.com.br</div>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1">
            <header className="border-b p-6">
              <div className="text-xl font-semibold">Dashboard</div>
              <div className="text-sm text-gray-500">
                Visão geral do sistema de orçamentos de obra
              </div>
            </header>

            <main className="p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}