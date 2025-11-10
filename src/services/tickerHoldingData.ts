// Servicio para obtener y calcular todos los datos de tenencia de un ticker
// Unifica la lógica para CarteraActual y TickerHolding


import { getEstadoCuentaConCache } from './balanzApi';
import { getDolarParaFecha } from './dolarHistoricoApi';

export interface TickerHoldingOperation {
  cantidad: number;
  porcentajeCantidad: number;
  precioUSD: number;
  moneda: string;
  precioOriginal: number;
  dolarMEP: number;
  fechaDolarMEP?: string;
}

export interface TickerHoldingData {
  ticker: string;
  cantidadTotal: number;
  ppc: number;
  ppcDolarMEPPonderado?: number;
  precioActual: number;
  valorInicial: number;
  valorActual: number;
  rendimiento: number;
  rendimientoPorcentaje: number;
  operaciones: TickerHoldingOperation[];
}

// Recibe el ticker y todas las posiciones (de la API) y retorna los datos calculados
export async function getTickerHoldingData(ticker: string, positions: any[], dolarMEP: number): Promise<TickerHoldingData | null> {
  // Filtrar posiciones del ticker
  const tickerPositions = positions.filter(p => p.Ticker === ticker);
  if (tickerPositions.length === 0) return null;

  // Obtener tenencia actual desde la API
  const estadoCuenta = await getEstadoCuentaConCache();
  let preciosMap: Map<string, any> = new Map();
  if (estadoCuenta.data && estadoCuenta.data.tenencia) {
    estadoCuenta.data.tenencia.forEach((tenencia: any) => {
      preciosMap.set(tenencia.Ticker, tenencia);
    });
  }

  // Usar datos de la API si existen
  const datosActuales = preciosMap.get(ticker);

  // Calcular operaciones agrupadas
  const cantidadTotal = tickerPositions.reduce((sum, pos) => sum + (pos.Cantidad ?? 0), 0);
  // Para cada operación, si es en pesos, buscar el dólar MEP histórico según la fecha de compra
  const operaciones: TickerHoldingOperation[] = await Promise.all(
    tickerPositions.map(async pos => {
      let dolarHistorico = dolarMEP;
      let fechaDolarMEP = undefined;
      if (pos.Moneda === 'Pesos' && pos.Fecha) {
        // Normalizar fecha a formato YYYY-MM-DD si es necesario
        let fecha = pos.Fecha;
        if (/^\d{8}$/.test(fecha)) {
          // Si viene como YYYYMMDD
          fecha = `${fecha.slice(0,4)}-${fecha.slice(4,6)}-${fecha.slice(6,8)}`;
        }
        const historico = await getDolarParaFecha(fecha);
        if (historico) {
          dolarHistorico = historico;
          fechaDolarMEP = fecha;
        }
      }
      const precioUSD = pos.Moneda === 'Pesos' ? pos['Precio Compra'] / dolarHistorico : pos['Precio Compra'];
      return {
        cantidad: pos.Cantidad,
        porcentajeCantidad: cantidadTotal > 0 ? (pos.Cantidad / cantidadTotal) * 100 : 0,
        precioUSD,
        moneda: pos.Moneda,
        precioOriginal: pos['Precio Compra'],
        dolarMEP: dolarHistorico,
        fechaDolarMEP
      };
    })
  );

  // Si hay datos de API, usar esos valores
  if (datosActuales) {
    return {
      ticker,
      cantidadTotal: datosActuales.Cantidad,
      ppc: datosActuales.PPP,
      precioActual: datosActuales.Precio,
      valorInicial: datosActuales.ValorInicial,
      valorActual: datosActuales.ValorActual,
      rendimiento: datosActuales.NoRealizado,
      rendimientoPorcentaje: datosActuales.PorcRendimiento,
      operaciones
    };
  }

  // Si no hay datos de API, calcular localmente
  const sumaPrecioCantidad = operaciones.reduce((sum, op) => sum + (op.precioUSD * op.cantidad), 0);
  const ppc = cantidadTotal > 0 ? sumaPrecioCantidad / cantidadTotal : 0;
  // Calcular promedio ponderado de dólar MEP usado para PPC (solo para operaciones en pesos)
  const sumaDolarMEPPonderado = operaciones.reduce((sum, op) =>
    op.moneda === 'Pesos' ? sum + (op.dolarMEP * op.cantidad) : sum, 0);
  const cantidadPesos = operaciones.reduce((sum, op) =>
    op.moneda === 'Pesos' ? sum + op.cantidad : sum, 0);
  const ppcDolarMEPPonderado = cantidadPesos > 0 ? sumaDolarMEPPonderado / cantidadPesos : undefined;

  const valorInicial = ppc * cantidadTotal;
  // Usar el último precio disponible como precio actual
  const precioActual = tickerPositions[0]?.Precio ?? ppc;
  const valorActual = precioActual * cantidadTotal;
  const rendimiento = valorActual - valorInicial;
  const rendimientoPorcentaje = valorInicial > 0 ? (rendimiento / valorInicial) * 100 : 0;

  return {
    ticker,
    cantidadTotal,
    ppc,
    ppcDolarMEPPonderado,
    precioActual,
    valorInicial,
    valorActual,
    rendimiento,
    rendimientoPorcentaje,
    operaciones
  };
}
