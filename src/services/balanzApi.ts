import { Orden } from '../types/balanz';
import { CacheResult } from '../types/cache';
import { getCachedDataByDate, setCachedDataWithDate, getCachedDataExpired, getCachedDataFull, getCachedData, setCachedData, clearCache, getCacheInfo } from '../utils/cacheManager';
import { getBalanzInstrumentInfo } from './tickerApi';

// --- Órdenes históricas con caché ---
export type OrdenesConCache = CacheResult<Orden[]>;

/**
 * Obtiene las órdenes históricas con información de caché
 */
export async function getOrdenesHistoricasConCache(
  fechaDesde: string = '20210905',
  fechaHasta?: string
): Promise<OrdenesConCache> {
  try {
    const hoy = fechaHasta || new Date().toISOString().split('T')[0].replace(/-/g, '');
    const cacheKey = `balanz_ordenes_${fechaDesde}_${hoy}`;
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
    
    // Verificar caché válido (menos de 24 horas)
    const cachedData = getCachedData<Orden[]>(cacheKey, CACHE_DURATION);
    if (cachedData) {
      const cacheFull = getCachedDataFull<Orden[]>(cacheKey);
      const cacheDate = cacheFull?.timestamp ? new Date(cacheFull.timestamp) : new Date();
      const now = new Date();
      const diffHours = (now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60);
      
      return {
        data: cachedData,
        isCached: true,
        cacheAge: diffHours
      };
    }

    // Obtener datos frescos
    const url = `/api/reportehistoricoordenes/${BALANZ_ACCOUNT_ID}?FechaDesde=${fechaDesde}&FechaHasta=${hoy}`;
    const token = await getCachedAccessToken();
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': token,
      }
    });

    if (!response.ok) {
      console.error(`❌ Error ${response.status} al obtener órdenes históricas`);
      if (response.status === 520 || response.status === 403 || response.status === 401) {
        console.error('🔒 Error de autenticación - Token posiblemente expirado');
        localStorage.removeItem('balanz_access_token');
        localStorage.removeItem('balanz_token_timestamp');
      }
      // Si hay error, intentar usar caché expirado como fallback
      const expiredCache = getCachedDataExpired<Orden[]>(cacheKey);
      if (expiredCache) {
        return {
          data: expiredCache,
          isCached: true,
          cacheAge: 999
        };
      }
      return { data: [], isCached: false };
    }

    const responseData = await response.json();
    // La respuesta viene en formato: { "ordenes": [...] }
    const data = responseData?.ordenes;
    if (!data || !Array.isArray(data)) {
      console.warn('⚠️ No hay órdenes históricas disponibles');
      return { data: [], isCached: false };
    }
    
    // Guardar en caché con metadatos adicionales
    setCachedDataWithDate(cacheKey, data, undefined, { fechaDesde, fechaHasta: hoy });
    
    return { data, isCached: false, cacheAge: 0 };
  } catch (error) {
    console.error('❌ Error al obtener órdenes históricas con caché:', error);
    return { data: [], isCached: false };
  }
}
// Servicio para obtener datos de la API de Balanz
// Usa autenticación dinámica con token obtenido del flujo de login

import { getCachedAccessToken } from './balanzAuth';
import { getDolarParaFecha } from './dolarHistoricoApi';
import { preserveAuthTokens } from '../utils/cacheHelpers';

// ID de cuenta de Balanz (reemplazar con tu ID real)
const BALANZ_ACCOUNT_ID = '222233';

interface BalanzTenencia {
  Tipo: string;
  Ticker: string;
  idMoneda: number;
  Moneda: string;
  Descripcion: string;
  Cantidad: number;
  Precio: number;
  PPP: number;
  ValorInicial: number;
  ValorActual: number;
  ValorActualPesos: number;
  PorcTenencia: number;
  NoRealizado: number;
  PorcRendimiento: number;
  TNA: string;
  Variacion: string;
  PrecioAnterior: number;
  FechaUltimoOperado: string;
  DiasPromedioTenencia: number;
}

interface BalanzEstadoCuenta {
  tenenciaAgrupada: any[];
  tenencia: BalanzTenencia[];
  cotizacionesDolar: CotizacionDolar[];
}

interface CotizacionDolar {
  tipo: number;
  Descripcion: string;
  PrecioCompra: number;
  PrecioVenta: number;
}

interface BalanzCacheData {
  data: BalanzEstadoCuenta;
  fecha: string; // YYYY-MM-DD
  timestamp: number;
}

/**
 * Obtiene el estado de cuenta directamente desde la API de Balanz
 * Con caché por día para evitar consultas repetidas
 */
export async function getEstadoCuenta(fecha?: string): Promise<BalanzEstadoCuenta | null> {
  try {
    // Formato de fecha: YYYYMMDD para la API, YYYY-MM-DD para la caché
    const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const fechaParam = fecha || hoy.replace(/-/g, ''); // YYYYMMDD
    
    // Verificar caché (validación por fecha)
    const cacheKey = 'balanz_estado_cuenta';
    const cachedData = getCachedDataByDate<BalanzEstadoCuenta>(cacheKey, hoy);
    if (cachedData) {
      return cachedData;
    }
    
    // Construir URL completa con todos los parámetros requeridos
    const url = `/api/estadodecuenta/${BALANZ_ACCOUNT_ID}?Fecha=${fechaParam}&ta=1&idMoneda=2`;
    
    // Obtener token de autenticación
    const token = await getCachedAccessToken();
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': token,
      },
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error('❌ Error al obtener estado de cuenta:', response.statusText);
      console.error('📄 Response body:', text.substring(0, 500));
      
      // Detectar si es error de sesión expirada o autenticación
      if (response.status === 403 || response.status === 401 || response.status === 520) {
        console.error('🔒 Error de autenticación - Token posiblemente expirado');
        // Limpiar token del caché
        localStorage.removeItem('balanz_access_token');
        localStorage.removeItem('balanz_token_timestamp');
        
        // Para error 403, intentar parsear el mensaje específico
        if (response.status === 403) {
          try {
            const errorData = JSON.parse(text);
            if (errorData.CodigoError === -1001 || errorData.Descripcion?.includes('Sesion Expirada')) {
              console.error('🔒 Sesión expirada - Token de Balanz inválido');
              localStorage.setItem('balanz_session_expired', 'true');
            }
          } catch (e) {
            // Ignorar error de parsing
          }
        }
      }
      
      // Si hay error, intentar usar caché expirado como fallback
      const expiredCache = getCachedDataExpired<BalanzEstadoCuenta>(cacheKey);
      if (expiredCache) {
        return expiredCache;
      }
      
      return null;
    }

    // Si llegamos aquí, la respuesta fue exitosa, limpiar marca de sesión expirada
    localStorage.removeItem('balanz_session_expired');

    // Obtener el texto de la respuesta primero
    const text = await response.text();
    
    // Intentar parsear como JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      // Si falla el parse, intentar extraer JSON del texto
      console.warn('⚠️ Intento de parse directo falló, buscando JSON en la respuesta...');
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No se pudo extraer JSON de la respuesta');
      }
    }
    
    // Guardar en caché con la fecha de hoy
    setCachedDataWithDate('balanz_estado_cuenta', data, hoy);
    
    return data;
  } catch (error) {
    console.error('❌ Error al conectar con Balanz API:', error);
    throw error;
  }
}

export function getPrecioActual(tenencias: BalanzTenencia[], ticker: string): number | null {
  const tenencia = tenencias.find(t => t.Ticker === ticker);
  return tenencia ? tenencia.Precio : null;
}

export function getValorActual(tenencias: BalanzTenencia[], ticker: string): number | null {
  const tenencia = tenencias.find(t => t.Ticker === ticker);
  return tenencia ? tenencia.ValorActual : null;
}

export function getRendimiento(tenencias: BalanzTenencia[], ticker: string): {
  noRealizado: number;
  porcentaje: number;
} | null {
  const tenencia = tenencias.find(t => t.Ticker === ticker);
  return tenencia ? {
    noRealizado: tenencia.NoRealizado,
    porcentaje: tenencia.PorcRendimiento,
  } : null;
}

export function getDolarMEP(cotizaciones: CotizacionDolar[]): number | null {
  const dolarMep = cotizaciones.find(c => c.Descripcion === 'Dólar MEP');
  // Usar el promedio entre compra y venta
  return dolarMep ? (dolarMep.PrecioCompra + dolarMep.PrecioVenta) / 2 : null;
}

export interface EstadoCuentaConCache extends CacheResult<BalanzEstadoCuenta | null> {
  sessionExpired?: boolean; // Indica si la sesión expiró (403)
}

/**
 * Obtiene el estado de cuenta con información de caché
 * Retorna si los datos son de caché y de qué fecha
 */
export async function getEstadoCuentaConCache(fecha?: string): Promise<EstadoCuentaConCache> {
  const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Verificar si hay sesión expirada
  const sessionExpired = localStorage.getItem('balanz_session_expired') === 'true';
  
  // Verificar caché primero (validación por fecha)
  const cacheKey = 'balanz_estado_cuenta';
  const cachedData = getCachedDataByDate<BalanzEstadoCuenta>(cacheKey, hoy);
  
  if (cachedData) {
    const cacheFull = getCachedDataFull<BalanzEstadoCuenta>(cacheKey);
    return {
      data: cachedData,
      isCached: true, // Marcar como caché para mostrarlo en el footer
      fecha: cacheFull?.fecha || hoy,
      sessionExpired
    };
  }
  
  // Intentar obtener datos frescos
  const data = await getEstadoCuenta(fecha);
  
  // Verificar nuevamente por si cambió durante la llamada
  const sessionExpiredAfter = localStorage.getItem('balanz_session_expired') === 'true';
  
  if (data) {
    // Datos frescos obtenidos
    return {
      data,
      isCached: false,
      fecha: hoy,
      sessionExpired: sessionExpiredAfter
    };
  }
  
  // Si falló la API y hay caché, usarla como fallback
  const expiredCache = getCachedDataExpired<BalanzEstadoCuenta>(cacheKey);
  if (expiredCache) {
    const cacheFull = getCachedDataFull<BalanzEstadoCuenta>(cacheKey);
    return {
      data: expiredCache,
      isCached: true, // Marca como caché antigua
      fecha: cacheFull?.fecha || hoy,
      sessionExpired: sessionExpiredAfter
    };
  }
  
  // No hay datos ni caché
  return {
    data: null,
    isCached: false,
    fecha: hoy,
    sessionExpired: sessionExpiredAfter
  };
}

/**
 * Limpia el caché del estado de cuenta
 */
export function clearEstadoCuentaCache(): void {
  clearCache('balanz_estado_cuenta');
}

/**
 * Limpia el caché de movimientos históricos
 */
export function clearMovimientosCache(): void {
  preserveAuthTokens(() => {
    // Buscar todas las claves que empiecen con 'balanz_movimientos_'
    const keys = Object.keys(localStorage);
    let count = 0;
    
    keys.forEach(key => {
      if (key.startsWith('balanz_movimientos_')) {
        localStorage.removeItem(key);
        count++;
      }
    });
  });
}

/**
 * Obtiene información sobre el caché de movimientos
 */
export function getMovimientosCacheInfo(): {
  exists: boolean;
  count: number;
  oldestDate?: string;
  newestDate?: string;
} {
  const keys = Object.keys(localStorage);
  const movimientosKeys = keys.filter(key => key.startsWith('balanz_movimientos_'));
  
  if (movimientosKeys.length === 0) {
    return { exists: false, count: 0 };
  }
  
  let oldestTimestamp = Infinity;
  let newestTimestamp = 0;
  
  movimientosKeys.forEach(key => {
    const cacheFull = getCachedDataFull<any>(key);
    if (cacheFull?.timestamp) {
      const timestamp = cacheFull.timestamp;
      if (timestamp < oldestTimestamp) oldestTimestamp = timestamp;
      if (timestamp > newestTimestamp) newestTimestamp = timestamp;
    }
  });
  
  return {
    exists: true,
    count: movimientosKeys.length,
    oldestDate: oldestTimestamp !== Infinity ? new Date(oldestTimestamp).toISOString().split('T')[0] : undefined,
    newestDate: newestTimestamp > 0 ? new Date(newestTimestamp).toISOString().split('T')[0] : undefined
  };
}

/**
 * Obtiene los movimientos históricos de operaciones desde la API de Balanz
 * @param fechaDesde - Fecha inicial en formato YYYYMMDD
 * @param fechaHasta - Fecha final en formato YYYYMMDD (default: hoy)
 */
export async function getMovimientosHistoricos(
  fechaDesde: string = '20210905',
  fechaHasta?: string
): Promise<MovimientoHistorico[]> {
  try {
    // Si no se proporciona fechaHasta, usar fecha actual
    const hoy = fechaHasta || new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    // Verificar caché primero (válido por 24 horas)
    const cacheKey = `balanz_movimientos_${fechaDesde}_${hoy}`;
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
    const cachedData = getCachedData<MovimientoHistorico[]>(cacheKey, CACHE_DURATION);
    if (cachedData) {
      return cachedData;
    }
    
    const url = `/api/movimientos/${BALANZ_ACCOUNT_ID}?FechaDesde=${fechaDesde}&FechaHasta=${hoy}&ic=0`;
    
    // Obtener token de autenticación
    const token = await getCachedAccessToken();
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': token,
      }
    });
    
    if (!response.ok) {
      console.error(`❌ Error ${response.status} al obtener movimientos históricos`);
      
      // Si es error de autenticación, limpiar token
      if (response.status === 520 || response.status === 403 || response.status === 401) {
        console.error('🔒 Error de autenticación - Token posiblemente expirado');
        localStorage.removeItem('balanz_access_token');
        localStorage.removeItem('balanz_token_timestamp');
      }
      
      // Si hay error, intentar usar caché expirado como fallback
      const expiredCache = getCachedDataExpired<MovimientoHistorico[]>(cacheKey);
      if (expiredCache) {
        return expiredCache;
      }
      
      return [];
    }
    
    const responseData = await response.json();
    
    // La respuesta viene en formato: { "movimiento": [...] }
    const data = responseData?.movimiento;
    
    if (!data || !Array.isArray(data)) {
      console.warn('⚠️ No hay movimientos históricos disponibles');
      return [];
    }
    
    // Guardar en caché con metadatos adicionales
    setCachedDataWithDate(cacheKey, data, undefined, { fechaDesde, fechaHasta: hoy });
    
    return data;
  } catch (error) {
    console.error('❌ Error al obtener movimientos históricos:', error);
    return [];
  }
}

// Interfaz para movimientos históricos según el endpoint /api/v1/movimientos
export interface MovimientoHistorico {
  Concertacion: string; // Fecha en formato "2025-10-31"
  tipo: string; // "Cupón", "Renta \/ BPOC7", etc.
  descripcion: string; // "Cargo por Descubierto del 31\/10\/2025"
  descripcionCorta: string; // "Cargo por Descubierto del 31\/10\/2025"
  ticker: string; // "YPFD", "BPOC7", etc. (puede ser vacío "")
  cantidad: number; // 0 para cargos/abonos
  precio: number; // -1 para cargos/abonos
  Liquidacion: string; // Fecha en formato "2025-10-31"
  idMoneda: number; // 1 para pesos, puede ser otro para USD
  moneda: string; // "Pesos"
  Simbolo: string; // "$"
  importe: number; // -1.33, -728.62, etc.
  reporte: string; // "" 
  codigo: string; // ""
  idTicono: number; // 1
  TipoInstrumento: string; // "Bonos", ""
  plazo: string; // ""
}

export type MovimientosConCache = CacheResult<MovimientoHistorico[]>;

/**
 * Obtiene los movimientos históricos con información de caché
 */
export async function getMovimientosHistoricosConCache(
  fechaDesde: string = '20210905',
  fechaHasta?: string
): Promise<MovimientosConCache> {
  try {
    const hoy = fechaHasta || new Date().toISOString().split('T')[0].replace(/-/g, '');
    const cacheKey = `balanz_movimientos_${fechaDesde}_${hoy}`;
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
    
    // Verificar caché válido (menos de 24 horas)
    const cachedData = getCachedData<MovimientoHistorico[]>(cacheKey, CACHE_DURATION);
    if (cachedData) {
      const cacheFull = getCachedDataFull<MovimientoHistorico[]>(cacheKey);
      const cacheDate = cacheFull?.timestamp ? new Date(cacheFull.timestamp) : new Date();
      const now = new Date();
      const diffHours = (now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60);
      
      return {
        data: cachedData,
        isCached: true,
        cacheAge: diffHours
      };
    }
    
    // Obtener datos frescos
    const data = await getMovimientosHistoricos(fechaDesde, fechaHasta);
    
    return {
      data,
      isCached: false,
      cacheAge: 0
    };
  } catch (error) {
    console.error('❌ Error al obtener movimientos históricos con caché:', error);
    return {
      data: [],
      isCached: false
    };
  }
}

/**
 * Filtra y agrupa los movimientos por ticker
 * Maneja dos casos:
 * 1. Operaciones en USD (descripción termina en "/ usd"): Tienen 2 registros (uno con precio USD, otro con costo en pesos)
 * 2. Operaciones en pesos (descripción termina en "/ $"): Tienen 1 registro (precio en pesos, monto = precio * cantidad, costo = |importe| - monto)
 * 
 * IMPORTANTE: Usa dólar histórico de la fecha de la operación (bolsa > blue > oficial)
 */
import { normalizeTicker, tickersMatch } from '../utils/tickerHelpers';

export async function getOperacionesPorTicker(
  movimientos: MovimientoHistorico[],
  ticker: string,
  dolarMEPActual: number // Solo como fallback
): Promise<Array<{
  tipo: 'COMPRA' | 'VENTA' | 'RESCATE_PARCIAL';
  fecha: string;
  cantidad: number;
  precioUSD: number;
  montoUSD: number;
  costoOperacionUSD: number;
  descripcion: string;
  precioOriginal?: number; // Precio original en pesos si fue convertido
  costoOriginal?: number; // Costo original en pesos si fue convertido
  monedaOriginal: string; // "Pesos" o nombre de la moneda original
  dolarUsado: number; // Dólar usado para la conversión (histórico o actual)
}>> {
  // Normalizar el ticker buscado
  const tickerNormalizado = normalizeTicker(ticker);
  
  // Filtrar movimientos del ticker (comparando de forma normalizada)
  const movimientosTicker = movimientos.filter(m => tickersMatch(m.ticker, tickerNormalizado));
  
  // Primero, agrupar rescates parciales por fecha (para calcular monto total correctamente)
  const rescatesParcialesPorFecha = new Map<string, MovimientoHistorico[]>();
  const otrosMovimientos: MovimientoHistorico[] = [];
  
  movimientosTicker.forEach(mov => {
    // Solo procesar movimientos con cantidad (compras/ventas reales)
    if (mov.cantidad === 0) {
      return;
    }
    
    const descripcionLower = mov.descripcion.toLowerCase();
    const esRescateParcial = descripcionLower.includes('rescate parcial');
    
    if (esRescateParcial) {
      // Agrupar rescates parciales por fecha
      const key = mov.Concertacion;
      if (!rescatesParcialesPorFecha.has(key)) {
        rescatesParcialesPorFecha.set(key, []);
      }
      rescatesParcialesPorFecha.get(key)!.push(mov);
    } else {
      otrosMovimientos.push(mov);
    }
  });
  
  // Agrupar otros movimientos por descripción y fecha para combinar registros relacionados
  const operacionesMap = new Map<string, MovimientoHistorico[]>();
  
  otrosMovimientos.forEach(mov => {
    // Usar descripción + fecha como clave para agrupar
    const key = `${mov.descripcion}_${mov.Concertacion}`;
    if (!operacionesMap.has(key)) {
      operacionesMap.set(key, []);
    }
    operacionesMap.get(key)!.push(mov);
  });
  
  // Convertir cada grupo de movimientos a operación
  const operaciones: Array<{
    tipo: 'COMPRA' | 'VENTA' | 'RESCATE_PARCIAL';
    fecha: string;
    cantidad: number;
    precioUSD: number;
    montoUSD: number;
    costoOperacionUSD: number;
    descripcion: string;
    precioOriginal?: number;
    costoOriginal?: number;
    monedaOriginal: string;
    dolarUsado: number;
  }> = [];
  
  // Procesar rescates parciales agrupados por fecha
  for (const [fecha, movs] of rescatesParcialesPorFecha.entries()) {
    // Sumar todas las cantidades de rescates parciales de la misma fecha
    const cantidadTotal = movs.reduce((sum, m) => sum + Math.abs(m.cantidad), 0);
    
    if (cantidadTotal === 0) continue;
    
    // Obtener dólar histórico para la fecha
    let dolarHistorico = await getDolarParaFecha(fecha);
    if (!dolarHistorico) {
      console.warn(`⚠️ Usando dólar MEP actual como fallback para ${fecha}`);
      dolarHistorico = dolarMEPActual;
    }
    
    // Buscar movimiento anterior relacionado con rescate (hasta 3 semanas antes)
    const fechaRescate = new Date(fecha);
    const fechaLimite = new Date(fechaRescate);
    fechaLimite.setDate(fechaLimite.getDate() - 21); // 3 semanas = 21 días
    
    // Buscar movimientos anteriores del mismo ticker relacionados con rescate
    const movimientosAnteriores = movimientosTicker.filter(m => {
      const fechaMov = new Date(m.Concertacion);
      return fechaMov >= fechaLimite && 
             fechaMov < fechaRescate &&
             m.ticker === ticker &&
             (m.descripcion.toLowerCase().includes('rescate') || 
              m.descripcion.toLowerCase().includes('prima por rescate')) &&
             m.importe > 0; // Solo movimientos con importe positivo
    });
    
    // Ordenar por fecha descendente (más reciente primero)
    movimientosAnteriores.sort((a, b) => 
      new Date(b.Concertacion).getTime() - new Date(a.Concertacion).getTime()
    );
    
    // Tomar el movimiento más reciente que tenga importe
    const movimientoConMonto = movimientosAnteriores[0];
    
    let precioUSD = 0;
    let montoUSD = 0;
    let precioOriginal: number | undefined = undefined;
    let monedaOriginal = movs[0].moneda || '';
    
    if (movimientoConMonto && movimientoConMonto.importe > 0) {
      // Obtener dólar histórico para la fecha del movimiento anterior
      let dolarMovAnterior = await getDolarParaFecha(movimientoConMonto.Concertacion);
      if (!dolarMovAnterior) {
        dolarMovAnterior = dolarHistorico; // Usar dólar del rescate como fallback
      }
      
      // Convertir importe a USD
      const importeTotal = Math.abs(movimientoConMonto.importe);
      const importeUSD = movimientoConMonto.moneda.toLowerCase().includes('pesos') || movimientoConMonto.idMoneda === 1
        ? importeTotal / dolarMovAnterior
        : importeTotal;
      
      // Calcular precio y monto basado en la cantidad total
      precioUSD = cantidadTotal > 0 ? importeUSD / cantidadTotal : 0;
      montoUSD = importeUSD; // El monto total es el importe encontrado
      precioOriginal = importeTotal / cantidadTotal;
      monedaOriginal = movimientoConMonto.moneda || monedaOriginal;
      dolarHistorico = dolarMovAnterior; // Usar dólar del movimiento anterior
    }
    
    // Crear una sola operación de rescate parcial con la cantidad total
    operaciones.push({
      tipo: 'RESCATE_PARCIAL',
      fecha,
      cantidad: cantidadTotal,
      precioUSD,
      montoUSD,
      costoOperacionUSD: 0,
      descripcion: movs[0].descripcion, // Usar la descripción del primer movimiento
      precioOriginal,
      costoOriginal: undefined,
      monedaOriginal,
      dolarUsado: dolarHistorico
    });
  }
  
  // Procesar cada operación de forma asíncrona para obtener dólar histórico
  for (const [key, movs] of operacionesMap.entries()) {
    // Obtener dólar histórico para la fecha de la operación
    const fecha = movs[0].Concertacion;
    let dolarHistorico = await getDolarParaFecha(fecha);
    
    // Si no hay dólar histórico, usar el actual como fallback
    if (!dolarHistorico) {
      console.warn(`⚠️ Usando dólar MEP actual como fallback para ${fecha}`);
      dolarHistorico = dolarMEPActual;
    }
    
    // Detectar si es un rescate parcial
    const descripcionLower = movs[0].descripcion.toLowerCase();
    const esRescateParcial = descripcionLower.includes('rescate parcial');
    
    // Determinar si es operación en USD o en pesos
    const esOperacionUSD = descripcionLower.includes('/ usd') || descripcionLower.includes('/ u$s');
    
    if (esOperacionUSD) {
      // CASO 1: Operación en USD
      if (movs.length === 2) {
        // Un registro tiene el precio en USD, el otro tiene el costo en pesos
        const registroConPrecio = movs.find(m => m.precio > 0);
        const registroConCosto = movs.find(m => m.precio <= 0 || m === movs.find(m => m.precio > 0 && m.idMoneda === 1));
        if (!registroConPrecio) continue;
        const tipo: 'COMPRA' | 'VENTA' | 'RESCATE_PARCIAL' = esRescateParcial ? 'RESCATE_PARCIAL' : (registroConPrecio.importe < 0 ? 'COMPRA' : 'VENTA');
        const precioUSD = registroConPrecio.precio;
        const cantidad = Math.abs(registroConPrecio.cantidad);
        const montoUSD = precioUSD * cantidad;
        // El costo está en el registro en pesos (si existe)
        let costoUSD: number;
        let costoOriginal: number | undefined;
        if (registroConCosto && registroConCosto !== registroConPrecio) {
          // Hay un registro separado con el costo en pesos
          costoOriginal = Math.abs(registroConCosto.importe);
          costoUSD = costoOriginal / dolarHistorico;
        } else {
          // Solo hay un registro, usar el importe total
          costoUSD = Math.abs(registroConPrecio.importe) - montoUSD;
        }
        operaciones.push({
          tipo,
          fecha: registroConPrecio.Concertacion,
          cantidad,
          precioUSD,
          montoUSD,
          costoOperacionUSD: costoUSD,
          descripcion: registroConPrecio.descripcion,
          precioOriginal: undefined,
          costoOriginal,
          monedaOriginal: registroConCosto?.moneda || registroConPrecio.moneda,
          dolarUsado: dolarHistorico
        });
      } else if (movs.length === 1) {
        // Solo hay un registro: tomar precio y monto del registro, costo 0
        const mov = movs[0];
        if (mov.precio <= 0) continue;
        const tipo: 'COMPRA' | 'VENTA' | 'RESCATE_PARCIAL' = esRescateParcial ? 'RESCATE_PARCIAL' : (mov.importe < 0 ? 'COMPRA' : 'VENTA');
        const cantidad = Math.abs(mov.cantidad);
        const precioUSD = mov.precio;
        const montoUSD = precioUSD * cantidad;
        operaciones.push({
          tipo,
          fecha: mov.Concertacion,
          cantidad,
          precioUSD,
          montoUSD,
          costoOperacionUSD: 0,
          descripcion: mov.descripcion,
          precioOriginal: undefined,
          costoOriginal: undefined,
          monedaOriginal: mov.moneda,
          dolarUsado: dolarHistorico
        });
      }
    } else if (movs.length === 1 || !esOperacionUSD) {
      // CASO 2: Operación en pesos con 1 registro
      const mov = movs[0];
      
      // Los rescates parciales ya fueron procesados antes, saltarlos aquí
      if (esRescateParcial) {
        continue;
      }
      
      // Detectar suscripciones de fondos
      const descripcionLower = mov.descripcion?.toLowerCase() || mov.descripcionCorta?.toLowerCase() || '';
      const esSuscripcion = mov.tipo === 'Liquidación Fondo' && 
                           (descripcionLower.includes('suscripción') || 
                            descripcionLower.includes('suscribiste') ||
                            descripcionLower.includes('suscripcion'));
      
      if (esSuscripcion && mov.cantidad > 0 && mov.importe > 0) {
        // Suscripción de fondo: tratar como COMPRA
        // Precio puede ser válido o -1, usar precio del movimiento o calcular desde importe
        const precioOriginal = mov.precio > 0 ? mov.precio : (mov.importe / mov.cantidad);
        const precioUSD = precioOriginal / dolarHistorico;
        const cantidad = Math.abs(mov.cantidad);
        const montoUSD = precioUSD * cantidad;
        
        // Costo = importe total (ya incluye costos)
        const importeTotal = Math.abs(mov.importe) / dolarHistorico;
        const costoUSD = importeTotal - montoUSD;
        const costoOriginal = costoUSD * dolarHistorico;
        
        operaciones.push({
          tipo: 'COMPRA',
          fecha: mov.Concertacion,
          cantidad,
          precioUSD,
          montoUSD,
          costoOperacionUSD: costoUSD,
          descripcion: mov.descripcion || mov.descripcionCorta,
          precioOriginal,
          costoOriginal,
          monedaOriginal: mov.moneda,
          dolarUsado: dolarHistorico
        });
        continue;
      }
      
      if (mov.precio <= 0) continue; // Ignorar si no tiene precio válido
      
      const tipo: 'COMPRA' | 'VENTA' | 'RESCATE_PARCIAL' = mov.importe < 0 ? 'COMPRA' : 'VENTA';
      const cantidad = Math.abs(mov.cantidad);
      
      // Precio en pesos, convertir a USD usando dólar histórico
      const precioOriginal = mov.precio;
      const precioUSD = precioOriginal / dolarHistorico;
      
      // Monto = precio * cantidad
      const montoUSD = precioUSD * cantidad;
      
      // Costo = |importe| - monto
      const importeTotal = Math.abs(mov.importe) / dolarHistorico;
      const costoUSD = importeTotal - montoUSD;
      const costoOriginal = (costoUSD * dolarHistorico);
      
      operaciones.push({
        tipo,
        fecha: mov.Concertacion,
        cantidad,
        precioUSD,
        montoUSD,
        costoOperacionUSD: costoUSD,
        descripcion: mov.descripcion,
        precioOriginal,
        costoOriginal,
        monedaOriginal: mov.moneda,
        dolarUsado: dolarHistorico
      });
    }
  }
  
  // Ordenar por fecha descendente (más recientes primero)
  operaciones.sort((a, b) => b.fecha.localeCompare(a.fecha));
  
  return operaciones;
}

/**
 * Extrae los pagos de dividendos para un ticker específico
 * Busca movimientos con "Pago de dividendos" y "Retención de impuestos" 
 * en la descripción que coincidan con el ticker
 */
export async function getDividendosPorTicker(
  movimientos: MovimientoHistorico[],
  ticker: string
): Promise<Array<{
  fecha: string;
  montoBruto: number;
  impuestosRetenidos: number;
  montoNeto: number;
  moneda: string;
}>> {
  // Filtrar movimientos de dividendos
  // Ejemplo: "Movimiento Manual / Pago de dividendos - VOO.E"
  const pagosDividendos = movimientos.filter(m => 
    m.descripcion.toLowerCase().includes('pago de dividendos') &&
    m.descripcion.toLowerCase().includes(ticker.toLowerCase())
  );
  
  // Agrupar por fecha y procesar
  const dividendosMap = new Map<string, {
    pago?: MovimientoHistorico;
    retencion?: MovimientoHistorico;
  }>();
  
  // Primero, agregar todos los pagos
  pagosDividendos.forEach(pago => {
    const fecha = pago.Liquidacion;
    if (!dividendosMap.has(fecha)) {
      dividendosMap.set(fecha, {});
    }
    dividendosMap.get(fecha)!.pago = pago;
  });
  
  // Luego, buscar las retenciones correspondientes
  // Ejemplo: "Movimiento Manual / Retención de impuestos -VOO.E"
  const retenciones = movimientos.filter(m => 
    m.descripcion.toLowerCase().includes('retención de impuestos') &&
    m.descripcion.toLowerCase().includes(ticker.toLowerCase())
  );
  
  retenciones.forEach(retencion => {
    const fecha = retencion.Liquidacion;
    if (dividendosMap.has(fecha)) {
      dividendosMap.get(fecha)!.retencion = retencion;
    }
  });
  
  // Convertir a array de dividendos
  const dividendos = Array.from(dividendosMap.entries())
    .filter(([_, data]) => data.pago) // Solo incluir si hay pago
    .map(([fecha, data]) => {
      const montoBruto = Math.abs(data.pago!.importe);
      const impuestosRetenidos = data.retencion ? Math.abs(data.retencion.importe) : 0;
      const montoNeto = montoBruto - impuestosRetenidos;
      
      return {
        fecha,
        montoBruto,
        impuestosRetenidos,
        montoNeto,
        moneda: data.pago!.moneda
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha)); // Más recientes primero
  
  return dividendos;
}

/**
 * Extrae los pagos de renta para un ticker específico
 * Busca movimientos con "Renta" o "Intereses devengados" en la descripción que coincidan con el ticker
 * Los pagos vienen en dólares y los impuestos en pesos (necesitan conversión)
 */
export async function getRentasPorTicker(
  movimientos: MovimientoHistorico[],
  ticker: string
): Promise<Array<{
  fecha: string;
  montoBruto: number;
  impuestosRetenidos: number;
  montoNeto: number;
  moneda: string;
  esInteresDevengado: boolean;
}>> {
  // Filtrar movimientos de renta e intereses devengados
  // Ejemplo: "Renta / BPOC7" o "Intereses devengados / TLC1O"
  const pagosRenta = movimientos.filter(m => {
    const descripcionLower = m.descripcion.toLowerCase();
    const tipoLower = m.tipo.toLowerCase();
    return (
      (descripcionLower.includes('renta') || descripcionLower.includes('intereses devengados')) &&
      descripcionLower.includes(ticker.toLowerCase()) &&
      tipoLower === 'cupón'
    );
  });
  
  // Agrupar por fecha de liquidación
  const rentasMap = new Map<string, {
    pagoDolares?: MovimientoHistorico;
    impuestosPesos?: MovimientoHistorico;
    esInteresDevengado?: boolean;
  }>();
  
  // Separar pagos por moneda
  pagosRenta.forEach(pago => {
    const fecha = pago.Liquidacion;
    if (!rentasMap.has(fecha)) {
      rentasMap.set(fecha, {});
    }
    
    // Detectar si es un interés devengado
    const esInteresDevengado = pago.descripcion.toLowerCase().includes('intereses devengados');
    if (esInteresDevengado) {
      rentasMap.get(fecha)!.esInteresDevengado = true;
    }
    
    // Si la moneda contiene "Dólar" o "U$S" y el importe es positivo, es el pago en dólares
    // Si es "Pesos" y el importe es negativo, son los impuestos
    const monedaLower = pago.moneda.toLowerCase();
    if ((monedaLower.includes('dólar') || monedaLower.includes('u$s')) && pago.importe > 0) {
      rentasMap.get(fecha)!.pagoDolares = pago;
    } else if (monedaLower.includes('pesos') && pago.importe < 0) {
      rentasMap.get(fecha)!.impuestosPesos = pago;
    }
  });
  
  // Convertir a array de rentas con conversión de impuestos pesos a dólares
  const rentasPromises = Array.from(rentasMap.entries())
    .filter(([_, data]) => data.pagoDolares) // Solo incluir si hay pago en dólares
    .map(async ([fecha, data]) => {
      const montoBruto = Math.abs(data.pagoDolares!.importe);
      let impuestosRetenidos = 0;
      
      // Si hay impuestos en pesos, convertir a dólares usando el dolar MEP de la fecha
      if (data.impuestosPesos) {
        const impuestosPesos = Math.abs(data.impuestosPesos.importe);
        const dolarMEP = await getDolarParaFecha(fecha);
        
        if (dolarMEP && dolarMEP > 0) {
          impuestosRetenidos = impuestosPesos / dolarMEP;
        } else {
          console.warn(`⚠️ No se pudo obtener dolar MEP para fecha ${fecha}`);
          impuestosRetenidos = 0;
        }
      }
      
      const montoNeto = montoBruto - impuestosRetenidos;
      
      return {
        fecha,
        montoBruto,
        impuestosRetenidos,
        montoNeto,
        moneda: 'Dólares',
        esInteresDevengado: data.esInteresDevengado || false
      };
    });
  
  const rentas = (await Promise.all(rentasPromises))
    .sort((a, b) => b.fecha.localeCompare(a.fecha)); // Más recientes primero
  
  return rentas;
}

// Interfaz para ingresos y egresos
export interface IngresoEgreso {
  fecha: string;
  descripcion: string;
  moneda: string;
  importeOriginal: number;
  importeUSD: number;
  dolarUsado?: number;
  fechaDolarMEP?: string;
}

/**
 * Obtiene todos los ingresos y egresos desde movimientos históricos
 * Filtra por descripcionCorta: "Ingreso de Dinero" o "Retiro de Dinero"
 * Convierte pesos a USD usando dólar MEP histórico de la fecha de la operación
 */
export async function getIngresosYEgresos(
  movimientos: MovimientoHistorico[]
): Promise<{ ingresos: IngresoEgreso[]; egresos: IngresoEgreso[] }> {
  const ingresos: IngresoEgreso[] = [];
  const egresos: IngresoEgreso[] = [];

  // Filtrar movimientos de ingresos y egresos
  const movimientosDinero = movimientos.filter(
    (m) => m.descripcionCorta === 'Ingreso de Dinero' || m.descripcionCorta === 'Retiro de Dinero'
  );

  // Procesar cada movimiento
  for (const mov of movimientosDinero) {
    const fecha = mov.Liquidacion || mov.Concertacion;
    const esIngreso = mov.descripcionCorta === 'Ingreso de Dinero';
    const importeOriginal = Math.abs(mov.importe);
    const moneda = mov.moneda;

    let importeUSD = importeOriginal;
    let dolarUsado: number | undefined = undefined;
    let fechaDolarMEP: string | undefined = undefined;

    // Si es en pesos, convertir a USD usando dólar MEP histórico
    if (moneda.toLowerCase().includes('pesos') || moneda.toLowerCase() === 'pesos') {
      const dolarMEP = await getDolarParaFecha(fecha);
      if (dolarMEP && dolarMEP > 0) {
        importeUSD = importeOriginal / dolarMEP;
        dolarUsado = dolarMEP;
        fechaDolarMEP = fecha;
      } else {
        console.warn(`⚠️ No se pudo obtener dólar MEP para fecha ${fecha}, usando importe original`);
      }
    } else if (moneda.toLowerCase().includes('dólar') || moneda.toLowerCase().includes('dolar') || moneda.toLowerCase().includes('u$s') || moneda.toLowerCase().includes('us dollar')) {
      // Ya está en USD
      importeUSD = importeOriginal;
    } else {
      // Otra moneda (Cable, etc.) - asumir que es USD equivalente
      importeUSD = importeOriginal;
    }

    const item: IngresoEgreso = {
      fecha,
      descripcion: mov.descripcion,
      moneda,
      importeOriginal,
      importeUSD,
      dolarUsado,
      fechaDolarMEP,
    };

    if (esIngreso) {
      ingresos.push(item);
    } else {
      egresos.push(item);
    }
  }

  // Ordenar por fecha (más recientes primero)
  ingresos.sort((a, b) => b.fecha.localeCompare(a.fecha));
  egresos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  return { ingresos, egresos };
}

/**
 * Obtiene el total de dividendos de todos los tickers
 * Retorna el total en USD y un desglose por ticker
 */
export async function getDividendosTotales(
  movimientos: MovimientoHistorico[]
): Promise<{ total: number; porTicker: Map<string, number> }> {
  // Obtener todos los tickers únicos que tienen dividendos
  // El ticker puede estar en el campo ticker o extraerse de la descripción
  const tickersConDividendos = new Set<string>();
  movimientos.forEach((m) => {
    if (m.descripcion.toLowerCase().includes('pago de dividendos')) {
      let ticker = m.ticker;
      // Si el ticker está vacío, intentar extraerlo de la descripción
      // Ejemplo: "Movimiento Manual / Pago de dividendos - VOO.E"
      if (!ticker || ticker.trim() === '') {
        const match = m.descripcion.match(/pago de dividendos\s*-\s*([A-Z0-9.]+)/i);
        if (match && match[1]) {
          ticker = match[1].trim();
        }
      }
      if (ticker && ticker.trim() !== '') {
        tickersConDividendos.add(ticker);
      }
    }
  });

  const porTicker = new Map<string, number>();
  let total = 0;

  // Para cada ticker, obtener sus dividendos
  for (const ticker of tickersConDividendos) {
    const dividendos = await getDividendosPorTicker(movimientos, ticker);
    const totalTicker = dividendos.reduce((sum, d) => sum + d.montoNeto, 0);
    porTicker.set(ticker, totalTicker);
    total += totalTicker;
  }

  return { total, porTicker };
}

/**
 * Obtiene el total de rentas de todos los tickers
 * Retorna el total en USD y un desglose por ticker
 */
export async function getRentasTotales(
  movimientos: MovimientoHistorico[]
): Promise<{ total: number; porTicker: Map<string, number> }> {
  // Obtener todos los tickers únicos que tienen rentas
  const tickersConRentas = new Set<string>();
  movimientos.forEach((m) => {
    const descripcionLower = m.descripcion.toLowerCase();
    const tipoLower = m.tipo.toLowerCase();
    if (
      (descripcionLower.includes('renta') || descripcionLower.includes('intereses devengados')) &&
      m.ticker &&
      tipoLower === 'cupón'
    ) {
      tickersConRentas.add(m.ticker);
    }
  });

  const porTicker = new Map<string, number>();
  let total = 0;

  // Para cada ticker, obtener sus rentas
  for (const ticker of tickersConRentas) {
    const rentas = await getRentasPorTicker(movimientos, ticker);
    const totalTicker = rentas.reduce((sum, r) => sum + r.montoNeto, 0);
    porTicker.set(ticker, totalTicker);
    total += totalTicker;
  }

  return { total, porTicker };
}

/**
 * Obtiene los saldos actuales en diferentes monedas desde liquidez en estadoCuenta
 * Retorna los saldos convertidos a USD
 */
export async function getSaldosActuales(): Promise<{ usd: number; cable: number; pesos: number }> {
  try {
    // Obtener estado de cuenta
    const estadoCuenta = await getEstadoCuentaConCache();
    
    if (!estadoCuenta.data) {
      console.warn('⚠️ No se pudo obtener estado de cuenta para saldos actuales');
      return { usd: 0, cable: 0, pesos: 0 };
    }

    // Buscar liquidez en la respuesta
    let liquidez: any[] = [];
    
    if ((estadoCuenta.data as any).liquidez) {
      liquidez = (estadoCuenta.data as any).liquidez || [];
    }

    if (liquidez.length === 0) {
      console.warn('⚠️ No se encontró liquidez en estado de cuenta');
      return { usd: 0, cable: 0, pesos: 0 };
    }

    // Obtener dólar MEP actual para conversión de pesos
    const dolarMEP = getDolarMEP(estadoCuenta.data.cotizacionesDolar || []);

    // Convertir saldos a USD usando DO (saldo disponible)
    let usd = 0;
    let cable = 0;
    let pesos = 0;

    liquidez.forEach((item: any) => {
      const moneda = item.Moneda || item.moneda || '';
      const saldo = item.DO || item.DInm || 0; // Usar DO (saldo disponible) o DInm como fallback
      const monedaLower = moneda.toLowerCase();
      
      if (monedaLower.includes('dólar') && !monedaLower.includes('cable') && !monedaLower.includes('us dollar (cable)')) {
        // Dólares normales
        usd += saldo;
      } else if (monedaLower.includes('cable') || monedaLower.includes('us dollar (cable)')) {
        // US Dollar (Cable) - tratarlo como USD
        cable += saldo;
      } else if (monedaLower.includes('pesos')) {
        // Pesos - convertir a USD
        const saldoUSD = dolarMEP && dolarMEP > 0 ? saldo / dolarMEP : 0;
        pesos += saldoUSD;
      }
    });

    return { usd, cable, pesos };
  } catch (error) {
    console.error('❌ Error obteniendo saldos actuales:', error);
    return { usd: 0, cable: 0, pesos: 0 };
  }
}

// Interfaz para flujos proyectados
export interface FlujoProyectado {
  codigoespeciebono: string;
  fecha: string;
  vr: number;
  renta: number;
  amort: number;
  rentaamort: string;
  total: number;
  tipo_moneda: number; // 1 = pesos, 2 = dólares
}

// Interfaz para bonos excluidos
interface BonoExcluido {
  descripcionbono: string;
  codigoespeciebono: string;
  tenencia: number;
  precio: number;
}

interface FlujosProyectadosCacheData {
  data: FlujoProyectado[];
  fecha: string; // YYYY-MM-DD
  timestamp: number;
}

export type FlujosProyectadosConCache = CacheResult<FlujoProyectado[]>;

/**
 * Obtiene los flujos de un bono excluido usando instrument_info
 */
async function getFlujosDeBonoExcluido(bonoExcluido: BonoExcluido): Promise<FlujoProyectado[]> {
  try {
    const instrumentInfo = await getBalanzInstrumentInfo(bonoExcluido.codigoespeciebono);
    
    if (!instrumentInfo.bond?.cashFlow || !Array.isArray(instrumentInfo.bond.cashFlow)) {
      console.warn(`⚠️ No se encontró cashFlow para el bono excluido ${bonoExcluido.codigoespeciebono}`);
      return [];
    }

    const tenencia = bonoExcluido.tenencia;
    const flujos: FlujoProyectado[] = [];

    // Filtrar solo flujos futuros (fechas >= hoy)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    for (const cashFlow of instrumentInfo.bond.cashFlow) {
      const fechaFlujo = new Date(cashFlow.date);
      fechaFlujo.setHours(0, 0, 0, 0);

      // Solo incluir flujos futuros
      if (fechaFlujo >= hoy) {
        const renta = (cashFlow.rent || 0) * tenencia;
        const amort = (cashFlow.amortizationValue || 0) * tenencia;
        const total = (cashFlow.cashflow || 0) * tenencia;
        
        // Determinar si es renta, amortización o ambos
        let rentaamort = '';
        if (renta > 0 && amort > 0) {
          rentaamort = 'Renta + Amort.';
        } else if (renta > 0) {
          rentaamort = 'Renta';
        } else if (amort > 0) {
          rentaamort = 'Amort.';
        }

        flujos.push({
          codigoespeciebono: bonoExcluido.codigoespeciebono,
          fecha: cashFlow.date,
          vr: cashFlow.residualValue || 0,
          renta: renta,
          amort: amort,
          rentaamort: rentaamort,
          total: total,
          tipo_moneda: cashFlow.currency || 2, // Default a dólares si no se especifica
        });
      }
    }

    return flujos;
  } catch (error) {
    console.error(`❌ Error obteniendo flujos del bono excluido ${bonoExcluido.codigoespeciebono}:`, error);
    return [];
  }
}

/**
 * Obtiene los flujos proyectados desde la API de Balanz
 * Con caché por día para evitar consultas repetidas
 * Incluye los flujos de bonos excluidos obtenidos desde instrument_info
 */
export async function getFlujosProyectados(): Promise<FlujoProyectado[]> {
  try {
    const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Verificar caché (validación por fecha)
    const cacheKey = 'balanz_flujos_proyectados';
    const cachedData = getCachedDataByDate<FlujoProyectado[]>(cacheKey, hoy);
    if (cachedData) {
      return cachedData;
    }
    
    // Construir URL completa (el proxy de Vite agrega /v1 automáticamente)
    const url = `/api/bonos/flujoproyectado/${BALANZ_ACCOUNT_ID}`;
    
    // Obtener token de autenticación
    const token = await getCachedAccessToken();
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': token,
      },
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error('❌ Error al obtener flujos proyectados:', response.statusText);
      console.error('📄 Response body:', text.substring(0, 500));
      
      // Detectar si es error de sesión expirada o autenticación
      if (response.status === 403 || response.status === 401 || response.status === 520) {
        console.error('🔒 Error de autenticación - Token posiblemente expirado');
        localStorage.removeItem('balanz_access_token');
        localStorage.removeItem('balanz_token_timestamp');
      }
      
      // Si hay error, intentar usar caché expirado como fallback
      const expiredCache = getCachedDataExpired<FlujoProyectado[]>(cacheKey);
      if (expiredCache) {
        return expiredCache;
      }
      
      return [];
    }

    // Si llegamos aquí, la respuesta fue exitosa
    const text = await response.text();
    
    // Intentar parsear como JSON
    let data: FlujoProyectado[];
    let bonosExcluidos: BonoExcluido[] = [];
    
    try {
      const parsed = JSON.parse(text);
      // La respuesta puede venir como objeto con "flujo" o directamente como array
      if (parsed.flujo && Array.isArray(parsed.flujo)) {
        data = parsed.flujo;
        // Extraer bonos excluidos si existen
        if (parsed.excluidos && Array.isArray(parsed.excluidos)) {
          bonosExcluidos = parsed.excluidos;
        }
      } else if (Array.isArray(parsed)) {
        data = parsed;
      } else {
        throw new Error('Formato de respuesta inesperado');
      }
    } catch (parseError) {
      console.error('❌ Error parseando respuesta de flujos proyectados:', parseError);
      // Si hay error, intentar usar caché expirado como fallback
      const expiredCache = getCachedDataExpired<FlujoProyectado[]>(cacheKey);
      if (expiredCache) {
        return expiredCache;
      }
      return [];
    }
    
    // Obtener flujos de bonos excluidos
    if (bonosExcluidos.length > 0) {
      console.log(`📋 Procesando ${bonosExcluidos.length} bono(s) excluido(s)...`);
      const flujosExcluidos = await Promise.all(
        bonosExcluidos.map(bono => getFlujosDeBonoExcluido(bono))
      );
      
      // Aplanar y agregar a la lista principal
      const flujosExcluidosAplanados = flujosExcluidos.flat();
      if (flujosExcluidosAplanados.length > 0) {
        console.log(`✅ Se agregaron ${flujosExcluidosAplanados.length} flujo(s) de bonos excluidos`);
        data = [...data, ...flujosExcluidosAplanados];
      }
    }
    
    // Guardar en caché con la fecha de hoy
    setCachedDataWithDate(cacheKey, data, hoy);
    
    return data;
  } catch (error) {
    console.error('❌ Error al conectar con Balanz API para flujos proyectados:', error);
    // Si hay error, intentar usar caché expirado como fallback
    const cacheKey = 'balanz_flujos_proyectados';
    const expiredCache = getCachedDataExpired<FlujoProyectado[]>(cacheKey);
    if (expiredCache) {
      return expiredCache;
    }
    return [];
  }
}

/**
 * Obtiene los flujos proyectados con información de caché
 */
export async function getFlujosProyectadosConCache(): Promise<FlujosProyectadosConCache> {
  const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Verificar caché primero (validación por fecha)
  const cacheKey = 'balanz_flujos_proyectados';
  const cachedData = getCachedDataByDate<FlujoProyectado[]>(cacheKey, hoy);
  
  if (cachedData) {
    const cacheFull = getCachedDataFull<FlujoProyectado[]>(cacheKey);
    return {
      data: cachedData,
      isCached: true,
      fecha: cacheFull?.fecha || hoy
    };
  }
  
  // Intentar obtener datos frescos
  const data = await getFlujosProyectados();
  
  if (data && data.length > 0) {
    // Datos frescos obtenidos
    return {
      data,
      isCached: false,
      fecha: hoy
    };
  }
  
  // Si falló la API y hay caché, usarla como fallback
  const expiredCache = getCachedDataExpired<FlujoProyectado[]>(cacheKey);
  if (expiredCache) {
    const cacheFull = getCachedDataFull<FlujoProyectado[]>(cacheKey);
    return {
      data: expiredCache,
      isCached: true,
      fecha: cacheFull?.fecha || hoy
    };
  }
  
  // No hay datos ni caché
  return {
    data: [],
    isCached: false,
    fecha: hoy
  };
}

/**
 * Limpia el caché de flujos proyectados
 */
export function clearFlujosProyectadosCache(): void {
  clearCache('balanz_flujos_proyectados');
}
