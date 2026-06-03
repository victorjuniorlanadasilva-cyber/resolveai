# ResolveAi

Projeto separado para deploy gratuito:

- `frontend/`: app estático para Vercel.
- `backend/`: API Node.js para Render.
- Banco: Supabase PostgreSQL.
- Repositório: GitHub.

## Estrutura

```text
frontend/
  index.html
  app.js
  styles.css
  assets/
  scripts/build.js
  vercel.json

backend/
  src/server.js
  sql/schema.sql
  package.json
  .env.example
```

## Banco Supabase

1. Crie uma conta grátis em Supabase.
2. Crie um novo projeto.
3. Vá em `Project Settings` > `Database`.
4. Copie a connection string PostgreSQL.
5. Use a connection string em `DATABASE_URL` no Render.

O backend cria as tabelas automaticamente no primeiro start usando `backend/sql/schema.sql`.

## Backend no Render

1. Suba o projeto para o GitHub.
2. Entre no Render e crie um `Web Service`.
3. Conecte o repositório GitHub.
4. Configure:

```text
Root Directory: backend
Build Command: npm install && npm run build
Start Command: npm start
Plan: Free
```

5. Configure as variáveis de ambiente:

```env
DATABASE_URL=postgresql://...
FRONTEND_URL=https://seu-frontend.vercel.app
APP_URL=https://seu-frontend.vercel.app
BACKEND_URL=https://seu-backend.onrender.com
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_PUBLIC_KEY=
MERCADOPAGO_WEBHOOK_SECRET=
SESSION_SECRET=uma_chave_grande_e_secreta
```

`FRONTEND_URL` libera CORS para o domínio da Vercel.

Para o deploy atual do ResolveAi, confira estes valores nos paineis:

```env
FRONTEND_URL=https://resolveai-nine.vercel.app
APP_URL=https://resolveai-nine.vercel.app
BACKEND_URL=https://resolveai-2blg.onrender.com
VITE_API_URL=https://resolveai-2blg.onrender.com
```

No Render, cadastre tambem `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_PUBLIC_KEY` com as credenciais de producao do Mercado Pago. Nao coloque esses valores no codigo.

## Frontend na Vercel

1. No Vercel, crie um novo projeto pelo mesmo repositório GitHub.
2. Configure:

```text
Root Directory: frontend
Build Command: npm run build
Output Directory: dist
```

3. Configure a variável:

```env
VITE_API_URL=https://seu-backend.onrender.com
```

4. Faça deploy.

## Mercado Pago

No painel do Mercado Pago, configure o webhook:

```text
https://seu-backend.onrender.com/api/webhooks/mercadopago
```

As URLs de retorno são montadas com `APP_URL`:

```text
${APP_URL}/pagamento/sucesso
${APP_URL}/pagamento/erro
${APP_URL}/pagamento/pendente
```

Em produção, o backend envia `auto_return: "approved"`. Em localhost, ele omite `auto_return`, porque o Mercado Pago não aceita retorno automático com `localhost`.

## Login ADM

Administrador inicial:

```text
Email: victorjuniorlanadasilva@gmail.com
Senha: Vitinho@2235
```

A senha é gravada com hash no banco.

## Rodar localmente

Backend:

```bash
cd backend
npm install
copy .env.example .env
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Para build local:

```bash
cd frontend
npm run build
```

## GitHub

Antes de enviar:

1. Confira que `.env` não será commitado.
2. Commit:

```bash
git add .
git commit -m "Preparar deploy Vercel Render Supabase"
git push
```

Depois conecte o mesmo repositório na Vercel e no Render.
