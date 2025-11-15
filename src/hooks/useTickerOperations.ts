import { useState, useEffect } from 'react';
import { getOrdenesHistoricasConCache, getMovimientosHistoricosConCache, getDividendosPorTicker, getRentasPorTicker, getDolarMEP, getOperacionesPorTicker } from '../services/balanzApi';
import { getEstadoCuentaConCache } from '../services/balanzApi';
import { getCotizacionesHistoricas, getDolarParaFechaDesdeCotizaciones } from '../services/dolarHistoricoApi';

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

interface Operacion {
  tipo: 'COMPRA' | 'VENTA' | 'LIC' | 'RESCATE_PARCIAL';
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

interface Dividendo {
  fecha: string;
  montoBruto: number;
  impuestosRetenidos: number;
  montoNeto: number;
  moneda: string;
}

interface Renta {
  fecha: string;
  montoBruto: number;
  impuestosRetenidos: number;
  montoNeto: number;
  moneda: string;
  esInteresDevengado: boolean;
}

interface CacheInfo {
  isCached: boolean;
  fecha: string;
  url?: string;
}

export function useTickerOperations(
  selectedTicker: string | null,
  tickerInfo: { currency?: string; tickerCurrency?: string } | null
) {
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [dividendos, setDividendos] = useState<Dividendo[]>([]);
  const [rentas, setRentas] = useState<Renta[]>([]);
  const [movimientosCacheInfo, setMovimientosCacheInfo] = useState<CacheInfo | null>(null);
  const [movimientosHistoricosCacheInfo, setMovimientosHistoricosCacheInfo] = useState<CacheInfo | null>(null);
  const [estadoCuentaCacheInfo, setEstadoCuentaCacheInfo] = useState<CacheInfo | null>(null);
  const [dolarMEP, setDolarMEP] = useState<number | null>(null);

  useEffect(() => {
    const loadOperaciones = async () => {
      if (!selectedTicker) return;
      
      try {
        // Obtener estado de cuenta para obtener dolarMEP (opcional - solo para mostrar operaciones)
        let dolarMEPValue: number | null = null;
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
            dolarMEPValue = getDolarMEP(estadoCuentaResult.data.cotizacionesDolar);
            setDolarMEP(dolarMEPValue);
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
        if (dolarMEPValue || isUSDInstrument || cotizacionesHistoricas.length > 0) {
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
            const { normalizeTicker, tickersMatch } = await import('../utils/tickerHelpers');
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
              } else if (operacionStr.includes('SUSCRIPCIÓN') || operacionStr.includes('SUSCRIPCION')) {
                tipo = 'COMPRA'; // Suscripciones de fondos son compras
              } else if (operacionStr.includes('COMPRA')) {
                tipo = 'COMPRA';
              }
              // Mejorar detección de moneda en pesos
              let moneda = String(o.Moneda || '');
              if (moneda.toUpperCase() === 'PESOS') moneda = 'ARS';
              if (moneda.toUpperCase().includes('ARS')) moneda = 'ARS';
              const montoOriginal = typeof o.Monto === 'number' ? o.Monto : undefined;
              const costoOriginal = typeof o.Costos === 'number' ? o.Costos : 0;
              
              // Para suscripciones, usar CantidadOperada cuando Cantidad es -1
              const cantidad = Number(
                (o.Cantidad === -1 && o.CantidadOperada !== undefined && o.CantidadOperada !== -1)
                  ? o.CantidadOperada
                  : (o.CantidadOperada !== undefined && o.CantidadOperada !== -1) 
                    ? o.CantidadOperada 
                    : (o.Cantidad ?? 0)
              );
              
              // Determinar precio original: priorizar PrecioOperado sobre Precio
              let precioOriginal: number | undefined;
              const precioValue = typeof o.Precio === 'number' ? o.Precio : undefined;
              const precioOperadoValue = typeof o['Precio Operado'] === 'number' ? o['Precio Operado'] : undefined;
              
              // Para suscripciones, si PrecioOperado es -1, calcular desde Monto y CantidadOperada
              if (tipo === 'COMPRA' && (operacionStr.includes('SUSCRIPCIÓN') || operacionStr.includes('SUSCRIPCION'))) {
                if (montoOriginal !== undefined && cantidad > 0) {
                  precioOriginal = montoOriginal / cantidad;
                } else if (precioOperadoValue !== undefined && precioOperadoValue !== -1) {
                  precioOriginal = precioOperadoValue;
                } else if (precioValue !== undefined && precioValue !== -1) {
                  precioOriginal = precioValue;
                }
              } else {
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
                  dolarUsado = dolarMEPValue || 0;
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
            let operacionesDesdeMovimientos: Operacion[] = [];
            try {
              const fechaHasta = new Date();
              const fechaDesde = new Date('2021-09-05');
              const fechaDesdeStr = fechaDesde.toISOString().split('T')[0].replace(/-/g, '');
              const fechaHastaStr = fechaHasta.toISOString().split('T')[0].replace(/-/g, '');
              const movimientosResult = await getMovimientosHistoricosConCache(fechaDesdeStr, fechaHastaStr);
              
              if (movimientosResult.data && dolarMEPValue) {
                const opsDesdeMovs = await getOperacionesPorTicker(
                  movimientosResult.data,
                  selectedTicker,
                  dolarMEPValue
                );
                // Mapear al tipo Operacion completo y normalizar fechas
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
            const operacionesAgrupadas = new Map<string, Operacion>();
            
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
                let keyExistente: string | null = null;
                
                for (const [existingKey, existingOp] of operacionesAgrupadas.entries()) {
                  if (existingOp.fecha === op.fecha && 
                      existingOp.cantidad === op.cantidad &&
                      (existingOp.tipo === 'LIC' || existingOp.tipo === 'COMPRA')) {
                    // Verificar si el precio es similar (tolerancia de $0.10 o 0.5%)
                    const diferenciaAbsoluta = Math.abs(existingOp.precioUSD - op.precioUSD);
                    const diferenciaPorcentual = existingOp.precioUSD > 0 ? (diferenciaAbsoluta / existingOp.precioUSD) * 100 : 0;
                    
                    if (diferenciaAbsoluta < 0.10 || diferenciaPorcentual < 0.5) {
                      esDuplicado = true;
                      keyExistente = existingKey;
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
                for (const [existingKey, existingOp] of operacionesAgrupadas.entries()) {
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
  }, [selectedTicker, tickerInfo]);

  return {
    operaciones,
    dividendos,
    rentas,
    movimientosCacheInfo,
    movimientosHistoricosCacheInfo,
    estadoCuentaCacheInfo,
    dolarMEP
  };
}

