# 🎯 Guía de Uso - Totonz Trading Dashboard

## ✅ Sistema Completo Implementado

### Componentes

1. **Frontend React** (localhost:5173)
   - Dashboard de cartera
   - Consulta de tickers
   - Modal de login
   - Gráficos históricos

2. **Backend Node.js** (localhost:3001)
   - Proxy seguro para Balanz API
   - Gestión de autenticación
   - Caché de sesión

## 🚀 Inicio Rápido

### Paso 1: Iniciar Backend

```bash
# Terminal 1
cd server
source ~/.nvm/nvm.sh && nvm use 20.19.5
node index.js
```

Deberías ver:
```
╔════════════════════════════════════════╗
║   🚀 Totonz Server iniciado           ║
║   📡 Puerto: 3001                     ║
║   🔒 Modo: Autenticado                ║
╚════════════════════════════════════════╝
✅ Token cargado desde .env
```

### Paso 2: Iniciar Frontend

```bash
# Terminal 2
cd /Users/emiliano.perez/dev/totonz
source ~/.nvm/nvm.sh && nvm use 20.19.5
npm run dev
```

Deberías ver:
```
VITE v5.4.21  ready in 138 ms
➜  Local:   http://localhost:5173/
```

### Paso 3: Abrir la Aplicación

Abre tu navegador en: **http://localhost:5173/**

## 🎮 Funcionalidades Implementadas

### 1. Login Automático con Token

Al abrir la app, verás un botón **"🔐 Iniciar Sesión"** en la esquina superior derecha.

**Estado actual:**
- ✅ El backend ya está autenticado con el token del `.env`
- ✅ El botón mostrará "Conectado" automáticamente
- ⚠️ El endpoint real de login de Balanz necesita ser investigado

### 2. Cartera Actual

**Pestaña: 📊 Cartera Actual**

Funcionalidades:
- ✅ Ver todas tus posiciones agrupadas por tipo y moneda
- ✅ Toggle "API" / "Local" para cambiar fuente de datos
- ✅ Click en cualquier ticker para ver análisis detallado
- ✅ Indicadores de ganancia/pérdida en tiempo real
- ✅ Conversión USD/ARS con DolarMEP

**Cómo usar:**
1. La cartera se carga automáticamente con datos locales
2. Click en el toggle "🔗 Usar datos de API" para datos en vivo
3. Click en cualquier ticker (ej: "AAPL") para ver detalles

### 3. Consulta de Tickers

**Pestaña: 🔍 Consulta de Tickers**

Funcionalidades:
- ✅ Dropdown con todos los tickers de tu cartera
- ✅ Gráfico histórico de 1 año
- ✅ Selector de timeframe (1W, 1M, 6M, 1Y)
- ✅ Línea de PPC si tienes el activo
- ✅ Estadísticas: precio, cambio, market cap, volumen
- ✅ Links a Yahoo Finance y Google Finance

**Cómo usar:**
1. Selecciona un ticker del dropdown
2. O haz click en un ticker desde la pestaña "Cartera Actual"
3. Cambia el timeframe con los botones (1W, 1M, 6M, 1Y)
4. Hover sobre el gráfico para ver datos específicos

### 4. Historial de Boletos

**Pestaña: 📋 Boletos**

Funcionalidades:
- ✅ Tabla completa de operaciones
- ✅ Filtros por tipo, fecha, ticker
- ✅ Detalles de cada transacción

## 🔐 Sistema de Autenticación

### Modo Actual: Token Preconfigurado

El sistema está funcionando con un **token preconfigurado** en `server/.env`:

```env
BALANZ_TOKEN=DB9CE6B5-E22D-464C-ACAD-286372565C57
```

### Próximo Paso: Login Real

Para implementar login completo con usuario/contraseña:

1. **Investigar endpoint de Balanz:**
   - Abrir DevTools (F12)
   - Ir a https://clientes.balanz.com/auth/login
   - Network tab → Clear
   - Hacer login manualmente
   - Buscar el request de login
   - Copiar: URL, método, headers, body

2. **Actualizar `server/index.js`:**
   ```javascript
   // Reemplazar el POST /api/auth/login con el endpoint real
   const loginResponse = await axios.post(
     'https://clientes.balanz.com/api/XXX/login', // ← URL real
     { 
       username,  // ← Campos reales
       password 
     }
   );
   ```

3. **Probar desde la UI:**
   - Click en "🔐 Iniciar Sesión"
   - Ingresar credenciales
   - Verificar que funcione

### Modo Fallback

Si el login real falla, el sistema automáticamente usa el token del `.env` como fallback.

## 📊 Flujo de Datos

```
Usuario → Frontend → Backend → Balanz API
                ↓
           localStorage
         (cache de datos)
```

### APIs Integradas

1. **Balanz API** (via backend)
   - Estado de cuenta
   - Cotizaciones
   - Posiciones

2. **Finnhub API** (directo)
   - Precio actual
   - Market cap
   - Volumen

3. **Yahoo Finance API** (via proxy)
   - Datos históricos
   - Gráficos de 1 año

## 🐛 Troubleshooting

### El backend no inicia

**Problema:** Error "Unexpected identifier"

**Solución:**
```bash
source ~/.nvm/nvm.sh
nvm use 20.19.5
node --version  # Debe mostrar v20.19.5
```

### El frontend no conecta con el backend

**Problema:** CORS error o 404

**Verificar:**
1. Backend corriendo: `curl http://localhost:3001/health`
2. Frontend en puerto correcto: http://localhost:5173
3. Consola del navegador (F12) para ver errores

### Los datos no cargan

**Problema:** API no responde

**Verificar:**
1. Token válido en `server/.env`
2. Conexión a internet
3. Consola del backend para ver logs
4. Rate limiting de APIs (esperar unos minutos)

### El gráfico no muestra datos

**Problema:** Cache vacío o ticker no encontrado

**Solución:**
1. Abrir DevTools → Console
2. Buscar mensajes de error
3. Limpiar cache: `localStorage.clear()`
4. Recargar la página

## 📝 Logs y Debugging

### Backend Logs

El backend muestra logs de todas las operaciones:

```
🔍 Obteniendo estado de cuenta...
✅ Estado de cuenta obtenido
💵 Obteniendo cotización dólar...
✅ Cotización obtenida
```

### Frontend Logs

Abre la consola del navegador (F12) para ver:

```javascript
🔍 Consultando información de: AAPL
✅ Datos recibidos: 20 tenencias
📊 Usando datos cacheados para AAPL
```

## 🎨 Personalización

### Cambiar Puerto del Backend

Edita `server/.env`:
```env
PORT=3002  # Cambiar a otro puerto
```

Y actualiza `src/services/balanzApi.ts`:
```typescript
const BACKEND_URL = 'http://localhost:3002';
```

### Agregar Nuevos Tickers

Los tickers se cargan automáticamente desde `src/data/balanz_data.json`.

Para agregar más:
1. Edita `balanz_data/` con nuevos archivos Excel
2. Ejecuta `node scripts/convertExcelToJson.js`
3. Recarga la app

### Cambiar Tema

Los colores están en Tailwind. Para cambiar:

**Colores principales:**
- Fondo: `bg-slate-900`
- Tarjetas: `bg-slate-800`
- Texto: `text-white`, `text-slate-400`
- Acentos: `text-blue-400`, `text-green-400`

## 🚀 Próximas Mejoras

### Corto Plazo
- [ ] Investigar endpoint real de login de Balanz
- [ ] Implementar renovación automática de token
- [ ] Agregar indicador de expiración de sesión

### Mediano Plazo
- [ ] Migrar sesiones de memoria a Redis
- [ ] Implementar rate limiting en backend
- [ ] Agregar más gráficos (volumen, RSI, MACD)
- [ ] Export de datos a Excel/CSV

### Largo Plazo
- [ ] Deploy a producción (Vercel + Railway)
- [ ] Notificaciones push de cambios de precio
- [ ] Alertas personalizadas
- [ ] Modo multi-cuenta

## 📞 Soporte

Si encuentras problemas:

1. Revisa los logs del backend y frontend
2. Verifica que ambos servidores estén corriendo
3. Limpia cache: `localStorage.clear()`
4. Reinicia ambos servidores
5. Verifica versión de Node.js: 20.19.5

## ✅ Checklist de Inicio

Antes de comenzar, verifica:

- [x] Node.js 20.19.5 instalado (con nvm)
- [x] Dependencias instaladas (`npm install` en ambas carpetas)
- [x] Archivo `server/.env` configurado con token
- [x] Backend corriendo en puerto 3001
- [x] Frontend corriendo en puerto 5173
- [x] Navegador abierto en http://localhost:5173

---

**¡Todo listo para usar! 🎉**

La aplicación está completamente funcional con:
- ✅ Backend seguro con proxy
- ✅ Login automático con token
- ✅ Integración con APIs reales
- ✅ Gráficos históricos con cache
- ✅ Click en tickers para análisis detallado
- ✅ Sistema de autenticación extensible

El próximo paso es investigar el endpoint real de login de Balanz para permitir autenticación con usuario/contraseña.
