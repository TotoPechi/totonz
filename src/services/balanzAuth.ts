/**
 * Servicio de autenticación para Balanz
 * Maneja el flujo de login automático en dos pasos:
 * 1. POST /auth/init - Obtiene el nonce
 * 2. POST /auth/login - Obtiene el accessToken
 * 
 * IMPORTANTE: Las peticiones se hacen a través del proxy de Vite (/api)
 * para evitar problemas de CORS
 */

const API_BASE = '/api'; // Usa el proxy de Vite configurado en vite.config.ts

interface AuthInitResponse {
  tipoAutenticacion: number;
  user: string;
  URLAuth: string;
  nonce: string;
}

interface AuthLoginResponse {
  idAplicacion: number;
  idProductor: string | null;
  idPersona: string;
  Nombre: string;
  idSesion: string;
  AccessToken: string; // El token viene con mayúscula
  Avatar: string;
  [key: string]: any;
}

/**
 * Paso 1: Inicializa la autenticación y obtiene el nonce
 */
async function authInit(user: string): Promise<string> {
  console.log('🔐 Iniciando autenticación para usuario:', user);
  
  const response = await fetch(`${API_BASE}/auth/init?avoidAuthRedirect=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Lang': 'es',
    },
    body: JSON.stringify({
      user,
      source: 'WebV2'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Error en auth/init:', response.status, errorText);
    throw new Error(`Error en auth/init: ${response.status} ${response.statusText}`);
  }

  const responseText = await response.text();
  console.log('📦 Response de auth/init:', responseText.substring(0, 200));
  
  let data: AuthInitResponse;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error('❌ Error parseando JSON:', e);
    console.error('Respuesta completa:', responseText);
    throw new Error('La respuesta de auth/init no es JSON válido');
  }
  
  console.log('✅ Nonce obtenido:', data.nonce);
  
  return data.nonce;
}

/**
 * Paso 2: Realiza el login y obtiene el accessToken
 */
async function authLogin(user: string, pass: string, nonce: string): Promise<string> {
  console.log('🔑 Realizando login...');
  console.log('📋 Datos de login:', { user, nonce, hasPass: !!pass });
  
  const payload = {
    user,
    pass,
    nonce,
    source: 'WebV2',
    idDispositivo: '696fa10a-ac40-4b12-bd62-187677de7535',
    TipoDispositivo: 'Web',
    sc: 1,
    Nombre: 'Mac OS 10.15.7 Chrome 142.0.0.0',
    SistemaOperativo: 'Mac OS',
    VersionSO: '10.15.7',
    VersionAPP: '2.30.2'
  };
  
  console.log('📦 Payload de login:', JSON.stringify(payload, null, 2));
  
  const response = await fetch(`${API_BASE}/auth/login?avoidAuthRedirect=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Lang': 'es',
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Error en auth/login:', response.status, errorText);
    throw new Error(`Error en auth/login: ${response.status} ${response.statusText}`);
  }

  const responseText = await response.text();
  console.log('📦 Response de auth/login:', responseText.substring(0, 200));
  
  let data: AuthLoginResponse;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error('❌ Error parseando JSON:', e);
    console.error('Respuesta completa:', responseText);
    throw new Error('La respuesta de auth/login no es JSON válido');
  }
  
  console.log('✅ AccessToken obtenido:', data.AccessToken);
  
  return data.AccessToken;
}

/**
 * Obtiene el accessToken completo realizando el flujo de autenticación
 */
export async function getAccessToken(): Promise<string> {
  const user = import.meta.env.VITE_BALANZ_USER;
  const pass = import.meta.env.VITE_BALANZ_PASS;

  if (!user || !pass) {
    throw new Error('Credenciales no configuradas. Verifica las variables VITE_BALANZ_USER y VITE_BALANZ_PASS en .env.local');
  }

  try {
    // Paso 1: Obtener nonce
    const nonce = await authInit(user);
    
    // Paso 2: Hacer login con el nonce
    const accessToken = await authLogin(user, pass, nonce);
    
    return accessToken;
  } catch (error) {
    console.error('❌ Error en autenticación:', error);
    throw error;
  }
}

/**
 * Gestión de token con caché en localStorage
 * El token se almacena con un timestamp y se renueva automáticamente si está vencido
 */
const TOKEN_STORAGE_KEY = 'balanz_access_token';
const TOKEN_TIMESTAMP_KEY = 'balanz_token_timestamp';
const TOKEN_FAIL_KEY = 'balanz_token_last_fail';
const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutos
const TOKEN_FAIL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutos de cooldown después de un fallo

// Variable para prevenir múltiples intentos simultáneos
let authPromise: Promise<string> | null = null;

/**
 * Obtiene el accessToken, usando caché si está disponible y válido
 */
export async function getCachedAccessToken(): Promise<string> {
  // 1. Verificar si hay un intento de autenticación en progreso
  if (authPromise) {
    console.log('⏳ Esperando autenticación en progreso...');
    return authPromise;
  }

  // 2. Verificar cooldown después de fallo
  const lastFail = localStorage.getItem(TOKEN_FAIL_KEY);
  if (lastFail) {
    const failAge = Date.now() - parseInt(lastFail);
    if (failAge < TOKEN_FAIL_COOLDOWN_MS) {
      const remainingSeconds = Math.round((TOKEN_FAIL_COOLDOWN_MS - failAge) / 1000);
      throw new Error(`Autenticación falló recientemente. Espera ${remainingSeconds}s antes de reintentar.`);
    } else {
      // Cooldown expirado, limpiar
      localStorage.removeItem(TOKEN_FAIL_KEY);
    }
  }

  // 3. Verificar caché de token válido
  const cachedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  const cachedTimestamp = localStorage.getItem(TOKEN_TIMESTAMP_KEY);

  if (cachedToken && cachedTimestamp) {
    const tokenAge = Date.now() - parseInt(cachedTimestamp);
    
    if (tokenAge < TOKEN_EXPIRY_MS) {
      console.log('✅ Usando accessToken en caché (válido por', Math.round((TOKEN_EXPIRY_MS - tokenAge) / 1000 / 60), 'minutos más)');
      return cachedToken;
    } else {
      console.log('⚠️ Token en caché expirado, renovando...');
    }
  }

  // 4. Obtener nuevo token (con lock para evitar múltiples intentos)
  try {
    authPromise = getAccessToken();
    const newToken = await authPromise;
    
    // Guardar en caché
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    localStorage.setItem(TOKEN_TIMESTAMP_KEY, Date.now().toString());
    
    // Limpiar marca de fallo si existía
    localStorage.removeItem(TOKEN_FAIL_KEY);
    
    return newToken;
  } catch (error) {
    // Marcar el fallo para evitar reintentos inmediatos
    localStorage.setItem(TOKEN_FAIL_KEY, Date.now().toString());
    console.error('❌ Error en autenticación - cooldown de 2 minutos activado');
    throw error;
  } finally {
    authPromise = null;
  }
}

/**
 * Limpia el token del caché (útil para forzar re-autenticación)
 */
export function clearTokenCache(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_TIMESTAMP_KEY);
  localStorage.removeItem(TOKEN_FAIL_KEY);
  console.log('🗑️ Token cache limpiado');
}
