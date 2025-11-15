/**
 * Módulo centralizado para manejo de caché
 * Proporciona funciones genéricas para guardar y recuperar datos del localStorage
 * con soporte para expiración y respeto al flag global de caché
 */

import { preserveAuthTokens } from './cacheHelpers';

const GLOBAL_CACHE_ENABLED_KEY = 'global_cache_enabled';

/**
 * Verifica si el caché global está habilitado
 */
export function isGlobalCacheEnabled(): boolean {
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
  preserveAuthTokens(() => {
    localStorage.removeItem(cacheKey);
  });
}

/**
 * Limpia múltiples cachés que coincidan con un patrón
 */
export function clearCacheByPattern(pattern: string | RegExp): number {
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

/**
 * Obtiene datos del caché validando por fecha (YYYY-MM-DD) en lugar de tiempo transcurrido
 * Útil para datos que deben actualizarse diariamente
 * @param cacheKey - Clave del caché en localStorage
 * @param fechaRequerida - Fecha requerida en formato YYYY-MM-DD (default: hoy)
 * @returns Los datos cacheados o null si no existe o no coincide la fecha
 */
export function getCachedDataByDate<T>(cacheKey: string, fechaRequerida?: string): T | null {
  if (!isGlobalCacheEnabled()) {
    return null;
  }

  try {
    const cachedData = localStorage.getItem(cacheKey);
    if (!cachedData) {
      return null;
    }

    const parsed = JSON.parse(cachedData);
    
    // Si tiene campo 'fecha', validar que coincida
    if (parsed.fecha) {
      const fechaHoy = fechaRequerida || new Date().toISOString().split('T')[0];
      if (parsed.fecha !== fechaHoy) {
        return null; // Caché de otro día
      }
    }

    return parsed.data as T;
  } catch (e) {
    console.warn(`⚠️ Error al parsear caché ${cacheKey}:`, e);
    return null;
  }
}

/**
 * Guarda datos en el caché con fecha (YYYY-MM-DD) y timestamp
 * @param cacheKey - Clave del caché en localStorage
 * @param data - Datos a guardar
 * @param fecha - Fecha en formato YYYY-MM-DD (default: hoy)
 * @param metadata - Metadatos adicionales a guardar (opcional)
 */
export function setCachedDataWithDate<T>(
  cacheKey: string, 
  data: T, 
  fecha?: string,
  metadata?: Record<string, any>
): void {
  try {
    const fechaHoy = fecha || new Date().toISOString().split('T')[0];
    const cacheObject = {
      data,
      fecha: fechaHoy,
      timestamp: Date.now(),
      ...metadata
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheObject));
  } catch (e) {
    console.warn(`⚠️ Error al guardar caché ${cacheKey}:`, e);
  }
}

/**
 * Obtiene datos del caché aunque estén expirados (útil como fallback)
 * @param cacheKey - Clave del caché en localStorage
 * @returns Los datos cacheados o null si no existe
 */
export function getCachedDataExpired<T>(cacheKey: string): T | null {
  try {
    const cachedData = localStorage.getItem(cacheKey);
    if (!cachedData) {
      return null;
    }

    const parsed = JSON.parse(cachedData);
    return parsed.data as T;
  } catch (e) {
    console.warn(`⚠️ Error al parsear caché expirado ${cacheKey}:`, e);
    return null;
  }
}

/**
 * Obtiene el objeto completo del caché (incluyendo metadatos como fecha, timestamp, etc.)
 * @param cacheKey - Clave del caché en localStorage
 * @returns El objeto completo del caché o null si no existe
 */
export function getCachedDataFull<T>(cacheKey: string): { data: T; timestamp?: number; fecha?: string; [key: string]: any } | null {
  try {
    const cachedData = localStorage.getItem(cacheKey);
    if (!cachedData) {
      return null;
    }

    return JSON.parse(cachedData);
  } catch (e) {
    console.warn(`⚠️ Error al parsear caché completo ${cacheKey}:`, e);
    return null;
  }
}

/**
 * Guarda datos en el caché con formato personalizado
 * Útil para caches que necesitan metadatos adicionales (ej: {data, lastUpdate, days})
 * @param cacheKey - Clave del caché en localStorage
 * @param cacheObject - Objeto completo a guardar (debe incluir los datos y metadatos)
 */
export function setCachedDataCustom<T extends Record<string, any>>(cacheKey: string, cacheObject: T): void {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(cacheObject));
  } catch (e) {
    console.warn(`⚠️ Error al guardar caché personalizado ${cacheKey}:`, e);
  }
}

/**
 * Obtiene datos del caché con validación personalizada
 * @param cacheKey - Clave del caché en localStorage
 * @param validator - Función que valida si el caché es válido (recibe el objeto completo del caché)
 * @returns Los datos cacheados o null si no existe o no pasa la validación
 */
export function getCachedDataWithValidator<T>(
  cacheKey: string,
  validator: (cache: any) => boolean
): T | null {
  if (!isGlobalCacheEnabled()) {
    return null;
  }

  try {
    const cachedData = localStorage.getItem(cacheKey);
    if (!cachedData) {
      return null;
    }

    const parsed = JSON.parse(cachedData);
    
    if (!validator(parsed)) {
      return null; // No pasa la validación
    }

    return parsed.data as T;
  } catch (e) {
    console.warn(`⚠️ Error al parsear caché ${cacheKey}:`, e);
    return null;
  }
}

