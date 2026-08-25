# Como rodar a plataforma no seu computador

## ⚡ Referência rápida (cola e usa)

**Pasta do projeto (sempre a primeira linha, em qualquer terminal novo):**
```
cd "/Users/elisandrogasparrini/PLATAFORMA ORCAMENTO"
```

**Banco real** (dados de verdade — 18 orçamentos, 9 clientes, etc.):
```
npx pnpm@10.4.1 run dev
```
→ abre em http://localhost:3000

**Banco de teste** (vazio, pode mexer/quebrar à vontade, não afeta dados reais):
```
npx pnpm@10.4.1 run dev:teste
```
→ abre em http://localhost:3001

**Login local (primeira vez em cada um):**
```
http://localhost:3000/api/dev-login   (banco real)
http://localhost:3001/api/dev-login   (banco de teste)
```

**Parar o servidor:** `Control + C` no Terminal onde ele está rodando.

**Recriar o banco de teste do zero** (copia a estrutura do banco real, sem dados):
```
npx pnpm@10.4.1 run db:teste:clonar-schema
```

---

## O que já está pronto

- O projeto está nesta pasta, com as correções de segurança já aplicadas (senhas que estavam cravadas no código foram removidas e movidas para o arquivo `.env`).
- O `.env` já está configurado apontando para o banco de dados real (os 18 orçamentos, 9 clientes, etc. já existentes).
- Login local: como o login original depende dos servidores da Manus (fora do ar para este projeto fora da Manus), foi criado um login local só para desenvolvimento (`server/_core/devAuth.ts`). Ele nunca funciona em produção — só quando você roda no seu computador.

**Importante:** essa configuração conecta direto no banco de dados real da empresa. Qualquer alteração que você fizer testando localmente (criar, editar, excluir orçamentos) afeta os dados de verdade. Não é um banco de teste separado.

## Pré-requisitos

1. **Node.js versão 20 ou mais recente.** Para checar se já tem instalado, abra o Terminal e rode:
   ```
   node -v
   ```
   Se não tiver, baixe em https://nodejs.org (escolha a versão "LTS").

## Passo a passo

Abra o Terminal (Spotlight → digite "Terminal") e rode, um comando de cada vez:

**1. Entrar na pasta do projeto:**
```
cd "/Users/elisandrogasparrini/PLATAFORMA ORCAMENTO"
```

**2. Instalar as dependências do projeto** (baixa tudo que o app precisa; pode levar alguns minutos):
```
npx pnpm@10.4.1 install
```
Na primeira vez ele pergunta se pode instalar o pacote `pnpm` — digite `y` e Enter.

> Nota: se o Terminal reclamar de permissão ao tentar instalar o `pnpm` globalmente (erro `EACCES` em `/usr/local/lib/node_modules`), é porque o Node foi instalado de um jeito que exige permissão de administrador para instalar pacotes globais. O comando acima com `npx` evita esse problema — ele roda o pnpm sem precisar instalá-lo globalmente, então nem tente `corepack enable` ou `npm install -g pnpm`.

**3. Rodar o app:**
```
npx pnpm@10.4.1 run dev
```

Vai aparecer algo como `Server running on http://localhost:3000/`. Deixe esse Terminal aberto — é o servidor rodando.

**4. Abrir no navegador direto nesta página de login local:**
```
http://localhost:3000/api/dev-login
```
Ela identifica sozinha qual conta é dona dos orçamentos no banco e já te loga como ela. Se por acaso houver mais de uma conta no banco, ela mostra uma lista pra você escolher a certa (a que tem nome/e-mail reconhecíveis).

Depois desse primeiro login, pode navegar normalmente por `http://localhost:3000`.

**Se a tela já veio em branco antes (sem orçamentos):** era um bug do login local — ele estava criando uma conta nova vazia em vez de usar a conta dona dos dados. Já corrigi. Só repita o passo 4 acima (`/api/dev-login`) para logar na conta certa.

**Para parar o servidor:** volte no Terminal e aperte `Control + C`.

## Se der algo errado

- **Porta 3000 ocupada:** o próprio app procura uma porta livre automaticamente e avisa no Terminal qual porta usar (ex: `http://localhost:3001/`).
- **Erro de conexão com banco de dados:** confirme que o arquivo `.env` existe na pasta do projeto e tem a linha `DATABASE_URL=...` preenchida.
- **`pnpm: command not found`:** use sempre `npx pnpm@10.4.1 ...` na frente do comando, em vez de só `pnpm ...`.

## Próximos passos

Com isso funcionando 100% localmente, os próximos passos naturais são:

1. **Aprimorar o código** — corrigir os pontos que já identifiquei (arquivo `server/routers.ts` gigante, scripts soltos na raiz, etc.) e adicionar funcionalidades novas.
2. **Hospedar online** — subir para Railway ou Render, ligados a um repositório GitHub.
3. **Domínio próprio** — apontar `orcamento.construtoraeg.com.br` (subdomínio, sem mexer no site institucional) via um registro CNAME no Registro.br.
4. **Trocar as senhas expostas** — a senha do banco de dados e as chaves da Manus estavam em texto puro no código-fonte original. Vale trocar essas credenciais quando puder, pelos painéis da Manus/TiDB.
