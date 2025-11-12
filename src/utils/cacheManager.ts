/**
 * Módulo centralizado para manejo de caché
 * Proporciona funciones genéricas para guardar y recuperar datos del localStorage
 * con soporte para expiración y respeto al flag global de caché
 */

const GLOBAL_CACHE_ENABLED_KEY = 'global_cache_enabled';

/**
 * Verifica si el caché global está habilitado
 */
function isGlobalCacheEnabled(): boolean {
  return localStorage.getItem(GLOBAL_CACHE_ENABLED_KEY) !== 'false';
}

/**
 * Obtiene datos del caché con verificación de expiración
 * @param cacheKey - Clave del caché en localStorage
 * @param maxAgeMs - Edad máxima del caché en milisegundos (opcional)
 * @returns Los datos cacheados o null si no existe o está expirado
 */
export function getCachedData<T>(cacheKey: string, maxAgeMs?: number): T | null {
  if (!isGlobalCacheEnabled()) {
    return null;
  }

  try {
    const cachedData = localStorage.getItem(cacheKey);
    if (!cachedData) {
      return null;
    }

    const parsed = JSON.parse(cachedData);
    
    // Si se especifica maxAgeMs, verificar expiración
    if (maxAgeMs && parsed.timestamp) {
      const age = Date.now() - parsed.timestamp;
      if (age > maxAgeMs) {
        return null; // Caché expirado
      }
    }

    return parsed.data as T;
  } catch (e) {
    console.warn(`⚠️ Error al parsear caché ${cacheKey}:`, e);
    return null;
  }
}

/**
 * Guarda datos en el caché con timestamp
 * @param cacheKey - Clave del caché en localStorage
 * @param data - Datos a guardar
 */
export function setCachedData<T>(cacheKey: string, data: T): void {
  try {
    const cacheObject = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheObject));
  } catch (e) {
    console.warn(`⚠️ Error al guardar caché ${cacheKey}:`, e);
  }
}

/**
 * Obtiene información sobre el caché (edad, si existe, etc.)
 */
export function getCacheInfo(cacheKey: string): {
  exists: boolean;
  age?: number; // en milisegundos
  isExpired?: boolean; // si maxAgeMs fue proporcionado
} | null {
  try {
    const cachedData = localStorage.getItem(cacheKey);
    if (!cachedData) {
      return { exists: false };
    }

    const parsed = JSON.parse(cachedData);
    if (parsed.timestamp) {
      const age = Date.now() - parsed.timestamp;
      return {
        exists: true,
        age
      };
    }

    return { exists: true };
  } catch (e) {
    return null;
  }
}

/**
 * Limpia un caché específico preservando tokens de autenticación
 */
export function clearCache(cacheKey: string): void {
  const { preserveAuthTokens } = require('./cacheHelpers');
  preserveAuthTokens(() => {
    localStorage.removeItem(cacheKey);
  });
}

/**
 * Limpia múltiples cachés que coincidan con un patrón
 */
export function clearCacheByPattern(pattern: string | RegExp): number {
  const { preserveAuthTokens } = require('./cacheHelpers');
  let count = 0;
  
  preserveAuthTokens(() => {
    const keys = Object.keys(localStorage);
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    keys.forEach(key => {
      if (regex.test(key)) {
        localStorage.removeItem(key);
        count++;
      }
    });
  });
  
  return count;
}

