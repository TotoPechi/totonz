// Servicio para obtener cotizaciones históricas del dólar desde Argentina Datos
// API: https://api.argentinadatos.com/v1/cotizaciones/dolares
// Cachea por 1 día ya que son datos históricos que no cambian

interface CotizacionDolar {
  casa: string;
  compra: number;
  venta: number;
  fecha: string; // Formato: "YYYY-MM-DD"
}

const CACHE_KEY = 'dolar_historico_cache_v1';
const CACHE_TIMESTAMP_KEY = 'dolar_historico_cache_timestamp';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas en milisegundos

/**
 * Obtiene todas las cotizaciones históricas del dólar
 * Cachea por 24 horas
 */
async function getCotizacionesHistoricas(): Promise<CotizacionDolar[]> {
  try {
    // Verificar si hay caché válido
    const cachedData = localStorage.getItem(CACHE_KEY);
    const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    
    if (cachedData && cachedTimestamp) {
      const timestamp = parseInt(cachedTimestamp, 10);
      const now = Date.now();
      
      if (now - timestamp < CACHE_DURATION) {
        console.log('📦 Usando cotizaciones históricas del caché');
        return JSON.parse(cachedData);
      } else {
        console.log('⏰ Caché de cotizaciones expirado, obteniendo datos frescos...');
      }
    }
    
    // Obtener datos frescos de la API
    console.log('🌐 Obteniendo cotizaciones históricas de Argentina Datos...');
    const response = await fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares');
    
    if (!response.ok) {
      throw new Error(`Error en API: ${response.status}`);
    }
    
    const data: CotizacionDolar[] = await response.json();
    
    // Guardar en caché
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    
    console.log(`✅ Cotizaciones históricas obtenidas y cacheadas: ${data.length} registros`);
    
    return data;
  } catch (error) {
    console.error('❌ Error obteniendo cotizaciones históricas:', error);
    
    // Si hay error, intentar usar caché aunque esté expirado
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      console.log('⚠️ Usando caché expirado debido a error en API');
      return JSON.parse(cachedData);
    }
    
    throw error;
  }
}

/**
 * Obtiene el dólar para una fecha específica
 * Prioridad: bolsa > blue > oficial
 * 
 * @param fecha - Fecha en formato "YYYY-MM-DD"
 * @returns Valor del dólar (promedio entre compra y venta)
 */
export async function getDolarParaFecha(fecha: string): Promise<number | null> {
  try {
    const cotizaciones = await getCotizacionesHistoricas();
    
    // Filtrar cotizaciones de la fecha específica
    const cotizacionesFecha = cotizaciones.filter(c => c.fecha === fecha);
    
    if (cotizacionesFecha.length === 0) {
      console.warn(`⚠️ No hay cotizaciones para la fecha ${fecha}`);
      return null;
    }
    
    // Buscar en orden de prioridad: bolsa > blue > oficial
    const prioridad = ['bolsa', 'blue', 'oficial'];
    
    for (const casa of prioridad) {
      const cotizacion = cotizacionesFecha.find(c => c.casa === casa);
      if (cotizacion) {
        // Usar promedio entre compra y venta
        const valor = (cotizacion.compra + cotizacion.venta) / 2;
        console.log(`💵 Dólar ${casa} para ${fecha}: $${valor.toFixed(2)}`);
        return valor;
      }
    }
    
    console.warn(`⚠️ No se encontró dólar bolsa/blue/oficial para ${fecha}`);
    return null;
  } catch (error) {
    console.error('❌ Error obteniendo dólar para fecha:', error);
    return null;
  }
}

/**
 * Limpia el caché de cotizaciones históricas
 */
export function clearDolarHistoricoCache(): void {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_TIMESTAMP_KEY);
  console.log('🗑️ Caché de cotizaciones históricas limpiado');
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
  const cachedData = localStorage.getItem(CACHE_KEY);
  const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
  
  if (!cachedData || !cachedTimestamp) {
    return { exists: false };
  }
  
  const timestamp = parseInt(cachedTimestamp, 10);
  const now = Date.now();
  const expiresIn = CACHE_DURATION - (now - timestamp);
  const data = JSON.parse(cachedData);
  
  return {
    exists: true,
    timestamp,
    expiresIn: Math.max(0, expiresIn),
    recordCount: data.length
  };
}
