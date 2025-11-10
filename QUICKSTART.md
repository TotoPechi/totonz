# ⚡ INICIO RÁPIDO

## 🚀 Opción 1: Script Automático (Recomendado)

```bash
./start.sh
```

Esto iniciará automáticamente:
- ✅ Backend en puerto 3001
- ✅ Frontend en puerto 5173

Luego abre: **http://localhost:5173**

---

## 🔧 Opción 2: Manual (Dos Terminales)

### Terminal 1: Backend

```bash
cd server
source ~/.nvm/nvm.sh && nvm use 20.19.5
node index.js
```

### Terminal 2: Frontend

```bash
source ~/.nvm/nvm.sh && nvm use 20.19.5
npm run dev
```

Luego abre: **http://localhost:5173**

---

## 📚 Documentación Completa

- **`STATUS.md`** - Estado actual y resumen ejecutivo
- **`USAGE.md`** - Guía detallada de uso
- **`AUTHENTICATION.md`** - Arquitectura de seguridad
- **`README.md`** - Documentación completa
- **`server/README.md`** - Documentación del backend

---

## ✅ Lo que Funciona

- ✅ Backend Node.js con autenticación segura
- ✅ Modal de login en el frontend
- ✅ Integración con Balanz API
- ✅ Gráficos históricos con Yahoo Finance
- ✅ Cache local de datos
- ✅ Click en ticker para análisis detallado
- ✅ PPC (Precio Promedio Ponderado) en gráficos

---

## 🎯 Próximo Paso

Investigar el endpoint real de login de Balanz:

1. Abre https://clientes.balanz.com/auth/login
2. DevTools (F12) → Network
3. Haz login
4. Encuentra el request
5. Actualiza `server/index.js` línea 42-52

Mientras tanto, el sistema funciona con token preconfigurado en `server/.env`

---

**¿Problemas?** Lee `STATUS.md` sección Troubleshooting
