// Servicio para obtener información de tickers
// Usando Balanz API como fuente única de datos

import { preserveAuthTokens } from '../utils/cacheHelpers';
import {
  clearCache,
  clearCacheByPattern,
  getCachedData,
  getCachedDataExpired,
  getCachedDataWithValidator,
  setCachedData,
  setCachedDataCustom
} from '../utils/cacheManager';
import { tickersMatch } from '../utils/tickerHelpers';
import { getCachedAccessToken } from './balanzAuth';
import { getCotizacionesHistoricas, getDolarParaFechaDesdeCotizaciones } from './dolarHistoricoApi';
import { Position } from '../types/balanz';
import { MovimientoHistorico } from './balanzApi';

// --- Tipos para datos de API ---

/**
 * Datos históricos de fondo desde la API
 */
interface FondoHistoricoItem {
  fecha: string;
  valorcuotaparte: number;
}

/**
 * Datos completos de instrumento desde la API de Balanz
 */
interface InstrumentFullData {
  Cotizacion?: {
    Descripcion?: string;
    tipo?: string;
    currencies?: string[][];
    Ratio?: string;
    industryGroup?: string;
    industrySector?: string;
    industrySubgroup?: string;
    PrecioCierreAnterior?: number;
    PrecioApertura?: number;
    MarketID?: string;
  };
  bond?: {
    type?: string;
    couponType?: string;
    coupon?: string;
    nextPaymentDate?: string;
    nextPaymentDays?: number;
    currentYield?: string;
    frequency?: string;
    description?: string;
    issuanceDate?: string;
    jurisdiction?: string;
    maturity?: string;
    yield?: string;
    cashFlow?: Array<{
      date: string;
      coupon: string;
      amortization: string;
      effectiveRent: string;
      residualValue: number;
      amortizationValue: number;
      rent: number;
      cashflow: number;
      currency: number;
    }>;
  };
  description?: string;
  usdTicker?: string;
}

/**
 * Cotización histórica del dólar desde Argentina Datos
 */
interface CotizacionDolarHistorica {
  casa: string;
  compra: number;
  venta: number;
  fecha: string;
}

// --- Funciones helper ---

/**
 * Maneja errores de autenticación limpiando el token del caché
 */
function handleAuthError(response: Response): void {
  if (response.status === 520 || response.status === 403 || response.status === 401) {
    console.error('🔒 Error de autenticación - Token posiblemente expirado');
    localStorage.removeItem('balanz_access_token');
    localStorage.removeItem('balanz_token_timestamp');
  }
}

interface TickerQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketCap?: number;
  volume?: number;
  high52w?: number;
  low52w?: number;
  mappedSymbol?: string; // Símbolo transformado si se usó mapeo especial
  description?: string; // Descripción detallada del instrumento
  type?: string; // Tipo de instrumento
  category?: string; // Categoría (industryGroup - industrySector - industrySubgroup)
  lastClose?: number; // Precio de último cierre
  open?: number; // Precio de apertura
  marketId?: string; // Identificador del mercado
  tickerCurrency?: string; // Moneda original del ticker (ARS, USD, CCL, etc.)
  ratio?: string; // Ratio de conversión (ej: "25 VN = 1 ADR")
  // Información del bono (si aplica)
  bond?: {
    couponType?: string; // "Fixed rate", "Variable", etc.
    coupon?: string; // "5%" como string
    nextPaymentDate?: string; // "2026-04-30"
    nextPaymentDays?: number; // 174
    currentYield?: string; // "5.2%" como string
    frequency?: string; // "Semiannual", "Quarterly", etc.
    description?: string; // Descripción completa
    issuanceDate?: string; // "2024-01-05"
    jurisdiction?: string; // "ARG", "USA", etc.
    maturity?: string; // "2027-10-31"
    yield?: string; // "7.6%" como string
    type?: string; // "BOPREAL", "Treasury", etc.
    cashFlow?: Array<{
      date: string;
      coupon: string;
      amortization: string;
      effectiveRent: string;
      residualValue: number;
      amortizationValue: number;
      rent: number;
      cashflow: number;
      currency: number;
    }>;
  };
}

interface HistoricalData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalDataResponse {
  data: HistoricalData[];
  sourceUrl: string;
  source: 'cache' | 'balanz';
  cacheDate?: string; // Fecha del caché en formato YYYY-MM-DD
}

/**
 * Obtiene información detallada de un instrumento desde la API de Balanz
 * Incluye el ticker en USD desde Cotizacion.currencies
 * Con caché de 24 horas para evitar llamadas repetidas
 */
export async function getBalanzInstrumentInfo(ticker: string): Promise<{ 
  description?: string; 
  type?: string; 
  category?: string;
  usdTicker?: string; // Ticker para consultar precios en USD
  lastClose?: number; // Precio de último cierre
  open?: number; // Precio de apertura
  marketId?: string; // Identificador del mercado
  tickerCurrency?: string; // Moneda original del ticker (ARS, USD, CCL, etc.)
  ratio?: string; // Ratio de conversión (ej: "25 VN = 1 ADR")
  // Información del bono (si aplica)
  bond?: {
    couponType?: string; // "Fixed rate", "Variable", etc.
    coupon?: string; // "5%" como string
    nextPaymentDate?: string; // "2026-04-30"
    nextPaymentDays?: number; // 174
    currentYield?: string; // "5.2%" como string
    frequency?: string; // "Semiannual", "Quarterly", etc.
    description?: string; // Descripción completa
    issuanceDate?: string; // "2024-01-05"
    jurisdiction?: string; // "ARG", "USA", etc.
    maturity?: string; // "2027-10-31"
    yield?: string; // "7.6%" como string
    type?: string; // "BOPREAL", "Treasury", etc.
    cashFlow?: Array<{
      date: string;
      coupon: string;
      amortization: string;
      effectiveRent: string;
      residualValue: number;
      amortizationValue: number;
      rent: number;
      cashflow: number;
      currency: number;
    }>;
  };
  fullData?: InstrumentFullData; // Data completa para uso interno
}> {
  // Helper para procesar data completa del API y extraer lo necesario
  const processInstrumentData = (fullData: InstrumentFullData, ticker: string) => {
    // Si es el formato antiguo (solo los campos básicos), retornarlo directamente
    if (fullData.description !== undefined || fullData.usdTicker !== undefined) {
      return fullData;
    }
    
    // Procesar formato completo del API
    if (!fullData.Cotizacion) {
      return {};
    }
    
    const cotizacion = fullData.Cotizacion;
    const bond = fullData.bond;
    
    // Detectar moneda del ticker actual y ticker en USD
    let usdTicker = ticker;
    let tickerCurrency = 'USD'; // Default USD
    
    if (cotizacion.currencies && Array.isArray(cotizacion.currencies)) {
      // Buscar el ticker actual en currencies para saber su moneda
      const currentCurrency = cotizacion.currencies.find((c: string[]) => c[0] === ticker);
      if (currentCurrency && currentCurrency[2]) {
        tickerCurrency = currentCurrency[2]; // ARS, USD, CCL, etc.
      }
      
      // Buscar ticker en USD
      const usdCurrency = cotizacion.currencies.find((c: string[]) => c[2] === 'USD');
      if (usdCurrency && usdCurrency[0]) {
        usdTicker = usdCurrency[0];
      }
    }
    
    // Extraer ratio si existe
    const ratio = cotizacion.Ratio || undefined;
    
    let description = cotizacion.Descripcion || '';
    
    let type = cotizacion.tipo || '';
    if (bond && bond.type) {
      type = type ? `${type} (${bond.type})` : bond.type;
    }
    
    const parts = [
      cotizacion.industryGroup,
      cotizacion.industrySector,
      cotizacion.industrySubgroup
    ].filter(Boolean);
    const category = parts.length > 0 ? parts.join(' - ') : undefined;
    
    // Extraer información del bono si existe
    let bondInfo = undefined;
    if (bond) {
      bondInfo = {
        ...bond
      };
    }
    
    return {
      description: description || undefined,
      type: type || undefined,
      category: category,
      usdTicker: usdTicker,
      lastClose: cotizacion.PrecioCierreAnterior, // Precio de cierre anterior
      open: cotizacion.PrecioApertura, // Precio de apertura
      marketId: cotizacion.MarketID,
      tickerCurrency: tickerCurrency, // Moneda del ticker (ARS, USD, CCL, etc.)
      ratio: ratio, // Ratio de conversión si existe
      bond: bondInfo,
      fullData: fullData // Incluir data completa por si se necesita
    };
  };

  try {
    // Clave de caché
    const cacheKey = `instrument_info_${ticker}`;
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
    
    // Verificar si hay datos en caché válidos (menos de 24 horas)
    const cachedFullData = getCachedData<InstrumentFullData>(cacheKey, CACHE_DURATION);
    if (cachedFullData) {
      return processInstrumentData(cachedFullData, ticker);
    }
    
    // Primero intentamos sin mapeo especial para obtener la info
    const url = `/api/cotizacioninstrumento?plazo=1&idCuenta=222233&ticker=${ticker}`;
    
    // Obtener token de autenticación
    const token = await getCachedAccessToken();
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': token,
      }
    });
    
    if (!response.ok) {
      console.warn(`⚠️ Error ${response.status} al obtener info del instrumento`);
      
      handleAuthError(response);
      
      // Si hay error pero tenemos caché antiguo, usarlo como fallback
      const expiredCache = getCachedDataExpired<InstrumentFullData>(cacheKey);
      if (expiredCache) {
        return processInstrumentData(expiredCache, ticker);
      }
      
      return {};
    }
    
    const data = await response.json();
    
    if (!data || !data.Cotizacion) {
      console.warn('⚠️ No hay datos de cotización');
      
      // Si no hay datos pero tenemos caché, usarlo
      const expiredCache = getCachedDataExpired<InstrumentFullData>(cacheKey);
      if (expiredCache) {
        return processInstrumentData(expiredCache, ticker);
      }
      
      return {};
    }
    
    const cotizacion = data.Cotizacion;
    const bond = data.bond;
    
    // Guardar la respuesta COMPLETA en caché
    setCachedData(cacheKey, data);
    
    // Obtener ticker en USD desde currencies y detectar moneda del ticker actual
    // currencies es un array de arrays: [["YPFD", "1", "ARS"], ["YPFDD", "2", "USD"], ...]
    let usdTicker = ticker; // Default al ticker original
    let tickerCurrency = 'USD'; // Default USD
    
    if (cotizacion.currencies && Array.isArray(cotizacion.currencies)) {
      // Buscar el ticker actual en currencies para saber su moneda
      const currentCurrency = cotizacion.currencies.find((c: string[]) => c[0] === ticker);
      if (currentCurrency && currentCurrency[2]) {
        tickerCurrency = currentCurrency[2]; // ARS, USD, CCL, etc.
      }
      
      // Buscar ticker en USD
      const usdCurrency = cotizacion.currencies.find((c: string[]) => c[2] === 'USD');
      if (usdCurrency && usdCurrency[0]) {
        usdTicker = usdCurrency[0];
      }
    }
    
    // Extraer ratio si existe
    const ratio = cotizacion.Ratio || undefined;
    
    // Descripción: usar solo Cotizacion.Descripcion (bond.description va en el tooltip)
    let description = cotizacion.Descripcion || '';
    
    // Tipo: usar Cotizacion.tipo, agregar bond.type si existe
    let type = cotizacion.tipo || '';
    if (bond && bond.type) {
      type = type ? `${type} (${bond.type})` : bond.type;
    }
    
    // Categoría: industryGroup - industrySector - industrySubgroup
    const parts = [
      cotizacion.industryGroup,
      cotizacion.industrySector,
      cotizacion.industrySubgroup
    ].filter(Boolean);
    const category = parts.length > 0 ? parts.join(' - ') : undefined;
    
    // Extraer información del bono si existe
    let bondInfo = undefined;
    if (bond) {
      bondInfo = {
        couponType: bond.couponType, // "Fixed rate", etc.
        coupon: bond.coupon, // "5%" como string
        nextPaymentDate: bond.nextPaymentDate, // "2026-04-30"
        nextPaymentDays: bond.nextPaymentDays, // 174 como número
        currentYield: bond.currentYield, // "5.2%" como string
        frequency: bond.frequency, // "Semiannual", etc.
        description: bond.description, // Descripción completa
        issuanceDate: bond.issuanceDate, // "2024-01-05"
        jurisdiction: bond.jurisdiction, // "ARG"
        maturity: bond.maturity, // "2027-10-31"
        yield: bond.yield, // "7.6%"
        type: bond.type, // "BOPREAL", etc.
        cashFlow: bond.cashFlow // Array completo de cashflow
      };
    }
    
    const result = {
      description: description || undefined,
      type: type || undefined,
      category: category,
      usdTicker: usdTicker,
      lastClose: cotizacion.PrecioCierreAnterior, // Precio de cierre anterior
      open: cotizacion.PrecioApertura, // Precio de apertura
      marketId: cotizacion.MarketID,
      tickerCurrency: tickerCurrency, // Moneda del ticker (ARS, USD, CCL, etc.)
      ratio: ratio, // Ratio de conversión si existe
      bond: bondInfo
    };
    
    return result;
  } catch (error) {
    console.error('❌ Error obteniendo info del instrumento:', error);
    
    // Intentar usar caché como último recurso
    const cacheKey = `instrument_info_${ticker}`;
      const expiredCache = getCachedDataExpired<InstrumentFullData>(cacheKey);
    if (expiredCache) {
      return processInstrumentData(expiredCache, ticker);
    }
    
    return {};
  }
}

// Función para obtener cotización de un ticker
export async function getTickerQuote(symbol: string, positions?: Position[], movimientos?: MovimientoHistorico[]): Promise<TickerQuote | null> {
  try {
    try {
      // Detectar si es un fondo
      const esFondo = isFondo(symbol, positions, movimientos);
      
      if (esFondo) {
        // Usar API de fondos
        const fondoInfo = await getBalanzFondoInfo(symbol);
        
        if (fondoInfo.price !== undefined) {
          return {
            symbol: symbol,
            name: symbol,
            price: fondoInfo.price,
            change: fondoInfo.change || 0,
            changePercent: fondoInfo.changePercent || 0,
            currency: fondoInfo.tickerCurrency === 'ARS' ? 'ARS' : 'USD',
            volume: undefined, // Los fondos no tienen volumen
            mappedSymbol: undefined,
            description: fondoInfo.description,
            type: fondoInfo.type,
            category: fondoInfo.category,
            lastClose: fondoInfo.lastClose,
            open: fondoInfo.open,
            marketId: undefined,
            tickerCurrency: fondoInfo.tickerCurrency,
            ratio: undefined,
            bond: undefined,
          };
        }
        
        console.warn('⚠️ No hay datos de fondo para', symbol);
        return null;
      } else {
        // Usar API normal (acciones, bonos, etc.)
        try {
          // Primero obtener información del instrumento para saber el ticker en USD
          const instrumentInfo = await getBalanzInstrumentInfo(symbol);
          
          // Usar el ticker en USD obtenido de currencies, o usar el ticker original
          const usdTicker = instrumentInfo.usdTicker || symbol;
          
          // Obtener datos históricos con el ticker correcto
          const historicalData = await getBalanzHistorico(usdTicker, 3650); // Últimos 10 años (3650 días)
          
          if (historicalData.length > 0) {
            const lastData = historicalData[historicalData.length - 1];
            const prevData = historicalData.length > 1 ? historicalData[historicalData.length - 2] : lastData;
            
            const price = lastData.close;
            const previousPrice = prevData.close;
            const change = price - previousPrice;
            const changePercent = previousPrice > 0 ? (change / previousPrice * 100) : 0;
            
            return {
              symbol: symbol,
              name: symbol,
              price: price,
              change: change,
              changePercent: changePercent,
              currency: 'USD', // Balanz en USD
              volume: lastData.volume,
              high52w: undefined,
              low52w: undefined,
              mappedSymbol: usdTicker !== symbol ? usdTicker : undefined, // Solo si es diferente
              description: instrumentInfo.description,
              type: instrumentInfo.type,
              category: instrumentInfo.category,
              lastClose: instrumentInfo.lastClose,
              open: instrumentInfo.open,
              marketId: instrumentInfo.marketId,
              tickerCurrency: instrumentInfo.tickerCurrency, // Moneda original del ticker (ARS, USD, CCL, etc.)
              ratio: instrumentInfo.ratio, // Ratio de conversión (ej: "25 VN = 1 ADR")
              bond: instrumentInfo.bond,
            };
          }
        } catch (normalApiError) {
          // Si la API normal falla, intentar API de fondos como fallback
          console.warn('⚠️ API normal falló para', symbol, ', intentando API de fondos...');
          try {
            const fondoInfo = await getBalanzFondoInfo(symbol);
            
            if (fondoInfo.price !== undefined) {
              return {
                symbol: symbol,
                name: symbol,
                price: fondoInfo.price,
                change: fondoInfo.change || 0,
                changePercent: fondoInfo.changePercent || 0,
                currency: fondoInfo.tickerCurrency === 'ARS' ? 'ARS' : 'USD',
                volume: undefined,
                mappedSymbol: undefined,
                description: fondoInfo.description,
                type: fondoInfo.type,
                category: fondoInfo.category,
                lastClose: fondoInfo.lastClose,
                open: fondoInfo.open,
                marketId: undefined,
                tickerCurrency: fondoInfo.tickerCurrency,
                ratio: undefined,
                bond: undefined,
              };
            }
          } catch (fondoApiError) {
            // Si ambas APIs fallan, continuar con el error original
            console.error('❌ También falló la API de fondos:', fondoApiError);
          }
        }
        
        console.warn('⚠️ No hay datos de Balanz para', symbol);
        return null;
      }
    } catch (balanzError) {
      console.error('❌ Error obteniendo datos de Balanz:', balanzError);
      return null;
    }
  } catch (error) {
    console.error('❌ Error obteniendo datos del ticker:', error);
    return null;
  }
}

/**
 * Detecta si un ticker es un fondo de inversión
 * Puede detectarse desde positions, movimientos históricos, o desde la respuesta de la API
 */
export function isFondo(ticker: string, positions?: Position[], movimientos?: MovimientoHistorico[]): boolean {
  // 1. Buscar en positions
  if (positions) {
    const position = positions.find(p => p.Ticker === ticker);
    if (position?.Tipo) {
      const tipo = position.Tipo.toLowerCase();
      if (tipo.includes('fondo') || tipo.includes('cuotaparte')) {
        return true;
      }
    }
  }
  
  // 2. Buscar en movimientos históricos
  if (movimientos && movimientos.length > 0) {
    const movimientosTicker = movimientos.filter(mov => {
      // Normalizar ticker para comparación (puede venir con espacios como "EQUITYS A")
      const movTicker = mov.ticker || mov.Ticker || '';
      return tickersMatch(movTicker, ticker);
    });
    
    if (movimientosTicker.length > 0) {
      // Verificar si alguno de los movimientos indica que es un fondo
      const esFondoEnMovimientos = movimientosTicker.some(mov => {
        // Verificar TipoInstrumento
        const tipoInstrumento = mov.TipoInstrumento || mov.tipoInstrumento || '';
        if (tipoInstrumento.toLowerCase().includes('fondo')) {
          return true;
        }
        
        // Verificar tipo de movimiento
        const tipo = mov.tipo || mov.Tipo || '';
        if (tipo === 'Liquidación Fondo' || tipo.toLowerCase().includes('fondo')) {
          return true;
        }
        
        return false;
      });
      
      if (esFondoEnMovimientos) {
        return true;
      }
    }
  }
  
  return false;
}

// --- Funciones auxiliares para fondos ---

/**
 * Detecta si un fondo es en ARS basándose en la información del caché o API
 */
async function detectFondoCurrency(ticker: string, fondoInfoCached?: InstrumentFullData): Promise<boolean> {
  if (fondoInfoCached?.Cotizacion) {
    const cotizacion = fondoInfoCached.Cotizacion;
    const monedaStr = (cotizacion.Moneda || '').toLowerCase();
    const idMoneda = cotizacion.idMoneda;
    return idMoneda === 1 || monedaStr.includes('pesos') || monedaStr === 'ars';
  }
  
  // Si no hay caché, obtener la información del fondo
  const fondoInfo = await getBalanzFondoInfo(ticker);
  if (fondoInfo.tickerCurrency) {
    const monedaLower = fondoInfo.tickerCurrency.toLowerCase();
    return monedaLower === 'ars' || monedaLower.includes('pesos');
  }
  
  return false;
}

/**
 * Convierte datos del caché de fondo de ARS a USD
 */
async function convertCachedFondoDataToUSD(
  ticker: string,
  cachedData: HistoricalData[]
): Promise<HistoricalData[]> {
  console.log(`💱 Aplicando conversión a USD a datos del caché para ${ticker}...`);
  try {
    const cotizacionesHistoricas = await getCotizacionesHistoricas();
    console.log(`✅ Obtenidas ${cotizacionesHistoricas.length} cotizaciones históricas del dólar para convertir caché`);
    
    const convertedData = cachedData.map((candle) => {
      const dolarHistorico = getDolarParaFechaDesdeCotizaciones(cotizacionesHistoricas, candle.time);
      if (dolarHistorico && dolarHistorico > 0) {
        const valorConvertido = candle.close / dolarHistorico;
        return {
          ...candle,
          open: valorConvertido,
          high: valorConvertido,
          low: valorConvertido,
          close: valorConvertido,
        };
      }
      return candle;
    });
    
    console.log(`✅ Conversión aplicada a caché: primer valor ${cachedData[0]?.close} -> ${convertedData[0]?.close}`);
    return convertedData;
  } catch (error) {
    console.warn('⚠️ Error convirtiendo datos del caché, retornando datos originales:', error);
    return cachedData;
  }
}

/**
 * Convierte datos históricos de fondo de ARS a USD
 */
function convertFondoHistoricoToUSD(
  ticker: string,
  historico: FondoHistoricoItem[],
  cotizacionesHistoricas: CotizacionDolarHistorica[]
): HistoricalData[] {
  let conversionesExitosas = 0;
  let conversionesFallidas = 0;
  
  const candles: HistoricalData[] = historico
    .map((item) => {
      const fecha = item.fecha;
      let valorcuotaparte = item.valorcuotaparte || 0;
      const valorOriginal = valorcuotaparte;
      
      const dolarHistorico = getDolarParaFechaDesdeCotizaciones(cotizacionesHistoricas, fecha);
      if (dolarHistorico && dolarHistorico > 0) {
        valorcuotaparte = valorcuotaparte / dolarHistorico;
        conversionesExitosas++;
        if (conversionesExitosas <= 3 || conversionesExitosas === historico.length) {
          console.log(`💱 Convertido ${ticker} ${fecha}: ${valorOriginal.toFixed(2)} ARS / ${dolarHistorico.toFixed(2)} = ${valorcuotaparte.toFixed(4)} USD`);
        }
      } else {
        conversionesFallidas++;
        console.warn(`⚠️ No se encontró dólar histórico para fecha ${fecha}, usando valor en ARS: ${valorcuotaparte}`);
      }
      
      return {
        time: fecha,
        open: valorcuotaparte,
        high: valorcuotaparte,
        low: valorcuotaparte,
        close: valorcuotaparte,
        volume: 0,
      };
    })
    .filter((candle: HistoricalData) => candle.close > 0 && candle.time)
    .sort((a, b) => a.time.localeCompare(b.time));
  
  if (conversionesExitosas > 0 || conversionesFallidas > 0) {
    console.log(`📊 Resumen conversión ${ticker}: ${conversionesExitosas} exitosas, ${conversionesFallidas} fallidas de ${historico.length} totales`);
    if (candles.length > 0) {
      const primerValor = candles[0].close;
      const ultimoValor = candles[candles.length - 1].close;
      console.log(`📈 Rango de valores convertidos: ${primerValor.toFixed(4)} - ${ultimoValor.toFixed(4)} USD`);
    }
  }
  
  return candles;
}

/**
 * Obtiene datos históricos de un fondo desde la API cotizacionhistorico
 */
async function getBalanzFondoHistorico(ticker: string, days: number = 3650): Promise<HistoricalData[]> {
  try {
    const cacheKey = `fondo_history_${ticker}_v1`;
    const CACHE_DURATION = 24 * 60 * 60 * 1000;
    const fondoInfoCacheKey = `fondo_info_${ticker}`;
    
    // Detectar moneda del fondo
    const fondoInfoCached = getCachedData<InstrumentFullData>(fondoInfoCacheKey, CACHE_DURATION);
    let esARS = await detectFondoCurrency(ticker, fondoInfoCached);
    
    // Verificar caché
    const cachedData = getCachedDataWithValidator<HistoricalData[]>(
      cacheKey,
      (cache) => {
        if (!cache.lastUpdate || cache.days !== days) return false;
        const age = Date.now() - new Date(cache.lastUpdate).getTime();
        return age < CACHE_DURATION && Array.isArray(cache.data) && cache.data.length > 0;
      }
    );
    
    if (cachedData) {
      console.log(`📦 Datos históricos de ${ticker} encontrados en caché (${cachedData.length} registros)`);
      if (esARS) {
        return await convertCachedFondoDataToUSD(ticker, cachedData);
      }
      console.log(`💵 Fondo ${ticker} es USD - Retornando datos del caché sin conversión`);
      return cachedData;
    }

    // --- API REAL ---
    const url = `/api/cotizacionhistorico?ticker=${ticker}`;
    const token = await getCachedAccessToken();
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': token,
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error ${response.status} al obtener histórico de fondo`);
      console.error(`📄 Response body:`, errorText.substring(0, 500));
      handleAuthError(response);
      return [];
    }
    
    const text = await response.text();
    let data: { historico?: FondoHistoricoItem[] } | FondoHistoricoItem[];
    try {
      data = JSON.parse(text) as { historico?: FondoHistoricoItem[] } | FondoHistoricoItem[];
    } catch (parseError) {
      console.error('❌ Error parseando respuesta de fondo como JSON:', parseError);
      console.error('📄 Texto completo recibido:', text);
      return [];
    }
    
    const historico = (Array.isArray(data) ? data : data?.historico) || [];
    if (!historico || !Array.isArray(historico) || historico.length === 0) {
      console.warn('⚠️ No hay datos históricos de fondo para', ticker);
      return [];
    }
    
    // Verificar moneda nuevamente si no estaba determinada
        if (!fondoInfoCached?.Cotizacion) {
          const fondoInfoCachedAfter = getCachedData<InstrumentFullData>(fondoInfoCacheKey, CACHE_DURATION);
      esARS = await detectFondoCurrency(ticker, fondoInfoCachedAfter);
    }
    
    // Convertir datos si es ARS
    let candles: HistoricalData[];
    if (esARS) {
      console.log(`💱 Fondo ${ticker} es ARS - Obteniendo cotizaciones históricas para convertir a USD...`);
      try {
        const cotizacionesHistoricas = await getCotizacionesHistoricas();
        console.log(`✅ Obtenidas ${cotizacionesHistoricas.length} cotizaciones históricas del dólar`);
        candles = convertFondoHistoricoToUSD(ticker, historico, cotizacionesHistoricas);
      } catch (error) {
        console.warn('⚠️ No se pudieron obtener cotizaciones históricas para convertir fondo a USD:', error);
        // Retornar datos sin convertir si falla la conversión
        candles = historico.map((item) => ({
          time: item.fecha,
          open: item.valorcuotaparte || 0,
          high: item.valorcuotaparte || 0,
          low: item.valorcuotaparte || 0,
          close: item.valorcuotaparte || 0,
          volume: 0,
        })).filter((candle: HistoricalData) => candle.close > 0 && candle.time)
          .sort((a, b) => a.time.localeCompare(b.time));
      }
    } else {
      console.log(`💵 Fondo ${ticker} es USD - No se requiere conversión`);
      candles = historico.map((item) => ({
        time: item.fecha,
        open: item.valorcuotaparte || 0,
        high: item.valorcuotaparte || 0,
        low: item.valorcuotaparte || 0,
        close: item.valorcuotaparte || 0,
        volume: 0,
      })).filter((candle: HistoricalData) => candle.close > 0 && candle.time)
        .sort((a, b) => a.time.localeCompare(b.time));
    }
    
    // Guardar en caché con formato personalizado
    const cacheData = candles.slice(-days);
    setCachedDataCustom(cacheKey, {
      data: cacheData,
      lastUpdate: new Date().toISOString(),
      days
    });
    
    return cacheData;
  } catch (error) {
    console.error('❌ Error obteniendo datos históricos de fondo:', error);
    return [];
  }
}

/**
 * Obtiene información de cotización actual de un fondo desde la API cotizacioncuotaparte
 */
async function getBalanzFondoInfo(ticker: string): Promise<{ 
  description?: string; 
  type?: string; 
  category?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  lastClose?: number;
  open?: number;
  tickerCurrency?: string;
  fullData?: InstrumentFullData;
}> {
  try {
    const cacheKey = `fondo_info_${ticker}`;
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
    
    // Verificar caché
    const cachedData = getCachedData<InstrumentFullData>(cacheKey, CACHE_DURATION);
    if (cachedData) {
      return processFondoData(cachedData);
    }
    
    // --- API REAL ---
    const url = `/api/cotizacioncuotaparte?ticker=${ticker}&idCuenta=222233`;
    const token = await getCachedAccessToken();
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': token,
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error ${response.status} al obtener info de fondo:`, errorText);
      handleAuthError(response);
      
      // Intentar usar caché expirado
      const expiredCache = getCachedDataExpired<InstrumentFullData>(cacheKey);
      if (expiredCache) {
        return processFondoData(expiredCache);
      }
      
      return {};
    }
    
    const text = await response.text();
    let data: InstrumentFullData;
    try {
      data = JSON.parse(text) as InstrumentFullData;
    } catch (parseError) {
      console.error('❌ Error parseando respuesta de fondo como JSON:', parseError);
      const expiredCache = getCachedDataExpired<InstrumentFullData>(cacheKey);
      if (expiredCache) {
        return processFondoData(expiredCache);
      }
      return {};
    }
    
    // Guardar en caché
    setCachedData(cacheKey, data);
    
    return processFondoData(data);
  } catch (error) {
    console.error('❌ Error obteniendo info de fondo:', error);
    const cacheKey = `fondo_info_${ticker}`;
    const expiredCache = getCachedDataExpired<InstrumentFullData>(cacheKey);
    if (expiredCache) {
      return processFondoData(expiredCache);
    }
    return {};
  }
}

/**
 * Procesa los datos de un fondo desde la API cotizacioncuotaparte
 */
function processFondoData(fullData: InstrumentFullData) {
  if (!fullData.Cotizacion) {
    return {};
  }
  
  const cotizacion = fullData.Cotizacion;
  
  // Obtener precio actual (valor cuotaparte)
  const precioActual = parseFloat(cotizacion.CotizacionCuotaparte || cotizacion.Cotizacion || '0');
  
  // Calcular cambio diario
  const varDiaria = parseFloat(cotizacion.VarDiaria || '0');
  const cambio = (precioActual * varDiaria) / 100;
  const cambioPorcentaje = varDiaria;
  
  // Obtener descripción
  const description = cotizacion.Descripcion || fullData.info?.Nombre || '';
  
  // Tipo y categoría
  const type = 'Fondo';
  const category = fullData.info?.TipoFondo || undefined;
  
  // Moneda
  const tickerCurrency = cotizacion.idMoneda === 1 ? 'ARS' : 'USD';
  
  return {
    description: description || undefined,
    type: type || undefined,
    category: category,
    price: precioActual,
    change: cambio,
    changePercent: cambioPorcentaje,
    lastClose: precioActual, // Para fondos, el último cierre es el precio actual
    open: precioActual, // Para fondos, open = close
    tickerCurrency: tickerCurrency,
    fullData: fullData
  };
}

/**
 * Obtiene datos históricos desde la API de Balanz
 * Para bonos, corporativos y CEDEARs
 * IMPORTANTE: Recibe el ticker ya transformado a USD (ej: YPFDD, TXD6D)
 */
async function getBalanzHistorico(tickerUSD: string, days: number = 3650): Promise<HistoricalData[]> {
  try {
    // --- CACHÉ ---
    const cacheKey = `ticker_history_${tickerUSD}_v3`;
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
    
    // Validar que el cache tenga menos de 24h y la misma cantidad de días
    const cachedData = getCachedDataWithValidator<HistoricalData[]>(
      cacheKey,
      (cache) => {
        if (!cache.lastUpdate || cache.days !== days) return false;
        const age = Date.now() - new Date(cache.lastUpdate).getTime();
        return age < CACHE_DURATION && Array.isArray(cache.data) && cache.data.length > 0;
      }
    );
    
    if (cachedData) {
      return cachedData;
    }

    // --- API REAL ---
    // Mapear días a plazo de Balanz (1=1año, 2=2años, etc)
    // Por ahora usamos 1 año
    const plazo = 1;
    const url = `/api/historico/eventos?ticker=${tickerUSD}&plazo=${plazo}&fullNormalize=false`;
    const token = await getCachedAccessToken();
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': token,
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error ${response.status} al obtener datos de Balanz`);
      console.error(`📄 Response body:`, errorText.substring(0, 500));
      handleAuthError(response);
      return [];
    }
    const text = await response.text();
    let data: { historico?: unknown[] } | unknown[];
    try {
      data = JSON.parse(text) as { historico?: unknown[] } | unknown[];
    } catch (parseError) {
      console.error('❌ Error parseando respuesta de Balanz como JSON:', parseError);
      console.error('📄 Texto completo recibido:', text);
      console.warn('⚠️ La API de Balanz no retorna JSON válido para este endpoint');
      return [];
    }
    const historico = data?.historico || data;
    if (!historico || !Array.isArray(historico) || historico.length === 0) {
      console.warn('⚠️ No hay datos históricos en Balanz para', tickerUSD);
      return [];
    }
    const candles: HistoricalData[] = historico
      .map((item: { fecha: string; precioapertura?: number; preciocierre?: number; preciomaximo?: number; preciominimo?: number; ultimoprecio?: number; volumen?: number }) => {
        const fecha = item.fecha;
        const open = item.precioapertura || item.preciocierre || 0;
        const high = item.preciomaximo || item.preciocierre || 0;
        const low = item.preciominimo || item.preciocierre || 0;
        const close = item.preciocierre || item.ultimoprecio || 0;
        const volume = item.volumen || 0;
        return {
          time: fecha,
          open,
          high,
          low,
          close,
          volume,
        };
      })
      .filter((candle: HistoricalData) => candle.close > 0 && candle.time)
      .sort((a, b) => a.time.localeCompare(b.time));
    
    // Guardar en caché con formato personalizado
    const cacheData = candles.slice(-days);
    setCachedDataCustom(cacheKey, {
      data: cacheData,
      lastUpdate: new Date().toISOString(),
      days
    });
    
    return cacheData;
  } catch (error) {
    console.error('❌ Error obteniendo datos de Balanz:', error);
    return [];
  }
}

/**
 * Función centralizada para obtener datos históricos de precios
 * Usa la API historico/eventos de Balanz para acciones/bonos o cotizacionhistorico para fondos
 * @param symbol - Ticker del instrumento
 * @param days - Número de días de histórico a obtener (default: 3650 = ~10 años)
 * @param positions - Array de posiciones (opcional, para detectar fondos)
 * @param movimientos - Array de movimientos (opcional, para detectar fondos)
 * @returns Promise con datos históricos y metadatos de la fuente
 */
export async function getTickerCandles(symbol: string, days: number = 3650, positions?: Position[], movimientos?: MovimientoHistorico[]): Promise<HistoricalDataResponse> {
  try {
    // Detectar si es un fondo
    const esFondo = isFondo(symbol, positions, movimientos);
    
    if (esFondo) {
      // Usar API de fondos
      const data = await getBalanzFondoHistorico(symbol, days);
      const balanzUrl = `https://clientes.balanz.com/api/v1/cotizacionhistorico?ticker=${symbol}`;
      return {
        data,
        sourceUrl: balanzUrl,
        source: 'balanz',
        cacheDate: undefined
      };
    } else {
      // Usar API normal (acciones, bonos, etc.)
      try {
        const instrumentInfo = await getBalanzInstrumentInfo(symbol);
        const usdTicker = instrumentInfo.usdTicker || symbol;
        const data = await getBalanzHistorico(usdTicker, days);
        const balanzUrl = `https://clientes.balanz.com/api/v1/historico/eventos?ticker=${usdTicker}&plazo=1&fullNormalize=false`;
        return {
          data,
          sourceUrl: balanzUrl,
          source: 'balanz',
          cacheDate: undefined
        };
      } catch (normalApiError) {
        // Si la API normal falla, intentar API de fondos como fallback
        console.warn('⚠️ API normal de histórico falló para', symbol, ', intentando API de fondos...');
        try {
          const data = await getBalanzFondoHistorico(symbol, days);
          const balanzUrl = `https://clientes.balanz.com/api/v1/cotizacionhistorico?ticker=${symbol}`;
          return {
            data,
            sourceUrl: balanzUrl,
            source: 'balanz',
            cacheDate: undefined
          };
        } catch (fondoApiError) {
          console.error('❌ También falló la API de fondos:', fondoApiError);
          return {
            data: [],
            sourceUrl: 'Error: No data available',
            source: 'balanz',
            cacheDate: undefined
          };
        }
      }
    }
  } catch (error) {
    console.error('❌ Error obteniendo datos históricos:', error);
    return {
      data: [],
      sourceUrl: 'Error: No data available',
      source: 'balanz',
      cacheDate: undefined
    };
  }
}

// Función auxiliar para limpiar el caché de un ticker específico
export function clearTickerCache(symbol: string): void {
  preserveAuthTokens(() => {
    // Limpiar caché de histórico (acciones/bonos)
    const cacheKey = `ticker_history_${symbol}_v3`;
    clearCache(cacheKey);
    
    // Limpiar caché de histórico de fondos
    const fondoCacheKey = `fondo_history_${symbol}_v1`;
    clearCache(fondoCacheKey);
    
    // Limpiar versiones antiguas
    const oldKeys = [
      `ticker_history_${symbol}_v2`,
      `ticker_history_${symbol}`
    ];
    oldKeys.forEach(key => clearCache(key));
    
    // Limpiar caché de información del instrumento
    const instrumentCacheKey = `instrument_info_${symbol}`;
    clearCache(instrumentCacheKey);
    
    // Limpiar caché de información de fondo
    const fondoInfoCacheKey = `fondo_info_${symbol}`;
    clearCache(fondoInfoCacheKey);
    
    // Limpiar timestamp legacy si existe (compatibilidad)
    localStorage.removeItem(`${instrumentCacheKey}_timestamp`);
  });
}

// Función auxiliar para limpiar todo el caché de tickers
export function clearAllTickerCache(): void {
  preserveAuthTokens(() => {
    // Limpiar todos los caches de histórico
    const historyCount = clearCacheByPattern(/^ticker_history_/);
    
    // Limpiar todos los caches de información de instrumentos
    const instrumentCount = clearCacheByPattern(/^instrument_info_/);
    
    // Limpiar timestamps legacy si existen (compatibilidad)
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.endsWith('_timestamp') && (key.startsWith('instrument_info_') || key.startsWith('ticker_history_'))) {
        localStorage.removeItem(key);
      }
    });
    
    console.log(`🗑️ Limpiados ${historyCount} caches de histórico y ${instrumentCount} caches de instrumentos`);
  });
}
