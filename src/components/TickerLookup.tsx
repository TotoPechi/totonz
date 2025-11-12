import React, { useState, useEffect } from 'react';
import { getTickerHoldingData } from '../services/tickerHoldingData';
import { useParams, useNavigate } from 'react-router-dom';
import { getTickerQuote, getTickerCandles, clearTickerCache } from '../services/tickerApi';
import { getEstadoCuentaConCache, getDolarMEP, clearEstadoCuentaCache, getOrdenesHistoricasConCache, getMovimientosHistoricosConCache, getDividendosPorTicker, getRentasPorTicker } from '../services/balanzApi';
import { getDolarHistoricoCacheInfo, clearDolarHistoricoCache, getCotizacionesHistoricas, getDolarParaFechaDesdeCotizaciones } from '../services/dolarHistoricoApi';
import { preserveAuthTokens } from '../utils/cacheHelpers';
import { useTickerCache } from '../hooks/useTickerCache';
import TickerHeader from './TickerHeader';
import TickerChart from './TickerChart';
import TickerOrders from './TickerOrders';
import CacheSection from './CacheSection';

interface TickerInfo {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketCap?: string;
  volume?: string;
  pe?: string;
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

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TickerLookupProps {
  availableTickers: string[];
  positions: any[]; // Array de posiciones de la cartera
}

const TickerLookup: React.FC<TickerLookupProps> = ({ availableTickers, positions }) => {
  const { ticker: urlTicker } = useParams<{ ticker?: string }>();
  const navigate = useNavigate();
  const [selectedTicker, setSelectedTicker] = useState<string>(urlTicker || 'GBTC.E');
  const [tickerInfo, setTickerInfo] = useState<TickerInfo | null>(null);
  const [historicalData, setHistoricalData] = useState<CandleData[]>([]);
  const [ppc, setPpc] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dolarMEP, setDolarMEP] = useState<number | null>(null);
  const [operaciones, setOperaciones] = useState<Array<{
    tipo: 'COMPRA' | 'VENTA' | 'LIC';
    fecha: string;
    cantidad: number;
    precioUSD: number;
    montoUSD: number;
    costoOperacionUSD: number;
    descripcion: string;
    precioOriginal?: number;
    costoOriginal?: number;
    monedaOriginal: string;
    dolarUsado: number; // Dólar histórico usado para la conversión
  }>>([]);
  const [dividendos, setDividendos] = useState<Array<{
    fecha: string;
    montoBruto: number;
    impuestosRetenidos: number;
    montoNeto: number;
    moneda: string;
  }>>([]);
  const [rentas, setRentas] = useState<Array<{
    fecha: string;
    montoBruto: number;
    impuestosRetenidos: number;
    montoNeto: number;
    moneda: string;
    esInteresDevengado: boolean;
  }>>([]);
  const [movimientosCacheInfo, setMovimientosCacheInfo] = useState<{
    isCached: boolean;
    fecha: string;
    url?: string;
  } | null>(null);
  const [movimientosHistoricosCacheInfo, setMovimientosHistoricosCacheInfo] = useState<{
    isCached: boolean;
    fecha: string;
    url?: string;
  } | null>(null);
  const [estadoCuentaCacheInfo, setEstadoCuentaCacheInfo] = useState<{
    isCached: boolean;
    fecha: string;
  } | null>(null);
  // Usar hook para caché de ticker
  const { candlesCacheInfo, instrumentCacheInfo } = useTickerCache(selectedTicker);
  // Info de caché de cotizaciones históricas del dólar
  const dolarCacheInfo = getDolarHistoricoCacheInfo();
  const [hoveredOperacionIndex, setHoveredOperacionIndex] = useState<number | null>(null);
  const [showBondDescTooltip, setShowBondDescTooltip] = useState(false);

  // Función para determinar número de decimales según el ticker
  const getDecimalPlaces = (ticker: string): number => {
    const cleanTicker = ticker.replace('.E', '');
    // Tickers con precios muy pequeños necesitan más decimales
    if (['TZXD6', 'T30J6'].includes(cleanTicker)) {
      return 6;
    }
    return 2; // Default para la mayoría de tickers
  };

  // Función para agrupar tickers por categoría
  const getGroupedTickers = () => {
    const acciones: string[] = [];
    const bonos: string[] = [];
    const corporativos: string[] = [];
    const cedears: string[] = [];
    
    availableTickers.forEach(ticker => {
      const position = positions.find(p => p.Ticker === ticker);
      const tipo = position?.Tipo?.toLowerCase() || '';
      
      if (tipo.includes('acción') || tipo.includes('accion')) {
        acciones.push(ticker);
      } else if (tipo.includes('bono')) {
        bonos.push(ticker);
      } else if (tipo.includes('corporativo')) {
        corporativos.push(ticker);
      } else if (tipo.includes('cedear')) {
        cedears.push(ticker);
      } else {
        // Inferir por ticker
        if (['VIST'].includes(ticker)) {
          cedears.push(ticker);
        } else if (['AL30', 'BPOC7', 'T30J6', 'TZXD6', 'YM39O'].includes(ticker)) {
          bonos.push(ticker);
        } else if (['YMCXO', 'TLC1O'].includes(ticker)) {
          corporativos.push(ticker);
        } else {
          acciones.push(ticker);
        }
      }
    });
    
    return { acciones, bonos, corporativos, cedears };
  };


  // Actualizar ticker seleccionado cuando cambia la URL
  useEffect(() => {
    if (urlTicker) {
      setSelectedTicker(urlTicker);
    }
  }, [urlTicker]);

  // Cargar información del ticker cuando cambia la selección
  useEffect(() => {
    if (selectedTicker) {
      fetchTickerInfo(selectedTicker);
    }
  }, [selectedTicker]);

  // Cargar operaciones históricas del ticker
  useEffect(() => {
    const loadOperaciones = async () => {
      if (!selectedTicker) return;
      
      try {
        
        // Obtener estado de cuenta para obtener dolarMEP (opcional - solo para mostrar operaciones)
        let dolarMEP: number | null = null;
        try {
          const estadoCuentaResult = await getEstadoCuentaConCache();
          
          // Guardar información de caché del estado de cuenta
          if (estadoCuentaResult.isCached && estadoCuentaResult.fecha) {
            setEstadoCuentaCacheInfo({
              isCached: true,
              fecha: estadoCuentaResult.fecha
            });
          } else {
            setEstadoCuentaCacheInfo(null);
          }
          
          if (estadoCuentaResult.data && estadoCuentaResult.data.cotizacionesDolar) {
            const dolarMEPValue = getDolarMEP(estadoCuentaResult.data.cotizacionesDolar);
            setDolarMEP(dolarMEPValue);
            dolarMEP = dolarMEPValue;
          } else {
            console.warn('⚠️ No se pudo obtener cotizaciones - continuando sin operaciones');
          }
        } catch (error) {
          console.warn('⚠️ Error al obtener estado de cuenta - continuando sin operaciones:', error);
        }



        // Cargar cotizaciones históricas del dólar para usar en las conversiones
        let cotizacionesHistoricas: any[] = [];
        try {
          cotizacionesHistoricas = await getCotizacionesHistoricas();
        } catch (error) {
          console.warn('⚠️ Error al cargar cotizaciones históricas, usando dolarMEP como fallback:', error);
        }

        // Intentar obtener movimientos (no crítico - puede fallar)
        // Permitir mostrar operaciones si el instrumento es en USD aunque no haya dolarMEP
        const isUSDInstrument = tickerInfo?.currency === 'USD' || tickerInfo?.tickerCurrency === 'USD';
        if (dolarMEP || isUSDInstrument || cotizacionesHistoricas.length > 0) {
          try {
            const fechaHasta = new Date();
            const fechaDesde = new Date('2021-09-05');
            // Formato YYYYMMDD requerido por la API
            const fechaDesdeStr = fechaDesde.toISOString().split('T')[0].replace(/-/g, '');
            const fechaHastaStr = fechaHasta.toISOString().split('T')[0].replace(/-/g, '');
            const ordenesResult = await getOrdenesHistoricasConCache(fechaDesdeStr, fechaHastaStr);
            // Guardar info de caché de órdenes
            const ordenesUrl = `https://clientes.balanz.com/api/v1/reportehistoricoordenes/222233?FechaDesde=${fechaDesdeStr}&FechaHasta=${fechaHastaStr}`;
            const ordenesFecha = ordenesResult.cacheAge 
              ? new Date(Date.now() - ordenesResult.cacheAge * 60 * 60 * 1000).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
            setMovimientosCacheInfo({
              isCached: ordenesResult.isCached,
              fecha: ordenesFecha,
              url: ordenesUrl
            });
            // Filtrar y mapear operaciones del ticker seleccionado al modelo esperado por TickerOrders
            // Solo incluir órdenes con Estado "Ejecutada"
            const ordenesTicker = ordenesResult.data.filter((o: any) => 
              o.Ticker === selectedTicker && o.Estado === 'Ejecutada'
            );
            // Mapear al modelo esperado por TickerOrders
            const operacionesMapped = ordenesTicker.map((o: any) => {
              let tipo: 'COMPRA' | 'VENTA' | 'LIC' = 'VENTA';
              const operacionStr = typeof o.Operacion === 'string' ? o.Operacion.toUpperCase() : '';
              if (operacionStr.includes('LICITACIÓN') || operacionStr.includes('LICITACION')) {
                tipo = 'LIC';
              } else if (operacionStr.includes('COMPRA')) {
                tipo = 'COMPRA';
              }
              // Mejorar detección de moneda en pesos
              let moneda = String(o.Moneda || '');
              if (moneda.toUpperCase() === 'PESOS') moneda = 'ARS';
              if (moneda.toUpperCase().includes('ARS')) moneda = 'ARS';
              const montoOriginal = typeof o.Monto === 'number' ? o.Monto : undefined;
              const costoOriginal = typeof o.Costos === 'number' ? o.Costos : 0;
              
              // Obtener cantidad para usar en cálculos
              const cantidad = Number(
                (o.CantidadOperada !== undefined && o.CantidadOperada !== -1) 
                  ? o.CantidadOperada 
                  : (o.Cantidad ?? 0)
              );
              
              // Determinar precio original: si Precio y PrecioOperado no están o son -1, calcularlo
              let precioOriginal: number | undefined;
              const precioValue = typeof o.Precio === 'number' ? o.Precio : undefined;
              const precioOperadoValue = typeof o.PrecioOperado === 'number' ? o.PrecioOperado : undefined;
              
              if (precioValue !== undefined && precioValue !== -1) {
                precioOriginal = precioValue;
              } else if (precioOperadoValue !== undefined && precioOperadoValue !== -1) {
                precioOriginal = precioOperadoValue;
              } else if (montoOriginal !== undefined && cantidad > 0) {
                // Calcular precio dividiendo monto por cantidad
                precioOriginal = montoOriginal / cantidad;
              } else {
                precioOriginal = undefined;
              }
              
              let precioUSD = precioOriginal || 0;
              let montoUSD = typeof o.Monto === 'number' ? o.Monto : 0;
              let costoOperacionUSD = 0;
              let dolarUsado = 0;
              // Si la operación es en ARS, convertir a USD usando el dólar histórico de la fecha
              if (moneda === 'ARS' && precioOriginal && montoOriginal) {
                // Obtener la fecha de la operación en formato YYYY-MM-DD
                const fechaRaw = String(o.Fecha || o.FechaLiquidacion || '');
                let fechaOp = fechaRaw.split('T')[0].trim();
                
                // Si la fecha viene en formato DD/MM/YYYY, convertirla a YYYY-MM-DD
                if (fechaOp && fechaOp.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                  const [dia, mes, anio] = fechaOp.split('/');
                  fechaOp = `${anio}-${mes}-${dia}`;
                }
                
                // Validar que la fecha tenga el formato correcto antes de buscar
                if (fechaOp && fechaOp.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  // Buscar el dólar histórico para la fecha de la operación
                  if (cotizacionesHistoricas.length > 0) {
                    dolarUsado = getDolarParaFechaDesdeCotizaciones(cotizacionesHistoricas, fechaOp) || 0;
                    if (!dolarUsado || dolarUsado === 0) {
                      console.warn(`⚠️ No se encontró dólar histórico para fecha ${fechaOp}`);
                    }
                  }
                } else {
                  console.warn(`⚠️ Fecha de operación inválida o vacía: "${fechaRaw}" -> "${fechaOp}"`);
                }
                
                // Si no se encontró dólar histórico, usar dolarMEP como fallback
                if (!dolarUsado || dolarUsado === 0) {
                  dolarUsado = dolarMEP || 0;
                  if (dolarUsado > 0) {
                    console.warn(`⚠️ Usando dolarMEP actual (${dolarUsado}) como fallback para fecha ${fechaOp || fechaRaw}`);
                  }
                }
                
                if (dolarUsado > 0) {
                  precioUSD = precioOriginal / dolarUsado;
                  montoUSD = montoOriginal / dolarUsado;
                  costoOperacionUSD = costoOriginal / dolarUsado;
                } else {
                  console.warn(`⚠️ No se pudo obtener dólar para fecha ${fechaOp}, operación sin convertir`);
                }
              } else {
                // Si ya está en USD, usar los valores originales
                precioUSD = precioOriginal || 0;
                montoUSD = montoOriginal || 0;
                costoOperacionUSD = costoOriginal || 0;
              }
              return {
                tipo,
                fecha: String(o.Fecha || o.FechaLiquidacion || ''),
                cantidad: Number(
                  (o.CantidadOperada !== undefined && o.CantidadOperada !== -1) 
                    ? o.CantidadOperada 
                    : (o.Cantidad ?? 0)
                ),
                precioUSD,
                montoUSD,
                costoOperacionUSD,
                descripcion: String(o.Operacion || ''),
                precioOriginal,
                montoOriginal,
                costoOriginal,
                monedaOriginal: moneda,
                dolarUsado
              };
            });
            setOperaciones(operacionesMapped);
          } catch (error) {
            console.warn('⚠️ Error al cargar movimientos - continuando sin operaciones:', error);
            setOperaciones([]);
            setMovimientosCacheInfo(null);
          }
        } else {
          setOperaciones([]);
          setMovimientosCacheInfo(null);
        }
      } catch (error) {
        console.error('❌ Error al cargar operaciones:', error);
        setOperaciones([]);
      }

      // Cargar dividendos y rentas desde movimientos históricos
      try {
        const fechaHasta = new Date();
        const fechaDesde = new Date('2021-09-05');
        const fechaDesdeStr = fechaDesde.toISOString().split('T')[0].replace(/-/g, '');
        const fechaHastaStr = fechaHasta.toISOString().split('T')[0].replace(/-/g, '');
        
        const movimientosResult = await getMovimientosHistoricosConCache(fechaDesdeStr, fechaHastaStr);
        
        // Guardar información de caché de movimientos históricos
        const movimientosUrl = `https://clientes.balanz.com/api/movimientos/222233?FechaDesde=${fechaDesdeStr}&FechaHasta=${fechaHastaStr}&ic=0`;
        const movimientosFecha = movimientosResult.cacheAge 
          ? new Date(Date.now() - movimientosResult.cacheAge * 60 * 60 * 1000).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        setMovimientosHistoricosCacheInfo({
          isCached: movimientosResult.isCached,
          fecha: movimientosFecha,
          url: movimientosUrl
        });
        
        // Obtener dividendos
        const dividendosData = await getDividendosPorTicker(movimientosResult.data, selectedTicker);
        setDividendos(dividendosData);
        
        // Obtener rentas
        const rentasData = await getRentasPorTicker(movimientosResult.data, selectedTicker);
        setRentas(rentasData);
      } catch (error) {
        console.warn('⚠️ Error al cargar dividendos y rentas:', error);
        setDividendos([]);
        setRentas([]);
        setMovimientosHistoricosCacheInfo(null);
      }
    };

    loadOperaciones();
  }, [selectedTicker]);

  const fetchTickerInfo = async (ticker: string) => {
    setLoading(true);
    setError(null);

    try {
      
      // El hook useTickerCache ya maneja la verificación de caché
      // Intentar cargar datos de cotización y datos históricos en paralelo
      const [quoteResult, candlesResult] = await Promise.allSettled([
        getTickerQuote(ticker),
        getTickerCandles(ticker, 730) // Últimos 2 años
      ]);
      
      // Extraer quote si fue exitoso
      const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;
      
      // Extraer candles si fue exitoso
      const candles = candlesResult.status === 'fulfilled' 
        ? candlesResult.value 
        : { data: [], sourceUrl: '', source: 'cache' as const, cacheDate: undefined };
      
      // Si tenemos datos históricos pero no quote, usar datos del caché/histórico
      if (!quote && candles.data.length > 0) {
        console.warn('⚠️ No se pudo obtener cotización en vivo, usando datos históricos');
        const lastCandle = candles.data[candles.data.length - 1];
        const prevCandle = candles.data[candles.data.length - 2];
        
        const info: TickerInfo = {
          ticker: ticker,
          name: ticker,
          price: lastCandle.close,
          change: prevCandle ? lastCandle.close - prevCandle.close : 0,
          changePercent: prevCandle ? ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100 : 0,
          currency: 'USD',
          marketCap: undefined,
          volume: undefined,
          high52w: Math.max(...candles.data.map(c => c.high)),
          low52w: Math.min(...candles.data.map(c => c.low)),
          mappedSymbol: undefined,
          description: undefined,
          type: undefined,
          category: undefined,
          lastClose: undefined,
          open: undefined,
          marketId: undefined,
          tickerCurrency: undefined,
          ratio: undefined,
          bond: undefined,
        };

        setTickerInfo(info);
        setHistoricalData(candles.data);
        setLoading(false);
        return; // Salir aquí, ya tenemos lo necesario
      }
      
      // Si no tenemos ni quote ni datos históricos, error
      if (!quote) {
        throw new Error('No se encontró información para este ticker');
      }

      // Caso normal: tenemos quote (con o sin candles)
      const info: TickerInfo = {
        ticker: ticker,
        name: quote.name,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        currency: quote.currency,
        marketCap: quote.marketCap ? formatLargeNumber(quote.marketCap) : undefined,
        volume: quote.volume ? formatLargeNumber(quote.volume) : undefined,
        high52w: quote.high52w,
        low52w: quote.low52w,
        mappedSymbol: quote.mappedSymbol,
        description: quote.description,
        type: quote.type,
        category: quote.category,
        lastClose: quote.lastClose,
        open: quote.open,
        marketId: quote.marketId,
        tickerCurrency: quote.tickerCurrency,
        ratio: quote.ratio,
        bond: quote.bond,
      };

      setTickerInfo(info);
      setHistoricalData(candles.data);
    } catch (err) {
      console.error('❌ Error al obtener información:', err);
      setError('No se pudo obtener información del ticker. Por favor verifica que el símbolo sea correcto.');
    } finally {
      setLoading(false);
    }
  };

  const formatLargeNumber = (num: number): string => {
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  };

  // Obtener PPC real desde la API (igual que CarteraActual)
  useEffect(() => {
    const fetchPPC = async () => {
      if (!selectedTicker || !positions || !dolarMEP) return;
      const data = await getTickerHoldingData(selectedTicker, positions, dolarMEP);
      setPpc(data?.ppc);
    };
    fetchPPC();
  }, [selectedTicker, positions, dolarMEP]);
  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-white mb-6">🔍 Consulta de Tickers</h2>

      {/* Selector de Ticker con Precio y Variación */}
      <div className="mb-6 flex items-end justify-between gap-6">
        {/* Selector */}
        <div className="flex-shrink-0">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Selecciona un ticker de tu cartera:
          </label>
          <select
            value={selectedTicker}
            onChange={(e) => {
              const newTicker = e.target.value;
              setSelectedTicker(newTicker);
              navigate(`/ticker/${newTicker}`);
            }}
            className="w-96 px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(() => {
              const { acciones, bonos, corporativos, cedears } = getGroupedTickers();
              return (
                <>
                  {acciones.length > 0 && (
                    <optgroup label="📈 Acciones">
                      {acciones.map((ticker) => (
                        <option key={ticker} value={ticker}>
                          {ticker}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {bonos.length > 0 && (
                    <optgroup label="💰 Bonos">
                      {bonos.map((ticker) => (
                        <option key={ticker} value={ticker}>
                          {ticker}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {corporativos.length > 0 && (
                    <optgroup label="🏢 Corporativos">
                      {corporativos.map((ticker) => (
                        <option key={ticker} value={ticker}>
                          {ticker}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {cedears.length > 0 && (
                    <optgroup label="🌎 CEDEARs">
                      {cedears.map((ticker) => (
                        <option key={ticker} value={ticker}>
                          {ticker}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              );
            })()}
          </select>
        </div>
        
        {/* Precio y Variación */}
        {!loading && !error && tickerInfo && (
          <div className="text-right">
            <p className="text-xs text-slate-400 mb-1">Precio</p>
            <p className="text-3xl font-bold text-white">
              {tickerInfo.currency} {tickerInfo.price.toLocaleString('es-AR', {
                minimumFractionDigits: getDecimalPlaces(selectedTicker),
                maximumFractionDigits: getDecimalPlaces(selectedTicker)
              })}
            </p>
            {(() => {
              const decimals = getDecimalPlaces(selectedTicker);
              const minChange = Math.pow(10, -decimals);
              const isNearZero = Math.abs(tickerInfo.change) < minChange && Math.abs(tickerInfo.changePercent) < 0.01;
              
              if (isNearZero) {
                return (
                  <p className="text-lg font-semibold mt-1 text-slate-400">
                    ― Sin variación
                  </p>
                );
              }
              
              return (
                <p className={`text-lg font-semibold mt-1 ${
                  tickerInfo.change >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {tickerInfo.change >= 0 ? '▲' : '▼'} {Math.abs(tickerInfo.change).toFixed(decimals)} ({tickerInfo.changePercent.toFixed(2)}%)
                </p>
              );
            })()}
          </div>
        )}
      </div>

      {/* Información del Ticker */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="text-slate-400 mt-4">Cargando información...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {!loading && !error && tickerInfo && (
        <div className="space-y-6">
          {/* Cabecera modularizada */}
          <div className="bg-slate-700/50 rounded-lg p-6 mb-6">
            <TickerHeader
              tickerInfo={tickerInfo}
              selectedTicker={selectedTicker}
              dolarMEP={dolarMEP}
              getDecimalPlaces={getDecimalPlaces}
              bond={tickerInfo?.bond}
              showBondDescTooltip={showBondDescTooltip}
              setShowBondDescTooltip={setShowBondDescTooltip}
              dividendos={dividendos}
              rentas={rentas}
              positions={positions}
            />
          </div>

          {/* Estadísticas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {tickerInfo.marketCap && (
              <div className="bg-slate-700/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Cap. de Mercado</p>
                <p className="text-white text-xl font-semibold mt-1">{tickerInfo.marketCap}</p>
              </div>
            )}
            {tickerInfo.high52w && (
              <div className="bg-slate-700/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Máximo 52 sem</p>
                <p className="text-white text-xl font-semibold mt-1">
                  {tickerInfo.high52w.toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </p>
              </div>
            )}
            {tickerInfo.low52w && (
              <div className="bg-slate-700/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Mínimo 52 sem</p>
                <p className="text-white text-xl font-semibold mt-1">
                  {tickerInfo.low52w.toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </p>
              </div>
            )}
          </div>

          {/* Gráfico y Operaciones Históricas lado a lado */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ maxHeight: '530px' }}>
            {/* Gráfico - ocupa 2/3 del espacio */}
            <div className="lg:col-span-2">
              <TickerChart 
                data={historicalData}
                ticker={selectedTicker}
                ppc={ppc}
                operaciones={operaciones}
                dividendos={dividendos}
                rentas={rentas}
                hoveredOperacionIndex={hoveredOperacionIndex}
              />
            </div>
            
            {/* Operaciones Históricas - ocupa 1/3 del espacio */}
            <div className="lg:col-span-1 h-full">
              <TickerOrders 
                operaciones={operaciones}
                hoveredOperacionIndex={hoveredOperacionIndex}
                setHoveredOperacionIndex={setHoveredOperacionIndex}
              />
            </div>
          </div>

          {/* Sección unificada de cachés */}
          <CacheSection
            caches={[
              // Órdenes históricas
              movimientosCacheInfo?.isCached && movimientosCacheInfo.url ? {
                label: 'balanz - reportehistoricoordenes',
                isCached: true,
                fecha: movimientosCacheInfo.fecha,
                url: movimientosCacheInfo.url,
                onClear: () => {
                  preserveAuthTokens(() => {
                    // Limpiar caché de órdenes históricas
                    const fechaDesde = movimientosCacheInfo.url?.split('FechaDesde=')[1]?.split('&')[0];
                    const fechaHasta = movimientosCacheInfo.url?.split('FechaHasta=')[1];
                    if (fechaDesde && fechaHasta) {
                      localStorage.removeItem(`balanz_ordenes_${fechaDesde}_${fechaHasta}`);
                    }
                  });
                  if (selectedTicker) fetchTickerInfo(selectedTicker);
                }
              } : null,
              // Movimientos históricos (para dividendos y rentas)
              movimientosHistoricosCacheInfo?.isCached && movimientosHistoricosCacheInfo.url ? {
                label: 'balanz - movimientos',
                isCached: true,
                fecha: movimientosHistoricosCacheInfo.fecha,
                url: movimientosHistoricosCacheInfo.url,
                onClear: () => {
                  preserveAuthTokens(() => {
                    // Limpiar caché de movimientos históricos
                    const fechaDesde = movimientosHistoricosCacheInfo.url?.split('FechaDesde=')[1]?.split('&')[0];
                    const fechaHasta = movimientosHistoricosCacheInfo.url?.split('FechaHasta=')[1]?.split('&')[0];
                    if (fechaDesde && fechaHasta) {
                      localStorage.removeItem(`balanz_movimientos_${fechaDesde}_${fechaHasta}`);
                    }
                  });
                  if (selectedTicker) fetchTickerInfo(selectedTicker);
                }
              } : null,
              // Estado de cuenta
              estadoCuentaCacheInfo?.isCached ? {
                label: 'balanz - estadocuenta',
                isCached: true,
                fecha: estadoCuentaCacheInfo.fecha,
                url: 'https://clientes.balanz.com/api/v1/estadocuenta',
                onClear: () => {
                  clearEstadoCuentaCache();
                  if (selectedTicker) fetchTickerInfo(selectedTicker);
                }
              } : null,
              // Info instrumento
              instrumentCacheInfo?.isCached ? {
                label: 'balanz - cotizacioninstrumento',
                isCached: true,
                fecha: instrumentCacheInfo.fecha,
                url: `https://clientes.balanz.com/api/cotizacioninstrumento?plazo=1&idCuenta=222233&ticker=${selectedTicker}`,
                onClear: () => {
                  clearTickerCache(selectedTicker);
                  fetchTickerInfo(selectedTicker);
                }
              } : null,
              // Histórico de precios (candles)
              candlesCacheInfo?.isCached ? {
                label: 'balanz - historico/eventos',
                isCached: true,
                fecha: candlesCacheInfo.fecha ? new Date(candlesCacheInfo.fecha).toISOString().split('T')[0] : '',
                url: `https://clientes.balanz.com/api/v1/historico/eventos?ticker=${candlesCacheInfo.usdTicker || selectedTicker}&plazo=1&fullNormalize=false`,
                onClear: () => {
                  // Limpiar caché usando el usdTicker si está disponible
                  if (candlesCacheInfo.usdTicker) {
                    clearTickerCache(candlesCacheInfo.usdTicker);
                  } else {
                    clearTickerCache(selectedTicker);
                  }
                  fetchTickerInfo(selectedTicker);
                }
              } : null,
              // Cotizaciones históricas del dólar
              dolarCacheInfo.exists ? {
                label: 'argentinadatos - cotizaciones/dolares',
                isCached: true,
                fecha: dolarCacheInfo.timestamp ? new Date(dolarCacheInfo.timestamp).toISOString().split('T')[0] : '',
                url: 'https://api.argentinadatos.com/v1/cotizaciones/dolares',
                onClear: () => {
                  clearDolarHistoricoCache();
                  if (selectedTicker) fetchTickerInfo(selectedTicker);
                }
              } : null,
            ].filter(Boolean) as any}
          />

          {/* Links externos */}
          <div className="text-center flex flex-col gap-3 items-center">
          </div>
        </div>
      )}

    </div>
  );
};

export default TickerLookup;
