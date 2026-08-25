# Como criar o banco de dados de teste

Isso cria um segundo banco, vazio e separado do real, para testarmos coisas
mais arriscadas sem risco nenhum aos seus dados de verdade. Mesma pasta de
projeto, só troca pra qual banco o app conversa.

## 1. Criar a conta e o cluster (site do TiDB Cloud)

1. Acesse **https://tidbcloud.com** e crie uma conta (pode ser com e-mail ou
   login do Google/Microsoft). Não pede cartão de crédito.
2. Depois de logar, clique em **"Create Cluster"**.
3. Escolha o plano **Starter** (gratuito — antigo nome "Serverless").
4. Dê um nome pro cluster, por exemplo `orcamento-teste`. Região pode deixar
   a padrão ou escolher uma próxima do Brasil, se aparecer opção.
5. Clique em criar e aguarde alguns segundos até o cluster ficar pronto.

## 2. Pegar a string de conexão

1. Na página do cluster, clique no botão **"Connect"**.
2. Vai aparecer uma "Connection String" parecida com:
   `mysql://usuario.algumacoisa:senha@gateway...tidbcloud.com:4000/nome_do_banco?ssl={"rejectUnauthorized":true}`
3. Copie essa string inteira (o TiDB Cloud mostra a senha só uma vez —
   se fechar a tela sem copiar, precisa gerar uma nova).

## 3. Configurar no projeto

1. Na pasta do projeto, copie o arquivo `.env.teste.example` e renomeie a
   cópia para `.env.teste` (sem o ".example" no final).
2. Abra o `.env.teste` e cole a connection string do passo 2 na linha
   `DATABASE_URL=`.
3. Salve o arquivo.

## 4. Criar as tabelas no banco de teste

No Terminal, na pasta do projeto:

```
npx pnpm@10.4.1 run db:teste:migrar
```

Isso cria a mesma estrutura de tabelas do banco real, mas vazia (sem os
orçamentos, clientes, etc.) — só a "planta" do banco.

## 5. Rodar o app usando o banco de teste

```
npx pnpm@10.4.1 run dev:teste
```

Repare que abre numa porta diferente (3001 em vez de 3000), então dá pra
deixar os dois rodando ao mesmo tempo se quiser comparar lado a lado.

Pra voltar a usar o banco real, é só rodar `npx pnpm@10.4.1 run dev` de
novo (sem o `:teste`) — o comportamento padrão continua sendo o real, o de
teste é sempre uma escolha explícita.

## Resumo do que cada comando faz

- `pnpm run dev` → banco real, porta 3000 (o de sempre)
- `pnpm run dev:teste` → banco de teste, porta 3001
- `pnpm run db:teste:migrar` → cria/atualiza as tabelas no banco de teste (rodar de novo sempre que eu adicionar uma tabela nova ao projeto)

Quando terminar de testar algo e confirmar que está tudo certo, é aí que a
mudança de código "vale" para o banco real também — porque o código é o
mesmo nas duas pastas, só o banco muda.
