import { Operacion } from '../types';
import { Orden } from '../types/balanz';
import { normalizarFecha } from './tickerHelpers';
import { getDolarParaFechaDesdeCotizaciones } from '../services/dolarHistoricoApi';

interface CotizacionHistorica {
  casa: string;
  compra: number;
  venta: number;
  fecha: string;
}

/**
 * Mapea una orden de Balanz a una operación estructurada
 * @param orden - Orden de Balanz
 * @param cotizacionesHistoricas - Cotizaciones históricas del dólar
 * @param dolarMEPValue - Dólar MEP actual como fallback
 * @param useMontoAjustado - Si true, calcula monto ajustado usando CantidadOperada * PrecioOperado
 * @returns Operación mapeada
 */
export function mapOrdenToOperacion(
  orden: Orden,
  cotizacionesHistoricas: CotizacionHistorica[],
  dolarMEPValue: number | null,
  useMontoAjustado: boolean = false
): Operacion {
  // Determinar tipo de operación
  let tipo: 'COMPRA' | 'VENTA' | 'LIC' | 'RESCATE_PARCIAL' = 'VENTA';
  const operacionStr = typeof orden.Operacion === 'string' ? orden.Operacion.toUpperCase() : '';
  if (operacionStr.includes('RESCATE PARCIAL') || operacionStr.includes('RESCATE_PARCIAL')) {
    tipo = 'RESCATE_PARCIAL';
  } else if (operacionStr.includes('LICITACIÓN') || operacionStr.includes('LICITACION')) {
    tipo = 'LIC';
  } else if (operacionStr.includes('SUSCRIPCIÓN') || operacionStr.includes('SUSCRIPCION')) {
    tipo = 'COMPRA';
  } else if (operacionStr.includes('COMPRA')) {
    tipo = 'COMPRA';
  }

  // Normalizar moneda
  let moneda = String(orden.Moneda || '');
  if (moneda.toUpperCase() === 'PESOS') moneda = 'ARS';
  if (moneda.toUpperCase().includes('ARS')) moneda = 'ARS';

  // Obtener valores originales
  const montoOriginal = typeof orden.Monto === 'number' ? orden.Monto : undefined;
  const costoOriginal = typeof orden.Costos === 'number' ? orden.Costos : 0;

  // Calcular cantidad
  const cantidad = Number(
    (orden.Cantidad === -1 && orden.CantidadOperada !== undefined && orden.CantidadOperada !== -1)
      ? orden.CantidadOperada
      : (orden.CantidadOperada !== undefined && orden.CantidadOperada !== -1) 
        ? orden.CantidadOperada 
        : (orden.Cantidad ?? 0)
  );

  // Determinar precio original
  let precioOriginal: number | undefined;
  const precioValue = typeof orden.Precio === 'number' ? orden.Precio : undefined;
  const precioOperadoValue = typeof orden['Precio Operado'] === 'number' ? orden['Precio Operado'] : undefined;
  
  if (tipo === 'COMPRA' && (operacionStr.includes('SUSCRIPCIÓN') || operacionStr.includes('SUSCRIPCION'))) {
    // Para suscripciones, calcular desde Monto y CantidadOperada
    if (montoOriginal && cantidad > 0) {
      precioOriginal = montoOriginal / cantidad;
    } else if (precioOperadoValue !== undefined && precioOperadoValue !== -1) {
      precioOriginal = precioOperadoValue;
    } else if (precioValue !== undefined && precioValue !== -1) {
      precioOriginal = precioValue;
    }
  } else {
    // Priorizar PrecioOperado sobre Precio
    if (precioOperadoValue !== undefined && precioOperadoValue !== -1) {
      precioOriginal = precioOperadoValue;
    } else if (precioValue !== undefined && precioValue !== -1) {
      precioOriginal = precioValue;
    } else if (montoOriginal && cantidad > 0) {
      precioOriginal = montoOriginal / cantidad;
    }
  }

  // Calcular monto (ajustado o original)
  let montoFinal: number | undefined;
  if (useMontoAjustado) {
    const cantidadOperada = (orden.CantidadOperada !== undefined && orden.CantidadOperada !== -1) ? orden.CantidadOperada : undefined;
    const precioOperado = (orden['Precio Operado'] !== undefined && orden['Precio Operado'] !== -1) ? orden['Precio Operado'] : undefined;
    
    if (cantidadOperada !== undefined && precioOperado !== undefined && cantidadOperada > 0) {
      montoFinal = cantidadOperada * precioOperado;
    } else if (montoOriginal !== undefined && cantidad > 0 && precioOriginal !== undefined) {
      montoFinal = cantidad * precioOriginal;
    } else {
      montoFinal = montoOriginal;
    }
  } else {
    montoFinal = montoOriginal;
  }

  // Obtener fecha
  const fechaRaw = String(orden.Fecha || orden.FechaLiquidacion || '');

  // Convertir a USD si es necesario
  let precioUSD = precioOriginal || 0;
  let montoUSD = montoFinal || 0;
  let costoOperacionUSD = 0;
  let dolarUsado = 0;

  if (moneda === 'ARS' && precioOriginal && montoFinal) {
    let fechaOp = fechaRaw.split('T')[0].trim();
    
    // Convertir formato DD/MM/YYYY a YYYY-MM-DD
    if (fechaOp && fechaOp.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [dia, mes, anio] = fechaOp.split('/');
      fechaOp = `${anio}-${mes}-${dia}`;
    }
    
    // Buscar dólar histórico
    if (fechaOp && fechaOp.match(/^\d{4}-\d{2}-\d{2}$/)) {
      if (cotizacionesHistoricas.length > 0) {
        dolarUsado = getDolarParaFechaDesdeCotizaciones(cotizacionesHistoricas, fechaOp) || 0;
        if (!dolarUsado || dolarUsado === 0) {
          console.warn(`⚠️ No se encontró dólar histórico para fecha ${fechaOp}`);
        }
      }
    } else {
      console.warn(`⚠️ Fecha de operación inválida o vacía: "${fechaRaw}" -> "${fechaOp}"`);
    }
    
    // Usar dolarMEP como fallback
    if (!dolarUsado || dolarUsado === 0) {
      dolarUsado = dolarMEPValue || 0;
      if (dolarUsado > 0) {
        console.warn(`⚠️ Usando dolarMEP actual (${dolarUsado}) como fallback para fecha ${fechaOp || fechaRaw}`);
      }
    }
    
    if (dolarUsado > 0) {
      precioUSD = precioOriginal / dolarUsado;
      montoUSD = montoFinal / dolarUsado;
      costoOperacionUSD = costoOriginal / dolarUsado;
    } else {
      console.warn(`⚠️ No se pudo obtener dólar para fecha ${fechaOp}, operación sin convertir`);
    }
  } else {
    // Ya está en USD
    precioUSD = precioOriginal || 0;
    montoUSD = montoFinal || 0;
    costoOperacionUSD = costoOriginal || 0;
  }

  const fechaNormalizada = normalizarFecha(fechaRaw);

  return {
    tipo,
    fecha: fechaNormalizada,
    cantidad: useMontoAjustado ? Number(
      (orden.CantidadOperada !== undefined && orden.CantidadOperada !== -1) 
        ? orden.CantidadOperada 
        : (orden.Cantidad ?? 0)
    ) : cantidad,
    precioUSD,
    montoUSD,
    costoOperacionUSD,
    descripcion: String(orden.Operacion || ''),
    precioOriginal,
    montoOriginal: montoFinal,
    costoOriginal,
    monedaOriginal: moneda,
    dolarUsado
  };
}

