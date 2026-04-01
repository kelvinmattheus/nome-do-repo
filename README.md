# BlueCredit Pro

Versão mais profissional do sistema de controle de clientes, contratos, distribuição de cobradores e pagamentos.

## Stack
- Front-end: React + Vite + Ant Design
- Back-end: Node.js + Express
- Banco: SQLite com Prisma
- Autenticação: JWT

## Perfis
- **ADMIN**
  - gerencia usuários
  - cria, edita e exclui clientes
  - cria, edita e exclui contratos
  - distribui contratos para cobradores
  - vê todos os pagamentos
- **COLLECTOR**
  - vê contratos atribuídos a ele
  - registra, edita e exclui os próprios pagamentos
  - acompanha o resumo e suas distribuições

## Funcionalidades
- Login com senha
- Dashboard com resumo financeiro
- Cadastro de clientes com endereço brasileiro
- Geração visual da idade a partir da data de nascimento
- Cadastro de contratos
- Distribuição de contratos para cobradores
- Informe de pagamento com editar e apagar
- CRUD de usuários
- Design premium em azul estilo Facebook

## Usuários padrão
Após rodar o seed:
- Admin: `admin@admin.com` / `123456`
- Cobrador: `cobrador@empresa.com` / `123456`

## Instalação local
### 1) Backend
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run seed
npm run dev
```

### 2) Frontend
```bash
cd frontend
cp .env.example .env
# edite VITE_API_URL para o IP/host do backend
npm install
npm run dev
```

## Instalação na AWS EC2 Ubuntu
Use o script `install-ec2.sh` na raiz do projeto.

```bash
chmod +x install-ec2.sh
./install-ec2.sh
```

Depois:
- backend em `http://IP-DA-VM:3000`
- frontend em `http://IP-DA-VM:5173`

## Estrutura
```text
backend/
  prisma/
  src/
frontend/
  src/
```

## Melhorias futuras indicadas para venda premium
- PostgreSQL
- filtros por período no dashboard
- relatórios PDF/Excel
- parcelas individualizadas por contrato
- confirmação de baixa parcial por parcela
- auditoria de ações do usuário
- upload de documentos do cliente
- versão com domínio + HTTPS + PM2 + Nginx
