// Tipos para los datos de Balanz

export interface Boleto {
  Especie: string;
  'Num Boleto': number;
  Ticker: string;
  Tipo: 'COMPRA' | 'VENTA';
  Concertacion: string;
  Liquidacion: string;
  Cantidad: number;
  Precio: number;
  Bruto: number;
  'Costos Mercado': number;
  Arancel: number;
  Neto: number;
  Moneda: string;
}

export interface Movimiento {
  Descripcion: string;
  Ticker: string;
  'Tipo de Instrumento': string;
  Concertacion: string;
  Cantidad: number;
  Precio: number;
  Liquidacion: string;
  Moneda: string;
  Importe: number;
}

export interface CuentaCorriente {
  Descripcion: string;
  Fecha: string;
  Cantidad: number;
  Moneda: string;
  Importe: number;
}

export interface Orden {
  Operacion: string;
  Estado: string;
  'id Orden': number;
  Ticker: string;
  Moneda: string;
  [key: string]: any;
}

export interface BalanzOperation {
  Cantidad: number;
  Descripcion: string;
  Fecha: string;
  FechaCompra: string;
  Gastos: number;
  'Moneda Compra': string;
  'Moneda Venta': string;
  'Operacion Compra': string;
  'Operacion Venta': string;
  'Precio Compra': number;
  PrecioVenta: number;
  Ticker: string;
  Tipo: string;
  'Tipo Movimiento': string;
  OperacionCompraDolarCCL: number;
  OperacionCompraDolarMEP: number;
  OperacionCompraDolarOficial: number;
  OperacionVentaDolarCCL: number;
  OperacionVentaDolarMEP: number;
  OperacionVentaDolarOficial: number;
}

export interface BalanzPosition {
  Cantidad: number;
  Descripcion: string;
  Fecha: string;
  'Fecha Lote': string;
  Gastos: number;
  Moneda: string;
  Operacion: string;
  'Precio Compra': number;
  Ticker: string;
  Tipo: string;
  DolarCCL: number;
  DolarMEP: number;
  DolarOficial: number;
}

export interface BalanzData {
  boletos: {
    boletos: Boleto[];
  };
  cuentacorriente: {
    cuentacorriente: CuentaCorriente[];
  };
  movimientos: {
    movimientos: Movimiento[];
  };
  ordenes: {
    ordenes: Orden[];
  };
  resultados_por_info_completa: {
    resultados_por_lotes_iniciales: any[];
    resultados_por_realizado: BalanzOperation[];
    resultados_por_lotes_finales: BalanzPosition[];
  };
}
