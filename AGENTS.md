# AGENTS.md

Arquivo de contexto operacional para agentes de código.
Fonte da verdade: código-fonte. Última atualização: 2026-04-06.

---

## 1. Resumo executivo do projeto

**mipixi-pro** é um sistema de gestão de crédito informal / vendas parceladas voltado para pequenos comerciantes que vendem produtos (como cestas básicas) a prazo.

Funcionalidades centrais:
- Cadastro de clientes com CPF, endereço e renda
- Criação de contratos parcelados com juros
- Distribuição de contratos para cobradores
- Registro e rastreamento de pagamentos
- Controle de estoque de produtos e cestas básicas
- Inclusão e gestão de inadimplentes no SPC
- Dashboard financeiro, relatórios PDF/Excel/CSV
- Log de auditoria de todas as ações

**Nome do produto**: `mipixi-pro` (nome anterior em código legado: "BlueCredit Pro" — ainda presente em `premium.css`).

**Perfis principais**:
- `ADMIN` — acesso total ao sistema
- `COLLECTOR` — acesso restrito à cobrança: vê apenas contratos atribuídos a si, registra/edita/exclui próprios pagamentos

---

## 2. Fonte da verdade

Ordem de confiança decrescente:

1. `backend/src/server.js` — rotas, regras de negócio, validações reais
2. `backend/prisma/schema.prisma` — estrutura do banco confirmada
3. `backend/src/utils/business.js` — lógica pura, funções compartilhadas
4. `backend/src/middleware/auth.js` — autenticação real
5. `frontend/src/App.jsx` — estado e comportamento real do frontend
6. `frontend/src/services/api.js` — comunicação com API
7. `backend/package.json` / `frontend/package.json` — dependências reais
8. `backend/prisma/seed.js` / `seed-full.js` — dados de exemplo (contém inconsistências — ver seção 12)
9. `README.md` — **recém atualizado, mas ainda contém omissões** (ver seção 12)

---

## 3. Stack real confirmada

### Frontend
- React 18.3 + Vite 5.4
- Ant Design 5.21 (componentes e tema)
- Axios 1.7 (HTTP, `withCredentials: true`)
- dayjs 1.11 + plugin utc (manipulação de datas)
- recharts 3.8 (gráficos no dashboard)
- framer-motion 12 (animações)
- react-resizable 3.1 (colunas redimensionáveis nas tabelas)

### Backend
- Node.js + Express 4.21
- Prisma ORM 6.5 (`@prisma/client`)
- bcryptjs 2.4 (hash de senha)
- jsonwebtoken 9.0 (JWT)
- cookie-parser 1.4 (leitura do cookie HttpOnly)
- zod 3.23 (validação de entrada)
- express-rate-limit 8.3
- pdfkit 0.18 (geração de PDF)
- exceljs 4.4 (geração de Excel)
- morgan 1.10 (log HTTP)
- dayjs 1.11 (datas no backend)
- dotenv 16.4

### Banco de dados
- **PostgreSQL** (confirmado em `schema.prisma` `datasource db { provider = "postgresql" }` e `.env.example`)
- Prisma como único ORM/query builder

### Autenticação
- JWT gerado no login, armazenado em **cookie HttpOnly** (`authToken`)
- Flag `secure` ativa automaticamente quando `NODE_ENV=production`
- `sameSite: 'lax'`
- Expiração: 7 dias
- Middleware aceita cookie **ou** header `Authorization: Bearer` (para clientes que não suportam cookie)

### Ferramentas de dev/deploy
- nodemon 3.1 (dev)
- Jest 30 (testes unitários — 50 testes)
- PM2 (processo em produção, `ecosystem.config.cjs`)
- nginx (proxy reverso, porta 8080 → backend 3001)
- Railway (deploy alternativo, `backend/railway.json`)
- Contabo VPS Ubuntu (hospedagem atual)

---

## 4. Estrutura do repositório

```
mipixi-pro/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # modelos do banco — fonte da verdade das entidades
│   │   ├── seed.js                # seed mínimo: 2 usuários (admin + cobrador)
│   │   └── seed-full.js           # seed completo: 10 clientes, 10 contratos, produtos, SPC
│   └── src/
│       ├── middleware/
│       │   └── auth.js            # JWT: lê cookie ou header, verifica role
│       ├── utils/
│       │   ├── business.js        # funções puras testáveis: parseDate, isValidCpf,
│       │   │                      #   calcContractTotal, buildInstallments,
│       │   │                      #   normalizeInstallmentStatus, normalizeContractStatus,
│       │   │                      #   toCsv, moneyLike, safeErrorMessage, getErrorStatus
│       │   ├── date.js            # startOfMonth, endOfMonth, startOfDay, endOfDay
│       │   └── prisma.js          # singleton PrismaClient
│       ├── __tests__/
│       │   ├── business.test.js   # 40 testes das funções puras
│       │   └── auth.middleware.test.js  # 10 testes do middleware de auth
│       └── server.js              # ⚠️ arquivo central: 3791 linhas, contém TODAS as rotas
├── frontend/
│   ├── dist/                      # build estático servido pelo nginx
│   └── src/
│       ├── App.jsx                # ⚠️ arquivo central: 4952 linhas, contém TODAS as telas
│       ├── main.jsx               # entrypoint: ConfigProvider Ant Design + locale pt-BR
│       ├── services/
│       │   └── api.js             # instância axios + interceptor 401 + erro de rede
│       ├── components/
│       │   └── PageHeader.jsx     # componente de cabeçalho de página (título + subtítulo + ações)
│       ├── premium.css            # design system completo (tokens, tipografia, cards, tabelas)
│       └── styles.css             # tokens CSS globais e base (body, root, variáveis)
├── ecosystem.config.cjs           # PM2: app "mipixi-pro", porta 3001, log em /var/log/mipixi-pro/
├── install-ec2.sh                 # script de instalação — ⚠️ DESATUALIZADO (ver seção 12)
└── README.md                      # documentação geral — recém atualizado
```

---

## 5. Como rodar localmente

### Pré-requisitos
- Node.js 20+
- PostgreSQL rodando (local ou Docker)
- npm

### Ordem correta

**1. Backend**
```bash
cd backend
cp .env.example .env
# edite .env: DATABASE_URL, JWT_SECRET (min. 32 chars), SETUP_ADMIN_KEY, PORT=3000
npm install
npx prisma generate
npx prisma db push
npm run seed          # seed mínimo (2 usuários)
# ou: node prisma/seed-full.js   # seed completo com dados de demonstração
npm run dev           # nodemon — http://localhost:3000
```

**2. Frontend**
```bash
cd frontend
# crie frontend/.env com: VITE_API_URL=http://localhost:3000
npm install
npm run dev           # Vite — http://localhost:5173
```

### Portas padrão
| Serviço | Local | Produção (Contabo) |
|---------|-------|--------------------|
| Backend | 3000 | 3001 (PM2) |
| Frontend dev | 5173 | — (nginx serve `dist/`) |
| nginx externo | — | 8080 |

### Testes
```bash
cd backend
npm test
```

---

## 6. Variáveis de ambiente

### Backend (`backend/.env`)

| Variável | Onde usada | Obrigatória | Impacto |
|----------|-----------|-------------|---------|
| `DATABASE_URL` | Prisma | **sim** | Sem ela o processo aborta na inicialização |
| `JWT_SECRET` | `signUser()`, `auth.js` | **sim** | Sem ela o processo aborta na inicialização |
| `SETUP_ADMIN_KEY` | `POST /auth/setup-admin` | **sim** | Chave única para criar o primeiro admin sem autenticação |
| `PORT` | `app.listen()` | não | Padrão `3000`; PM2 força `3001` via `ecosystem.config.cjs` |
| `FRONTEND_URL` | CORS `allowedOrigins` | não | Sem ela, usa origens de dev (`localhost:5173/5174/3000`) — **definir em produção** |
| `NODE_ENV` | `secure` cookie, `safeErrorMessage` | não | `production` ativa cookie seguro e mascara stack traces |

### Frontend (`frontend/.env`)

| Variável | Onde usada | Obrigatória | Impacto |
|----------|-----------|-------------|---------|
| `VITE_API_URL` | `frontend/src/services/api.js` baseURL | não | Padrão `http://localhost:3000`; **em produção** deve apontar para nginx (ex.: `http://IP:8080/api`) |

---

## 7. Modelo de domínio

Todas as entidades estão em `backend/prisma/schema.prisma`.

| Entidade | Propósito | Relações-chave |
|----------|-----------|----------------|
| `User` | Usuários do sistema (ADMIN / COLLECTOR) | tem `assignments`, `payments`, `auditLogs` |
| `Customer` | Cliente/devedor | tem `contracts`, `spcRecords`, `stockMovements` |
| `Contract` | Contrato parcelado | pertence a `Customer`, tem `installments`, `payments`, `assignments` |
| `Installment` | Parcela individual do contrato | pertence a `Contract`; `@@unique([contractId, number])` |
| `Assignment` | Vínculo cobrador ↔ contrato | `@@unique([contractId, collectorId])` — um cobrador por contrato |
| `Payment` | Registro de pagamento | aponta para `Contract`, `Installment` (opcional), `User` (cobrador) |
| `AuditLog` | Log de ações (CREATE/UPDATE/DELETE) | userId nullable (ação anônima possível) |
| `Product` | Produto de estoque | tem `movements`, `basketItems` |
| `StockMovement` | Entrada/saída de produto | pode vincular a `Contract`, `Customer`, `User` |
| `Basket` | Cesta de produtos (kit) | tem `BasketItem[]` e `BasketMovement[]` |
| `BasketItem` | Composição da cesta | `@@unique([basketId, productId])` |
| `BasketMovement` | Movimentação de cesta (MONTAGEM/VENDA) | pode vincular a `Contract`, `Customer` |
| `SpcRecord` | Registro de inadimplente no SPC | tem `SpcAgreement[]`; expira em 5 anos |
| `SpcAgreement` | Acordo de pagamento vinculado ao SPC | pertence a `SpcRecord` |

**Status de parcela** (definido por `normalizeInstallmentStatus` em `business.js`):
`PAGA` / `PARCIAL` / `ATRASADA` / `PENDENTE`

**Status de contrato** (definido por `normalizeContractStatus` em `business.js`):
`ATIVO` / `QUITADO` / `ATRASADO`

---

## 8. Perfis e autenticação

### Fluxo de login
1. `POST /auth/login` — verifica email/senha com `bcrypt.compare`; usa `DUMMY_HASH` para evitar timing attack quando usuário não existe
2. Gera JWT com `{ sub, email, role, name }`, expira em 7 dias
3. Seta cookie HttpOnly `authToken` via `Set-Cookie`
4. Frontend armazena objeto `user` em `localStorage` apenas para UI (não para autenticação)
5. Todas as requisições subsequentes enviam o cookie automaticamente (`withCredentials: true`)

### Middleware `backend/src/middleware/auth.js`
- Lê token de `req.cookies?.authToken` (cookie) **ou** `Authorization: Bearer` (header)
- Cookie tem prioridade
- Chama `jwt.verify()` com `JWT_SECRET`
- Popula `req.user = { sub, email, role, name }`
- Aceita lista de roles: `auth(['ADMIN'])` → retorna 403 se role não bate
- `auth()` sem args → apenas autenticação, qualquer role

### `/auth/me`
- Verifica se o usuário ainda existe no banco **e** se `isActive === true`
- Usado no mount do frontend para validar sessão existente

### Logout
- `POST /auth/logout` — limpa o cookie com `res.clearCookie('authToken')`
- Frontend remove `user` do `localStorage` e reseta estado

### Proteção de rotas no frontend
- Se `user === null` → renderiza tela de login (sem react-router, lógica em `App.jsx`)
- Interceptor axios: resposta 401 → remove `localStorage.user`, redireciona para `/`

---

## 9. Mapa do backend

### Arquivo central
`backend/src/server.js` — **3791 linhas**, contém 100% das rotas. Não há roteamento modular.

### Middlewares
- `cors` — origens configuráveis via `FRONTEND_URL`
- `globalLimiter` — 300 req/min para todas as rotas
- `writeLimiter` — 60 req/min para POST/PUT/DELETE/PATCH
- `authLimiter` — 20 req/15min para `/auth/*`
- `express.json({ limit: '1mb' })`
- `cookieParser`
- `morgan('dev')`
- Request ID — `req.requestId = randomUUID()` → header `X-Request-Id`

### Utils
| Arquivo | Função |
|---------|--------|
| `utils/prisma.js` | Singleton `PrismaClient` |
| `utils/business.js` | Funções puras: `parseDate`, `isValidCpf`, `calcContractTotal`, `buildInstallments`, `normalizeInstallmentStatus`, `normalizeContractStatus`, `toCsv`, `moneyLike`, `safeErrorMessage`, `getErrorStatus` |
| `utils/date.js` | `startOfMonth`, `endOfMonth`, `startOfDay`, `endOfDay` |

### Rotas por módulo

| Módulo | Rotas | Roles |
|--------|-------|-------|
| Health | `GET /health` | público |
| Auth | `POST /auth/setup-admin`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | misto |
| Usuários | `GET/POST /users`, `PUT/DELETE /users/:id`, `GET /collectors` | ADMIN |
| Clientes | `GET /customers`, `GET /customers/:id/full`, `POST/PUT/DELETE /customers/:id` | GET: todos; escrita: ADMIN |
| Contratos | `GET/POST /contracts`, `PUT/DELETE /contracts/:id`, `POST /contracts/:id/renegotiate` | GET: todos; escrita: ADMIN |
| Distribuição | `GET/POST /assignments`, `PUT/DELETE /assignments/:id`, `POST /distribution/bulk`, `GET /distribution/collectors`, `GET /distribution/available-contracts` | ADMIN |
| Pagamentos | `GET /payments`, `GET /payments/:id/receipt`, `POST/PUT/DELETE /payments/:id` | GET: todos; escrita: ADMIN+COLLECTOR |
| Caixa mensal | `GET /cash-accounts/monthly` (JSON/PDF/Excel) | ADMIN |
| Dashboard | `GET /dashboard/summary`, `GET /collector/dashboard` | todos |
| Relatórios | `GET /reports/contracts.csv`, `GET /reports/payments.csv` | todos |
| Auditoria | `GET /audit-logs` | ADMIN |
| Produtos | `GET/POST /products`, `PUT/DELETE /products/:id` | GET: todos; escrita: ADMIN |
| Estoque | `GET/POST /stock/movements`, `GET /stock/summary`, `PUT/DELETE`, reversões | ADMIN |
| Cestas | `GET/POST /baskets`, `PUT/DELETE /baskets/:id`, movimentações, histórico | misto |
| SPC | `GET /spc`, `GET /spc/summary`, `POST /spc`, `PUT /spc/:id/baixar`, acordo, editar, deletar | ADMIN |

### Funções internas relevantes
- `enrichContract(contract)` — calcula `paidAmount`, `pendingAmount`, `paidInstallments`, `overdueInstallments`, `remainingInstallments`, `status` normalizado
- `signUser(user)` — gera JWT
- `setAuthCookie(res, token)` — seta cookie com flags corretas
- `writeAuditLog({...})` — persiste log sem lançar exceção
- `pdfDrawTable(doc, headers, rows, colWidths)` — helper para tabelas PDF
- `DUMMY_HASH` — bcrypt hash gerado no startup para proteção contra timing attack

### Riscos de acoplamento
- Toda lógica de negócio, validação, geração de PDF/Excel e queries Prisma estão em um único arquivo
- Adicionar uma nova entidade exige editar `server.js` diretamente
- `enrichContract` é chamado em loop (N+0 dado que os dados já vêm incluídos, mas ainda é O(n) em memória)

---

## 10. Mapa do frontend

### Entrypoint
`frontend/src/main.jsx` — `ReactDOM.createRoot` + `ConfigProvider` Ant Design com locale `pt-BR` e tema azul (`colorPrimary: '#1877f2'`)

### Componente raiz
`frontend/src/App.jsx` — **4952 linhas**, arquivo único para todo o frontend.

### Telas gerenciadas (menu lateral)
| Key | Tela | Perfil |
|-----|------|--------|
| `dashboard` | Resumo financeiro | todos |
| `customers` | Clientes | todos |
| `contracts` | Contratos | todos |
| `payments` | Pagamentos | todos |
| `cobranca` | Sub-menu cobrança | todos |
| `users` | Usuários | ADMIN |
| `cashAccounts` | Prestação de contas | ADMIN |
| `estoque` | Estoque de produtos | ADMIN |
| `cestas` | Cestas básicas | ADMIN |
| `spc` | SPC | ADMIN |
| `audit` | Auditoria | ADMIN |

### Estado global (tudo em `App.jsx`)
Mais de 40 `useState` gerenciando: `user`, `current` (tela ativa), `summary`, `customers`, `contracts`, `payments`, `collectors`, `users`, `availableContracts`, `auditLogs`, `products`, `stockMovements`, `stockSummary`, `baskets`, `basketMovements`, `basketSummary`, `spcRecords`, `spcSummary`, dezenas de modais/drawers.

### Serviço de API
`frontend/src/services/api.js`:
- `baseURL: VITE_API_URL || 'http://localhost:3000'`
- `withCredentials: true` — envia cookie em todas as requisições
- Interceptor de resposta:
  - 401 → remove `localStorage.user`, redireciona para `/` se não estiver em `/login` ou `/`
  - Sem resposta (rede) → injeta `error.response.data.message` com mensagem amigável

### Comunicação com o backend
- Todas as chamadas via `api` (instância axios)
- `loadAll()` — função que dispara em paralelo (`Promise.all`) todas as chamadas de dados ao montar/atualizar
- Dependência: `[user?.id, isAdmin, isCollector]`

### Gargalos de manutenção
- `App.jsx` com 4952 linhas é inviável de manter sem risco de regressão
- Não há react-router — navegação por `current` state
- Sem gerenciamento de estado externo (Redux, Zustand, etc.)
- Todo modal/drawer/form vive dentro de `App.jsx`
- Nenhuma separação entre lógica de apresentação e chamadas de API

---

## 11. Arquivos críticos

| Arquivo | Por que é crítico | O que passa por ele | Risco ao editar |
|---------|------------------|---------------------|-----------------|
| `backend/src/server.js` | Contém 100% das rotas e lógica de negócio | Toda mudança de comportamento do backend | Alto — 3791 linhas, sem testes de integração |
| `backend/prisma/schema.prisma` | Define estrutura do banco | Novas entidades, campos, índices | Alto — mudança sem `prisma migrate` pode corromper dados |
| `backend/src/utils/business.js` | Funções puras compartilhadas | Cálculo de parcelas, status, validação CPF | Médio — coberto por testes |
| `backend/src/middleware/auth.js` | Autenticação de todas as rotas protegidas | Mudança de estratégia de auth | Alto — impacta todas as rotas |
| `frontend/src/App.jsx` | 100% do frontend | Qualquer tela, modal, estado, chamada API | Muito alto — sem testes, 4952 linhas |
| `frontend/src/services/api.js` | Interceptors e baseURL | Mudança de auth, CORS, erros globais | Alto — afeta todas as chamadas |
| `ecosystem.config.cjs` | Configuração do PM2 | Porta, modo, logs, restart | Médio — erro aqui derruba produção |

---

## 12. Inconsistências e armadilhas

### Nome do produto
- `premium.css` linha 2: comentário `/* BlueCredit Pro — Premium Design System */` — nome antigo, não foi atualizado
- `backend/package.json` name: `client-control-backend` — não reflete o projeto
- `frontend/package.json` name: `client-control-frontend` — não reflete o projeto

### seed-full.js com dados inválidos
**⚠️ Crítico**: `backend/prisma/seed-full.js` cria clientes com CPFs formatados:
```js
{ cpf: '111.222.333-44', ... }
```
Mas `isValidCpf()` em `business.js` **rejeita CPFs com pontuação** (`/^\d{11}$/`). Se alguma rota de validação for aplicada retroativamente a esses registros, eles falharão.

Além disso, o seed não passa pelos validadores do backend — insere direto via Prisma — então CPFs inválidos entram no banco.

### seed-full.js com status de parcela inconsistentes
`seed-full.js` cria parcelas com:
- `status: 'PAGO'` e `status: 'VENCIDO'`

Mas `normalizeInstallmentStatus()` retorna:
- `'PAGA'`, `'ATRASADA'`, `'PARCIAL'`, `'PENDENTE'`

O campo `status` da `Installment` no schema é `String @default("PENDENTE")` sem enum — então o banco aceita qualquer valor. O frontend/backend usa `normalizeInstallmentStatus()` para calcular o status real em runtime, ignorando o campo salvo. Porém, qualquer query que filtre por `status` direto no banco (ex.: `status: 'PAGA'`) falhará para registros criados pelo seed.

### seed-full.js com status de contrato inválido
```js
status: 'INADIMPLENTE'
```
`normalizeContractStatus()` só retorna `'ATIVO'`, `'QUITADO'`, `'ATRASADO'`. O valor `'INADIMPLENTE'` não existe no fluxo normal — é resquício de versão anterior.

### install-ec2.sh desatualizado
- Linha 4: `PROJECT_DIR="$HOME/bluecredit-pro"` — nome antigo, deve ser `mipixi-pro-repo`
- Não menciona PM2 nem nginx
- Não configura o banco PostgreSQL
- Ainda referencia setup para EC2, mas o deploy atual é Contabo VPS

### frontend/.env.example aponta para porta errada em produção
```
VITE_API_URL=http://SEU-IP-OU-DOMINIO:3000
```
Em produção, a porta correta é `8080` (nginx) ou o caminho `/api`. A variável deve ser ajustada.

### Sem enum no banco para campos de status
`Contract.status`, `Installment.status`, `Customer.status`, `SpcRecord.status` etc. são todos `String` — sem restrição no banco. O seed inseriu valores fora do padrão e o banco aceitou silenciosamente.

### App.jsx acumula toda a lógica do frontend
4952 linhas sem separação de responsabilidades. Qualquer alteração em qualquer tela passa por este arquivo. Não há testes de frontend.

### server.js acumula todas as rotas do backend
3791 linhas. Funções utilitárias foram extraídas para `utils/business.js`, mas toda lógica de rota, validação e acesso a dados permanece inline.

### Sem migrações Prisma versionadas
O projeto usa `prisma db push` (sem `prisma migrate`). Isso significa que não há histórico de alterações do schema e rollback manual é necessário em caso de problema.

---

## 13. Regras para futuras alterações

**Schema Prisma**
- Ao adicionar campo/entidade: atualizar `seed.js` e/ou `seed-full.js`, revisar rotas afetadas em `server.js`, revisar formulários em `App.jsx`
- Ao remover campo: verificar se `server.js` referencia o campo, verificar se `App.jsx` exibe o campo
- Sempre rodar `npx prisma db push` (dev) ou `npx prisma migrate deploy` (Railway) após mudanças

**Autenticação**
- Qualquer mudança em auth passa por: `auth.js` + `setAuthCookie()` em `server.js` + interceptor em `api.js` + `persistAuth()`/`logout()` em `App.jsx`
- Não remover suporte ao header `Authorization: Bearer` — pode estar em uso por integrações externas ou testes

**Status de entidades**
- Os status de `Installment` e `Contract` são calculados em runtime por `normalizeInstallmentStatus` e `normalizeContractStatus` — não confiar no campo `status` salvo no banco
- Se adicionar novo status, atualizar: `business.js` + lógica de filtro em `server.js` + exibição de `Tag` em `App.jsx`

**CORS e variáveis de ambiente**
- Mudança de URL/porta impacta: `FRONTEND_URL` no backend + `VITE_API_URL` no frontend + configuração nginx
- `NODE_ENV=production` ativa `secure` no cookie — não testar auth em HTTP com essa flag

**Relatórios PDF/Excel**
- Qualquer mudança em campos de `Contract`, `Payment` ou `Customer` pode quebrar os relatórios — verificar as funções de geração no final de `server.js`

**Busca e filtros**
- Todos os `contains` de texto usam `mode: 'insensitive'` — requer PostgreSQL (não funciona em SQLite)
- Busca por CPF faz `q.replace(/\D/g, '')` antes — strip de formatação esperado

**Testes**
- Ao alterar `business.js`: rodar `npm test` e atualizar `__tests__/business.test.js`
- Ao alterar `auth.js`: atualizar `__tests__/auth.middleware.test.js`
- Não há testes de integração — qualquer mudança em `server.js` é deploy "ao vivo"

**seed-full.js**
- Antes de usar como referência de dados, verificar que CPFs e status estão consistentes com as regras do código
- Não usar CPFs formatados (`111.222.333-44`) em fixtures — usar somente 11 dígitos limpos

**Documentação**
- Ao corrigir inconsistência no código, atualizar `README.md` e esta seção de `AGENTS.md`
- Ao adicionar módulo, atualizar seções 7, 9, 10 e 11 deste arquivo

---

## 14. Próximos passos sugeridos

Ordenados por impacto/urgência:

1. **Corrigir seed-full.js** — CPFs com formatação (`111.222.333-44`) e status inválidos (`'PAGO'`, `'VENCIDO'`, `'INADIMPLENTE'`) que divergem das regras de negócio reais

2. **Atualizar install-ec2.sh** — renomear diretório `bluecredit-pro` → `mipixi-pro-repo`, adicionar passos de PM2 e nginx, referenciar PostgreSQL

3. **Atualizar comentário em premium.css** — remover "BlueCredit Pro" da linha 2

4. **Atualizar package.json** — `name` do backend e frontend para `mipixi-pro-backend` e `mipixi-pro-frontend`

5. **Adicionar enums de status no schema** — usar `String` com validação Zod é suficiente, mas documentar os valores aceitos como comentário no schema reduz erros futuros

6. **Migrar para `prisma migrate`** — criar baseline de migration para permitir rollback e histórico de evolução do banco

7. **Extrair telas do App.jsx** — cada seção do menu (`Clientes`, `Contratos`, `Pagamentos`, etc.) pode ser um componente em `frontend/src/pages/`. Reduz risco de regressão ao editar qualquer tela

8. **Extrair rotas do server.js** — criar `routes/customers.js`, `routes/contracts.js`, etc. usando `express.Router()`. Reduz conflitos em edições paralelas

9. **Adicionar testes de integração** — ao menos para os fluxos de login, criação de contrato e registro de pagamento

10. **Documentar nginx config real** — salvar o arquivo nginx atual em `infra/nginx.conf` no repositório

---

## 15. Protocolo de manutenção do AGENTS.md

Atualizar este arquivo quando ocorrer qualquer um dos eventos abaixo:

| Evento | Seções afetadas |
|--------|----------------|
| Nova entidade no Prisma | 7 (domínio), 11 (arquivos críticos), 13 (regras) |
| Nova rota no backend | 9 (mapa backend) |
| Nova tela no frontend | 10 (mapa frontend) |
| Mudança de autenticação | 8 (auth), 11 (arquivos críticos), 13 (regras) |
| Mudança de deploy / infraestrutura | 3 (stack), 5 (como rodar), 6 (env vars) |
| Refatoração estrutural (ex.: extrair módulos) | 4 (estrutura), 9, 10 |
| Inconsistência corrigida | 12 (remover da lista ou marcar como resolvida) |
| Novo perfil de usuário | 1, 8, 9 (permissões) |
| Mudança de dependências significativas | 3 (stack) |
