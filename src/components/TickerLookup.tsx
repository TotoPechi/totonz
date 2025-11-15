import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getTickerHoldingData } from '../services/tickerHoldingData';
import { useParams, useNavigate } from 'react-router-dom';
import { clearTickerCache, getTickerQuote } from '../services/tickerApi';
import { clearEstadoCuentaCache, getMovimientosHistoricosConCache, MovimientoHistorico } from '../services/balanzApi';
import { getDolarHistoricoCacheInfo, clearDolarHistoricoCache } from '../services/dolarHistoricoApi';
import { preserveAuthTokens } from '../utils/cacheHelpers';
import { clearCache } from '../utils/cacheManager';
import { normalizeTicker, tickersMatch, getFechaRangoHistorico, formatearFechaParaMostrar } from '../utils/tickerHelpers';
import { Position } from '../types/balanz';
import { useTickerCache } from '../hooks/useTickerCache';
import { useTickerInfo } from '../hooks/useTickerInfo';
import { useTickerOperations } from '../hooks/useTickerOperations';
import TickerHeader from './TickerHeader';
import TickerChart from './TickerChart';
import TickerOrders from './TickerOrders';
import CacheSection from './CacheSection';
import BondCashflow from './BondCashflow';
import HistoricalSummary from './HistoricalSummary';
import HistoricalTickerView from './HistoricalTickerView';

interface TickerLookupProps {
  availableTickers: string[];
  positions: Position[]; // Array de posiciones de la cartera
}

const TickerLookup: React.FC<TickerLookupProps> = ({ availableTickers, positions }) => {
  const { ticker: urlTicker } = useParams<{ ticker?: string }>();
  const navigate = useNavigate();
  const [selectedTicker, setSelectedTicker] = useState<string>(urlTicker || 'GBTC.E');
  
  // Usar hooks para manejar datos del ticker
  const {
    tickerInfo,
    historicalData,
    loading,
    error,
    isHistoricalOnly,
    historicalSummary,
    historicalOperations,
    fetchTickerInfo
  } = useTickerInfo(positions);
  
  const {
    operaciones: operacionesFromHook,
    dividendos,
    rentas,
    movimientosCacheInfo,
    movimientosHistoricosCacheInfo,
    estadoCuentaCacheInfo,
    dolarMEP
  } = useTickerOperations(selectedTicker, tickerInfo);
  
  // Usar operaciones del hook o del resumen histórico
  const operaciones = historicalOperations.length > 0 ? historicalOperations : operacionesFromHook;
  
  const [ppc, setPpc] = useState<number | undefined>(undefined);
  const [precioPromedioVenta, setPrecioPromedioVenta] = useState<number | undefined>(undefined);
  const [valorInicialConsolidado, setValorInicialConsolidado] = useState<number | undefined>(undefined);
  
  // Usar hook para caché de ticker
  const { candlesCacheInfo, instrumentCacheInfo } = useTickerCache(selectedTicker);
  // Info de caché de cotizaciones históricas del dólar
  const dolarCacheInfo = getDolarHistoricoCacheInfo();
  const [hoveredOperacionIndex, setHoveredOperacionIndex] = useState<number | null>(null);
  const [showBondDescTooltip, setShowBondDescTooltip] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [historicalTickers, setHistoricalTickers] = useState<Array<{ ticker: string; lastSaleDate?: string }>>([]);
  const [tickerDescriptions, setTickerDescriptions] = useState<Map<string, string>>(new Map());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calcular rendimiento a término para bonos
  const rendimientoATermino = useMemo(() => {
    if (!tickerInfo?.bond?.cashFlow || !Array.isArray(tickerInfo.bond.cashFlow) || tickerInfo.bond.cashFlow.length === 0) {
      return undefined;
    }
    
    const position = positions.find(p => p.Ticker === selectedTicker);
    const unidades = position?.Cantidad || 0;
    if (unidades === 0) return undefined;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Calcular totales futuros (cupones + amortizaciones)
    const cashFlowFuturo = tickerInfo.bond.cashFlow.filter((cf) => {
      const cfDate = new Date(cf.date);
      cfDate.setHours(0, 0, 0, 0);
      return cfDate >= today;
    });
    
    const valorATermino = cashFlowFuturo.reduce((acc: number, cf) => {
      return acc + (unidades * (cf.cashflow || 0));
    }, 0);
    
    // Calcular rentas pasadas usando rentas reales (de movimientos históricos)
    // Si hay rentas reales, usarlas (son las que realmente se recibieron)
    const rentasPasadas = rentas && Array.isArray(rentas) && rentas.length > 0
      ? rentas.reduce((acc: number, renta) => acc + (renta.montoNeto || 0), 0)
      : tickerInfo.bond.cashFlow.reduce((acc: number, cf) => {
          const cfDate = new Date(cf.date);
          cfDate.setHours(0, 0, 0, 0);
          if (cfDate < today) {
            return acc + (unidades * (cf.rent || 0));
          }
          return acc;
        }, 0);
    
    if (valorInicialConsolidado === undefined) return undefined;
    
    const rendimiento = valorATermino + rentasPasadas - valorInicialConsolidado;
    const porcentaje = valorInicialConsolidado > 0 ? (rendimiento / valorInicialConsolidado) * 100 : 0;
    
    return {
      valorATermino,
      rentasPasadas,
      rendimiento,
      porcentaje
    };
  }, [tickerInfo?.bond?.cashFlow, positions, selectedTicker, valorInicialConsolidado, rentas]);

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

  // Función para obtener descripción de un ticker
  const getTickerDescription = (ticker: string): string => {
    // Primero intentar desde tickerDescriptions (cache)
    if (tickerDescriptions.has(ticker)) {
      return tickerDescriptions.get(ticker)!;
    }
    
    // Luego desde positions
    const position = positions.find(p => p.Ticker === ticker);
    if (position?.Descripcion) {
      return position.Descripcion;
    }
    
    // Si tenemos tickerInfo cargado para este ticker
    if (tickerInfo && tickerInfo.ticker === ticker && tickerInfo.description) {
      return tickerInfo.description;
    }
    
    return '';
  };

  // Función para acortar descripción
  const shortenDescription = (desc: string, maxLength: number = 50): string => {
    if (!desc) return '';
    if (desc.length <= maxLength) return desc;
    return desc.substring(0, maxLength - 3) + '...';
  };

  // Función para formatear fecha a DD/MM/YYYY
  // Usar función centralizada para formatear fechas
  const formatDate = formatearFechaParaMostrar;

  // Cargar tickers históricos desde movimientos
  useEffect(() => {
    const loadHistoricalTickers = async () => {
      try {
        const { fechaDesde, fechaHasta } = getFechaRangoHistorico();
        const movimientosResult = await getMovimientosHistoricosConCache(fechaDesde, fechaHasta);
        
        if (movimientosResult.data && movimientosResult.data.length > 0) {
          // Mapa para almacenar la última fecha de venta por ticker
          const tickerLastSaleMap = new Map<string, string>();
          
          movimientosResult.data.forEach((mov: MovimientoHistorico) => {
            if (mov.ticker && mov.ticker.trim() !== '') {
              // Normalizar ticker para agrupar variaciones
              const tickerNormalizado = normalizeTicker(mov.ticker);
              
              // Detectar si es una venta
              const descripcionLower = mov.descripcion?.toLowerCase() || mov.descripcionCorta?.toLowerCase() || '';
              const esVenta = descripcionLower.includes('venta') || 
                             descripcionLower.includes('vendiste') ||
                             (mov.cantidad < 0 && mov.cantidad !== 0);
              
              if (esVenta) {
                // Usar fecha de liquidación o concertación
                const fechaVenta = mov.Liquidacion || mov.Concertacion;
                if (fechaVenta) {
                  // Si no hay fecha registrada para este ticker normalizado, o esta fecha es más reciente
                  const fechaActual = tickerLastSaleMap.get(tickerNormalizado);
                  if (!fechaActual || new Date(fechaVenta) > new Date(fechaActual)) {
                    tickerLastSaleMap.set(tickerNormalizado, fechaVenta);
                  }
                }
              }
            }
          });
          
          // Filtrar tickers que no están en la cartera actual
          const tickerSet = new Set<string>();
          const tickerMap = new Map<string, string>(); // Mapa de ticker normalizado -> ticker original (sin espacios)
          
          movimientosResult.data.forEach((mov: MovimientoHistorico) => {
            if (mov.ticker && mov.ticker.trim() !== '') {
              const tickerNormalizado = normalizeTicker(mov.ticker);
              tickerSet.add(tickerNormalizado);
              // Guardar el ticker sin espacios como representante
              if (!tickerMap.has(tickerNormalizado)) {
                tickerMap.set(tickerNormalizado, tickerNormalizado);
              }
            }
          });
          
          // Normalizar availableTickers para comparación
          const availableTickersNormalizados = new Set(availableTickers.map(t => normalizeTicker(t)));
          
          const historicalTickersList = Array.from(tickerSet)
            .filter(tickerNormalizado => !availableTickersNormalizados.has(tickerNormalizado))
            .map(tickerNormalizado => ({
              ticker: tickerMap.get(tickerNormalizado) || tickerNormalizado, // Usar el ticker sin espacios
              lastSaleDate: tickerLastSaleMap.get(tickerNormalizado)
            }))
            .sort((a, b) => {
              // Ordenar por fecha de última venta (más reciente primero), luego por ticker
              if (a.lastSaleDate && b.lastSaleDate) {
                const dateA = new Date(a.lastSaleDate);
                const dateB = new Date(b.lastSaleDate);
                if (dateB.getTime() !== dateA.getTime()) {
                  return dateB.getTime() - dateA.getTime();
                }
              }
              return a.ticker.localeCompare(b.ticker);
            });
          
          setHistoricalTickers(historicalTickersList);
        }
      } catch (error) {
        console.warn('⚠️ Error al cargar tickers históricos:', error);
      }
    };

    loadHistoricalTickers();
  }, [availableTickers]);

  // Cargar descripciones para tickers de la cartera actual
  useEffect(() => {
    const loadCurrentTickerDescriptions = async () => {
      const newDescriptions = new Map<string, string>();
      
      // Primero, cargar desde positions
      availableTickers.forEach(ticker => {
        const position = positions.find(p => p.Ticker === ticker);
        if (position?.Descripcion) {
          newDescriptions.set(ticker, position.Descripcion);
        }
      });
      
      // Luego, cargar desde API para los que no tienen descripción
      await Promise.all(availableTickers.map(async (ticker) => {
        if (!newDescriptions.has(ticker)) {
          try {
            // Cargar movimientos para detección de fondos
            let movimientosHistoricos: MovimientoHistorico[] = [];
            try {
              const { fechaDesde, fechaHasta } = getFechaRangoHistorico();
              const movimientosResult = await getMovimientosHistoricosConCache(fechaDesde, fechaHasta);
              movimientosHistoricos = movimientosResult.data || [];
            } catch (error) {
              // Ignorar errores
            }
            const quote = await getTickerQuote(ticker, positions, movimientosHistoricos);
            if (quote?.description) {
              newDescriptions.set(ticker, quote.description);
            }
          } catch (error) {
            // Ignorar errores
          }
        }
      }));
      
      setTickerDescriptions(prev => {
        const merged = new Map(prev);
        newDescriptions.forEach((value, key) => merged.set(key, value));
        return merged;
      });
    };

    if (availableTickers.length > 0) {
      loadCurrentTickerDescriptions();
    }
  }, [availableTickers, positions]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  // Filtrar tickers según búsqueda
  const filterTickers = (tickers: string[], search: string): string[] => {
    if (!search.trim()) return tickers;
    
    const searchLower = search.toLowerCase().trim();
    return tickers.filter(ticker => {
      const tickerLower = ticker.toLowerCase();
      const desc = getTickerDescription(ticker).toLowerCase();
      return tickerLower.includes(searchLower) || desc.includes(searchLower);
    });
  };

  // Obtener tickers filtrados para cada sección
  const getFilteredCurrentTickers = () => {
    return filterTickers(availableTickers, searchQuery);
  };

  const getFilteredHistoricalTickers = () => {
    if (!searchQuery.trim()) return historicalTickers;
    
    const searchLower = searchQuery.toLowerCase().trim();
    return historicalTickers.filter(item => {
      const tickerLower = item.ticker.toLowerCase();
      return tickerLower.includes(searchLower);
    });
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
      fetchTickerInfo(selectedTicker, dolarMEP);
    }
  }, [selectedTicker, fetchTickerInfo, dolarMEP]);


  // Obtener valores calculados desde el servicio (PPC, inversión consolidada, precio promedio de venta)
  useEffect(() => {
    const obtenerValoresCalculados = async () => {
      if (!selectedTicker || !positions || !dolarMEP) {
        setPpc(undefined);
        setValorInicialConsolidado(undefined);
        setPrecioPromedioVenta(undefined);
        return;
      }

      try {
        const data = await getTickerHoldingData(selectedTicker, positions, dolarMEP);
        if (data) {
          // Priorizar PPC desde operaciones históricas, sino usar PPC de la API
          setPpc(data.ppcDesdeOperaciones ?? data.ppc);
          setValorInicialConsolidado(data.valorInicialConsolidado);
          setPrecioPromedioVenta(data.precioPromedioVenta);
        } else {
          setPpc(undefined);
          setValorInicialConsolidado(undefined);
          setPrecioPromedioVenta(undefined);
        }
      } catch (error) {
        console.error('Error obteniendo valores calculados:', error);
        setPpc(undefined);
        setValorInicialConsolidado(undefined);
        setPrecioPromedioVenta(undefined);
      }
    };

    obtenerValoresCalculados();
  }, [selectedTicker, positions, dolarMEP]);
  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-white mb-6">🔍 Consulta de Tickers</h2>

      {/* Selector de Ticker con Precio y Variación */}
      <div className="mb-6 flex items-end justify-between gap-6">
        {/* Selector personalizado con buscador */}
        <div className="flex-shrink-0 relative" ref={dropdownRef}>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Selecciona un ticker:
          </label>
          <div className="relative w-96">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
            >
              <span className="font-mono font-semibold">{selectedTicker}</span>
              <span className="text-slate-400">{isDropdownOpen ? '▲' : '▼'}</span>
            </button>
            
            {isDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-slate-700 rounded-lg border border-slate-600 shadow-xl max-h-96 overflow-hidden flex flex-col">
                {/* Buscador */}
                <div className="p-3 border-b border-slate-600">
                  <input
                    type="text"
                    placeholder="Buscar ticker o descripción..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-3 py-2 bg-slate-800 text-white rounded border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                
                {/* Lista de tickers */}
                <div className="overflow-y-auto flex-1">
                  {/* Sección: Cartera Actual */}
            {(() => {
                    const filteredCurrent = getFilteredCurrentTickers();
              const { acciones, bonos, corporativos, cedears } = getGroupedTickers();
                    
                    const filteredAcciones = acciones.filter(t => filteredCurrent.includes(t));
                    const filteredBonos = bonos.filter(t => filteredCurrent.includes(t));
                    const filteredCorporativos = corporativos.filter(t => filteredCurrent.includes(t));
                    const filteredCedears = cedears.filter(t => filteredCurrent.includes(t));
                    
                    const hasCurrentSection = filteredAcciones.length > 0 || filteredBonos.length > 0 || 
                                            filteredCorporativos.length > 0 || filteredCedears.length > 0;
                    
              return (
                <>
                        {hasCurrentSection && (
                          <div className="border-b border-slate-600">
                            <div className="px-4 py-2 bg-slate-800 text-sm font-semibold text-slate-300 sticky top-0 border-b border-slate-600">
                              📊 Cartera Actual
                            </div>
                            {filteredAcciones.length > 0 && (
                              <div>
                                <div className="px-4 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/30">
                                  📈 Acciones
                                </div>
                                {filteredAcciones.map((ticker) => {
                                  const desc = getTickerDescription(ticker);
                                  return (
                                    <button
                                      key={ticker}
                                      type="button"
                                      onClick={() => {
                                        setSelectedTicker(ticker);
                                        navigate(`/ticker/${ticker}`);
                                        setIsDropdownOpen(false);
                                        setSearchQuery('');
                                      }}
                                      className={`w-full px-4 py-2 text-left hover:bg-slate-600 transition flex items-center gap-2 ${
                                        selectedTicker === ticker ? 'bg-slate-600' : ''
                                      }`}
                                    >
                                      <span className="font-mono font-semibold text-white">{ticker}</span>
                                      {desc && (
                                        <span className="text-xs text-slate-400 truncate flex-1">
                                          {shortenDescription(desc, 40)}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {filteredBonos.length > 0 && (
                              <div>
                                <div className="px-4 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/30">
                                  💰 Bonos
                                </div>
                                {filteredBonos.map((ticker) => {
                                  const desc = getTickerDescription(ticker);
                                  return (
                                    <button
                                      key={ticker}
                                      type="button"
                                      onClick={() => {
                                        setSelectedTicker(ticker);
                                        navigate(`/ticker/${ticker}`);
                                        setIsDropdownOpen(false);
                                        setSearchQuery('');
                                      }}
                                      className={`w-full px-4 py-2 text-left hover:bg-slate-600 transition flex items-center gap-2 ${
                                        selectedTicker === ticker ? 'bg-slate-600' : ''
                                      }`}
                                    >
                                      <span className="font-mono font-semibold text-white">{ticker}</span>
                                      {desc && (
                                        <span className="text-xs text-slate-400 truncate flex-1">
                                          {shortenDescription(desc, 40)}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {filteredCorporativos.length > 0 && (
                              <div>
                                <div className="px-4 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/30">
                                  🏢 Corporativos
                                </div>
                                {filteredCorporativos.map((ticker) => {
                                  const desc = getTickerDescription(ticker);
                                  return (
                                    <button
                                      key={ticker}
                                      type="button"
                                      onClick={() => {
                                        setSelectedTicker(ticker);
                                        navigate(`/ticker/${ticker}`);
                                        setIsDropdownOpen(false);
                                        setSearchQuery('');
                                      }}
                                      className={`w-full px-4 py-2 text-left hover:bg-slate-600 transition flex items-center gap-2 ${
                                        selectedTicker === ticker ? 'bg-slate-600' : ''
                                      }`}
                                    >
                                      <span className="font-mono font-semibold text-white">{ticker}</span>
                                      {desc && (
                                        <span className="text-xs text-slate-400 truncate flex-1">
                                          {shortenDescription(desc, 40)}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {filteredCedears.length > 0 && (
                              <div>
                                <div className="px-4 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/30">
                                  🌎 CEDEARs
                                </div>
                                {filteredCedears.map((ticker) => {
                                  const desc = getTickerDescription(ticker);
                                  return (
                                    <button
                                      key={ticker}
                                      type="button"
                                      onClick={() => {
                                        setSelectedTicker(ticker);
                                        navigate(`/ticker/${ticker}`);
                                        setIsDropdownOpen(false);
                                        setSearchQuery('');
                                      }}
                                      className={`w-full px-4 py-2 text-left hover:bg-slate-600 transition flex items-center gap-2 ${
                                        selectedTicker === ticker ? 'bg-slate-600' : ''
                                      }`}
                                    >
                                      <span className="font-mono font-semibold text-white">{ticker}</span>
                                      {desc && (
                                        <span className="text-xs text-slate-400 truncate flex-1">
                                          {shortenDescription(desc, 40)}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Sección: Instrumentos Históricos */}
                        {(() => {
                          const filteredHistorical = getFilteredHistoricalTickers();
                          if (filteredHistorical.length === 0) return null;
                          
                          return (
                            <div>
                              <div className="px-4 py-2 bg-slate-800 text-sm font-semibold text-slate-300 sticky top-0 border-t border-slate-600 border-b border-slate-600">
                                📜 Instrumentos Históricos
                              </div>
                              {filteredHistorical.map((item) => {
                                const fechaVenta = item.lastSaleDate ? formatDate(item.lastSaleDate) : null;
                                return (
                                  <button
                                    key={item.ticker}
                                    type="button"
                                    onClick={() => {
                                      setSelectedTicker(item.ticker);
                                      navigate(`/ticker/${item.ticker}`);
                                      setIsDropdownOpen(false);
                                      setSearchQuery('');
                                    }}
                                    className={`w-full px-4 py-2 text-left hover:bg-slate-600 transition flex items-center gap-2 ${
                                      selectedTicker === item.ticker ? 'bg-slate-600' : ''
                                    }`}
                                  >
                                    <span className="font-mono font-semibold text-white">{item.ticker}</span>
                                    {fechaVenta && (
                                      <span className="text-xs text-slate-400 truncate flex-1">
                                        vendido el {fechaVenta}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                        
                        {/* Mensaje si no hay resultados */}
                        {getFilteredCurrentTickers().length === 0 && getFilteredHistoricalTickers().length === 0 && (
                          <div className="px-4 py-8 text-center text-slate-400 text-sm">
                            No se encontraron tickers que coincidan con "{searchQuery}"
                          </div>
                  )}
                </>
              );
            })()}
                </div>
              </div>
            )}
          </div>
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

      {/* Formato alternativo para tickers históricos sin información de API */}
      {!loading && !error && isHistoricalOnly && historicalSummary && (
        <HistoricalTickerView
          ticker={selectedTicker}
          historicalSummary={historicalSummary}
          operaciones={operaciones}
          hoveredOperacionIndex={hoveredOperacionIndex}
          setHoveredOperacionIndex={setHoveredOperacionIndex}
          formatDate={formatDate}
        />
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
              valorInicialConsolidado={valorInicialConsolidado}
              precioPromedioVenta={precioPromedioVenta}
              rendimientoATermino={rendimientoATermino}
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
          </div>

          {/* Resumen Histórico - Solo mostrar si el ticker NO está en la cartera actual */}
          {historicalSummary && !positions.find(p => tickersMatch(p.Ticker, selectedTicker)) && (
            <HistoricalSummary
              totalComprado={historicalSummary.totalComprado}
              totalVendido={historicalSummary.totalVendido}
              gananciaPerdida={historicalSummary.gananciaPerdida}
              gananciaPerdidaPorcentaje={historicalSummary.gananciaPerdidaPorcentaje}
              ppc={historicalSummary.ppc}
              precioPromedioVenta={historicalSummary.precioPromedioVenta}
              cantidadTotalComprada={historicalSummary.cantidadTotalComprada}
              cantidadTotalVendida={historicalSummary.cantidadTotalVendida}
              showTitle={true}
            />
          )}

          {/* Gráfico y Operaciones Históricas lado a lado */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6" style={{ maxHeight: '530px' }}>
            {/* Gráfico - ocupa 3/5 del espacio (60%) */}
            <div className="lg:col-span-3">
              <TickerChart 
                data={historicalData}
                ticker={selectedTicker}
                ppc={ppc}
                precioPromedioVenta={precioPromedioVenta}
                operaciones={operaciones}
                dividendos={dividendos}
                rentas={rentas}
                hoveredOperacionIndex={hoveredOperacionIndex}
              />
            </div>
            
            {/* Operaciones Históricas - ocupa 2/5 del espacio (40%) */}
            <div className="lg:col-span-2 h-full">
              <TickerOrders 
                operaciones={operaciones}
                hoveredOperacionIndex={hoveredOperacionIndex}
                setHoveredOperacionIndex={setHoveredOperacionIndex}
              />
            </div>
          </div>

          {/* Cashflow del Bono - Solo mostrar si hay tenencias */}
          {tickerInfo?.bond?.cashFlow && 
           Array.isArray(tickerInfo.bond.cashFlow) && 
           tickerInfo.bond.cashFlow.length > 0 && 
           (positions.find(p => p.Ticker === selectedTicker)?.Cantidad || 0) > 0 && (
            <BondCashflow 
              cashFlow={tickerInfo.bond.cashFlow}
              unidades={positions.find(p => p.Ticker === selectedTicker)?.Cantidad || 0}
              currency={tickerInfo.bond.cashFlow[0]?.currency}
              showOnlyFuture={true}
              valorInicialConsolidado={valorInicialConsolidado}
              rentasReales={rentas}
            />
          )}

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
                      clearCache(`balanz_ordenes_${fechaDesde}_${fechaHasta}`);
                    }
                  });
                  if (selectedTicker) fetchTickerInfo(selectedTicker, dolarMEP);
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
                      clearCache(`balanz_movimientos_${fechaDesde}_${fechaHasta}`);
                    }
                  });
                  if (selectedTicker) fetchTickerInfo(selectedTicker, dolarMEP);
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
                  if (selectedTicker) fetchTickerInfo(selectedTicker, dolarMEP);
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
                  fetchTickerInfo(selectedTicker, dolarMEP);
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
                  fetchTickerInfo(selectedTicker, dolarMEP);
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
                  if (selectedTicker) fetchTickerInfo(selectedTicker, dolarMEP);
                }
              } : null,
            ].filter((item): item is NonNullable<typeof item> => Boolean(item))}
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
