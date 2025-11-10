# Guía de Autenticación Balanz

## Configuración Inicial

1. **Crear archivo de credenciales**
   ```bash
   cp .env.example .env.local
   ```

2. **Editar `.env.local`** con tus credenciales:
   ```
   VITE_BALANZ_USER=TotoBalanz
   VITE_BALANZ_PASS=*pizzaLOCA01
   ```

3. **Reiniciar el servidor** para que cargue las variables:
   ```bash
   npm run dev
   ```

## Flujo de Autenticación

El sistema implementa un flujo de 2 pasos:

### Paso 1: Inicializar Autenticación
```
POST https://clientes.balanz.com/api/v1/auth/init?avoidAuthRedirect=true
Body: {
  "user": "TotoBalanz",
  "source": "WebV2"
}

Respuesta: {
  "tipoAutenticacion": 0,
  "user": "totobalanz",
  "URLAuth": "",
  "nonce": "64344AB6-7B36-47BD-A07F-B29CFDC9260A"
}
```

### Paso 2: Login con Nonce
```
POST https://clientes.balanz.com/api/v1/auth/login?avoidAuthRedirect=true
Body: {
  "user": "TotoBalanz",
  "pass": "*pizzaLOCA01",
  "nonce": "64344AB6-7B36-47BD-A07F-B29CFDC9260A",
  "source": "WebV2",
  "idDispositivo": "696fa10a-ac40-4b12-bd62-187677de7535",
  "TipoDispositivo": "Web",
  "sc": 1,
  "Nombre": "Mac OS 10.15.7 Chrome 142.0.0.0",
  "SistemaOperativo": "Mac OS",
  "VersionSO": "10.15.7",
  "VersionAPP": "2.30.2"
}

Respuesta: {
  "accessToken": "TOKEN_AQUI",
  ...
}
```

## Pruebas en Consola del Navegador

Una vez que la aplicación esté corriendo, abre la consola del navegador (F12) y ejecuta:

### 1. Verificar Configuración
```javascript
testBalanzAuth.checkConfig()
```
Verifica que las credenciales estén configuradas correctamente.

### 2. Obtener Nuevo Token
```javascript
await testBalanzAuth.getNewToken()
```
Ejecuta el flujo completo de autenticación y devuelve un nuevo token.

### 3. Obtener Token con Caché
```javascript
await testBalanzAuth.getCachedToken()
```
Usa el token en caché si está disponible y válido (< 30 min), o genera uno nuevo.

### 4. Limpiar Caché
```javascript
testBalanzAuth.clearCache()
```
Elimina el token del localStorage, forzando a obtener uno nuevo en la próxima llamada.

## Caché de Token

El sistema guarda el token en `localStorage` con estas claves:
- `balanz_access_token` - El token en sí
- `balanz_token_timestamp` - Timestamp de cuando se obtuvo

El token expira después de **30 minutos** y se renueva automáticamente.

## Integración con API Calls

Para usar el token en tus llamadas a la API:

```typescript
import { getCachedAccessToken } from './services/balanzAuth';

async function fetchBalanzData() {
  const token = await getCachedAccessToken();
  
  const response = await fetch('/api/endpoint', {
    headers: {
      'Authorization': token  // o 'Authorization': `Bearer ${token}`
    }
  });
  
  return response.json();
}
```

## Troubleshooting

### "Credenciales no configuradas"
- Verifica que el archivo `.env.local` exista
- Verifica que las variables empiecen con `VITE_`
- Reinicia el servidor de desarrollo (`npm run dev`)

### "Error en auth/init" o "Error en auth/login"
- Verifica que las credenciales sean correctas
- Verifica que tengas conexión a internet
- Revisa la consola del navegador para más detalles del error

### Token expira muy rápido
- Puedes ajustar `TOKEN_EXPIRY_MS` en `src/services/balanzAuth.ts`
- El valor por defecto es 30 minutos (30 * 60 * 1000 ms)

## Seguridad

⚠️ **IMPORTANTE**: 
- El archivo `.env.local` NO se sube a Git (está en `.gitignore`)
- Nunca compartas tu archivo `.env.local`
- Nunca hagas commit de credenciales en el código
- El `.env.example` solo contiene placeholders

## Próximos Pasos

1. ✅ Configuración de credenciales en `.env.local`
2. ✅ Servicio de autenticación (`balanzAuth.ts`)
3. ✅ Sistema de caché de token
4. ✅ Utilidades de testing
5. ⏳ Integrar token dinámico en `balanzApi.ts`
6. ⏳ Renovación automática de token antes de expirar
7. ⏳ Manejo de errores de autenticación (401, 403)
