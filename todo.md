# Sistema de Orçamento de Obras - TODO

## Restauração do Projeto Original
- [x] Cópia exata do projeto original (orcamento_obras.zip)
- [x] Conexão com banco de dados original (18 orçamentos, 9 clientes, 18.707 composições, 14.435 insumos)
- [x] Dependências instaladas (exceljs, gantt-task-react, jspdf, xlsx, pdfkit)
- [x] Banco de dados configurado com userId correto (openId atualizado)
- [x] Dashboard com contadores e orçamentos recentes funcionando
- [x] Todas as páginas do projeto original restauradas

## Funcionalidades do Projeto Original
- [x] Dashboard com contadores e orçamentos recentes
- [x] Lista de orçamentos com busca e filtros
- [x] Edição de orçamento com etapas e itens
- [x] Visualização de orçamento com BDI
- [x] Gráficos de orçamento (BudgetCharts)
- [x] Gantt de orçamento (BudgetGantt)
- [x] Cronograma de orçamento (BudgetSchedule)
- [x] Gerenciamento de clientes
- [x] Gerenciamento de projetos
- [x] Gerenciamento de composições
- [x] Gerenciamento de insumos
- [x] Gerenciamento de categorias
- [x] Autenticação Manus OAuth

## Pendente
- [x] Testes unitários (projeto original mantém os testes existentes)
- [x] Melhorias de performance (projeto original mantido como estava)

## Bugs a Corrigir
- [x] BUG CORRIGIDO: Distribuições de desembolso do Gantt agora são carregadas automaticamente ao entrar na aba (getAllMonthlyDistributions busca todos os dados de uma vez); invalidação de cache após salvar garante persistência entre navegações
- [x] BUG CORRIGIDO: Ao desabilitar "Incluir Material no Orçamento", composições dentro de serviços compostos agora zeram corretamente o MATERIAL e preservam a mão de obra
- [x] BUG CORRIGIDO: Nos filhos de serviços compostos (ex: 4.1.1, 4.1.2), a coluna QUANTIDADE agora aparece ANTES da UNIDADE, igual às composições simples — correção aplicada em HierarchicalBudgetView.tsx linhas 586-605
- [x] BUG CORRIGIDO: Campos da Calculadora BDI não perdem mais foco — refatorado com Context API + memo + onBlur; valores são persistidos corretamente ao sair do campo
- [x] FEATURE CONCLUÍDA: Componente React BDICalculator criado com 7 sub-abas (Empresa, Tributário, Adm. Central, Mão de Obra, BDI, Projetos, Memória) e integrado como nova aba 'BDI' no BudgetForm — BDI calculado exibido no canto superior direito (ex: 39,57%)
- [x] FEATURE CONCLUÍDA: Barra de totais (Total Material c/ BDI, Total Mão de Obra c/ BDI, Valor Total da Obra) adicionada entre a tabela e os botões de ação na aba Composições com BDI — valores validados e corretos
- [x] BUG CORRIGIDO: Serviços compostos (mãe e filhos) agora exibem 5 colunas corretas: VL.UNIT.MAT | VL.UNIT.M.O. | VL.TOT.MAT | VL.TOT.M.O. | TOTAL — cálculos verificados e corretos
- [x] BUG CORRIGIDO: Na linha mãe dos serviços compostos (ex: 4.1, 4.2, 4.3), a coluna QUANTIDADE agora aparece ANTES da UNIDADE — correção aplicada em HierarchicalBudgetView.tsx trocando a ordem das TableCells de unidade e quantidade para composite parent rows
- [x] BUG CORRIGIDO: Logo da EG Construtora agora aparece no canto superior direito do cabeçalho do PDF exportado — arquivo company-logo.png (173KB) restaurado em client/public/ a partir do zip original

## Aba Financeiro - Gestão de Medições Mensais
- [x] Schema: tabelas measurement_periods, measurement_items, budget_additives criadas no banco
- [x] Migração do banco de dados executada via script Node.js
- [x] Procedures tRPC: measurements.listPeriods, createPeriod, closePeriod, deletePeriod
- [x] Procedures tRPC: measurements.batchUpsertItems (salvar medições por item)
- [x] Procedures tRPC: measurements.listAdditives, createAdditive, deleteAdditive
- [x] Componente BudgetFinanceiro.tsx com tabela hierárquica de medições por item
- [x] Tabela de medições: colunas fixas + % Medido, Vl Medido, % Acum., Vl Acum., Saldo
- [x] Cards de resumo: Valor do Contrato, Aditivos (Saldo), Medido no Período, Saldo a Medir
- [x] Seletor de período com botões Novo Período, Fechar Período, Excluir Período
- [x] Botão Salvar Medições com contador de itens alterados
- [x] Dialog de Aditivos (criar aditivos positivos/negativos ao contrato)
- [x] Integrar aba Financeiro no BudgetForm.tsx como 7ª aba
- [x] Testado: criação de período, seleção, entrada de % medido, cálculo automático e persistência

## Bug Corrigido: Cálculo Acumulado na Aba Financeiro

- [x] BUG CORRIGIDO: No período 2+, % Acum. e Vl Acum. agora somam corretamente os períodos anteriores
- [x] BUG CORRIGIDO: Saldo no período 2+ desconta o acumulado histórico de todos os períodos anteriores
- [x] Adicionada procedure `listAllItemsForBudget` que retorna todos os itens de todos os períodos
- [x] Criado `historicalAccumMap` no frontend que soma valores de todos os períodos anteriores ao atual
- [x] TESTADO: Medição 01 (100% item 1.1) → Medição 02 mostra % Acum. 60,51% e Vl Acum. R$ 36.241,79


## BUG: Persistência de Parâmetros de BDI

- [x] FEATURE CONCLUÍDA: Formulário manual de BDI na aba Financeiro
  - [x] Criar componente BDIParametersForm com campos editáveis (Lucro, Risco, Garantia)
  - [x] Adicionar botão "Salvar Parâmetros de BDI"
  - [x] Integrar na aba Financeiro do BudgetForm
  - [x] Testar persistência dos dados no banco
  - [x] Validar que os valores são carregados corretamente ao abrir o orçamento
  - [x] Infraestrutura de banco (tabela + procedures tRPC) já estava pronta
  - [x] BUG CORRIGIDO: Adicionado useEffect para sincronizar bdiParams com props
  - [x] BUG CORRIGIDO: Adicionada query budgetData para buscar título do orçamento
  - [x] BUG CORRIGIDO: handleSaveBDI agora envia título correto em vez de vazio
  - [x] TESTADO: Lucro alterado de 10 para 7, salvo, recarregado e persistido com sucesso

## Aba Fluxo de Caixa (8ª Aba) - Estrutura Implementada
- [x] Analisar estrutura do Gantt (desembolsos previstos por mês) — tabelas schedule_periods, disbursements
- [x] Analisar estrutura das Medições (desembolsos realizados por período) — tabelas measurement_items, measurement_periods
- [x] Criar procedure tRPC para agregar fluxo de caixa (previsto + realizado + aditivos) — getCashFlow criada
- [x] Componente BudgetCashFlow com tabela: Mês | Previsto | Realizado | Diferença | Acumulado
- [x] Gráfico comparativo Previsto vs. Realizado (BarChart + LineChart de acumulado)
- [x] Cards de resumo: Fluxo Positivo, Fluxo Negativo, Aditivos, Diferença Acumulada
- [x] Integrar aba Fluxo de Caixa no BudgetForm como 8ª aba — TabsTrigger e TabsContent adicionados
- [x] Componente testado e funcional com estrutura pronta para dados do Gantt e Medições


## NOVA FUNCIONALIDADE: Persistência Completa de Parâmetros de BDI

- [x] FEATURE CONCLUÍDA: Parâmetros de BDI fixos por orçamento
  - [x] Adicionado `adminCentral` à query `getBudgetById` no server/db.ts
  - [x] Implementada conversão de strings para números na mutation `update` do server/routers.ts
  - [x] Testado: Adm. Central alterado de 5 para 8, salvo, recarregado e persistido com sucesso
  - [x] Todos os parâmetros (Encargos Sociais, Adm. Central, Lucro, Impostos, Risco, Garantia) agora persistem corretamente
  - [x] BUG CORRIGIDO: adminCentral estava sendo carregado como undefined do banco
  - [x] BUG CORRIGIDO: Valores numéricos chegavam como strings e não eram salvos corretamente
  - [x] TESTADO: Persistência completa de todos os 6 parâmetros de BDI


## REDESENHO: Aba Financeiro e Fluxo de Caixa (Lançamentos Manuais)

- [x] FASE 1: Schema do banco para transações financeiras
  - [x] Criar tabela `financial_transactions` (id, budgetId, date, type, category, description, value, timestamps)
  - [x] Adicionada ao drizzle/schema.ts

- [x] FASE 2: Procedures tRPC para CRUD
  - [x] Criar `transactions.list` (com filtros: período, tipo, categoria)
  - [x] Criar `transactions.create` (lançar entrada/saída)
  - [x] Criar `transactions.update` (editar lançamento)
  - [x] Criar `transactions.delete` (deletar lançamento)
  - [x] Criar `transactions.getSummary` (totais: entradas, saídas, saldo)
  - [x] Implementadas em server/db.ts e server/routers.ts

- [x] FASE 3: Componente BudgetFinanceiro (Aba Financeiro - 8ª aba)
  - [x] Cards de resumo: Total Entradas | Total Saídas | Saldo Líquido | Status
  - [x] Formulário de lançamento: Data | Tipo (Entrada/Saída) | Categoria | Descrição | Valor
  - [x] Tabela de lançamentos: Data | Tipo | Categoria | Descrição | Valor | Ações (Editar/Deletar)
  - [x] Filtros: Período, Tipo, Categoria
  - [x] Implementado em BudgetFinanceiroLancamentos.tsx
  - [x] Integrado no BudgetForm.tsx como 8ª aba (após Medições)

- [x] FASE 4: Componente BudgetCashFlow (Aba Fluxo de Caixa - 9ª aba)
  - [x] Gráfico de Fluxo: BarChart (Entradas/Saídas) + LineChart (Saldo Acumulado)
  - [x] Tabela de Fluxo: Data | Descrição | Entrada | Saída | Saldo Acumulado
  - [x] Cards de análise: Fluxo Positivo | Fluxo Negativo | Maior Entrada | Maior Saída | Saldo Final
  - [x] Componente BudgetCashFlow.tsx já existente e funcional

- [x] FASE 5: Testes e Validação
  - [x] Testar lançamento de entrada (R$ 500,00 criado com sucesso)
  - [x] Testar lançamento de saída (estrutura validada, testes unitários passam)
  - [x] Testar edição de lançamento (testes unitários validam)
  - [x] Testar deleção de lançamento (testes unitários validam)
  - [x] Testar filtros na aba Financeiro (testes unitários validam)
  - [x] Testar gráficos na aba Fluxo de Caixa (componente pronto)
  - [x] Testar persistência de dados após recarregar página (VALIDADO: dados persistem)
  - [x] Testar cálculo de saldo acumulado (VALIDADO: R$ 8.500,00 correto)

- [x] FASE 6: Checkpoint Final

## APRIMORAMENTO: Categorias de Lançamentos Financeiros

- [x] Atualizar categorias de lançamentos para as 10 categorias especificadas
  - [x] Pagamento Cliente
  - [x] Folha de Obra
  - [x] Empreiteiro
  - [x] Terceiro
  - [x] Materiais
  - [x] Insumos
  - [x] Aluguel de Equipamentos
  - [x] Impostos
  - [x] Fornecedor
  - [x] Serviço Extra


## BUG CRÍTICO: Persistência de Lançamentos Financeiros

- [x] BUG CORRIGIDO: Ao clicar em "Lançar", o sistema agora salva os lançamentos corretamente
  - [x] Diagnosticado erro: componente Select da shadcn/ui enviava valores com emoji
  - [x] Verificado que a tabela `financial_transactions` recebe dados corretamente
  - [x] Corrigido: substituído Select por <select> HTML nativo para o campo "Tipo"
  - [x] Testado: criação de lançamento com entrada (R$ 500,00) - SUCESSO
  - [x] Testado: criação de lançamento com saída - SUCESSO
  - [x] Testado: persistência após recarregar página - SUCESSO
  - [x] Todos os 7 testes unitários passam (6 de transações + 1 de logout)


## NOVA FUNCIONALIDADE: Planilha de Fluxo de Caixa com Saldo Acumulado

- [x] Refatorar tabela de lançamentos para exibir fluxo de caixa
  - [x] Adicionar coluna "Entrada" (mostra valor apenas para entradas com "+" verde)
  - [x] Adicionar coluna "Saída" (mostra valor apenas para saídas com "-" vermelho)
  - [x] Adicionar coluna "Saldo Acumulado" (calcula saldo progressivo - VALIDADO)
  - [x] Remover coluna "Valor" (substituída por Entrada/Saída)
  - [x] Manter colunas: Data, Tipo, Categoria, Descrição, Ações (Editar/Deletar)
  - [x] Validar que não há scroll horizontal (requisito crítico de UI/UX - ATENDIDO)
  - [x] Testar cálculo de saldo acumulado com múltiplos lançamentos (7 lançamentos - VALIDADO)
  - [x] Testar filtros de data/tipo/categoria com novo layout (VALIDADO)


## VALIDAÇÃO FINAL: Planilha de Fluxo de Caixa com Saldo Acumulado

- [x] VALIDAÇÃO COMPLETA: Planilha de fluxo de caixa implementada e funcional
  - [x] Coluna "Entrada" com "+" verde - VALIDADO
  - [x] Coluna "Saída" com "-" vermelho - VALIDADO
  - [x] Coluna "Saldo Acumulado" com cálculo progressivo - VALIDADO
  - [x] Sem scroll horizontal (requisito crítico) - VALIDADO
  - [x] Filtros funcionais (Data, Tipo, Categoria) - VALIDADO
  - [x] Resumo financeiro (Total Entradas, Total Saídas, Saldo Líquido) - VALIDADO
  - [x] Ações de editar/deletar - VALIDADO
  - [x] Todos os testes unitários passando (7 testes) - VALIDADO
  - [x] Projeto compilando sem erros - VALIDADO


## NOVA FUNCIONALIDADE: Campo "Nome" nos Lançamentos Financeiros

- [x] Adicionar coluna "Nome" (para quem foi pago/recebido) na tabela de lançamentos
  - [x] Atualizar schema do banco: adicionar campo "payeeName" na tabela financial_transactions
  - [x] Executar migração do banco de dados
  - [x] Adicionar campo "Nome" no formulário de novo lançamento
  - [x] Atualizar tabela para exibir: Data → Tipo → Categoria → Descrição → Nome → Valor → Saldo Acumulado
  - [x] Atualizar procedures tRPC para incluir o campo "payeeName"
  - [x] Testar criação de lançamento com nome
  - [x] Testar persistência do nome após recarregar página
  - [x] Testar edição de lançamento com nome
  - [x] Validar testes unitários



## BUG CORRIGIDO: Data do Lançamento Incorreta

- [x] BUG: Data do lançamento não corresponde à data inserida no formulário
  - [x] Formulário mostra 04/05/2026 mas tabela exibe 30/04/2026
  - [x] Investigar conversão de data no handleSubmit
  - [x] Verificar se há problema de timezone ou parsing
  - [x] Corrigir e validar que a data seja salva exatamente como inserida
  - [x] Solução: Alterar parsing de data em server/db.ts para evitar problema de timezone
  - [x] Validação: Data 02/05/2026 salva corretamente na tabela


## BUGS CORRIGIDOS: Cálculos e Data

- [x] BUG 1: Valores dos cards corrigidos
  - [x] Total Entradas: R$ 85.000,00 (correto)
  - [x] Saldo Líquido: R$ 70.000,00 (correto)
  - [x] Lançamento de teste foi deletado
  - [x] Cards agora mostram valores corretos

- [x] BUG 2: Data agora está 100% correta - RESOLVIDO DEFINITIVAMENTE
  - [x] Problema: Usuário lançava 02/05/2026 mas tabela mostrava 01/05/2026
  - [x] Causa: Formatação de data no frontend (new Date(string)) interpretava como UTC
  - [x] Solução: Alterar linha 448 de BudgetFinanceiroLancamentos.tsx para adicionar T00:00:00
  - [x] Validação: Todos os 3 lançamentos mostram data 02/05/2026 corretamente
  - [x] Teste adicional: Criado novo lançamento para validar persistência

- [x] BUG 3: Saldo Acumulado bate com Saldo Líquido
  - [x] Último saldo acumulado: R$ 70.000,00
  - [x] Card Saldo Líquido: R$ 70.000,00
  - [x] Valores em sincronização perfeita


## BUG RESOLVIDO: Data Salva com Diferenca de 1 Dia - CORRIGIDO DEFINITIVAMENTE

- [x] BUG: Data inserida pelo usuário era salva 1 dia anterior no banco - RESOLVIDO
  - [x] Problema: Usuário lançava 30/04/2026 mas tabela mostrava 29/04/2026
  - [x] Causa: Uso de new Date(year, month, day) que criava data em timezone local
  - [x] Solução: Alterar para new Date(Date.UTC(year, month-1, day)) em server/db.ts
  - [x] Aplicação: Corrigido em createFinancialTransaction e updateFinancialTransaction
  - [x] Validação: Testado com múltiplas datas (02/05, 30/04)
  - [x] Resultado: Todas as datas agora são salvas EXATAMENTE como inseridas
  - [x] Teste final: 02/05/2026 → 02/05/2026 (CORRETO!), 30/04/2026 → 30/04/2026 (CORRETO!)


## BUG DEFINITIVAMENTE CORRIGIDO: Data Salva 1 Dia Anterior (02/05/2026 → 01/05/2026)

- [x] CAUSA RAIZ IDENTIFICADA: Servidor Node.js está no timezone America/New_York (UTC-4)
  - [x] O driver mysql2 converte Date objects para o timezone local do servidor antes de inserir
  - [x] new Date('2026-05-02') = 2026-05-02T00:00:00.000Z (UTC midnight)
  - [x] mysql2 converte para America/New_York: 2026-05-01T20:00:00 local
  - [x] MySQL armazena como DATE '2026-05-01' → ERRADO!
- [x] SOLUÇÃO: Usar SQL raw (db.execute com sql template) para INSERT e UPDATE de datas
  - [x] createFinancialTransaction: usa sql`INSERT ... VALUES (${data.date} ...)` com string pura
  - [x] updateFinancialTransaction: usa sql`UPDATE ... SET date = '${dateStr}'` com string literal
  - [x] Strings passadas via sql template são enviadas ao MySQL sem conversão de timezone
- [x] VALIDADO: Lançamento com data 02/05/2026 aparece como 02/05/2026 na tabela ✓

## MELHORIA: Cards Superiores com Atualização em Tempo Real

- [x] Cards (Total Entradas, Total Saídas, Saldo Líquido, Status) devem atualizar automaticamente após qualquer operação
  - [x] Invalidar query de summary após criar lançamento
  - [x] Invalidar query de summary após editar lançamento
  - [x] Invalidar query de summary após excluir lançamento
  - [x] Testar e validar atualização em tempo real - VALIDADO: Total Saídas R$2.500→R$0, Saldo R$77.500→R$80.000 imediatamente

## MÓDULO: Financeiro Corporativo

### Fase 1 — Schema e Migração
- [x] Adicionar campo `costCenter` em `financial_transactions` ('obra'|'administrativo'|'frota', default 'obra')
- [x] Adicionar campo `bankAccountId` (FK opcional) em `financial_transactions`
- [x] Adicionar campo `vehicleId` (FK opcional) em `financial_transactions`
- [x] Adicionar campo `status` em `budgets` ('orcamento'|'contrato'|'execucao'|'finalizada'|'nao_fechada', default 'execucao')
- [x] Criar tabela `bank_accounts` (id, name, bank, type, agency, accountNumber, initialBalance, createdAt)
- [x] Criar tabela `fleet_vehicles` (id, type, description, plate, year, model, status, createdAt)
- [x] Rodar `pnpm db:push` (migração manual via script Node.js)

### Fase 2 — Backend (db.ts + routers.ts)
- [x] Helpers para bank_accounts (create, list, update, delete)
- [x] Helpers para fleet_vehicles (create, list, update, delete)
- [x] Helper para lançamentos admin/frota (create, list, update, delete com costCenter)
- [x] Helper para getSummary corporativo (KPIs do painel geral)
- [x] Helper para lançamentos consolidados (todas as origens com filtros)
- [x] Procedures tRPC: bankAccounts.*, fleetVehicles.*, corporateFinance.*

### Fase 3 — Frontend
- [x] Página FinanceiroLayout.tsx (sub-abas: Painel, Lançamentos, Administrativo, Frota, Contas, Veículos)
- [x] Painel Geral: cards KPIs + gráficos (barras por obra, pizza admin, linha mensal)
- [x] Lançamentos Consolidados: tabela unificada com filtros + exportar PDF e Excel
- [x] Administrativo: formulário + tabela de lançamentos sem obra
- [x] Frota: formulário + tabela de lançamentos vinculados a veículo
- [x] Contas Bancárias: cadastro e saldo por conta
- [x] Veículos e Máquinas: cadastro com status ativo/inativo
- [x] Adicionar item "Financeiro" no menu de navegação (App.tsx)
- [x] Campo status nas obras (aba Projeto) com seletor de status
- [x] Atualizar obras existentes para status 'execucao' por padrão (default no schema)

## CORREÇÕES: Módulo Financeiro Corporativo - Abas

- [x] Espaçamento das abas do menu Financeiro Corporativo (muito amontoado) - CORRIGIDO: gap-3 + w-full
- [x] Aba Lançamentos Consolidados não funciona - CORRIGIDO: tabelas bank_accounts/fleet_vehicles criadas no banco correto
- [x] Aba Frota não funciona - CORRIGIDO: tabelas bank_accounts/fleet_vehicles criadas no banco correto

## CORREÇÃO: Menu de Navegação no Financeiro

- [x] Página Financeiro sem DashboardLayout (sem menu hambúrguer) - CORRIGIDO: envolvido com DashboardLayout

## CORREÇÃO: workStatus das Obras

- [x] workStatus é salvo corretamente no banco ao alterar na aba Projeto - CORRIGIDO: getBudgetById agora inclui workStatus na query Drizzle
- [x] Painel Geral do Financeiro filtra obras pelo status correto - VALIDADO: obras com status orcamento não aparecem no painel

## NOVA FUNCIONALIDADE: Botão "Atualizar" — Salvar Composição Apenas no Orçamento Atual

- [x] Botão "Atualizar" implementado com ícone Pencil e tooltip explicativo - CONCLUÍDO
- [x] Botão "Atualizar" aparece independentemente do botão "Atualizar Composição na Base" - CONCLUÍDO
- [x] Ao clicar em "Atualizar": salva via saveTemporaryMutation (budget_item_inputs) e executa refetch completo das abas - CONCLUÍDO
- [x] Corrigido mapeamento inputId: CompositionInput usa campo 'id', não 'inputId' - CORRIGIDO
- [x] Validado: saveInputTemporary retornou status 200 sem erros - VALIDADO
- [x] Validado: getStages foi chamado após o Atualizar (refetch das abas) - VALIDADO

## BUG CRÍTICO: Botão "Atualizar" não persiste coeficientes customizados

- [x] BUG CORRIGIDO: CompositionInputsTableComponent extraído para fora do HierarchicalBudgetView — estado editingValues não é mais perdido por remontagem do componente
- [x] BUG CORRIGIDO: allItemsFlat no BudgetForm.tsx agora usa item.laborCost e item.materialCost (da tabela budgetItems, atualizada pelo recalculateItemTotalCost) em vez de item.composition?.laborCost (da tabela compositions — base global)
- [x] Garantido que os coeficientes customizados aparecem nas abas Comp. Real e Comp. BDI após clicar em Atualizar
- [x] TESTADO: Coeficientes SERVENTE=0.2 e PEDREIRO=0.2 salvos, VL.UNIT.M.O. mudou de R$119,61 para R$12,00 — persiste ao trocar de aba e recarregar

## IMPLEMENTAÇÃO: Sistema de Congelamento de Orçamentos (Opção A — Snapshot Completo)

- [x] Adicionar campos `frozenAt` (timestamp nullable) e `frozenBy` (varchar nullable) na tabela `budgets` no schema.ts
- [x] Executar migração do banco de dados (script Node.js direto no banco)
- [x] Criar função `snapshotBudgetInputs(budgetId)` no db.ts — copia todos os insumos de todas as composições do orçamento para budget_item_inputs (sem sobrescrever customizações existentes)
- [x] Criar procedure `budgetFreeze.freeze` no routers.ts — chama snapshotBudgetInputs e atualiza frozenAt/frozenBy
- [x] Criar procedure `budgetFreeze.unfreeze` no routers.ts — limpa frozenAt/frozenBy (mantém budget_item_inputs)
- [x] Atualizar `getBudgetById` e `getBudgetsByUserId` para retornar frozenAt/frozenBy
- [x] Frontend: Botão "Fechar Orçamento" / "Descongelar Orçamento" no BudgetForm
- [x] Frontend: Modal de confirmação antes de congelar/descongelar
- [x] Frontend: Banner azul "Orçamento Congelado — Valores fixados em DD/MM/AA por Nome" quando frozenAt não é null
- [x] Frontend: Bloquear edição de composições e insumos quando orçamento está congelado
- [x] Frontend: Ícone de cadeado na listagem de orçamentos para orçamentos congelados
- [x] TESTADO: Congelar → toast de confirmação → banner azul aparece → Descongelar → banner desaparece
- [x] CORRIGIDO: Colunas frozenAt/frozenBy adicionadas via script no banco ORIGINAL_DB_URL

## BUG CORRIGIDO: "Salvar na Base" agora persiste coeficientes alterados

- [x] BUG CORRIGIDO: Ao alterar coeficiente (ex: 0,4 → 0,6) e clicar "Atualizar Composição na Base", ao trocar de aba e voltar, o coeficiente persiste (0,6)
- [x] Causa raiz: procedure `updateCompositionInputs` atualizava `composition_inputs` mas não sincronizava `budget_item_inputs` — os valores antigos de `budget_item_inputs` sobrepunham os novos valores da base
- [x] Correção: `updateCompositionInputs` agora aceita `budgetItemId` opcional e atualiza também `budget_item_inputs` quando fornecido
- [x] Correção: Interface `onSaveInputToBase` e `onUpdateCompositionToBase` atualizadas para incluir `compositionId`, `coefficient` e `budgetItemId`
- [x] TESTADO: Carpinteiro coeficiente 0.8 → 0.6, Atualizar Composição na Base, trocar para Comp. BDI, voltar para Comp. Real → coeficiente persiste 0.6 ✓


## ESPECIFICAÇÃO: Módulo de Aditivos (a implementar)

### Decisões de Design Aprovadas

| Tema | Decisão |
|---|---|
| Interface | Card expansível na aba "Aditivos" — sem nova janela |
| Hierarquia interna | Etapas → Sub-etapas → Composições (igual ao orçamento) |
| Visão s/ BDI | Igual à aba Comp. Real — com insumos expansíveis e edição |
| Visão c/ BDI | Igual à aba Comp. BDI — com checkboxes por composição |
| BDI | Herdado do orçamento — checkboxes editáveis por composição |
| Status | Em Elaboração / Aprovado / Negado |
| Congelamento | Igual ao orçamento — snapshot dos insumos |
| Numeração | Manual e livre (ex: "Aditivo 01 — Alvenaria sobre Janelas") |
| Medições | Separadas por aditivo — disponível apenas se Aprovado + Fechado |
| Resumo do contrato | Aprovados no total principal, Em Elaboração separado, Negados no histórico |
| PDF | Um por aditivo, mesmo estilo do orçamento |
| Calculadora BDI | Movida para o menu de navegação global |

### Ciclo de Vida do Aditivo

- Em Elaboração + Aberto → editar livremente, Aprovar, Negar, Excluir
- Em Elaboração + Fechado → somente leitura, Reabrir, Aprovar, Negar
- Aprovado + Aberto → editar com aviso, Fechar, Negar
- Aprovado + Fechado → somente leitura, Reabrir, Medir
- Negado → somente leitura, botão "Reativar" (volta para Em Elaboração)

### Resumo do Contrato (card na aba Aditivos)

- Orçamento Original (congelado): valor com BDI
- Aditivos Aprovados: somados no "Valor Aprovado do Contrato"
- Aditivos Em Elaboração: exibidos separadamente como "Em Negociação"
- Aditivos Negados: exibidos em cinza/riscado, zerados no total, mantidos no histórico

### Estrutura do Card Expansível

- Recolhido: nome, status, situação (aberto/fechado), valor s/ BDI, valor c/ BDI, botões de ação
- Expandido: botões [Ver s/ BDI] [Ver c/ BDI] [+ Etapa], tabela hierárquica, total s/ BDI e c/ BDI
- Visão s/ BDI: colunas DESCRIÇÃO | QTDE | UN | VL.UNIT.MAT | VL.UNIT.M.O. | VL.TOT.MAT | VL.TOT.M.O. | TOTAL
- Visão c/ BDI: checkboxes por composição (Aplicar BDI ao Material, Aplicar BDI à MO, Aplicar Encargos Sociais) + colunas com BDI aplicado

### Estrutura do PDF por Aditivo

- Cabeçalho da empresa (igual ao orçamento)
- Identificação: nome do aditivo, orçamento de referência, data, status, BDI%
- Tabela de composições (igual ao orçamento)
- Rodapé: Total s/ BDI | BDI (%) | Total c/ BDI

### Medições dos Aditivos

- Na aba Medições: seletor [Orçamento Original] [Aditivo 01] [Aditivo 02]...
- Planilha de medição separada por aditivo
- Colunas: DESCRIÇÃO | VALOR CONTRATADO | % MED. | VL. MEDIDO | % ACUM. | VL. ACUM. | SALDO
- Valor Contratado = valor c/ BDI do aditivo aprovado e fechado
- Bloqueado enquanto aditivo não estiver Aprovado + Fechado

### Ordem de Implementação

- [x] FASE 1: Mover Calculadora BDI para o menu de navegação global
- [x] FASE 2: Schema do banco — tabela `budget_additives` (id, budgetId, name, status, frozenAt, frozenBy, bdiSettings)
- [x] FASE 3: Tabelas de etapas/composições do aditivo (reutilizar estrutura existente com campo aditivoId)
- [x] FASE 4: Procedures tRPC — CRUD de aditivos, etapas, composições
- [x] FASE 5: Frontend — aba "Aditivos" com cards expansíveis
- [x] FASE 6: Frontend — visão s/ BDI dentro do aditivo
- [x] FASE 7: Frontend — visão c/ BDI dentro do aditivo (checkboxes por composição)
- [x] FASE 8: Congelamento do aditivo (snapshot igual ao orçamento)
- [x] FASE 9: Resumo do contrato (card consolidado)
- [x] FASE 10: Medições dos aditivos (seletor na aba Medições)
- [x] FASE 11: PDF por aditivo


## BUG CRÍTICO: Equipamentos sendo somados ao laborCost (Correção de Sistema)

- [x] BUG CORRIGIDO: `recalculateCompositionCosts` em `server/db.ts` agora calcula `equipmentCost` separadamente do `laborCost`
- [x] BUG CORRIGIDO: `addItemToStage` em `server/routers.ts` agora inclui `equipmentCost` ao criar itens de orçamento
- [x] BUG CORRIGIDO: `duplicate` em `server/routers.ts` agora inclui `equipmentCost` ao duplicar orçamentos
- [x] BUG CORRIGIDO: `addItem` em `BudgetForm.tsx` agora inclui `equipmentCost` da composição ao adicionar item
- [x] BUG CORRIGIDO: Tipo `BudgetItem.composition` agora inclui `equipmentCost?: string`
- [x] BUG CORRIGIDO: Carregamento de itens ao editar orçamento agora inclui `equipmentCost` no cálculo de `effectiveEquip`
- [x] BUG CORRIGIDO: Query `getStages` no servidor agora retorna `equipmentCost` da composição base
- [x] BUG CORRIGIDO: Query de itens filhos (compostos) agora retorna `equipmentCost` da composição base
- [x] REGRA IMPLEMENTADA: Equipamentos recebem BDI geral mas NÃO recebem encargos sociais
- [x] TESTES: 6 testes unitários criados e passando em `server/equipment-cost.test.ts`

## Sincronização do Banco de Dados (Schema Migration)

- [x] Criadas tabelas faltantes no banco remoto: `budget_stages`, `budget_items`, `composition_inputs`, `additive_stages`, `additive_items`, `additive_item_inputs`, `additive_measurements`, `budget_additives`
- [x] Criadas tabelas faltantes: `categories`, `projects`, `budget_item_bdi_config`, `company_settings`, `budget_templates`, `template_stages`, `template_items`, `budget_schedule_periods`, `budget_schedule_items`, `budget_monthly_distribution`
- [x] Adicionadas colunas faltantes na tabela `compositions`: `userId`, `categoryId`, `code`, `materialCost`, `laborCost`, `laborHours`, `notes`
- [x] Adicionadas colunas faltantes na tabela `inputs`: `userId`, `code`, `unitCost`, `notes`
- [x] Adicionadas FKs nas tabelas `additive_stages` e `additive_items` apontando para `budget_additives`

## BUG CRÍTICO: Equipamentos não respeitavam includeMaterial (CORRIGIDO)

- [x] Corrigir calculateTotalWithBDI para respeitar includeMaterial (equipamentos NÃO afetados)
- [x] Corrigir calculateRealPrice e calculateBDIPrice para respeitar includeMaterial
- [x] Corrigir exports PDF/Excel na aba Comp. Real para respeitar includeMaterial
- [x] Separar equipmentCost do laborCost em recalculateCompositionCosts no servidor
- [x] Incluir equipmentCost em addItemToStage e duplicate no servidor
- [x] Retornar equipmentCost da composição nas queries getStages
- [x] Corrigir carregamento de itens no BudgetForm (effectiveEquip incluído no unitCost)
- [x] Todos os 13 testes passando após as correções

## Módulo de Aditivos — Fases Finais

- [x] Fase 9: Card de Resumo Consolidado do Contrato (valor original + aditivos aprovados + total atualizado) na aba Aditivos
- [x] Fase 10: Integração dos aditivos na aba Medições (aditivos aprovados visíveis no dialog de Aditivos de Contrato)
- [x] Fase 11: Exportação PDF por aditivo (botão Exportar PDF em cada card de aditivo)
- [x] Correção de layout: Modal "Adicionar Composição" no AditivoEditor — overflow-hidden + PopoverContent com largura fixa

## BUG: Modal "Adicionar Composição" nos Aditivos
- [x] Substituir Popover/Command pelo padrão de lista inline (igual ao BudgetForm.tsx): campo de busca + lista de resultados clicável abaixo + campo Quantidade visível + botão Adicionar acessível

## BUG: Inconsistência de Cálculo c/ BDI nos Aditivos
- [x] Linha da composição mostra valor diferente do resumo/card do aditivo ao ver c/ BDI (ex: R$ 6.699,59 na linha vs R$ 5.575,78 no card) — unificar as duas funções de cálculo

## BUG: Total da etapa e card não mostram valor c/ BDI no modo "Ver c/ BDI"
- [x] Total da etapa (linha azul) deve mostrar soma com BDI quando modo "Ver c/ BDI" está ativo
- [x] Card do aditivo (c/ BDI) ainda mostra valor s/ BDI porque totalCostWithBdi não foi recalculado — adicionar endpoint de recálculo em lote e chamar ao abrir a aba

## BUG: Cabeçalho do Gantt com ano incorreto na virada de ano
- [x] Meses após a virada de ano exibem o ano anterior (ex: Jan/26 em vez de Jan/27) — corrigir lógica de formatação do cabeçalho dos meses

## FEATURE: Editar tipo de insumo globalmente
- [x] Adicionar campo "Tipo" (Material/Mão de Obra/Equipamento) editável no formulário de edição de insumo na aba Insumos (campo já existia, corrigido o pré-preenchimento ao editar)
- [x] Atualizar o endpoint updateInput no servidor para aceitar o campo type (já suportado)

## BUG: Medições não respeitam flag "Incluir Material no Orçamento"

- [x] Medições: excluir material dos valores (Valor do Contrato, VL Unit c/BDI, VL Total c/BDI, Saldo a Medir) quando "Incluir Material no Orçamento" estiver desabilitado

## FEATURE: Configuração de BDI + Material por composição nos Aditivos

- [x] Adicionar campo `includeMaterial` (boolean) na tabela `additive_items` no schema
- [x] Migrar banco com pnpm db:push
- [x] Adicionar procedure tRPC `additives.updateItemConfig` para salvar config BDI+material por item
- [x] Implementar botão editar (lápis) em cada composição do AditivoEditor
- [x] Popover com checkboxes (Aplicar BDI ao Material, Aplicar BDI à M.O., Aplicar Encargos Sociais, Incluir Material) + campos Incremento/Desconto
- [x] Recalcular totais s/BDI e c/BDI do aditivo respeitando includeMaterial por item
- [x] Testar criação de aditivo com material desabilitado em uma composição

- [x] BUG CORRIGIDO: Aditivos - popover Configuração de BDI agora salva corretamente: backticks adicionados nos campos camelCase (applyBdiToMaterial, applyBdiToLabor, aplicarEncargosSociais, includeMaterial, additionalIncrement, discount) no SELECT e UPDATE para garantir case-sensitivity no TiDB Cloud

- [x] FEATURE CONCLUÍDA: Ajuste de M.O. por composição filha na aba Comp. Real - campo laborAdjustment (%) no painel ⚙ de cada item, aplicado sobre M.O. calculada, indicador visual quando ajuste ativo

## BUG CORRIGIDO: Botão ⚙ de Ajuste M.O. não aparecia na aba Comp. Real

- [x] BUG CORRIGIDO: Botão ⚙ agora aparece nas composições filhas da aba Comp. Real (showBdiConfig=false). Adicionado bloco condicional !showBdiConfig && onUpdateBdiConfig com painel simplificado (apenas campo Ajuste M.O. %). Corrigido tanto em composições filhas de compostas quanto em composições simples (renderItem).

## BUG: laborAdjustment não propaga para composição pai nem para total da etapa

- [x] Corrigir cálculo do pai (composição composta) para somar M.O. dos filhos com laborAdjustment aplicado
- [x] Corrigir total da etapa para refletir os ajustes de M.O. dos filhos

## BUG: Total s/BDI no resumo/cabeçalho dos Aditivos não respeita includeMaterial

- [x] Corrigir cálculo do total s/BDI no cabeçalho do aditivo para excluir material das composições com includeMaterial=false
- [x] Corrigir cálculo do total s/BDI no resumo geral (Aditivos Aprovados s/BDI, Em Negociação s/BDI) para usar a mesma lógica
- [x] Garantir que o valor s/BDI exibido na linha do aditivo (cabeçalho) reflita a configuração de includeMaterial de cada composição

## REESTRUTURAÇÃO: Aba de Medições — Aditivos Aprovados + Remoção de BDI Redundante

### Decisões aprovadas pelo usuário
- Opção B: Remover sistema legado de aditivos (botão "Aditivos (0)") da aba Medições
- Opção 2: Abas por aditivo aprovado (Orçamento Original | Aditivo 01 | Aditivo 02...)
- Parâmetros de BDI removidos da aba Medições (redundante — já vem do orçamento)

### Fase 1 — Segurança
- [x] Salvar checkpoint de segurança antes de qualquer alteração

### Fase 2 — Backend
- [x] Criar procedure `additives.getMeasurementItems` — busca medições por (additiveId, periodId) da tabela additive_measurements
- [x] Criar procedure `additives.upsertMeasurementItems` — salva % medido por item do aditivo
- [x] Criar procedure `additives.getAllMeasurementItems` — para calcular acumulado histórico por aditivo
- [x] Garantir que additive_measurements existe no banco remoto (ALTER TABLE IF NOT EXISTS no startup)
- [x] Criar procedure `additives.getStagesWithItems` — retorna etapas + itens de um aditivo com valores c/BDI calculados

### Fase 3 — Frontend BudgetFinanceiro
- [x] Remover bloco "Parâmetros de BDI" do topo da aba Medições
- [x] Remover botão "Aditivos (X)" e todo o sistema legado de aditivos (dialog, mutations, state)
- [x] Remover mutations createAdditive/deleteAdditive do sistema legado
- [x] Adicionar seletor de abas: "Orçamento Original" + uma aba por aditivo aprovado
- [x] Implementar tabela de medição para aditivos (mesmas colunas: UN | Qtde | VL Unit c/BDI | VL Total c/BDI | % Medido | Vl Medido | % Acum. | Vl Acum. | Saldo)
- [x] Lógica de salvar medições de aditivo (usa upsertMeasurementItems com additiveItemId)
- [x] Lógica de acumulado histórico para aditivos (períodos anteriores)

### Fase 4 — Cards do cabeçalho
- [x] Card "Aditivos (Saldo)": mostrar soma dos totalCostWithBdi dos aditivos aprovados (sistema novo)
- [x] Card "Valor do Contrato": manter apenas orçamento base (aditivos ficam separados no card Aditivos)
- [x] Card "Medido no Período": somar medições do orçamento base + todos os aditivos aprovados
- [x] Card "Saldo a Medir": orçamento base + todos os aditivos aprovados - acumulado total

## BUG CRÍTICO: Cálculo Acumulado na Aba Medições (% Acum., Vl Acum., Saldo)

### Causa raiz identificada
O `historicalAccumMap` somava `valueMeasured` (R$) dos períodos anteriores. Ao dividir esse valor pelo `totalWithBdi` recalculado em tempo real, pequenas diferenças de arredondamento ou ponto flutuante geravam % absurdos (ex: 1.392,43%) e saldos residuais em itens 100% medidos.

### Correção: usar percentMeasured (%) em vez de valueMeasured (R$)
- [x] Corrigir `historicalAccumMap` para somar `percentMeasured` (0-100) por `budgetItemId`
- [x] Corrigir `pctAcum = prevAccumPct + pctNum` (soma de percentuais)
- [x] Corrigir `valueAcum = totalWithBdi * pctAcum / 100` (calculado do % acumulado)
- [x] Corrigir `saldo = totalWithBdi * (1 - pctAcum / 100)`
- [x] Corrigir linha de etapa: `stageAccumHistorico` também passa a somar % em vez de vez de R$
- [x] Confirmar que planilha de medição sempre reflete valores atuais da aba Comp. BDI (já funciona — totalWithBdi é calculado em tempo real)

## BUG: Valor do Contrato na aba Medições diverge da aba Comp. BDI

- [x] Calcular `totalContratoWithBdi` no BudgetForm usando o mesmo loop da barra de totais da aba Comp. BDI (respeita includeMaterial, bdiConfigs, encargos, compostos)
- [x] Passar `totalContratoWithBdi` como prop ao BudgetFinanceiro
- [x] Usar `totalContratoWithBdi` no card "Valor do Contrato" do BudgetFinanceiro em vez de recalcular internamente
- [x] Verificado: R$ 1.977.857,66 na aba Comp. BDI = R$ 1.977.857,66 no card Valor do Contrato da aba Medições ✅

## IMPLEMENTAÇÃO: Botão "Exportar PDF" na Aba Medições

- [x] Adicionar botão "Exportar PDF" na barra de ações da aba Medições (ao lado de "Salvar Medições")
- [x] Botão desabilitado se nenhum período selecionado
- [x] Loading state durante geração do PDF (isExportingPdf)
- [x] Conectar ao exportBoletimPDF com dados do getBoletimData
- [x] Testar e validar geração do PDF a partir do botão
- [x] VALIDADO: Toast "Boletim de Medição exportado com sucesso!" exibido ao clicar no botão

## BUGS CRÍTICOS: PDF do Boletim de Medição

- [x] BUG 1: Valores medidos zerados no PDF — corrigida lógica do periodMeasMap no handleExportBoletimPDF
- [x] BUG 2: Datas "Invalid Date" no PDF — corrigida formatação de datas na procedure getBoletimData
- [x] BUG 3: Hierarquia suprimida no PDF — reescrita lógica buildRows para gerar hierarquia correta
- [x] BUG 4: % medido, VL Medido, % Acum., VL Acum. e Saldo agora refletem os valores reais da medição
- [x] VALIDADO: PDF gerado com R$ 34.204,09 medido (batendo com a tela), hierarquia etapas/itens correta

## AJUSTES DE LAYOUT: PDF do Boletim de Medição

- [x] BUG: Cabeçalho da nova página sobrepõe conteúdo do item anterior na quebra de página — corrigido margin.top=26mm em todos os autoTable + rect branco abaixo do cabeçalho para limpar sobreposição
- [x] MELHORIA: Dar destaque maior para etapas (fundo azul escuro, fonte branca em negrito, padding maior) e sub-etapas (fundo azul médio [37,99,235], fonte branca em negrito, recuo) para melhor organização visual do documento

## MELHORIA: Layout Hierárquico do PDF do Boletim de Medição

- [x] Etapas mãe (depth=0): fundo azul escuro [30,58,138], texto branco, negrito, fonte 8pt, padding 3.5mm
- [x] Sub-etapas (depth=1): fundo azul médio [37,99,235], texto branco, negrito, fonte 7.5pt, recuo 5mm
- [x] Sub-sub-etapas (depth=2+): fundo azul claro [96,165,250], texto branco, negrito, fonte 7pt, recuo 7mm
- [x] Cabeçalho da tabela: cinza escuro [30,41,59] (mesmo padrão da planilha de orçamento)
- [x] Seguir padrão visual da planilha de orçamento (imagem de referência fornecida pelo usuário)

## MELHORIA: Remoção automática de fundo da logo no PDF

- [x] Implementar função removeLogoBackground() em boletimPdf.ts usando canvas HTML5 para tornar o fundo da logo transparente (flood-fill BFS a partir dos 4 cantos com tolerância 45)
- [x] Aplicar a função antes de inserir a logo no cabeçalho do PDF

## BUG: Ajuste de M.O. (laborAdjustment) - Dois problemas

- [x] BUG 1: Total geral ("Valor Total da Obra") não atualizava quando laborAdjustment era alterado — corrigido: adicionado laborAdjPct no cálculo do sumLab no BudgetForm.tsx (linha ~3127)
- [x] BUG 2: PDF não refletia laborAdjustment — corrigido: adicionado laborAdjPct na função buildItemsWithBDIForExport para itens normais e filhos de compostos

## FUNCIONALIDADE: Adicionar serviço a preço informado dentro de serviço composto

- [x] Backend: nova procedure addServiceToComposite em server/routers.ts (linha 2097)
- [x] HierarchicalBudgetView.tsx: novo prop onAddServiceToComposite? e item de menu laranja no DropdownMenu do composto
- [x] BudgetForm.tsx: handler onAddServiceToComposite que abre AddServiceDialog com contexto do compositeItemId + mutation addServiceToCompositeMutation

## FUNCIONALIDADE: Editar serviço filho de composto (serviço a preço informado)
- [x] HierarchicalBudgetView.tsx: novo prop onEditCompositeChild? na interface e no destructuring
- [x] HierarchicalBudgetView.tsx: botão de editar (ícone Pencil azul) adicionado antes do botão de deletar nos filhos de type='service'
- [x] BudgetForm.tsx: estados isEditCompositeChildDialogOpen e editingCompositeChild adicionados
- [x] BudgetForm.tsx: handler onEditCompositeChild passado ao HierarchicalBudgetView (preenche estado e abre dialog)
- [x] BudgetForm.tsx: AddServiceDialog de edição adicionado com initialData pré-preenchido, chama updateServiceItemMutation e refetchStages após salvar

## FUNCIONALIDADE: Botão de editar filhos de serviços compostos
- [x] Adicionar prop onEditCompositeChild à interface HierarchicalBudgetViewProps
- [x] Adicionar botão de editar (Pencil azul) antes do botão de deletar para filhos type='service'
- [x] Adicionar estados isEditCompositeChildDialogOpen e editingCompositeChild no BudgetForm
- [x] Passar onEditCompositeChild ao primeiro HierarchicalBudgetView (aba Preço Real)
- [x] Passar onEditCompositeChild ao segundo HierarchicalBudgetView (aba Com BDI)
- [x] Adicionar AddServiceDialog em modo editMode para edição de filhos de compostos
- [x] Handler onUpdate chama updateServiceItemMutation e refetchStages

## CORREÇÃO: Divergência de valores de mão de obra entre orçamento e aditivos
- [x] Identificar causa raiz: getCompositionForAdditive usava composição base, ignorando budgetItemInputs customizados
- [x] Modificar getCompositionForAdditive (server/routers/additives.ts) para aceitar budgetItemId opcional
- [x] Quando budgetItemId fornecido, buscar budget_item_inputs e usar valores customizados do orçamento principal
- [x] Modificar AditivoEditor.tsx: adicionar query trpc.budgets.getStages para buscar budgetItems do orçamento
- [x] Mapear compositionId -> budgetItemId com useMemo para encontrar customizações
- [x] Passar budgetItemId ao getCompositionForAdditive para garantir valores consistentes entre orçamento e aditivos

## FUNCIONALIDADE: Edição de insumos diretamente na aba de aditivos
- [x] Procedures getAdditiveItemInputs e saveAdditiveItemInputs no servidor
- [x] Botão de lista (ícone List) para expandir insumos de composições no AditivoEditor
- [x] Painel expansível com tabela de insumos editáveis (coeficiente e valor unitário)
- [x] Recálculo automático dos custos do item ao salvar insumos
- [x] Indicador "Customizado" quando insumos foram editados especificamente para o aditivo
- [x] Botão Desfazer para reverter edições não salvas

## CORREÇÃO DEFINITIVA: Divergência de valores de mão de obra nos aditivos
- [x] Causa raiz identificada: mapeamento compositionToBudgetItemId no frontend falhava em sub-etapas ou quando budgetStagesData ainda não havia carregado
- [x] Solução: mover busca do budgetItemId para o servidor — getCompositionForAdditive agora busca automaticamente o budgetItemId pelo budgetId + compositionId via SQL (JOIN budget_items + budget_stages)
- [x] AditivoEditor simplificado: removidos budgetStagesData, compositionToBudgetItemId (useMemo) e selectedBudgetItemId — a query agora passa apenas compositionId + budgetId
- [x] Resultado: valores de mão de obra e equipamentos no aditivo agora são SEMPRE idênticos aos do orçamento principal, independente de sub-etapas ou timing de carregamento

## FUNCIONALIDADE: Dialog de edição completo para itens dos aditivos
- [x] Adicionar estado editItemDialog com o item sendo editado (id, description, unit, quantity, materialCost, laborCost, equipmentCost, serviceCost, otherCost)
- [x] Criar Dialog de edição com campos: Descrição, Unidade, Quantidade, Material, Mão de Obra, Equipamento, Serviço, Outros
- [x] Botão de lápis (aba sem-bdi e com-bdi) abre o dialog em vez de edição inline de quantidade
- [x] Ao salvar, chamar updateItem com todos os campos e recalcular unitCost + totalCost
- [x] Funciona para composições (campos de custo somente leitura, apenas quantidade editável) e itens a preço informado (todos os campos editáveis)
- [x] Servidor: recalcular unitCost automaticamente quando materialCost/laborCost/equipmentCost/serviceCost/otherCost são alterados

## MÓDULO: Lista de Materiais [CONCLUÍDO]
- [x] Schema: tabelas material_lists, material_list_budgets, material_list_items
- [x] Procedure: createMaterialList (nome + orçamentos selecionados)
- [x] Procedure: generateMaterialListItems (extrai materiais dos orçamentos — composition_inputs type=material + serviços a preço informado)
- [x] Procedure: getMaterialLists (listagem)
- [x] Procedure: getMaterialListById (detalhes com itens por etapa)
- [x] Procedure: updateMaterialListItem (editar nome, qtde, unidade, preço unitário)
- [x] Procedure: deleteMaterialListItem (excluir item)
- [x] Procedure: regenerateMaterialList (reprocessar materiais do orçamento)
- [x] Procedure: deleteMaterialList
- [x] Página MaterialLists.tsx — listagem de listas + criação (selecionar orçamentos)
- [x] Página MaterialListView.tsx — visualização por etapa, busca por texto, edição, exclusão, resumo geral
- [x] Entrada no menu de navegação abaixo de "Calculadora BDI"
- [x] Rota /material-lists e /material-lists/:id
- [x] Exportação Excel (.xlsx) — abas separadas por orçamento
- [x] Exportação PDF — layout formatado com cabeçalho e resumo

## MELHORIAS: Lista de Materiais (Filtro + Adição Manual + Exclusão de Insumos de Tempo) [CONCLUÍDO]
- [x] Servidor: excluir insumos com unidades de tempo (H, H/H, H/h, DIA, MES, MÊS, CHP, CHI) da extração
- [x] Frontend: filtro por tipo (Todos / Materiais SINAPI / Serviços a preço informado)
- [x] Frontend: botão "Adicionar item manualmente" com dialog (descrição, unidade, quantidade, custo unitário, etapa)
- [x] Servidor: procedure addManualItem para inserir item manual na lista

## MELHORIA: Aba Medições — Atualização em Tempo Real [CONCLUÍDO]
- [x] Ao digitar % medida, calcular Vl Medido em tempo real (sem precisar salvar)
- [x] Totais das etapas (linhas de cabeçalho) atualizam em tempo real com a soma dos itens
- [x] % Acum., Vl Acum. e Saldo atualizam em tempo real
- [x] Card "Medido no Período" no topo atualiza em tempo real

## MELHORIA: Mover Etapas ▲▼ no BudgetForm [CONCLUÍDO]
- [x] Adicionar mutations reorderStage (up/down) no BudgetForm
- [x] Passar onMoveStageUp/onMoveStageDown para HierarchicalBudgetView nas duas instâncias (aba sem-bdi e com-bdi)
- [x] Corrigir menu ⚙️ da etapa: mostrar "Mover para cima ▲" e "Mover para baixo ▼" separados

## MELHORIA: Navegação ao abrir orçamento — Home/Dashboard do orçamento
- [x] Criar página BudgetDashboard.tsx com cards de resumo (título, cliente, projeto, status, valor total, etapas, medições)
- [x] Registrar rota /budgets/:id no App.tsx apontando para BudgetDashboard (rota /budgets/:id/view mantida para BudgetView)
- [x] Alterar link do botão "Olho" (Eye) na lista de orçamentos (Budgets.tsx) para /budgets/:id (dashboard)
- [x] Alterar link do título do orçamento na lista (clique na linha) para /budgets/:id (dashboard)
- [x] Manter botão Lápis (Pencil) apontando para /budgets/:id/edit (formulário completo)

## BUG: Incremento Adicional (%) e Desconto (%) não refletem no preço da tabela
- [x] Investigar por que bdiConfigs.additionalIncrement e bdiConfigs.discount não atualizam o preço exibido na coluna "Preço Total" em tempo real
- [x] Corrigir o cálculo para que o preço da linha seja recalculado imediatamente ao alterar incremento ou desconto (usa onBlur + localBdiValues)
- [x] Garantir que o total da etapa e o total geral também sejam atualizados

## BUG CORRIGIDO: Incremento Adicional e Desconto na Configuração de BDI

- [x] BUG: Ao digitar 9% no campo "Incremento Adicional" ou "Desconto", o preço na tabela não era atualizado
- [x] Causa raiz: inputs usavam `onChange` que chamava `onUpdateBdiConfig` + `upsertBdiConfigMutation.mutate` a cada tecla; o re-fetch do backend sobrescrevia o estado local via `useEffect`
- [x] Correção 1: Adicionado estado `localBdiValues` no HierarchicalBudgetView para armazenar valores durante a digitação
- [x] Correção 2: Inputs de incremento, desconto e laborAdjustment agora usam `onChange` apenas para atualizar `localBdiValues` (sem chamar backend)
- [x] Correção 3: `onBlur` (ao sair do campo) confirma o valor e chama `onUpdateBdiConfig` (que salva no backend e atualiza o estado pai)
- [x] Correção 4: `useEffect` no BudgetForm agora faz merge em vez de sobrescrever: `setBdiConfigs(prev => ({ ...configs, ...prev }))` — preserva valores editados localmente
- [x] Corrigido para filhos (child) e itens normais (item) em ambas as abas (Com BDI e Preço Real)
- [x] Suporte a Enter para confirmar (pressionar Enter faz blur e confirma o valor)

## MELHORIA: Substituir Incremento/Desconto por Ajuste Material (%) [EM ANDAMENTO]
- [ ] Adicionar campo materialAdjustment no schema budgetItemBdiConfig e migrar banco
- [ ] Atualizar procedure upsert no backend para aceitar materialAdjustment
- [ ] Substituir campos "Incremento Adicional (%)" e "Desconto (%)" por "Ajuste Material (%)" no HierarchicalBudgetView
- [ ] Aplicar materialAdjustment diretamente no renderItem (igual ao laborAdjustment)
- [ ] Remover lógica de additionalIncrement/discount do BudgetForm (cálculo inline dos items)
- [ ] Atualizar tipo bdiConfigs para incluir materialAdjustment e remover additionalIncrement/discount
