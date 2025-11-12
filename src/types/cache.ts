/**
 * Interfaces genéricas para manejo de caché
 */

/**
 * Resultado genérico de una operación con caché
 */
export interface CacheResult<T> {
  data: T;
  isCached: boolean;
  cacheAge?: number; // Horas desde que se guardó en caché
  fecha?: string; // Fecha del caché en formato YYYY-MM-DD
}

/**
 * Información sobre el estado del caché
 */
export interface CacheInfo {
  exists: boolean;
  age?: number; // Edad en milisegundos
  isExpired?: boolean;
}

