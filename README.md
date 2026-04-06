# mipixi-pro

Sistema de controle de clientes, contratos, cobrança, estoque e SPC.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + Ant Design |
| Backend | Node.js + Express 4 |
| Banco de dados | PostgreSQL via Prisma ORM |
| Autenticação | JWT armazenado em cookie HttpOnly |
| Processo (produção) | PM2 |
| Proxy reverso | nginx (porta 8080 → backend 3001) |
| Deploy alternativo | Railway |

## Perfis de acesso

| Perfil | Permissões |
|--------|-----------|
| **ADMIN** | Acesso completo: usuários, clientes, contratos, pagamentos, estoque, SPC, auditoria, relatórios |
| **COLLECTOR** | Vê contratos atribuídos, registra/edita/exclui os próprios pagamentos, acessa dashboard de cobrança |

## Módulos

- **Autenticação** — login/logout com cookie HttpOnly, verificação de sessão ativa (`/auth/me`)
- **Usuários** — CRUD de usuários ADMIN e COLLECTOR
- **Clientes** — cadastro completo com CPF validado, endereço e dados financeiros; busca case-insensitive por nome, CPF, telefone e cidade
- **Contratos** — criação com parcelas automáticas, juros, renegociação, status calculado (ATIVO / ATRASADO / QUITADO)
- **Distribuição** — atribuição de contratos para cobradores (individual ou em massa)
- **Pagamentos** — registro de pagamentos com baixa de parcelas, comprovante PDF, caixa mensal em PDF e Excel
- **Estoque** — produtos, movimentações de entrada/saída, cestas de produtos, ajustes e reversões
- **SPC** — inclusão de inadimplentes, acordos de pagamento, baixa automática
- **Dashboard** — resumo financeiro (admin e cobrador), indicadores de inadimplência
- **Relatórios** — exportação em CSV (contratos e pagamentos), PDF e Excel
- **Auditoria** — log de todas as ações por usuário

## Segurança

- Cookie HttpOnly com flag `secure` ativo em produção (HTTPS)
- Rate limiting global (300 req/min) e em escrita (60 req/min)
- Proteção contra timing attack no login com `bcrypt.hashSync`
- Códigos de recibo gerados com `crypto.randomUUID()`
- Validação de CPF com algoritmo de dígitos verificadores
- Validação de entrada via Zod em todos os endpoints
- HTTP status dinâmico: 422 (validação), 409 (conflito), 404 (não encontrado), 500 (interno)
- `X-Request-Id` em todas as respostas para correlação de logs

## Testes

50 testes unitários com Jest cobrindo:
`isValidCpf`, `calcContractTotal`, `buildInstallments`, `normalizeInstallmentStatus`, `normalizeContractStatus`, `parseDate`, `toCsv`, `moneyLike`, `safeErrorMessage`, `getErrorStatus`, middleware de autenticação (token via header e cookie, roles, expirado, malformado).

```bash
cd backend
npm test
```

## Variáveis de ambiente

Copie `backend/.env.example` para `backend/.env` e preencha:

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL de conexão PostgreSQL |
| `JWT_SECRET` | Segredo JWT (mín. 32 caracteres) |
| `SETUP_ADMIN_KEY` | Chave para criar o primeiro admin via `/auth/setup-admin` |
| `PORT` | Porta do servidor (padrão `3000`; PM2 usa `3001`) |
| `FRONTEND_URL` | Origem(s) do frontend para CORS (separe por vírgula) |

## Instalação local

### Backend

```bash
cd backend
cp .env.example .env
# edite .env com DATABASE_URL e JWT_SECRET
npm install
npx prisma generate
npx prisma db push
npm run seed
npm run dev        # http://localhost:3000
```

### Frontend

```bash
cd frontend
# crie .env com: VITE_API_URL=http://localhost:3000
npm install
npm run dev        # http://localhost:5173
```

## Deploy em VPS (Ubuntu + nginx + PM2)

### 1. Pré-requisitos

```bash
sudo apt update && sudo apt install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pm2
```

### 2. Clonar e configurar

```bash
git clone https://github.com/kelvinmattheus/mipixi-pro.git /root/mipixi-pro-repo
cd /root/mipixi-pro-repo/backend
cp .env.example .env
# edite .env
npm install
npx prisma generate
npx prisma db push
npm run seed
```

### 3. Iniciar com PM2

```bash
cd /root/mipixi-pro-repo
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 4. nginx

Exemplo de bloco `server` para `/etc/nginx/sites-available/mipixi-pro`:

```nginx
server {
    listen 8080;

    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        root /root/mipixi-pro-repo/frontend/dist;
        try_files $uri /index.html;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/mipixi-pro /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## Deploy no Railway

O arquivo `backend/railway.json` já está configurado. Basta:

1. Criar um projeto no Railway e adicionar um banco PostgreSQL
2. Conectar o repositório apontando para a pasta `backend`
3. Definir as variáveis de ambiente no painel do Railway
4. O deploy roda `npx prisma migrate deploy && node src/server.js` automaticamente

## Primeiro acesso

Após o seed (ou em ambiente sem seed), crie o admin inicial via:

```bash
curl -X POST http://localhost:3000/auth/setup-admin \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@exemplo.com","password":"SuaSenha123","setupKey":"SETUP_ADMIN_KEY_AQUI"}'
```

## Estrutura

```
mipixi-pro/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # modelos: User, Customer, Contract, Installment,
│   │   │                       #   Assignment, Payment, AuditLog, Product,
│   │   │                       #   StockMovement, Basket, BasketItem,
│   │   │                       #   BasketMovement, SpcRecord, SpcAgreement
│   │   └── seed.js
│   └── src/
│       ├── middleware/
│       │   └── auth.js         # JWT via cookie HttpOnly ou header Authorization
│       ├── utils/
│       │   ├── business.js     # funções puras (cálculo, validação, formatação)
│       │   ├── date.js
│       │   └── prisma.js
│       ├── __tests__/
│       │   ├── business.test.js
│       │   └── auth.middleware.test.js
│       └── server.js           # todas as rotas da API
├── frontend/
│   └── src/
│       ├── App.jsx             # SPA principal (React + Ant Design)
│       ├── services/
│       │   └── api.js          # axios com cookie e interceptor 401
│       └── components/
│           └── PageHeader.jsx
└── ecosystem.config.cjs        # configuração PM2
```
