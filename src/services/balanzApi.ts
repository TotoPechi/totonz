import { Orden } from '../types/balanz';
import { CacheResult } from '../types/cache';

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
    const cachedData = localStorage.getItem(cacheKey);
    
    if (cachedData) {
      try {
        const cache = JSON.parse(cachedData);
        const cacheDate = new Date(cache.timestamp);
        const now = new Date();
        const diffHours = (now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60);
        
        // Caché válido por 24 horas
        if (diffHours < 24) {
          return {
            data: cache.data,
            isCached: true,
            cacheAge: diffHours
          };
        }
      } catch (e) {
        console.warn('⚠️ Error al parsear caché de órdenes:', e);
      }
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
      if (cachedData) {
        try {
          const cache = JSON.parse(cachedData);
          return {
            data: cache.data,
            isCached: true,
            cacheAge: 999
          };
        } catch (e) {
          console.error('❌ Error al usar caché como fallback:', e);
        }
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
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: new Date().toISOString(),
        fechaDesde,
        fechaHasta: hoy
      }));
    } catch (e) {
      console.warn('⚠️ Error al guardar órdenes en caché:', e);
    }
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
    
    // Verificar caché
    const cacheKey = 'balanz_estado_cuenta';
    const cachedData = localStorage.getItem(cacheKey);
    
    // Respetar el flag global de caché
    const globalCacheEnabled = localStorage.getItem('global_cache_enabled') !== 'false';
    if (cachedData && globalCacheEnabled) {
      try {
        const cache: BalanzCacheData = JSON.parse(cachedData);
        // Si la caché es del día actual, usarla
        if (cache.fecha === hoy) {
          return cache.data;
        }
      } catch (e) {
        console.warn('⚠️ Error parseando caché de Balanz');
      }
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
      
      // Si hay caché antigua, usarla como fallback
      if (cachedData) {
        const cache: BalanzCacheData = JSON.parse(cachedData);
        return cache.data;
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
    const cacheData: BalanzCacheData = {
      data,
      fecha: hoy,
      timestamp: Date.now()
    };
    localStorage.setItem('balanz_estado_cuenta', JSON.stringify(cacheData));
    
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
  
  // Verificar caché primero
  const cacheKey = 'balanz_estado_cuenta';
  const cachedData = localStorage.getItem(cacheKey);
  
  // Respetar el flag global de caché
  const globalCacheEnabled = localStorage.getItem('global_cache_enabled') !== 'false';
  if (cachedData && globalCacheEnabled) {
    try {
      const cache: BalanzCacheData = JSON.parse(cachedData);
      // Si el caché es del día de hoy, usarlo
      if (cache.fecha === hoy) {
        return {
          data: cache.data,
          isCached: true, // Marcar como caché para mostrarlo en el footer
          fecha: cache.fecha,
          sessionExpired
        };
      }
    } catch (e) {
      console.warn('⚠️ Error al parsear caché:', e);
    }
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
  if (cachedData) {
    try {
      const cache: BalanzCacheData = JSON.parse(cachedData);
      return {
        data: cache.data,
        isCached: true, // Marca como caché antigua
        fecha: cache.fecha,
        sessionExpired: sessionExpiredAfter
      };
    } catch (e) {
      console.error('❌ Error al usar caché como fallback:', e);
    }
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
  preserveAuthTokens(() => {
    localStorage.removeItem('balanz_estado_cuenta');
  });
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
    try {
      const cache = JSON.parse(localStorage.getItem(key) || '{}');
      const timestamp = new Date(cache.timestamp).getTime();
      
      if (timestamp < oldestTimestamp) oldestTimestamp = timestamp;
      if (timestamp > newestTimestamp) newestTimestamp = timestamp;
    } catch (e) {
      // Ignorar errores de parsing
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
    
    // Verificar caché primero
    const cacheKey = `balanz_movimientos_${fechaDesde}_${hoy}`;
    const cachedData = localStorage.getItem(cacheKey);
    
    // Respetar el flag global de caché
    const globalCacheEnabled = localStorage.getItem('global_cache_enabled') !== 'false';
    if (cachedData && globalCacheEnabled) {
      try {
        const cache = JSON.parse(cachedData);
        const cacheDate = new Date(cache.timestamp);
        const now = new Date();
        const diffHours = (now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60);
        
        // Caché válido por 24 horas
        if (diffHours < 24) {
          return cache.data;
        }
      } catch (e) {
        console.warn('⚠️ Error al parsear caché de movimientos:', e);
      }
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
      
      // Si hay caché antiguo, usarlo como fallback
      if (cachedData && globalCacheEnabled) {
        try {
          const cache = JSON.parse(cachedData);
          return cache.data;
        } catch (e) {
          console.error('❌ Error al usar caché como fallback:', e);
        }
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
    
    // Guardar en caché
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: new Date().toISOString(),
        fechaDesde,
        fechaHasta: hoy
      }));
    } catch (e) {
      console.warn('⚠️ Error al guardar movimientos en caché:', e);
    }
    
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
    const cachedData = localStorage.getItem(cacheKey);
    
    // Respetar el flag global de caché
    const globalCacheEnabled = localStorage.getItem('global_cache_enabled') !== 'false';
    if (cachedData && globalCacheEnabled) {
      try {
        const cache = JSON.parse(cachedData);
        const cacheDate = new Date(cache.timestamp);
        const now = new Date();
        const diffHours = (now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60);
        
        // Caché válido por 24 horas
        if (diffHours < 24) {
          return {
            data: cache.data,
            isCached: true,
            cacheAge: diffHours
          };
        }
      } catch (e) {
        console.warn('⚠️ Error al parsear caché de movimientos:', e);
      }
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
export async function getOperacionesPorTicker(
  movimientos: MovimientoHistorico[],
  ticker: string,
  dolarMEPActual: number // Solo como fallback
): Promise<Array<{
  tipo: 'COMPRA' | 'VENTA';
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
  // Filtrar movimientos del ticker
  const movimientosTicker = movimientos.filter(m => m.ticker === ticker);
  
  // Agrupar por descripción y fecha para combinar registros relacionados
  const operacionesMap = new Map<string, MovimientoHistorico[]>();
  
  movimientosTicker.forEach(mov => {
    // Solo procesar movimientos con cantidad (compras/ventas reales)
    if (mov.cantidad === 0) {
      return;
    }
    
    // Usar descripción + fecha como clave para agrupar
    const key = `${mov.descripcion}_${mov.Concertacion}`;
    if (!operacionesMap.has(key)) {
      operacionesMap.set(key, []);
    }
    operacionesMap.get(key)!.push(mov);
  });
  
  // Convertir cada grupo de movimientos a operación
  const operaciones: Array<{
    tipo: 'COMPRA' | 'VENTA';
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
    
    // Determinar si es operación en USD o en pesos
    const descripcionLower = movs[0].descripcion.toLowerCase();
    const esOperacionUSD = descripcionLower.includes('/ usd') || descripcionLower.includes('/ u$s');
    
    if (esOperacionUSD) {
      // CASO 1: Operación en USD
      if (movs.length === 2) {
        // Un registro tiene el precio en USD, el otro tiene el costo en pesos
        const registroConPrecio = movs.find(m => m.precio > 0);
        const registroConCosto = movs.find(m => m.precio <= 0 || m === movs.find(m => m.precio > 0 && m.idMoneda === 1));
        if (!registroConPrecio) continue;
        const tipo: 'COMPRA' | 'VENTA' = registroConPrecio.importe < 0 ? 'COMPRA' : 'VENTA';
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
        const tipo: 'COMPRA' | 'VENTA' = mov.importe < 0 ? 'COMPRA' : 'VENTA';
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
      
      if (mov.precio <= 0) continue; // Ignorar si no tiene precio válido
      
      const tipo: 'COMPRA' | 'VENTA' = mov.importe < 0 ? 'COMPRA' : 'VENTA';
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
