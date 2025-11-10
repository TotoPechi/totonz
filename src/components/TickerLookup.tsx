import React, { useState, useEffect } from 'react';
import { getTickerHoldingData } from '../services/tickerHoldingData';
import { useParams, useNavigate } from 'react-router-dom';
import { getTickerQuote, getTickerCandles, clearTickerCache } from '../services/tickerApi';
import { getMovimientosHistoricosConCache, getOperacionesPorTicker, getDividendosPorTicker, getRentasPorTicker, getEstadoCuentaConCache, getDolarMEP, clearMovimientosCache, clearEstadoCuentaCache } from '../services/balanzApi';
import TickerHeader from './TickerHeader';
import TickerChart from './TickerChart';
import TickerOrders from './TickerOrders';

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
  const [dataSource, setDataSource] = useState<{ url: string; source: string; cacheDate?: string } | null>(null);
  const [dolarMEP, setDolarMEP] = useState<number | null>(null);
  const [operaciones, setOperaciones] = useState<Array<{
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
  const [estadoCuentaCacheInfo, setEstadoCuentaCacheInfo] = useState<{
    isCached: boolean;
    fecha: string;
  } | null>(null);
  const [instrumentCacheInfo, setInstrumentCacheInfo] = useState<{
    isCached: boolean;
    fecha: string;
  } | null>(null);
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

        // Intentar obtener movimientos (no crítico - puede fallar)
        if (dolarMEP) {
          try {
            // Obtener movimientos desde 2021-01-01
            const fechaHasta = new Date();
            const fechaDesde = new Date('2021-01-01');
            
            // Formato YYYYMMDD requerido por la API
            const fechaDesdeStr = fechaDesde.toISOString().split('T')[0].replace(/-/g, '');
            const fechaHastaStr = fechaHasta.toISOString().split('T')[0].replace(/-/g, '');
            
            const movimientosResult = await getMovimientosHistoricosConCache(fechaDesdeStr, fechaHastaStr);
            
            // Debug: Mostrar algunos tickers de los movimientos

            // Guardar info de caché de movimientos
            const movimientosUrl = `https://clientes.balanz.com/api/v1/movimientos/historicos?fechaDesde=${fechaDesdeStr}&fechaHasta=${fechaHastaStr}`;
            const movimientosFecha = movimientosResult.cacheAge 
              ? new Date(Date.now() - movimientosResult.cacheAge * 60 * 60 * 1000).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
            setMovimientosCacheInfo({
              isCached: movimientosResult.isCached,
              fecha: movimientosFecha,
              url: movimientosUrl
            });

            // Filtrar y formatear operaciones del ticker seleccionado
            // IMPORTANTE: Usar el ticker completo (con .E si lo tiene) para buscar en movimientos
            
            const ops = await getOperacionesPorTicker(movimientosResult.data, selectedTicker, dolarMEP);
            
            setOperaciones(ops);
            
            // Obtener dividendos
            const divs = await getDividendosPorTicker(movimientosResult.data, selectedTicker);
            
            setDividendos(divs);
            
            // Obtener rentas
            const rents = await getRentasPorTicker(movimientosResult.data, selectedTicker);
            
            setRentas(rents);
          } catch (error) {
            console.warn('⚠️ Error al cargar movimientos - continuando sin operaciones:', error);
            setOperaciones([]);
            setDividendos([]);
            setRentas([]);
            setMovimientosCacheInfo(null);
          }
        } else {
          setOperaciones([]);
          setDividendos([]);
          setMovimientosCacheInfo(null);
        }
      } catch (error) {
        console.error('❌ Error al cargar operaciones:', error);
        setOperaciones([]);
        setDividendos([]);
      }
    };

    loadOperaciones();
  }, [selectedTicker]);

  const fetchTickerInfo = async (ticker: string) => {
    setLoading(true);
    setError(null);

    try {
      
      // Verificar si hay caché de información del instrumento
      const instrumentCacheKey = `instrument_info_${ticker}`;
      const instrumentTimestampKey = `instrument_info_${ticker}_timestamp`;
      const cachedInstrumentData = localStorage.getItem(instrumentCacheKey);
      const cachedInstrumentTimestamp = localStorage.getItem(instrumentTimestampKey);
      
      if (cachedInstrumentData && cachedInstrumentTimestamp) {
        const cacheAge = Date.now() - parseInt(cachedInstrumentTimestamp, 10);
        const cacheAgeHours = cacheAge / (1000 * 60 * 60);
        
        if (cacheAgeHours < 24) {
          const cacheFecha = new Date(parseInt(cachedInstrumentTimestamp, 10)).toISOString().split('T')[0];
          setInstrumentCacheInfo({
            isCached: true,
            fecha: cacheFecha
          });
        } else {
          setInstrumentCacheInfo(null);
        }
      } else {
        setInstrumentCacheInfo(null);
      }
      
      // Intentar cargar datos de cotización y datos históricos en paralelo
      const [quoteResult, candlesResult] = await Promise.allSettled([
        getTickerQuote(ticker),
        getTickerCandles(ticker, 365) // Último año
      ]);
      
      // Después de obtener los datos, verificar nuevamente el caché (pudo haberse creado)
      const newCachedTimestamp = localStorage.getItem(instrumentTimestampKey);
      if (newCachedTimestamp) {
        const cacheAge = Date.now() - parseInt(newCachedTimestamp, 10);
        const cacheAgeHours = cacheAge / (1000 * 60 * 60);
        
        if (cacheAgeHours < 24) {
          const cacheFecha = new Date(parseInt(newCachedTimestamp, 10)).toISOString().split('T')[0];
          setInstrumentCacheInfo({
            isCached: true,
            fecha: cacheFecha
          });
        }
      }
      
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
        setDataSource({ url: candles.sourceUrl, source: candles.source, cacheDate: candles.cacheDate });
        if (candles.cacheDate) {
        }
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
      setDataSource({ url: candles.sourceUrl, source: candles.source, cacheDate: candles.cacheDate });
      if (candles.cacheDate) {
      }
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

          {/* Operaciones Históricas */}
          <TickerOrders 
            operaciones={operaciones}
            hoveredOperacionIndex={hoveredOperacionIndex}
            setHoveredOperacionIndex={setHoveredOperacionIndex}
          />

          {/* Gráfico */}
          <TickerChart 
            data={historicalData}
            ticker={selectedTicker}
            ppc={ppc}
            operaciones={operaciones}
            dividendos={dividendos}
            rentas={rentas}
            hoveredOperacionIndex={hoveredOperacionIndex}
          />

          {/* Data source info - Combinado con caché de movimientos */}
          {(dataSource || movimientosCacheInfo?.isCached || estadoCuentaCacheInfo?.isCached || instrumentCacheInfo?.isCached) && (
            <div className="mt-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              {/* Footer de histórico/gráfico */}
              {dataSource && (
                <div className="flex items-center justify-between gap-2" style={{ paddingBottom: (movimientosCacheInfo?.isCached || estadoCuentaCacheInfo?.isCached || instrumentCacheInfo?.isCached) ? '5px' : '0', paddingTop: '5px' }}>
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-1">
                    <span className="font-mono">
                      {dataSource.source === 'cache' ? (
                        <>
                          📦 Cache
                          {dataSource.cacheDate && (
                            <span>({dataSource.cacheDate})</span>
                          )}
                        </>
                      ) : '🏦 Balanz API'}
                    </span>
                    <span>•</span>
                    <a 
                      href={dataSource.url.startsWith('http') ? dataSource.url : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`font-mono break-all ${dataSource.url.startsWith('http') ? 'text-blue-400 hover:text-blue-300 hover:underline' : 'text-slate-500'}`}
                      title={dataSource.url}
                    >
                        {dataSource.url.length > 80 ? `${dataSource.url.substring(0, 80)}...` : dataSource.url}
                      </a>
                  </div>
                  <button
                    onClick={() => {
                      clearTickerCache(selectedTicker);
                      fetchTickerInfo(selectedTicker);
                    }}
                    className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors whitespace-nowrap"
                    title="Limpiar caché y recargar datos"
                  >
                    🗑️ Limpiar caché
                  </button>
                </div>
              )}
              
              {/* Footer de movimientos */}
              {movimientosCacheInfo?.isCached && (
                <div className="flex items-center justify-between gap-2" style={{ paddingTop: '5px', paddingBottom: (estadoCuentaCacheInfo?.isCached || instrumentCacheInfo?.isCached) ? '5px' : '5px' }}>
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-1">
                    <span className="font-mono">
                      📦 Cache({movimientosCacheInfo.fecha})
                    </span>
                    <span>•</span>
                    <a 
                      href={movimientosCacheInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono break-all text-blue-400 hover:text-blue-300 hover:underline"
                      title={movimientosCacheInfo.url}
                    >
                      {movimientosCacheInfo.url && movimientosCacheInfo.url.length > 80 
                        ? `${movimientosCacheInfo.url.substring(0, 80)}...` 
                        : movimientosCacheInfo.url}
                    </a>
                  </div>
                  <button
                    onClick={() => {
                      clearMovimientosCache();
                      if (selectedTicker) {
                        fetchTickerInfo(selectedTicker);
                      }
                    }}
                    className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors whitespace-nowrap"
                    title="Limpiar caché de movimientos y recargar"
                  >
                    🗑️ Limpiar caché
                  </button>
                </div>
              )}
              
              {/* Footer de estado de cuenta (para PPC) */}
              {estadoCuentaCacheInfo?.isCached && (
                <div className="flex items-center justify-between gap-2" style={{ paddingTop: '5px', paddingBottom: instrumentCacheInfo?.isCached ? '5px' : '5px' }}>
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-1">
                    <span className="font-mono">
                      📦 Cache({estadoCuentaCacheInfo.fecha})
                    </span>
                    <span>•</span>
                    <a 
                      href="https://clientes.balanz.com/api/v1/estadocuenta"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono break-all text-blue-400 hover:text-blue-300 hover:underline"
                      title="https://clientes.balanz.com/api/v1/estadocuenta"
                    >
                      https://clientes.balanz.com/api/v1/estadocuenta
                    </a>
                  </div>
                  <button
                    onClick={() => {
                      clearEstadoCuentaCache();
                      if (selectedTicker) {
                        fetchTickerInfo(selectedTicker);
                      }
                    }}
                    className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors whitespace-nowrap"
                    title="Limpiar caché de estado de cuenta y recargar"
                  >
                    🗑️ Limpiar caché
                  </button>
                </div>
              )}
              
              {/* Footer de información del instrumento */}
              {instrumentCacheInfo?.isCached && (
                <div className="flex items-center justify-between gap-2" style={{ paddingTop: '5px', paddingBottom: '5px' }}>
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-1">
                    <span className="font-mono">
                      📦 Cache({instrumentCacheInfo.fecha})
                    </span>
                    <span>•</span>
                    <a 
                      href={`https://clientes.balanz.com/api/cotizacioninstrumento?plazo=1&idCuenta=222233&ticker=${selectedTicker}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono break-all text-blue-400 hover:text-blue-300 hover:underline"
                      title={`https://clientes.balanz.com/api/cotizacioninstrumento?plazo=1&idCuenta=222233&ticker=${selectedTicker}`}
                    >
                      {`https://clientes.balanz.com/api/cotizacioninstrumento?plazo=1&idCuenta=222233&ticker=${selectedTicker}`.length > 80 
                        ? `https://clientes.balanz.com/api/cotizacioninstrumento?plazo=1&idCuenta=222233&ticker=${selectedTicker}`.substring(0, 80) + '...'
                        : `https://clientes.balanz.com/api/cotizacioninstrumento?plazo=1&idCuenta=222233&ticker=${selectedTicker}`}
                    </a>
                  </div>
                  <button
                    onClick={() => {
                      clearTickerCache(selectedTicker);
                      fetchTickerInfo(selectedTicker);
                    }}
                    className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors whitespace-nowrap"
                    title="Limpiar caché de información del instrumento y recargar"
                  >
                    🗑️ Limpiar caché
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Links externos */}
          <div className="text-center flex flex-col gap-3 items-center">
          </div>
        </div>
      )}

    </div>
  );
};

export default TickerLookup;
