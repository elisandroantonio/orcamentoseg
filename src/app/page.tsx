export default function Dashboard() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
      <p className="text-gray-500 mb-8">Visão geral do sistema de orçamentos de obra</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="rounded-xl border p-6">
          <h2 className="text-sm text-gray-500">Orçamentos</h2>
          <p className="text-2xl font-semibold">0</p>
          <p className="text-xs text-gray-500 mt-1">Total de orçamentos criados</p>
        </div>

        <div className="rounded-xl border p-6">
          <h2 className="text-sm text-gray-500">Projetos</h2>
          <p className="text-2xl font-semibold">0</p>
          <p className="text-xs text-gray-500 mt-1">Obras em andamento</p>
        </div>

        <div className="rounded-xl border p-6">
          <h2 className="text-sm text-gray-500">Composições</h2>
          <p className="text-2xl font-semibold">0</p>
          <p className="text-xs text-gray-500 mt-1">Itens cadastrados</p>
        </div>

        <div className="rounded-xl border p-6">
          <h2 className="text-sm text-gray-500">Insumos</h2>
          <p className="text-2xl font-semibold">0</p>
          <p className="text-xs text-gray-500 mt-1">Materiais e recursos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="rounded-xl border p-6 min-h-[180px]">
          <h3 className="font-semibold">Orçamentos Recentes</h3>
          <p className="text-sm text-gray-500">Últimos orçamentos criados</p>
          <div className="text-sm text-gray-400 mt-10 text-center">
            Nenhum orçamento criado ainda
          </div>
        </div>

        <div className="rounded-xl border p-6 min-h-[180px]">
          <h3 className="font-semibold">Projetos Ativos</h3>
          <p className="text-sm text-gray-500">Obras em andamento</p>
          <div className="text-sm text-gray-400 mt-10 text-center">
            Nenhum projeto ativo
          </div>
        </div>
      </div>
    </main>
  );
}