// Servicio para obtener y calcular todos los datos de tenencia de un ticker
// Unifica la lógica para CarteraActual y TickerHolding

import { getEstadoCuentaConCache, getMovimientosHistoricosConCache, getOperacionesPorTicker } from './balanzApi';
import { getDolarParaFecha } from './dolarHistoricoApi';
import { normalizeTicker, tickersMatch } from '../utils/tickerHelpers';

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
  ppcDesdeOperaciones?: number; // PPC calculado desde operaciones históricas completas
  precioActual: number;
  valorInicial: number;
  valorInicialConsolidado?: number; // Inversión consolidada calculada desde operaciones históricas
  valorActual: number;
  rendimiento: number;
  rendimientoPorcentaje: number;
  precioPromedioVenta?: number; // Precio promedio de venta (promedio ponderado por cantidad)
  operaciones: TickerHoldingOperation[];
}

/**
 * Resultado del cálculo desde operaciones históricas
 */
interface CalculoDesdeOperaciones {
  ppc: number | undefined;
  valorInicialConsolidado: number | undefined;
  precioPromedioVenta: number | undefined;
}

/**
 * Calcula PPC, inversión consolidada y precio promedio de venta desde operaciones históricas
 * Esta función procesa todas las operaciones (compras, ventas, rescates) en orden cronológico
 * y calcula:
 * - PPC: Precio promedio de compra actual
 * - Inversión consolidada: Costo total acumulado actual
 * - Precio promedio de venta: Promedio ponderado de todas las ventas realizadas
 */
async function calcularDesdeOperacionesHistoricas(ticker: string, dolarMEP: number): Promise<CalculoDesdeOperaciones> {
  try {
    const movimientos = await getMovimientosHistoricosConCache();
    if (!movimientos.data || movimientos.data.length === 0) {
      return { ppc: undefined, valorInicialConsolidado: undefined, precioPromedioVenta: undefined };
    }
    
    const operaciones = await getOperacionesPorTicker(movimientos.data, ticker, dolarMEP);
    if (!operaciones || operaciones.length === 0) {
      return { ppc: undefined, valorInicialConsolidado: undefined, precioPromedioVenta: undefined };
    }

    // Ordenar operaciones por fecha ascendente (de más antigua a más reciente)
    const operacionesOrdenadas = [...operaciones].sort((a, b) => 
      a.fecha.localeCompare(b.fecha)
    );

    let cantidadActual = 0;
    let costoTotalAcumulado = 0;

    // Procesar cada operación en orden cronológico
    for (const op of operacionesOrdenadas) {
      if (op.tipo === 'COMPRA') {
        // Compra: aumenta cantidad y costo total
        const costoOperacion = op.montoUSD + op.costoOperacionUSD;
        cantidadActual += op.cantidad;
        costoTotalAcumulado += costoOperacion;
      } else if (op.tipo === 'RESCATE_PARCIAL') {
        // Rescate parcial: reduce cantidad y reduce el costo total por el monto recibido
        cantidadActual -= op.cantidad;
        costoTotalAcumulado -= op.montoUSD;
      } else if (op.tipo === 'VENTA') {
        // Venta: reduce cantidad y costo total proporcionalmente
        if (cantidadActual > 0) {
          const ppcAntesVenta = costoTotalAcumulado / cantidadActual;
          const costoVendido = ppcAntesVenta * op.cantidad;
          cantidadActual -= op.cantidad;
          costoTotalAcumulado -= costoVendido;
        }
      }
    }

    // Calcular PPC final
    const ppc = cantidadActual > 0 ? costoTotalAcumulado / cantidadActual : undefined;
    
    // Calcular inversión consolidada (costo total acumulado)
    const valorInicialConsolidado = costoTotalAcumulado > 0 ? costoTotalAcumulado : undefined;

    // Calcular precio promedio de venta (promedio ponderado por cantidad)
    const ventas = operaciones.filter(op => op.tipo === 'VENTA');
    let precioPromedioVenta: number | undefined = undefined;
    if (ventas.length > 0) {
      const totalCantidadVentas = ventas.reduce((sum, v) => sum + v.cantidad, 0);
      const totalMontoVentas = ventas.reduce((sum, v) => sum + (v.precioUSD * v.cantidad), 0);
      precioPromedioVenta = totalCantidadVentas > 0 ? totalMontoVentas / totalCantidadVentas : undefined;
    }

    return {
      ppc: ppc && ppc > 0 ? ppc : undefined,
      valorInicialConsolidado,
      precioPromedioVenta: precioPromedioVenta && precioPromedioVenta > 0 ? precioPromedioVenta : undefined
    };
  } catch (error) {
    console.error(`Error calculando desde operaciones históricas para ${ticker}:`, error);
    return { ppc: undefined, valorInicialConsolidado: undefined, precioPromedioVenta: undefined };
  }
}

// Recibe el ticker y todas las posiciones (de la API) y retorna los datos calculados
export async function getTickerHoldingData(ticker: string, positions: Position[], dolarMEP: number): Promise<TickerHoldingData | null> {
  // Normalizar ticker para comparación
  const tickerNormalizado = normalizeTicker(ticker);
  
  // Filtrar posiciones del ticker (usando comparación normalizada)
  const tickerPositions = positions.filter(p => tickersMatch(p.Ticker, tickerNormalizado));
  if (tickerPositions.length === 0) return null;

  // Obtener tenencia actual desde la API
  const estadoCuenta = await getEstadoCuentaConCache();
  let preciosMap: Map<string, Position> = new Map();
  if (estadoCuenta.data && estadoCuenta.data.tenencia) {
    estadoCuenta.data.tenencia.forEach((tenencia: Position) => {
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

  // Calcular valores desde operaciones históricas (PPC, inversión consolidada, precio promedio de venta)
  const calculosDesdeOperaciones = await calcularDesdeOperacionesHistoricas(ticker, dolarMEP);

  // Si hay datos de API, usar esos valores
  if (datosActuales) {
    return {
      ticker,
      cantidadTotal: datosActuales.Cantidad,
      ppc: datosActuales.PPP,
      ppcDesdeOperaciones: calculosDesdeOperaciones.ppc, // PPC calculado desde operaciones históricas
      precioActual: datosActuales.Precio,
      valorInicial: datosActuales.ValorInicial,
      valorInicialConsolidado: calculosDesdeOperaciones.valorInicialConsolidado, // Inversión consolidada calculada desde operaciones históricas
      valorActual: datosActuales.ValorActual,
      rendimiento: datosActuales.NoRealizado,
      rendimientoPorcentaje: datosActuales.PorcRendimiento,
      precioPromedioVenta: calculosDesdeOperaciones.precioPromedioVenta,
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
    ppcDesdeOperaciones: calculosDesdeOperaciones.ppc, // PPC calculado desde operaciones históricas
    precioActual,
    valorInicial,
    valorInicialConsolidado: calculosDesdeOperaciones.valorInicialConsolidado, // Inversión consolidada calculada desde operaciones históricas
    valorActual,
    rendimiento,
    rendimientoPorcentaje,
    precioPromedioVenta: calculosDesdeOperaciones.precioPromedioVenta,
    operaciones
  };
}
