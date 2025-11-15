import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getTickerHoldingData } from '../services/tickerHoldingData';
import { useParams, useNavigate } from 'react-router-dom';
import { getTickerQuote, getTickerCandles, clearTickerCache } from '../services/tickerApi';
import { getEstadoCuentaConCache, getDolarMEP, clearEstadoCuentaCache, getOrdenesHistoricasConCache, getMovimientosHistoricosConCache, getDividendosPorTicker, getRentasPorTicker, getOperacionesPorTicker, MovimientoHistorico } from '../services/balanzApi';
import { getDolarHistoricoCacheInfo, clearDolarHistoricoCache, getCotizacionesHistoricas, getDolarParaFechaDesdeCotizaciones } from '../services/dolarHistoricoApi';
import { preserveAuthTokens } from '../utils/cacheHelpers';
import { clearCache } from '../utils/cacheManager';
import { normalizeTicker, tickersMatch } from '../utils/tickerHelpers';
import { useTickerCache } from '../hooks/useTickerCache';
import TickerHeader from './TickerHeader';
import TickerChart from './TickerChart';
import TickerOrders from './TickerOrders';
import CacheSection from './CacheSection';
import BondCashflow from './BondCashflow';
import HistoricalSummary from './HistoricalSummary';
import HistoricalTickerView from './HistoricalTickerView';

// Función para normalizar fechas a formato YYYY-MM-DD
function normalizarFecha(fecha: string): string {
  if (!fecha) return '';
  
  // Si ya está en formato YYYY-MM-DD
  if (fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return fecha;
  }
  
  // Si viene en formato DD/MM/YYYY
  if (fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [dia, mes, anio] = fecha.split('/');
    return `${anio}-${mes}-${dia}`;
  }
  
  // Si viene con hora (YYYY-MM-DDTHH:mm:ss)
  const fechaSinHora = fecha.split('T')[0].trim();
  if (fechaSinHora.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return fechaSinHora;
  }
  
  // Intentar parsear como Date
  try {
    const date = new Date(fecha);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // Ignorar error
  }
  
  return fecha; // Retornar original si no se pudo normalizar
}

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
  const [precioPromedioVenta, setPrecioPromedioVenta] = useState<number | undefined>(undefined);
  const [valorInicialConsolidado, setValorInicialConsolidado] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dolarMEP, setDolarMEP] = useState<number | null>(null);
  const [operaciones, setOperaciones] = useState<Array<{
    tipo: 'COMPRA' | 'VENTA' | 'LIC' | 'RESCATE_PARCIAL';
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [historicalTickers, setHistoricalTickers] = useState<Array<{ ticker: string; lastSaleDate?: string }>>([]);
  const [tickerDescriptions, setTickerDescriptions] = useState<Map<string, string>>(new Map());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isHistoricalOnly, setIsHistoricalOnly] = useState(false);
  const [historicalSummary, setHistoricalSummary] = useState<{
    totalComprado: number;
    totalVendido: number;
    gananciaPerdida: number;
    gananciaPerdidaPorcentaje: number;
    ppc: number;
    precioPromedioVenta: number;
    cantidadTotalComprada: number;
    cantidadTotalVendida: number;
    primeraOperacion?: string;
    ultimaOperacion?: string;
  } | null>(null);

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
    const cashFlowFuturo = tickerInfo.bond.cashFlow.filter((cf: any) => {
      const cfDate = new Date(cf.date);
      cfDate.setHours(0, 0, 0, 0);
      return cfDate >= today;
    });
    
    const valorATermino = cashFlowFuturo.reduce((acc: number, cf: any) => {
      return acc + (unidades * (cf.cashflow || 0));
    }, 0);
    
    // Calcular rentas pasadas usando rentas reales (de movimientos históricos)
    // Si hay rentas reales, usarlas (son las que realmente se recibieron)
    const rentasPasadas = rentas && Array.isArray(rentas) && rentas.length > 0
      ? rentas.reduce((acc: number, renta: any) => acc + (renta.montoNeto || 0), 0)
      : tickerInfo.bond.cashFlow.reduce((acc: number, cf: any) => {
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
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    // Si ya está en formato YYYY-MM-DD, convertir a DD/MM/YYYY
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    }
    // Si está en formato DD/MM/YYYY, retornar tal cual
    if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      return dateStr;
    }
    // Intentar parsear como Date
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      }
    } catch (e) {
      // Ignorar error
    }
    return dateStr;
  };

  // Cargar tickers históricos desde movimientos
  useEffect(() => {
    const loadHistoricalTickers = async () => {
      try {
        const fechaHasta = new Date();
        const fechaDesde = new Date('2021-09-05');
        const fechaDesdeStr = fechaDesde.toISOString().split('T')[0].replace(/-/g, '');
        const fechaHastaStr = fechaHasta.toISOString().split('T')[0].replace(/-/g, '');
        
        const movimientosResult = await getMovimientosHistoricosConCache(fechaDesdeStr, fechaHastaStr);
        
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
            let movimientosHistoricos: any[] = [];
            try {
              const fechaHasta = new Date();
              const fechaDesde = new Date('2021-09-05');
              const fechaDesdeStr = fechaDesde.toISOString().split('T')[0].replace(/-/g, '');
              const fechaHastaStr = fechaHasta.toISOString().split('T')[0].replace(/-/g, '');
              const movimientosResult = await getMovimientosHistoricosConCache(fechaDesdeStr, fechaHastaStr);
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
      // Resetear estados al cambiar ticker
      setIsHistoricalOnly(false);
      setHistoricalSummary(null);
      setError(null);
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
            // Incluir órdenes con Estado "Ejecutada" o "Parcialmente Cancelada"
            // Usar comparación normalizada para manejar variaciones con espacios
            const tickerNormalizado = normalizeTicker(selectedTicker);
            const ordenesTicker = ordenesResult.data.filter((o: any) => 
              tickersMatch(o.Ticker, tickerNormalizado) && (o.Estado === 'Ejecutada' || o.Estado === 'Parcialmente Cancelada')
            );
            // Mapear al modelo esperado por TickerOrders
            const operacionesMapped = ordenesTicker.map((o: any) => {
              let tipo: 'COMPRA' | 'VENTA' | 'LIC' | 'RESCATE_PARCIAL' = 'VENTA';
              const operacionStr = typeof o.Operacion === 'string' ? o.Operacion.toUpperCase() : '';
              if (operacionStr.includes('RESCATE PARCIAL') || operacionStr.includes('RESCATE_PARCIAL')) {
                tipo = 'RESCATE_PARCIAL';
              } else if (operacionStr.includes('LICITACIÓN') || operacionStr.includes('LICITACION')) {
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
              
              // Obtener cantidad para usar en cálculos - priorizar CantidadOperada
              const cantidad = Number(
                (o.CantidadOperada !== undefined && o.CantidadOperada !== -1) 
                  ? o.CantidadOperada 
                  : (o.Cantidad ?? 0)
              );
              
              // Determinar precio original: priorizar PrecioOperado sobre Precio
              let precioOriginal: number | undefined;
              const precioValue = typeof o.Precio === 'number' ? o.Precio : undefined;
              const precioOperadoValue = typeof o['Precio Operado'] === 'number' ? o['Precio Operado'] : undefined;
              
              // Priorizar PrecioOperado si está disponible y es válido
              if (precioOperadoValue !== undefined && precioOperadoValue !== -1) {
                precioOriginal = precioOperadoValue;
              } else if (precioValue !== undefined && precioValue !== -1) {
                precioOriginal = precioValue;
              } else if (montoOriginal !== undefined && cantidad > 0) {
                // Calcular precio dividiendo monto por cantidad
                precioOriginal = montoOriginal / cantidad;
              } else {
                precioOriginal = undefined;
              }
              
              // Calcular monto ajustado: usar CantidadOperada * PrecioOperado cuando estén disponibles
              let montoAjustado: number | undefined;
              const cantidadOperada = (o.CantidadOperada !== undefined && o.CantidadOperada !== -1) ? o.CantidadOperada : undefined;
              const precioOperado = (o['Precio Operado'] !== undefined && o['Precio Operado'] !== -1) ? o['Precio Operado'] : undefined;
              
              if (cantidadOperada !== undefined && precioOperado !== undefined && cantidadOperada > 0) {
                // Calcular monto usando cantidad y precio realmente operados
                montoAjustado = cantidadOperada * precioOperado;
              } else if (montoOriginal !== undefined && cantidad > 0 && precioOriginal !== undefined) {
                // Calcular monto usando cantidad ajustada y precio
                montoAjustado = cantidad * precioOriginal;
              } else {
                // Fallback al monto original si no se puede calcular
                montoAjustado = montoOriginal;
              }
              
              let precioUSD = precioOriginal || 0;
              let montoUSD = montoAjustado || 0;
              let costoOperacionUSD = 0;
              let dolarUsado = 0;
              // Si la operación es en ARS, convertir a USD usando el dólar histórico de la fecha
              if (moneda === 'ARS' && precioOriginal && montoAjustado) {
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
                  montoUSD = montoAjustado / dolarUsado;
                  costoOperacionUSD = costoOriginal / dolarUsado;
                } else {
                  console.warn(`⚠️ No se pudo obtener dólar para fecha ${fechaOp}, operación sin convertir`);
                }
              } else {
                // Si ya está en USD, usar los valores ajustados
                precioUSD = precioOriginal || 0;
                montoUSD = montoAjustado || 0;
                costoOperacionUSD = costoOriginal || 0;
              }
              
              // Normalizar fecha a formato YYYY-MM-DD
              const fechaRaw = String(o.Fecha || o.FechaLiquidacion || '');
              const fechaNormalizada = normalizarFecha(fechaRaw);
              
              return {
                tipo,
                fecha: fechaNormalizada,
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
                montoOriginal: montoAjustado, // Usar monto ajustado como montoOriginal
                costoOriginal,
                monedaOriginal: moneda,
                dolarUsado
              };
            });
            
            // También obtener operaciones desde movimientos históricos (incluye rescates parciales)
            let operacionesDesdeMovimientos: typeof operacionesMapped = [];
            try {
              const fechaHasta = new Date();
              const fechaDesde = new Date('2021-09-05');
              const fechaDesdeStr = fechaDesde.toISOString().split('T')[0].replace(/-/g, '');
              const fechaHastaStr = fechaHasta.toISOString().split('T')[0].replace(/-/g, '');
              const movimientosResult = await getMovimientosHistoricosConCache(fechaDesdeStr, fechaHastaStr);
              
              if (movimientosResult.data && dolarMEP) {
                const opsDesdeMovs = await getOperacionesPorTicker(
                  movimientosResult.data,
                  selectedTicker,
                  dolarMEP
                );
                // Mapear al tipo de operaciones esperado y normalizar fechas
                operacionesDesdeMovimientos = opsDesdeMovs.map(op => ({
                  tipo: op.tipo,
                  fecha: normalizarFecha(op.fecha),
                  cantidad: op.cantidad,
                  precioUSD: op.precioUSD,
                  montoUSD: op.montoUSD,
                  costoOperacionUSD: op.costoOperacionUSD,
                  descripcion: op.descripcion,
                  precioOriginal: op.precioOriginal,
                  montoOriginal: op.precioOriginal && op.cantidad > 0 ? op.precioOriginal * op.cantidad : undefined,
                  costoOriginal: op.costoOriginal,
                  monedaOriginal: op.monedaOriginal,
                  dolarUsado: op.dolarUsado
                }));
              }
            } catch (error) {
              console.warn('⚠️ Error al cargar operaciones desde movimientos históricos:', error);
            }
            
            // Priorizar órdenes sobre movimientos para evitar duplicados
            // Estrategia: usar órdenes como fuente principal, y solo agregar rescates parciales de movimientos
            const operacionesAgrupadas = new Map<string, typeof operacionesMapped[0]>();
            
            // Primero, agregar todas las operaciones de órdenes (fuente principal)
            operacionesMapped.forEach(op => {
              if (op.tipo === 'RESCATE_PARCIAL') {
                // Para rescates parciales, agrupar por fecha y sumar cantidades
                const key = `${op.tipo}_${op.fecha}`;
                if (operacionesAgrupadas.has(key)) {
                  const existente = operacionesAgrupadas.get(key)!;
                  existente.cantidad += op.cantidad;
                  existente.montoUSD += op.montoUSD;
                  if (existente.cantidad > 0) {
                    existente.precioUSD = existente.montoUSD / existente.cantidad;
                  }
                } else {
                  operacionesAgrupadas.set(key, { ...op });
                }
              } else if (op.tipo === 'LIC' || op.tipo === 'COMPRA') {
                // Para LIC y COMPRA, buscar si ya existe una operación similar (misma fecha, cantidad, precio similar)
                let esDuplicado = false;
                
                for (const [existingKey, existingOp] of operacionesAgrupadas.entries()) {
                  if (existingOp.fecha === op.fecha && 
                      existingOp.cantidad === op.cantidad &&
                      (existingOp.tipo === 'LIC' || existingOp.tipo === 'COMPRA')) {
                    // Verificar si el precio es similar (tolerancia de $0.10 o 0.5%)
                    const diferenciaAbsoluta = Math.abs(existingOp.precioUSD - op.precioUSD);
                    const diferenciaPorcentual = existingOp.precioUSD > 0 ? (diferenciaAbsoluta / existingOp.precioUSD) * 100 : 0;
                    
                    if (diferenciaAbsoluta < 0.10 || diferenciaPorcentual < 0.5) {
                      esDuplicado = true;
                      // Priorizar LIC sobre COMPRA
                      if (op.tipo === 'LIC' && existingOp.tipo === 'COMPRA') {
                        operacionesAgrupadas.set(existingKey, { ...op });
                      }
                      break;
                    }
                  }
                }
                
                if (!esDuplicado) {
                  const key = `LIC_COMPRA_${op.fecha}_${op.cantidad}_${Math.round(op.precioUSD * 100) / 100}`;
                  operacionesAgrupadas.set(key, { ...op });
                }
              } else {
                // Para VENTA, buscar duplicados similares
                let esDuplicado = false;
                for (const [, existingOp] of operacionesAgrupadas.entries()) {
                  if (existingOp.fecha === op.fecha && 
                      existingOp.cantidad === op.cantidad &&
                      existingOp.tipo === op.tipo) {
                    const diferenciaAbsoluta = Math.abs(existingOp.precioUSD - op.precioUSD);
                    const diferenciaPorcentual = existingOp.precioUSD > 0 ? (diferenciaAbsoluta / existingOp.precioUSD) * 100 : 0;
                    
                    if (diferenciaAbsoluta < 0.10 || diferenciaPorcentual < 0.5) {
                      esDuplicado = true;
                      break;
                    }
                  }
                }
                
                if (!esDuplicado) {
                  const key = `${op.tipo}_${op.fecha}_${op.cantidad}_${Math.round(op.precioUSD * 100) / 100}`;
                  operacionesAgrupadas.set(key, { ...op });
                }
              }
            });
            
            // Luego, agregar solo rescates parciales de movimientos (que no están en órdenes)
            // SOLO procesar rescates parciales, ignorar COMPRA y VENTA de movimientos
            operacionesDesdeMovimientos.forEach(op => {
              if (op.tipo === 'RESCATE_PARCIAL') {
                // Para rescates parciales, agrupar por fecha y sumar cantidades
                const key = `${op.tipo}_${op.fecha}`;
                if (operacionesAgrupadas.has(key)) {
                  const existente = operacionesAgrupadas.get(key)!;
                  existente.cantidad += op.cantidad;
                  existente.montoUSD += op.montoUSD;
                  if (existente.cantidad > 0) {
                    existente.precioUSD = existente.montoUSD / existente.cantidad;
                  }
                } else {
                  operacionesAgrupadas.set(key, { ...op });
                }
              }
              // Ignorar completamente COMPRA y VENTA de movimientos
            });
            
            const operacionesUnicas = Array.from(operacionesAgrupadas.values());
            
            // Ordenar por fecha descendente
            operacionesUnicas.sort((a, b) => b.fecha.localeCompare(a.fecha));
            
            setOperaciones(operacionesUnicas);
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
      // Cargar movimientos históricos para detectar fondos históricos
      let movimientosHistoricos: any[] = [];
      try {
        const fechaHasta = new Date();
        const fechaDesde = new Date('2021-09-05');
        const fechaDesdeStr = fechaDesde.toISOString().split('T')[0].replace(/-/g, '');
        const fechaHastaStr = fechaHasta.toISOString().split('T')[0].replace(/-/g, '');
        const movimientosResult = await getMovimientosHistoricosConCache(fechaDesdeStr, fechaHastaStr);
        movimientosHistoricos = movimientosResult.data || [];
      } catch (error) {
        console.warn('⚠️ No se pudieron cargar movimientos para detección de fondos:', error);
      }
      
      // El hook useTickerCache ya maneja la verificación de caché
      // Intentar cargar datos de cotización y datos históricos en paralelo
      const [quoteResult, candlesResult] = await Promise.allSettled([
        getTickerQuote(ticker, positions, movimientosHistoricos),
        getTickerCandles(ticker, 730, positions, movimientosHistoricos) // Últimos 2 años
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
      
      // Si no tenemos ni quote ni datos históricos, marcar como histórico solamente
      if (!quote) {
        setIsHistoricalOnly(true);
        setTickerInfo(null);
        setHistoricalData([]);
        setLoading(false);
        // Calcular resumen desde operaciones históricas
        await calcularResumenHistorico(ticker);
        return;
      }
      
      // Si tenemos quote, no es histórico solamente
      setIsHistoricalOnly(false);

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
      
      // Siempre calcular resumen histórico si hay operaciones, incluso cuando tenemos datos de la API
      // Esto permite mostrar el resumen histórico junto con la información del ticker
      await calcularResumenHistorico(ticker);
    } catch (err) {
      console.error('❌ Error al obtener información:', err);
      // Si es error de "No se encontró información", intentar formato histórico
      if (err instanceof Error && err.message.includes('No se encontró información')) {
        setIsHistoricalOnly(true);
        setTickerInfo(null);
        setHistoricalData([]);
        setError(null);
        // Calcular resumen desde operaciones históricas
        await calcularResumenHistorico(selectedTicker);
      } else {
      setError('No se pudo obtener información del ticker. Por favor verifica que el símbolo sea correcto.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Calcular resumen histórico desde operaciones
  const calcularResumenHistorico = async (ticker: string) => {
    try {
      // Obtener operaciones históricas
      const fechaHasta = new Date();
      const fechaDesde = new Date('2021-09-05');
      const fechaDesdeStr = fechaDesde.toISOString().split('T')[0].replace(/-/g, '');
      const fechaHastaStr = fechaHasta.toISOString().split('T')[0].replace(/-/g, '');
      
      const [movimientosResult, ordenesResult] = await Promise.all([
        getMovimientosHistoricosConCache(fechaDesdeStr, fechaHastaStr),
        getOrdenesHistoricasConCache(fechaDesdeStr, fechaHastaStr)
      ]);

      // Obtener dolarMEP para conversiones
      let dolarMEPValue = dolarMEP;
      if (!dolarMEPValue) {
        try {
          const estadoCuentaResult = await getEstadoCuentaConCache();
          if (estadoCuentaResult.data?.cotizacionesDolar) {
            dolarMEPValue = getDolarMEP(estadoCuentaResult.data.cotizacionesDolar);
          }
        } catch (e) {
          console.warn('No se pudo obtener dolarMEP');
        }
      }

      // Obtener operaciones desde movimientos
      let operacionesDesdeMovimientos: typeof operaciones = [];
      if (movimientosResult.data && dolarMEPValue) {
        const opsDesdeMovs = await getOperacionesPorTicker(
          movimientosResult.data,
          ticker,
          dolarMEPValue
        );
        operacionesDesdeMovimientos = opsDesdeMovs.map(op => ({
          tipo: op.tipo,
          fecha: normalizarFecha(op.fecha),
          cantidad: op.cantidad,
          precioUSD: op.precioUSD,
          montoUSD: op.montoUSD,
          costoOperacionUSD: op.costoOperacionUSD,
          descripcion: op.descripcion,
          precioOriginal: op.precioOriginal,
          montoOriginal: op.precioOriginal && op.cantidad > 0 ? op.precioOriginal * op.cantidad : undefined,
          costoOriginal: op.costoOriginal,
          monedaOriginal: op.monedaOriginal,
          dolarUsado: op.dolarUsado
        }));
      }

      // Obtener operaciones desde órdenes
      let operacionesDesdeOrdenes: typeof operaciones = [];
      if (ordenesResult.data && dolarMEPValue) {
        // Usar comparación normalizada para manejar variaciones con espacios
        const tickerNormalizado = normalizeTicker(ticker);
        const ordenesTicker = ordenesResult.data.filter((o: any) => 
          tickersMatch(o.Ticker, tickerNormalizado) && (o.Estado === 'Ejecutada' || o.Estado === 'Parcialmente Cancelada')
        );

        // Obtener cotizaciones históricas del dólar
        const cotizacionesHistoricas = await getCotizacionesHistoricas();

        operacionesDesdeOrdenes = ordenesTicker.map((o: any) => {
          let tipo: 'COMPRA' | 'VENTA' | 'LIC' | 'RESCATE_PARCIAL' = 'VENTA';
          const operacionStr = typeof o.Operacion === 'string' ? o.Operacion.toUpperCase() : '';
          if (operacionStr.includes('RESCATE PARCIAL') || operacionStr.includes('RESCATE_PARCIAL')) {
            tipo = 'RESCATE_PARCIAL';
          } else if (operacionStr.includes('LICITACIÓN') || operacionStr.includes('LICITACION')) {
            tipo = 'LIC';
          } else if (operacionStr.includes('SUSCRIPCIÓN') || operacionStr.includes('SUSCRIPCION')) {
            tipo = 'COMPRA'; // Suscripciones de fondos son compras
          } else if (operacionStr.includes('COMPRA')) {
            tipo = 'COMPRA';
          }

          let moneda = String(o.Moneda || '');
          if (moneda.toUpperCase() === 'PESOS') moneda = 'ARS';
          if (moneda.toUpperCase().includes('ARS')) moneda = 'ARS';

          // Para suscripciones, usar CantidadOperada cuando Cantidad es -1
          const cantidad = Number(
            (o.Cantidad === -1 && o.CantidadOperada !== undefined && o.CantidadOperada !== -1)
              ? o.CantidadOperada
              : (o.CantidadOperada !== undefined && o.CantidadOperada !== -1) 
                ? o.CantidadOperada 
                : (o.Cantidad ?? 0)
          );

          let precioOriginal: number | undefined;
          const precioValue = typeof o.Precio === 'number' ? o.Precio : undefined;
          const precioOperadoValue = typeof o['Precio Operado'] === 'number' ? o['Precio Operado'] : undefined;
          
          // Para suscripciones, si PrecioOperado es -1, calcular desde Monto y CantidadOperada
          if (tipo === 'COMPRA' && (operacionStr.includes('SUSCRIPCIÓN') || operacionStr.includes('SUSCRIPCION'))) {
            const montoOriginal = typeof o.Monto === 'number' ? o.Monto : undefined;
            if (montoOriginal && cantidad > 0) {
              precioOriginal = montoOriginal / cantidad;
            } else if (precioOperadoValue !== undefined && precioOperadoValue !== -1) {
              precioOriginal = precioOperadoValue;
            } else if (precioValue !== undefined && precioValue !== -1) {
              precioOriginal = precioValue;
            }
          } else {
            if (precioOperadoValue !== undefined && precioOperadoValue !== -1) {
              precioOriginal = precioOperadoValue;
            } else if (precioValue !== undefined && precioValue !== -1) {
              precioOriginal = precioValue;
            }
          }

          const montoOriginal = typeof o.Monto === 'number' ? o.Monto : undefined;
          const costoOriginal = typeof o.Costos === 'number' ? o.Costos : 0;

          // Obtener fecha raw antes de cualquier procesamiento
          const fechaRaw = String(o.Fecha || o.FechaLiquidacion || '');

          let precioUSD = precioOriginal || 0;
          let montoUSD = montoOriginal || 0;
          let costoOperacionUSD = 0;
          let dolarUsado = 0;

          if (moneda === 'ARS' && precioOriginal && montoOriginal) {
            let fechaOp = fechaRaw.split('T')[0].trim();
            
            if (fechaOp && fechaOp.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
              const [dia, mes, anio] = fechaOp.split('/');
              fechaOp = `${anio}-${mes}-${dia}`;
            }
            
            if (fechaOp && fechaOp.match(/^\d{4}-\d{2}-\d{2}$/)) {
              if (cotizacionesHistoricas.length > 0) {
                dolarUsado = getDolarParaFechaDesdeCotizaciones(cotizacionesHistoricas, fechaOp) || 0;
              }
            }
            
            if (!dolarUsado || dolarUsado === 0) {
              dolarUsado = dolarMEPValue || 0;
            }
            
            if (dolarUsado > 0) {
              precioUSD = precioOriginal / dolarUsado;
              montoUSD = montoOriginal / dolarUsado;
              costoOperacionUSD = costoOriginal / dolarUsado;
            }
          } else {
            precioUSD = precioOriginal || 0;
            montoUSD = montoOriginal || 0;
            costoOperacionUSD = costoOriginal || 0;
          }

          const fechaNormalizada = normalizarFecha(fechaRaw);

          return {
            tipo,
            fecha: fechaNormalizada,
            cantidad,
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
      }

      // Combinar operaciones (priorizar órdenes, agregar rescates de movimientos)
      const todasLasOperaciones = [...operacionesDesdeOrdenes];
      operacionesDesdeMovimientos.forEach(op => {
        if (op.tipo === 'RESCATE_PARCIAL') {
          // Solo agregar rescates parciales que no estén en órdenes
          const existe = todasLasOperaciones.some(existente => 
            existente.tipo === 'RESCATE_PARCIAL' && existente.fecha === op.fecha
          );
          if (!existe) {
            todasLasOperaciones.push(op);
          }
        }
      });

      // Ordenar por fecha
      todasLasOperaciones.sort((a, b) => a.fecha.localeCompare(b.fecha));

      // Calcular resumen
      const compras = todasLasOperaciones.filter(op => op.tipo === 'COMPRA' || op.tipo === 'LIC');
      const ventas = todasLasOperaciones.filter(op => op.tipo === 'VENTA');
      const rescates = todasLasOperaciones.filter(op => op.tipo === 'RESCATE_PARCIAL');

      const totalComprado = compras.reduce((sum, op) => sum + op.montoUSD + op.costoOperacionUSD, 0);
      const totalVendido = ventas.reduce((sum, op) => sum + op.montoUSD, 0);
      const totalRescates = rescates.reduce((sum, op) => sum + op.montoUSD, 0);

      const cantidadTotalComprada = compras.reduce((sum, op) => sum + op.cantidad, 0);
      const cantidadTotalVendida = ventas.reduce((sum, op) => sum + op.cantidad, 0);
      const cantidadTotalRescatada = rescates.reduce((sum, op) => sum + op.cantidad, 0);

      const ppc = cantidadTotalComprada > 0 ? totalComprado / cantidadTotalComprada : 0;
      const precioPromedioVenta = cantidadTotalVendida > 0 
        ? totalVendido / cantidadTotalVendida 
        : 0;

      const gananciaPerdida = totalVendido + totalRescates - totalComprado;
      const gananciaPerdidaPorcentaje = totalComprado > 0 
        ? (gananciaPerdida / totalComprado) * 100 
        : 0;

      const primeraOperacion = todasLasOperaciones.length > 0 
        ? todasLasOperaciones[0].fecha 
        : undefined;
      const ultimaOperacion = todasLasOperaciones.length > 0 
        ? todasLasOperaciones[todasLasOperaciones.length - 1].fecha 
        : undefined;

      setHistoricalSummary({
        totalComprado,
        totalVendido: totalVendido + totalRescates,
        gananciaPerdida,
        gananciaPerdidaPorcentaje,
        ppc,
        precioPromedioVenta,
        cantidadTotalComprada,
        cantidadTotalVendida: cantidadTotalVendida + cantidadTotalRescatada,
        primeraOperacion,
        ultimaOperacion
      });

      // También establecer las operaciones para mostrar en TickerOrders
      setOperaciones(todasLasOperaciones);
    } catch (error) {
      console.error('❌ Error al calcular resumen histórico:', error);
      setHistoricalSummary(null);
    }
  };

  const formatLargeNumber = (num: number): string => {
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  };

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
                      clearCache(`balanz_movimientos_${fechaDesde}_${fechaHasta}`);
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
