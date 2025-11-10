# Totonz - Trading Charts Application

Aplicación web moderna para visualización de gráficos de trading y datos financieros en tiempo real.

![Totonz Trading Charts](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue) ![Vite](https://img.shields.io/badge/Vite-5.0-purple)

## 🚀 Características

- **Gráficos Interactivos**: Visualización de datos de precio con gráficos de área responsivos
- **Análisis de Volumen**: Gráficos de barras para visualizar el volumen de trading
- **Resumen de Mercado**: Dashboard con estadísticas clave (precio actual, cambio, máximos/mínimos 24h)
- **Diseño Responsive**: Totalmente adaptable a dispositivos móviles y desktop
- **Tema Oscuro**: Interfaz optimizada para reducir fatiga visual
- **TypeScript**: Type safety completo en toda la aplicación

## 🛠️ Stack Tecnológico

- **React 18** - Biblioteca UI
- **TypeScript** - Lenguaje con tipado estático
- **Vite** - Build tool y dev server ultra-rápido
- **Recharts** - Librería de gráficos para React
- **TailwindCSS** - Framework de utilidades CSS
- **Lightweight Charts** - Librería especializada en gráficos financieros

## 📦 Instalación

1. Clona el repositorio:
```bash
git clone <repository-url>
cd totonz
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura las credenciales de Balanz:
```bash
cp .env.example .env.local
```
Edita `.env.local` y completa con tus credenciales:
```
VITE_BALANZ_USER=tu_usuario
VITE_BALANZ_PASS=tu_password
```

4. Inicia el servidor de desarrollo:
```bash
npm run dev
```

5. Abre tu navegador en `http://localhost:5173`

## 🔐 Autenticación Balanz

La aplicación implementa autenticación automática con la API de Balanz mediante un flujo de dos pasos:

1. **POST /auth/init** - Obtiene un nonce de autenticación
2. **POST /auth/login** - Obtiene el accessToken usando el nonce

El token se almacena en caché por 30 minutos para evitar llamadas innecesarias.

### Probar la Autenticación

En la consola del navegador, puedes usar las siguientes funciones:

```javascript
// Verificar configuración
testBalanzAuth.checkConfig()

// Obtener nuevo token (sin caché)
await testBalanzAuth.getNewToken()

// Obtener token con caché
await testBalanzAuth.getCachedToken()

// Limpiar caché
testBalanzAuth.clearCache()
```

### Archivos Relacionados

- `src/services/balanzAuth.ts` - Servicio de autenticación
- `src/services/balanzAuthTest.ts` - Utilidades de testing
- `.env.local` - Credenciales (NO se sube a Git)
- `.env.example` - Template de configuración

## 🏗️ Estructura del Proyecto

```
totonz/
├── src/
│   ├── components/        # Componentes React
│   │   ├── PriceChart.tsx      # Gráfico de evolución de precio
│   │   ├── VolumeChart.tsx     # Gráfico de volumen
│   │   └── MarketSummary.tsx   # Resumen del mercado
│   ├── types/             # Definiciones TypeScript
│   │   └── index.ts            # Tipos para datos de trading
│   ├── utils/             # Funciones utilitarias
│   │   └── chartHelpers.ts     # Helpers para gráficos y formato
│   ├── App.tsx            # Componente principal
│   ├── main.tsx           # Punto de entrada
│   └── index.css          # Estilos globales
├── index.html             # HTML base
├── package.json           # Dependencias y scripts
├── tsconfig.json          # Configuración TypeScript
├── vite.config.ts         # Configuración Vite
└── tailwind.config.js     # Configuración TailwindCSS
```

## 📜 Scripts Disponibles

- `npm run dev` - Inicia el servidor de desarrollo
- `npm run build` - Construye la aplicación para producción
- `npm run preview` - Preview de la build de producción
- `npm run lint` - Ejecuta el linter ESLint

## 🎨 Componentes Principales

### PriceChart
Muestra la evolución del precio a lo largo del tiempo con un gráfico de área con gradiente.

### VolumeChart
Visualiza el volumen de trading en formato de barras, con colores que indican días alcistas (verde) o bajistas (rojo).

### MarketSummary
Panel de resumen que muestra:
- Símbolo del par de trading
- Precio actual
- Cambio porcentual
- Máximo y mínimo en 24h
- Volumen en 24h

## 🔧 Configuración

### Personalizar Datos

Los datos se generan en `src/utils/chartHelpers.ts` mediante la función `generateCandlestickData()`. Para conectar datos reales:

1. Crea un servicio para conectarte a tu API de datos financieros
2. Actualiza el estado en `App.tsx` con los datos reales
3. Implementa actualización en tiempo real con WebSockets si es necesario

### Estilos

Los estilos utilizan TailwindCSS. Puedes personalizarlos en:
- `tailwind.config.js` - Configuración global de tema
- `src/index.css` - Variables CSS y estilos base

## 🚀 Despliegue

Para construir la aplicación para producción:

```bash
npm run build
```

Los archivos optimizados se generarán en el directorio `dist/` listos para ser desplegados en cualquier servidor estático.

### Plataformas Recomendadas
- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront

## 📊 Próximas Características

- [ ] Integración con APIs reales de trading (Binance, Coinbase, etc.)
- [ ] Gráficos de velas japonesas (candlestick) interactivos
- [ ] Indicadores técnicos (RSI, MACD, Bollinger Bands)
- [ ] Múltiples pares de trading
- [ ] Watchlist personalizada
- [ ] Alertas de precio
- [ ] Modo claro/oscuro toggle

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Haz fork del proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## � Backend Proxy Seguro

La aplicación incluye un **backend Node.js/Express** que maneja la autenticación con Balanz de forma segura.

### Características del Backend

- 🔒 **Autenticación segura**: Credenciales solo en el servidor
- 🔄 **Proxy API**: Todas las llamadas a Balanz pasan por el backend
- 💾 **Gestión de sesión**: Token en memoria (no expuesto al frontend)
- 🚀 **Hot reload**: Desarrollo rápido con `--watch`

### Iniciar el Backend

```bash
# Terminal 1 - Backend
cd server
source ~/.nvm/nvm.sh && nvm use 20.19.5
node index.js
# Servidor corriendo en http://localhost:3001

# Terminal 2 - Frontend  
source ~/.nvm/nvm.sh && nvm use 20.19.5
npm run dev
# App corriendo en http://localhost:5173
```

### Configurar Credenciales

Edita `server/.env`:
```env
PORT=3001
BALANZ_USER=tu_usuario
BALANZ_PASSWORD=tu_contraseña
BALANZ_TOKEN=tu_token
BALANZ_CUENTA_ID=tu_cuenta
```

⚠️ **IMPORTANTE**: Nunca subas el archivo `.env` a Git.

### API Endpoints del Backend

- `POST /api/auth/login` - Iniciar sesión en Balanz
- `GET /api/auth/status` - Verificar estado de autenticación
- `POST /api/auth/logout` - Cerrar sesión
- `GET /api/balanz/estadodecuenta` - Obtener datos de cartera
- `GET /api/balanz/dolar` - Cotización del dólar
- `GET /health` - Health check

Más detalles en `server/README.md`

## �📝 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

## 👨‍💻 Autor

Desarrollado con ❤️ para la comunidad de trading

---

**Nota**: Esta aplicación se integra con APIs reales de Balanz, Finnhub y Yahoo Finance para datos en tiempo real.
