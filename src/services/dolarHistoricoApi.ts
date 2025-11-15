// Servicio para obtener cotizaciones históricas del dólar desde Argentina Datos
// API: https://api.argentinadatos.com/v1/cotizaciones/dolares
// Cachea por 1 día ya que son datos históricos que no cambian

import { clearCache, getCachedData, getCachedDataExpired, getCachedDataFull, getCacheInfo, setCachedData } from '../utils/cacheManager';

interface CotizacionDolar {
  casa: string;
  compra: number;
  venta: number;
  fecha: string; // Formato: "YYYY-MM-DD"
}

const CACHE_KEY = 'dolar_historico_cache_v1';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas en milisegundos

/**
 * Obtiene todas las cotizaciones históricas del dólar
 * Cachea por 24 horas
 */
export async function getCotizacionesHistoricas(): Promise<CotizacionDolar[]> {
  try {
    // Verificar si hay caché válido (menos de 24 horas)
    const cachedData = getCachedData<CotizacionDolar[]>(CACHE_KEY, CACHE_DURATION);
    if (cachedData) {
      return cachedData;
    }
    
    // Obtener datos frescos de la API
    const response = await fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares');
    
    if (!response.ok) {
      throw new Error(`Error en API: ${response.status}`);
    }
    
    const data: CotizacionDolar[] = await response.json();
    
    // Guardar en caché
    setCachedData(CACHE_KEY, data);
    
    return data;
  } catch (error) {
    console.error('❌ Error obteniendo cotizaciones históricas:', error);
    
    // Si hay error, intentar usar caché aunque esté expirado
    const expiredCache = getCachedDataExpired<CotizacionDolar[]>(CACHE_KEY);
    if (expiredCache) {
      console.warn('⚠️ Usando caché expirado debido a error en API');
      return expiredCache;
    }
    
    throw error;
  }
}

/**
 * Obtiene el dólar para una fecha específica desde cotizaciones ya cargadas
 * Prioridad: bolsa > contadoconliqui > blue > oficial
 * 
 * @param cotizaciones - Array de cotizaciones ya cargadas
 * @param fecha - Fecha en formato "YYYY-MM-DD"
 * @returns Valor del dólar (promedio entre compra y venta) o null
 */
export function getDolarParaFechaDesdeCotizaciones(cotizaciones: CotizacionDolar[], fecha: string): number | null {
  // Validar que la fecha sea válida
  if (!fecha || fecha.trim() === '') {
    console.warn(`⚠️ Fecha vacía o inválida: "${fecha}"`);
    return null;
  }
  
  // Validar formato de fecha (debe ser YYYY-MM-DD)
  const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!fechaRegex.test(fecha)) {
    console.warn(`⚠️ Formato de fecha inválido: "${fecha}" (esperado: YYYY-MM-DD)`);
    return null;
  }
  
  // Filtrar cotizaciones de la fecha específica
  const cotizacionesFecha = cotizaciones.filter(c => c.fecha === fecha);
  
  if (cotizacionesFecha.length === 0) {
    // Intentar buscar la fecha más cercana anterior (útil para fines de semana)
    try {
      const fechaDate = new Date(fecha + 'T00:00:00'); // Agregar hora para evitar problemas de timezone
      
      // Validar que la fecha sea válida
      if (isNaN(fechaDate.getTime())) {
        console.warn(`⚠️ Fecha inválida no se puede parsear: "${fecha}"`);
        return null;
      }
      
      for (let i = 1; i <= 7; i++) {
        fechaDate.setDate(fechaDate.getDate() - 1);
        const fechaAnterior = fechaDate.toISOString().split('T')[0];
        const cotizacionesAnteriores = cotizaciones.filter(c => c.fecha === fechaAnterior);
        if (cotizacionesAnteriores.length > 0) {
          const prioridad = ['bolsa', 'contadoconliqui', 'blue', 'oficial'];
          for (const casa of prioridad) {
            const cotizacion = cotizacionesAnteriores.find(c => c.casa === casa);
            if (cotizacion) {
              const valor = (cotizacion.compra + cotizacion.venta) / 2;
              return valor;
            }
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error al buscar fechas anteriores para ${fecha}:`, error);
    }
    console.warn(`⚠️ No hay cotizaciones para la fecha ${fecha} ni fechas cercanas`);
    return null;
  }
  
  // Buscar en orden de prioridad: bolsa > contadoconliqui > blue > oficial
  const prioridad = ['bolsa', 'contadoconliqui', 'blue', 'oficial'];
  
  for (const casa of prioridad) {
    const cotizacion = cotizacionesFecha.find(c => c.casa === casa);
    if (cotizacion) {
      // Usar promedio entre compra y venta
      const valor = (cotizacion.compra + cotizacion.venta) / 2;
      return valor;
    }
  }
  
  // Si no se encontró ninguna cotización, mostrar qué casas están disponibles
  const casasDisponibles = cotizacionesFecha.map(c => c.casa).join(', ');
  console.warn(`⚠️ No se encontró dólar bolsa/contadoconliqui/blue/oficial para ${fecha}. Casas disponibles: ${casasDisponibles || 'ninguna'}`);
  return null;
}

/**
 * Obtiene el dólar para una fecha específica
 * Prioridad: bolsa > contadoconliqui > blue > oficial
 * 
 * @param fecha - Fecha en formato "YYYY-MM-DD"
 * @returns Valor del dólar (promedio entre compra y venta)
 */
export async function getDolarParaFecha(fecha: string): Promise<number | null> {
  try {
    const cotizaciones = await getCotizacionesHistoricas();
    return getDolarParaFechaDesdeCotizaciones(cotizaciones, fecha);
  } catch (error) {
    console.error('❌ Error obteniendo dólar para fecha:', error);
    return null;
  }
}

/**
 * Limpia el caché de cotizaciones históricas
 */
export function clearDolarHistoricoCache(): void {
  clearCache(CACHE_KEY);
}

/**
 * Obtiene información del caché actual
 */
export function getDolarHistoricoCacheInfo(): { 
  exists: boolean; 
  timestamp?: number; 
  expiresIn?: number;
  recordCount?: number;
} {
  const cacheInfo = getCacheInfo(CACHE_KEY);
  const cacheFull = getCachedDataFull<CotizacionDolar[]>(CACHE_KEY);
  
  if (!cacheInfo || !cacheInfo.exists || !cacheFull) {
    return { exists: false };
  }
  
  const timestamp = cacheFull.timestamp || 0;
  const now = Date.now();
  const expiresIn = CACHE_DURATION - (now - timestamp);
  
  return {
    exists: true,
    timestamp,
    expiresIn: Math.max(0, expiresIn),
    recordCount: cacheFull.data?.length || 0
  };
}
