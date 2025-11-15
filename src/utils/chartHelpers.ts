import { CandlestickData } from '../types';
import { formatearFechaParaMostrar } from './tickerHelpers';

/**
 * Genera datos de ejemplo para gráficos de velas (candlestick)
 */
export const generateCandlestickData = (days: number = 30): CandlestickData[] => {
  const data: CandlestickData[] = [];
  let basePrice = 100;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    const open = basePrice + (Math.random() - 0.5) * 5;
    const close = open + (Math.random() - 0.5) * 10;
    const high = Math.max(open, close) + Math.random() * 5;
    const low = Math.min(open, close) - Math.random() * 5;
    const volume = Math.floor(Math.random() * 1000000) + 500000;

    data.push({
      time: date.toISOString().split('T')[0],
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    basePrice = close;
  }

  return data;
};

/**
 * Formatea números como moneda
 */
export const formatCurrency = (value: number): string => {
  // Si el número es muy pequeño (menos de 1), usar hasta 8 decimales
  const decimals = Math.abs(value) < 1 ? 8 : 2;
  
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(value);
};

/**
 * Formatea porcentajes
 */
export const formatPercent = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
};

/**
 * Formatea números grandes en formato abreviado (K, M, B, T)
 * Útil para volumen, market cap, etc.
 */
export const formatLargeNumber = (value: number): string => {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
};

/**
 * Formatea volumen en formato abreviado (K, M, B)
 * @deprecated Usar formatLargeNumber en su lugar
 */
export const formatVolume = formatLargeNumber;

/**
 * Formatea una fecha a formato DD/MM/YYYY
 * Acepta varios formatos de entrada: YYYY-MM-DD, DD/MM/YYYY, o Date object
 * @deprecated Usar formatearFechaParaMostrar de tickerHelpers.ts en su lugar
 */
export const formatearFecha = formatearFechaParaMostrar;
