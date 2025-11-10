#!/bin/bash

# Script para iniciar ambos servidores de Totonz
# Uso: ./start.sh

echo "🚀 Iniciando Totonz Trading Dashboard..."
echo ""

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Cargar NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Cambiar a Node 20.19.5
echo -e "${BLUE}📦 Configurando Node.js v20.19.5...${NC}"
nvm use 20.19.5
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}⚠️  Error: Este script debe ejecutarse desde la raíz del proyecto${NC}"
    exit 1
fi

# Función para manejar Ctrl+C
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Deteniendo servicios...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup INT TERM

# Iniciar Backend
echo -e "${BLUE}🔧 Iniciando Backend (puerto 3001)...${NC}"
cd server
node index.js &
BACKEND_PID=$!
cd ..
sleep 2

# Verificar que el backend esté corriendo
if curl -s http://localhost:3001/health > /dev/null; then
    echo -e "${GREEN}✅ Backend iniciado correctamente${NC}"
else
    echo -e "${YELLOW}⚠️  Backend no responde${NC}"
fi
echo ""

# Iniciar Frontend
echo -e "${BLUE}🎨 Iniciando Frontend (puerto 5173)...${NC}"
npm run dev &
FRONTEND_PID=$!
sleep 3

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ Totonz está corriendo            ║${NC}"
echo -e "${GREEN}║                                        ║${NC}"
echo -e "${GREEN}║   🔧 Backend:  http://localhost:3001  ║${NC}"
echo -e "${GREEN}║   🎨 Frontend: http://localhost:5173  ║${NC}"
echo -e "${GREEN}║                                        ║${NC}"
echo -e "${GREEN}║   Presiona Ctrl+C para detener        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

# Mantener el script corriendo
wait
