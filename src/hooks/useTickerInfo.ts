import { useState, useCallback } from 'react';
import { getTickerQuote, getTickerCandles } from '../services/tickerApi';
import { getMovimientosHistoricosConCache, getDolarMEP, getEstadoCuentaConCache, getOrdenesHistoricasConCache, getOperacionesPorTicker } from '../services/balanzApi';
import { getCotizacionesHistoricas } from '../services/dolarHistoricoApi';
import { normalizeTicker, tickersMatch, normalizarFecha, getFechaRangoHistorico } from '../utils/tickerHelpers';
import { formatLargeNumber } from '../utils/chartHelpers';
import { CandleData, Operacion } from '../types';
import { Position, Orden } from '../types/balanz';
import { MovimientoHistorico } from '../services/balanzApi';
import { mapOrdenToOperacion } from '../utils/orderMappers';

export interface TickerInfo {
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
  mappedSymbol?: string;
  description?: string;
  type?: string;
  category?: string;
  lastClose?: number;
  open?: number;
  marketId?: string;
  tickerCurrency?: string;
  ratio?: string;
  bond?: {
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
    type?: string;
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

export interface HistoricalSummary {
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
}


export function useTickerInfo(positions: Position[]) {
  const [tickerInfo, setTickerInfo] = useState<TickerInfo | null>(null);
  const [historicalData, setHistoricalData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHistoricalOnly, setIsHistoricalOnly] = useState(false);
  const [historicalSummary, setHistoricalSummary] = useState<HistoricalSummary | null>(null);
  const [historicalOperations, setHistoricalOperations] = useState<Operacion[]>([]);

  const calcularResumenHistorico = useCallback(async (ticker: string, dolarMEP: number | null) => {
    try {
      const { fechaDesde, fechaHasta } = getFechaRangoHistorico();
      
      const [movimientosResult, ordenesResult] = await Promise.all([
        getMovimientosHistoricosConCache(fechaDesde, fechaHasta),
        getOrdenesHistoricasConCache(fechaDesde, fechaHasta)
      ]);

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

      let operacionesDesdeMovimientos: Operacion[] = [];
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

      let operacionesDesdeOrdenes: Operacion[] = [];
      if (ordenesResult.data && dolarMEPValue) {
        const tickerNormalizado = normalizeTicker(ticker);
        const ordenesTicker = ordenesResult.data.filter((o: Orden) => 
          tickersMatch(o.Ticker, tickerNormalizado) && (o.Estado === 'Ejecutada' || o.Estado === 'Parcialmente Cancelada')
        );

        const cotizacionesHistoricas = await getCotizacionesHistoricas();

        operacionesDesdeOrdenes = ordenesTicker.map((o: Orden) => 
          mapOrdenToOperacion(o, cotizacionesHistoricas, dolarMEPValue, false)
        );
      }

      const todasLasOperaciones = [...operacionesDesdeOrdenes];
      operacionesDesdeMovimientos.forEach(op => {
        if (op.tipo === 'RESCATE_PARCIAL') {
          const existe = todasLasOperaciones.some(existente => 
            existente.tipo === 'RESCATE_PARCIAL' && existente.fecha === op.fecha
          );
          if (!existe) {
            todasLasOperaciones.push(op);
          }
        }
      });

      todasLasOperaciones.sort((a, b) => a.fecha.localeCompare(b.fecha));

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

      setHistoricalOperations(todasLasOperaciones);
    } catch (error) {
      console.error('❌ Error al calcular resumen histórico:', error);
      setHistoricalSummary(null);
    }
  }, []);

  const fetchTickerInfo = useCallback(async (ticker: string, dolarMEP: number | null) => {
    setLoading(true);
    setError(null);

    try {
      let movimientosHistoricos: MovimientoHistorico[] = [];
      try {
        const { fechaDesde, fechaHasta } = getFechaRangoHistorico();
        const movimientosResult = await getMovimientosHistoricosConCache(fechaDesde, fechaHasta);
        movimientosHistoricos = movimientosResult.data || [];
      } catch (error) {
        console.warn('⚠️ No se pudieron cargar movimientos para detección de fondos:', error);
      }
      
      const [quoteResult, candlesResult] = await Promise.allSettled([
        getTickerQuote(ticker, positions, movimientosHistoricos),
        getTickerCandles(ticker, 3650, positions, movimientosHistoricos)
      ]);
      
      const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;
      const candles = candlesResult.status === 'fulfilled' 
        ? candlesResult.value 
        : { data: [], sourceUrl: '', source: 'cache' as const, cacheDate: undefined };
      
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
        return;
      }
      
      if (!quote) {
        setIsHistoricalOnly(true);
        setTickerInfo(null);
        setHistoricalData([]);
        setLoading(false);
        await calcularResumenHistorico(ticker, dolarMEP);
        return;
      }
      
      setIsHistoricalOnly(false);

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
      
      await calcularResumenHistorico(ticker, dolarMEP);
    } catch (err) {
      console.error('❌ Error al obtener información:', err);
      if (err instanceof Error && err.message.includes('No se encontró información')) {
        setIsHistoricalOnly(true);
        setTickerInfo(null);
        setHistoricalData([]);
        setError(null);
        await calcularResumenHistorico(ticker, dolarMEP);
      } else {
        setError('No se pudo obtener información del ticker. Por favor verifica que el símbolo sea correcto.');
      }
    } finally {
      setLoading(false);
    }
  }, [positions, calcularResumenHistorico]);

  return {
    tickerInfo,
    historicalData,
    loading,
    error,
    isHistoricalOnly,
    historicalSummary,
    historicalOperations,
    fetchTickerInfo,
    setTickerInfo,
    setHistoricalData,
    setError
  };
}

