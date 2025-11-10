// Servicio para obtener información de tickers
// Usando Balanz API como fuente única de datos

import { getCachedAccessToken } from './balanzAuth';

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
async function getBalanzInstrumentInfo(ticker: string): Promise<{ 
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
  };
  fullData?: any; // Data completa para uso interno
}> {
  // Helper para procesar data completa del API y extraer lo necesario
  const processInstrumentData = (fullData: any, ticker: string) => {
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
    const cacheTimestampKey = `instrument_info_${ticker}_timestamp`;
    
    // Verificar si hay datos en caché válidos (menos de 24 horas)
    const cachedData = localStorage.getItem(cacheKey);
    const cachedTimestamp = localStorage.getItem(cacheTimestampKey);
    
    if (cachedData && cachedTimestamp) {
      const cacheAge = Date.now() - parseInt(cachedTimestamp, 10);
      const cacheAgeHours = cacheAge / (1000 * 60 * 60);
      
      // Si el caché tiene menos de 24 horas, usarlo
      if (cacheAgeHours < 24) {
        console.log(`📦 Usando info del instrumento en caché para ${ticker} (${cacheAgeHours.toFixed(1)}h de antigüedad)`);
        try {
          const cachedFullData = JSON.parse(cachedData);
          return processInstrumentData(cachedFullData, ticker);
        } catch (e) {
          console.warn('⚠️ Error parseando caché de instrumento, consultando API...');
        }
      } else {
        console.log(`🔄 Caché de instrumento expirado (${cacheAgeHours.toFixed(1)}h), consultando API...`);
      }
    }
    
    // Primero intentamos sin mapeo especial para obtener la info
    const url = `/api/cotizacioninstrumento?plazo=1&idCuenta=222233&ticker=${ticker}`;
    
    console.log(`📋 Obteniendo info del instrumento: ${ticker}`);
    
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
      
      // Si es error 520, 403 o 401, limpiar el token y mostrar mensaje
      if (response.status === 520 || response.status === 403 || response.status === 401) {
        console.error('🔒 Error de autenticación - Token posiblemente expirado');
        // Limpiar token del caché para que se regenere en el próximo intento
        localStorage.removeItem('balanz_access_token');
        localStorage.removeItem('balanz_token_timestamp');
      }
      
      // Si hay error pero tenemos caché antiguo, usarlo como fallback
      if (cachedData) {
        console.log('📦 Usando caché antiguo como fallback después de error API');
        try {
          const cachedFullData = JSON.parse(cachedData);
          return processInstrumentData(cachedFullData, ticker);
        } catch (e) {
          // Ignorar error de parsing
        }
      }
      
      return {};
    }
    
    const data = await response.json();
    
    if (!data || !data.Cotizacion) {
      console.warn('⚠️ No hay datos de cotización');
      
      // Si no hay datos pero tenemos caché, usarlo
      if (cachedData) {
        console.log('📦 Usando caché como fallback (no hay datos en API)');
        try {
          const cachedFullData = JSON.parse(cachedData);
          return processInstrumentData(cachedFullData, ticker);
        } catch (e) {
          // Ignorar error de parsing
        }
      }
      
      return {};
    }
    
    const cotizacion = data.Cotizacion;
    const bond = data.bond;
    
    // Guardar la respuesta COMPLETA en caché
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
      localStorage.setItem(cacheTimestampKey, Date.now().toString());
      console.log('💾 Info completa del instrumento guardada en caché (válido por 24h)');
    } catch (e) {
      console.warn('⚠️ Error guardando info del instrumento en caché:', e);
    }
    
    // Obtener ticker en USD desde currencies y detectar moneda del ticker actual
    // currencies es un array de arrays: [["YPFD", "1", "ARS"], ["YPFDD", "2", "USD"], ...]
    let usdTicker = ticker; // Default al ticker original
    let tickerCurrency = 'USD'; // Default USD
    
    if (cotizacion.currencies && Array.isArray(cotizacion.currencies)) {
      // Buscar el ticker actual en currencies para saber su moneda
      const currentCurrency = cotizacion.currencies.find((c: string[]) => c[0] === ticker);
      if (currentCurrency && currentCurrency[2]) {
        tickerCurrency = currentCurrency[2]; // ARS, USD, CCL, etc.
        console.log(`💰 Moneda del ticker ${ticker}: ${tickerCurrency}`);
      }
      
      // Buscar ticker en USD
      const usdCurrency = cotizacion.currencies.find((c: string[]) => c[2] === 'USD');
      if (usdCurrency && usdCurrency[0]) {
        usdTicker = usdCurrency[0];
        console.log(`💵 Ticker en USD encontrado: ${ticker} → ${usdTicker}`);
      } else {
        console.log(`⚠️ No se encontró ticker en USD en currencies, usando ticker original: ${ticker}`);
      }
    } else {
      console.log(`⚠️ No hay currencies disponibles, usando ticker original: ${ticker}`);
    }
    
    // Extraer ratio si existe
    const ratio = cotizacion.Ratio || undefined;
    if (ratio) {
      console.log(`📊 Ratio encontrado: ${ratio}`);
    }
    
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
        type: bond.type // "BOPREAL", etc.
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
    
    console.log('✅ Info del instrumento obtenida:', result);
    console.log('📊 Bond data:', bond ? 'EXISTE' : 'NO EXISTE', bond);
    console.log('📊 bondInfo procesado:', bondInfo);
    
    return result;
  } catch (error) {
    console.error('❌ Error obteniendo info del instrumento:', error);
    
    // Intentar usar caché como último recurso
    const cacheKey = `instrument_info_${ticker}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      console.log('📦 Usando caché como último recurso después de error');
      try {
        const cachedFullData = JSON.parse(cachedData);
        return processInstrumentData(cachedFullData, ticker);
      } catch (e) {
        // Ignorar error de parsing
      }
    }
    
    return {};
  }
}

// Función para obtener cotización de un ticker
export async function getTickerQuote(symbol: string): Promise<TickerQuote | null> {
  try {
    console.log('🔍 Consultando ticker:', symbol);
    console.log('🏦 Usando Balanz API para obtener datos...');
    
    try {
      // Primero obtener información del instrumento para saber el ticker en USD
      const instrumentInfo = await getBalanzInstrumentInfo(symbol);
      
      // Usar el ticker en USD obtenido de currencies, o usar el ticker original
      const usdTicker = instrumentInfo.usdTicker || symbol;
      
      console.log(`💱 Consultando histórico con ticker: ${usdTicker}`);
      
      // Obtener datos históricos con el ticker correcto
      const historicalData = await getBalanzHistorico(usdTicker, 5); // Últimos 5 días
      
      if (historicalData.length > 0) {
        const lastData = historicalData[historicalData.length - 1];
        const prevData = historicalData.length > 1 ? historicalData[historicalData.length - 2] : lastData;
        
        const price = lastData.close;
        const previousPrice = prevData.close;
        const change = price - previousPrice;
        const changePercent = previousPrice > 0 ? (change / previousPrice * 100) : 0;
        
        console.log(`✅ Precio de Balanz: $${price.toFixed(2)} USD (cambio: ${changePercent.toFixed(2)}%)`);
        
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
      
      console.warn('⚠️ No hay datos de Balanz para', symbol);
      return null;
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
 * Obtiene datos históricos desde la API de Balanz
 * Para bonos, corporativos y CEDEARs
 * IMPORTANTE: Recibe el ticker ya transformado a USD (ej: YPFDD, TXD6D)
 */
async function getBalanzHistorico(tickerUSD: string, days: number = 365): Promise<HistoricalData[]> {
  try {
    // Mapear días a plazo de Balanz (1=1año, 2=2años, etc)
    // Por ahora usamos 1 año
    const plazo = 1;
    
    // Endpoint correcto según el sitio de Balanz
    const url = `/api/historico/eventos?ticker=${tickerUSD}&plazo=${plazo}&fullNormalize=false`;
    
    console.log(`📊 Obteniendo datos históricos de Balanz...`);
    console.log(`🔗 URL: ${url}`);
    console.log(`📌 Ticker: ${tickerUSD}`);
    
    // Obtener token de autenticación
    const token = await getCachedAccessToken();
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': token,
      }
    });
    
    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    console.log(`📡 Content-Type: ${response.headers.get('content-type')}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error ${response.status} al obtener datos de Balanz`);
      console.error(`📄 Response body:`, errorText.substring(0, 500));
      
      // Si es error de autenticación, limpiar token
      if (response.status === 520 || response.status === 403 || response.status === 401) {
        console.error('🔒 Error de autenticación - Token posiblemente expirado');
        localStorage.removeItem('balanz_access_token');
        localStorage.removeItem('balanz_token_timestamp');
      }
      
      return [];
    }
    
    // Leer respuesta como texto primero para ver qué retorna
    const text = await response.text();
    console.log(`📄 Response text (primeros 300 chars):`, text.substring(0, 300));
    
    // Intentar parsear como JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('❌ Error parseando respuesta de Balanz como JSON:', parseError);
      console.error('📄 Texto completo recibido:', text);
      console.warn('⚠️ La API de Balanz no retorna JSON válido para este endpoint');
      return [];
    }
    
    // La API retorna { historico: [...] }
    const historico = data?.historico || data;
    
    if (!historico || !Array.isArray(historico) || historico.length === 0) {
      console.warn('⚠️ No hay datos históricos en Balanz para', tickerUSD);
      console.log('📄 Datos recibidos:', data);
      return [];
    }
    
    console.log(`✅ Se obtuvieron ${historico.length} registros históricos de Balanz`);
    
    // Transformar datos de Balanz al formato HistoricalData
    // Balanz retorna: { historico: [{ fecha: "2025-07-22", preciocierre: 1.0075, ... }, ...] }
    const candles: HistoricalData[] = historico
      .map((item: any) => {
        // Normalizar fecha al formato YYYY-MM-DD
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
      .sort((a, b) => a.time.localeCompare(b.time)); // Ordenar por fecha
    
    console.log(`✅ Datos de Balanz obtenidos: ${candles.length} registros`);
    
    if (candles.length > 0) {
      console.log('📅 Rango de fechas:', {
        más_antiguo: candles[0].time,
        más_reciente: candles[candles.length - 1].time,
        total_días: candles.length
      });
    }
    
    return candles.slice(-days);
  } catch (error) {
    console.error('❌ Error obteniendo datos de Balanz:', error);
    return [];
  }
}

// Función para obtener datos históricos usando Balanz API
// Con caché local para evitar peticiones repetidas
export async function getTickerCandles(symbol: string, days: number = 365): Promise<HistoricalDataResponse> {
  try {
    const cacheKey = `ticker_history_${symbol}_v3`; // v3 para Balanz exclusivo
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log(`📊 Ticker: ${symbol} - usando Balanz API`);
    
    // Obtener información del instrumento para saber el ticker en USD
    console.log('📋 Obteniendo ticker en USD desde instrumentInfo...');
    const instrumentInfo = await getBalanzInstrumentInfo(symbol);
    const usdTicker = instrumentInfo.usdTicker || symbol;
    
    console.log(`💱 Usando ticker: ${usdTicker}`);
    
    // Intentar obtener datos del caché
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      try {
        const cached = JSON.parse(cachedData);
        const { data, lastUpdate, sourceUrl } = cached;
        
        // Si el caché es de hoy, usarlo directamente
        if (lastUpdate === today) {
          console.log('📦 Usando datos en caché para', symbol, '(actualizado hoy)');
          return {
            data: data.slice(-days),
            sourceUrl: sourceUrl || 'Cache (Balanz)',
            source: 'cache',
            cacheDate: lastUpdate
          };
        }
        
        // Si el caché es de días anteriores, verificar si necesitamos actualizar
        const cachedDates = new Set(data.map((d: HistoricalData) => d.time));
        const needsUpdate = !cachedDates.has(today);
        
        if (!needsUpdate) {
          console.log('📦 Usando datos en caché para', symbol, '(ya tiene datos de hoy)');
          return {
            data: data.slice(-days),
            sourceUrl: sourceUrl || 'Cache (Balanz)',
            source: 'cache',
            cacheDate: lastUpdate
          };
        }
        
        console.log('🔄 Datos en caché desactualizados, consultando API...');
      } catch (e) {
        console.warn('⚠️ Error parseando caché, consultando API...');
      }
    }
    
    // Obtener datos de Balanz con el ticker correcto
    console.log('🏦 Consultando Balanz API...');
    const balanzData = await getBalanzHistorico(usdTicker, days);
    
    if (balanzData.length > 0) {
      const balanzUrl = `https://clientes.balanz.com/api/v1/historico/eventos?ticker=${usdTicker}&plazo=1&fullNormalize=false`;
      
      // Guardar en caché
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          data: balanzData,
          lastUpdate: today,
          sourceUrl: balanzUrl
        }));
        console.log('💾 Datos de Balanz guardados en caché');
      } catch (e) {
        console.warn('⚠️ Error guardando en caché:', e);
      }
      
      console.log('✅ Usando datos de Balanz API');
      return {
        data: balanzData,
        sourceUrl: balanzUrl,
        source: 'balanz'
      };
    }
    
    console.log('⚠️ No hay datos en Balanz para este ticker');
    
    // Si hay caché antiguo, usarlo como fallback
    if (cachedData) {
      try {
        const cached = JSON.parse(cachedData);
        console.log('📦 Usando caché antiguo como fallback');
        return {
          data: cached.data.slice(-days),
          sourceUrl: cached.sourceUrl || 'Cache',
          source: 'cache',
          cacheDate: cached.lastUpdate
        };
      } catch (e) {
        // Ignorar error de parsing
      }
    }
    
    // No hay datos disponibles
    return {
      data: [],
      sourceUrl: `https://clientes.balanz.com/api/v1/historico/eventos?ticker=${usdTicker}&plazo=1&fullNormalize=false`,
      source: 'balanz'
    };
    
  } catch (error) {
    console.error('❌ Error obteniendo datos históricos:', error);
    
    // Intentar usar caché como último recurso
    const cacheKey = `ticker_history_${symbol}_v3`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      try {
        const cached = JSON.parse(cachedData);
        console.log('📦 Usando caché como último recurso');
        return {
          data: cached.data.slice(-days),
          sourceUrl: cached.sourceUrl || 'Cache (Balanz)',
          source: 'cache',
          cacheDate: cached.lastUpdate
        };
      } catch (e) {
        console.warn('⚠️ Error parseando caché:', e);
      }
    }
    
    return {
      data: [],
      sourceUrl: 'Error: No data available',
      source: 'balanz'
    };
  }
}

// Función auxiliar para limpiar el caché de un ticker específico
export function clearTickerCache(symbol: string): void {
  // Limpiar caché de histórico
  const cacheKey = `ticker_history_${symbol}_v3`;
  const oldKeys = [
    `ticker_history_${symbol}_v2`,
    `ticker_history_${symbol}`
  ];
  
  localStorage.removeItem(cacheKey);
  oldKeys.forEach(key => localStorage.removeItem(key));
  
  // Limpiar caché de información del instrumento
  const instrumentCacheKey = `instrument_info_${symbol}`;
  const instrumentTimestampKey = `instrument_info_${symbol}_timestamp`;
  localStorage.removeItem(instrumentCacheKey);
  localStorage.removeItem(instrumentTimestampKey);
  
  console.log('🗑️ Caché eliminado para', symbol, '(histórico + info del instrumento)');
}

// Función auxiliar para limpiar todo el caché de tickers
export function clearAllTickerCache(): void {
  const keys = Object.keys(localStorage);
  let historyCount = 0;
  let instrumentCount = 0;
  
  keys.forEach(key => {
    if (key.startsWith('ticker_history_')) {
      localStorage.removeItem(key);
      historyCount++;
    }
    if (key.startsWith('instrument_info_')) {
      localStorage.removeItem(key);
      instrumentCount++;
    }
  });
  
  console.log('🗑️ Caché completo eliminado:', historyCount, 'históricos +', instrumentCount / 2, 'instrumentos');
}
