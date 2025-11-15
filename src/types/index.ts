export interface CandlestickData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LineChartData {
  time: string;
  value: number;
}

export interface TradeData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: Date;
}

/**
 * Datos de vela (candlestick) para gráficos
 */
export interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Tipo de operación financiera
 */
export type TipoOperacion = 'COMPRA' | 'VENTA' | 'LIC' | 'RESCATE_PARCIAL';

/**
 * Operación financiera procesada
 */
export interface Operacion {
  tipo: TipoOperacion;
  fecha: string;
  cantidad: number;
  precioUSD: number;
  montoUSD: number;
  costoOperacionUSD: number;
  descripcion: string;
  precioOriginal?: number;
  montoOriginal?: number;
  costoOriginal?: number;
  monedaOriginal: string;
  dolarUsado: number;
}

/**
 * Dividendo recibido
 */
export interface Dividendo {
  fecha: string;
  montoBruto: number;
  impuestosRetenidos: number;
  montoNeto: number;
  moneda: string;
}

/**
 * Renta recibida (intereses, cupones, etc.)
 */
export interface Renta {
  fecha: string;
  montoBruto: number;
  impuestosRetenidos: number;
  montoNeto: number;
  moneda: string;
  esInteresDevengado: boolean;
}
