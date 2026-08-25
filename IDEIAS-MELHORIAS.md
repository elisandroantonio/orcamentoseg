# Ideias de melhoria — Plataforma de Orçamentos

Lista viva, levantada em sessões de revisão de código e uso real. Não é
roteiro fixo — puxar dali conforme fizer sentido para a rotina da empresa.

## Arquitetura e saúde do código

- Dividir `server/routers.ts` (~4.300 linhas) em arquivos por domínio
  (budgets, clients, financeiro, frota, insumos, composições), seguindo o
  padrão já usado em `server/routers/additives.ts` e `materialLists.ts`.
- Separar `server/db.ts` (~1.200 linhas) em camada de dados pura, tirando de
  lá os cálculos de negócio (BDI, recomputo de totais).
- Cortar o tamanho do bundle do front-end (hoje ~4,5MB) carregando sob
  demanda Excel/PDF/Gantt só quando a tela é aberta.
- Limpar resíduos de desenvolvimento (arquivos `.backup`, scripts soltos na
  raiz tipo `test2.ts`, `console.log` de depuração com IDs fixos no meio do
  código de cálculo).
- Trocar as migrações "silenciosas" que rodam a cada start do servidor por
  migrações versionadas do Drizzle.
- [CONCLUÍDO em 2026-08-09] SQL cru vulnerável a injeção — 97 pontos em
  `server/db.ts` e `server/routers/additives.ts`, todos convertidos para
  consultas parametrizadas. Checkpoints em `_checkpoints/`.

## Visual e experiência de uso

- Trocar cores "hardcoded" (`text-gray-500`, `bg-blue-600` etc. — mais de 500
  ocorrências) pelos tokens do tema (`text-muted-foreground`, `text-primary`
  etc.). Sem isso o modo escuro fica com contraste ruim em várias telas.
- Responsividade mobile: só 9 de 23 páginas usam classes adaptáveis
  (`sm:`/`md:`/`lg:`). Prioridade se for usar pelo celular/iPad.
- Padronizar os cartões de resumo/KPI entre Financeiro, Fluxo de Caixa e
  Dashboard — hoje cada tela parece ter um estilo próprio.
- Estados de carregamento (skeleton) só em 12 das 23 páginas — nas outras,
  troca de tela pode piscar em branco sem feedback visual.
- [CONCLUÍDO em 2026-08-09] Diálogos de "Adicionar Composição", "Copiar de
  Composição Base", "Buscar Composição" e "Adicionar Serviço Composto"
  ficavam presos em 512px de largura por um conflito de classes Tailwind
  (`sm:max-w-lg` do componente base vs. `max-w-[95vw]` da tela). Corrigido.

## Funcionalidades para acrescentar

- Atualização automática de preços via tabelas oficiais SINAPI/SICRO.
- Alertas de desvio no fluxo de caixa (previsto x realizado) em orçamentos
  em execução, em vez de só mostrar o gráfico passivamente.
- Exportação de planilha de BDI e composições no formato exigido por editais
  públicos (Lei 14.133/2021 — relevante dado o trabalho da esposa do
  Elisandro com licitações).
- Módulo de aprovação/assinatura de medições mensais, com registro de quem
  aprovou e quando.
- Checklist/acompanhamento das aprovações SIE/SIF/SISBI por projeto de
  frigorífico.
- Relatório comparativo entre orçamentos (propostas de fornecedores ou
  revisões do mesmo projeto lado a lado).

## Decisões já tomadas (não reabrir sem motivo novo)

- Fórmula de BDI: mantida a "fórmula clássica"
  `[(1+AC)(1+G)(1+R)] / (1−L−I) − 1` (Lucro e Impostos no denominador). O
  rótulo na tela foi corrigido de "TCU/SINAPI · Acórdão 2.622/2013" para
  "Fórmula clássica de BDI", porque a fórmula literal do Acórdão trata o
  Lucro como fator multiplicativo no numerador, não no denominador — são
  duas convenções válidas, mas diferentes.
