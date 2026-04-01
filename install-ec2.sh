#!/usr/bin/env bash
set -e

PROJECT_DIR="$HOME/bluecredit-pro"

sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

mkdir -p "$PROJECT_DIR"
cp -r . "$PROJECT_DIR"

cd "$PROJECT_DIR/backend"
cp -n .env.example .env || true
npm install
npx prisma generate
npx prisma db push
npm run seed

cd "$PROJECT_DIR/frontend"
cp -n .env.example .env || true
npm install

echo ""
echo "Instalação concluída."
echo ""
echo "Próximos passos:"
echo "1) Edite $PROJECT_DIR/backend/.env se quiser trocar JWT_SECRET e SETUP_ADMIN_KEY"
echo "2) Edite $PROJECT_DIR/frontend/.env e ajuste VITE_API_URL com o IP público da sua EC2"
echo "3) Rode o backend: cd $PROJECT_DIR/backend && npm start"
echo "4) Rode o frontend: cd $PROJECT_DIR/frontend && npm run dev"
