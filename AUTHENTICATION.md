# 🔐 Sistema de Autenticación con Balanz

## Arquitectura

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│             │         │             │         │             │
│   Browser   │ ──────> │   Backend   │ ──────> │   Balanz    │
│  (React)    │ <────── │  (Node.js)  │ <────── │     API     │
│             │         │             │         │             │
└─────────────┘         └─────────────┘         └─────────────┘
   localhost:5173         localhost:3001        clientes.balanz.com
```

## Flujo de Autenticación

### 1. Login del Usuario

**Frontend (LoginModal.tsx)**
```typescript
// Usuario ingresa credenciales
const result = await login(username, password);

if (result.success) {
  // ✅ Login exitoso
  // El token se guarda en el backend
  setAuthStatus({ authenticated: true });
}
```

**Backend (server/index.js)**
```javascript
// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Llamar a Balanz API
  const response = await axios.post(
    'https://clientes.balanz.com/api/auth/login',
    { username, password }
  );
  
  // Guardar token en memoria del servidor
  sessionData.token = response.data.token;
  
  // Responder al frontend (SIN enviar el token)
  res.json({ success: true });
});
```

### 2. Requests Autenticados

**Frontend (balanzApi.ts)**
```typescript
// Solo necesitas llamar al endpoint
const response = await fetch(
  'http://localhost:3001/api/balanz/estadodecuenta'
);
```

**Backend (server/index.js)**
```javascript
// El backend agrega el token automáticamente
app.get('/api/balanz/estadodecuenta', async (req, res) => {
  // Usar el token guardado en sessionData
  const response = await axios.get(
    'https://clientes.balanz.com/api/v1/estadodecuenta',
    {
      headers: {
        'Authorization': sessionData.token // ← Token seguro en backend
      }
    }
  );
  
  res.json(response.data);
});
```

### 3. Verificación de Estado

**Frontend**
```typescript
// Verificar si está autenticado
const status = await getAuthStatus();

if (status.authenticated) {
  // ✅ Usuario logueado
  console.log('Usuario:', status.user);
  console.log('Expira:', new Date(status.expiresAt));
}
```

### 4. Logout

**Frontend**
```typescript
await logout();
setAuthStatus({ authenticated: false });
```

**Backend**
```javascript
// POST /api/auth/logout
sessionData.token = null; // Limpiar token
```

## Ventajas de esta Arquitectura

### ✅ Seguridad
- **Credenciales nunca se almacenan en el frontend**
- Token solo existe en memoria del servidor
- Frontend solo sabe si está "autenticado" o no
- Previene ataques XSS al token

### ✅ Simplicidad
- Frontend no maneja tokens
- Código más limpio y mantenible
- Un solo punto de configuración (backend)

### ✅ Control
- Puedes implementar rate limiting en el backend
- Logs centralizados de todas las requests
- Fácil agregar caché o validaciones

## Estado de Sesión (Backend)

```javascript
// Estructura en memoria
let sessionData = {
  token: 'DB9CE6B5-E22D-464C-ACAD-286372565C57',
  expiresAt: 1730764800000,  // Timestamp
  user: 'usuario@email.com'
};
```

⚠️ **Nota**: En producción, usar **Redis** o base de datos en lugar de memoria.

## Modo Fallback

Si el endpoint de login de Balanz no está disponible o no funciona, el backend tiene un **modo fallback**:

```javascript
// Si falla el login, usar token del .env
if (process.env.BALANZ_TOKEN) {
  sessionData.token = process.env.BALANZ_TOKEN;
  return res.json({ 
    success: true, 
    fallback: true  // Indica que usó fallback
  });
}
```

Esto permite trabajar con un token preconfigurado mientras se investiga el endpoint real de login.

## Endpoints de Balanz (Conocidos)

### 🔍 Investigados

✅ **Estado de Cuenta**
```
GET https://clientes.balanz.com/api/v1/estadodecuenta
Headers: Authorization: {token}
Params: cuenta, fecha
```

✅ **Cotizaciones Dólar**
```
GET https://clientes.balanz.com/api/Cotizaciones/GetTiposDeCambioDolar
Headers: Authorization: {token}
```

❓ **Login** (A investigar)
```
POST https://clientes.balanz.com/api/auth/login (?)
Body: { username, password }
Response: { token, ... } (?)
```

## Próximos Pasos

1. **Investigar endpoint real de login** de Balanz
   - Abrir DevTools en https://clientes.balanz.com/auth/login
   - Hacer login manualmente
   - Capturar el request en Network tab
   - Identificar endpoint, método y body

2. **Implementar renovación automática de token**
   - Detectar cuando el token expira
   - Renovar automáticamente
   - Notificar al frontend si falla

3. **Persistencia en producción**
   - Migrar de memoria a Redis
   - Implementar expiración automática
   - Sesiones por usuario

4. **Rate Limiting**
   - Limitar requests por IP
   - Prevenir abuso de API

## Testing

### Probar Login (Fallback)
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

### Probar Estado
```bash
curl http://localhost:3001/api/auth/status
```

### Probar Estado de Cuenta
```bash
curl http://localhost:3001/api/balanz/estadodecuenta
```

### Health Check
```bash
curl http://localhost:3001/health
```

## Configuración CORS

El backend está configurado para aceptar requests desde:
- `http://localhost:5173`
- `http://localhost:5174`
- `http://localhost:5175`

Para producción, actualizar el array de `origin` en `server/index.js`:

```javascript
app.use(cors({
  origin: [
    'https://tu-dominio.com',
    'https://www.tu-dominio.com'
  ],
  credentials: true
}));
```

## Seguridad en Producción

### ✅ Checklist

- [ ] Usar HTTPS (no HTTP)
- [ ] Configurar CORS restrictivo
- [ ] Migrar a Redis/DB para sesiones
- [ ] Implementar rate limiting
- [ ] Rotar tokens periódicamente
- [ ] Logs de seguridad
- [ ] Validar inputs
- [ ] Sanitizar respuestas
- [ ] Timeout en requests
- [ ] Manejo de errores sin exponer info sensible

### Variables de Entorno en Producción

No uses archivo `.env` en servidor de producción. Usa variables de entorno del sistema:

```bash
# En servidor
export BALANZ_USER=usuario
export BALANZ_PASSWORD=contraseña
export BALANZ_TOKEN=token
export BALANZ_CUENTA_ID=cuenta
export PORT=3001
```

O usando PM2:
```json
{
  "apps": [{
    "name": "totonz-backend",
    "script": "index.js",
    "env": {
      "PORT": 3001,
      "BALANZ_USER": "usuario",
      "BALANZ_PASSWORD": "contraseña"
    }
  }]
}
```

---

**Desarrollado con 🔒 para mantener tus credenciales seguras**
