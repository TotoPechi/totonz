import { useEffect, useState } from 'react';
import {
    getDividendosPorTicker,
    getDolarMEP,
    getEstadoCuentaConCache,
    getMovimientosHistoricosConCache,
    getOperacionesPorTicker,
    getOrdenesHistoricasConCache,
    getRentasPorTicker
} from '../services/balanzApi';
import { getCotizacionesHistoricas } from '../services/dolarHistoricoApi';
import { Dividendo, Operacion, Renta } from '../types';
import { Orden } from '../types/balanz';
import { normalizarFecha, getFechaRangoHistorico } from '../utils/tickerHelpers';
import { mapOrdenToOperacion } from '../utils/orderMappers';

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
        let cotizacionesHistoricas: Array<{ casa: string; compra: number; venta: number; fecha: string }> = [];
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
            const { fechaDesde, fechaHasta } = getFechaRangoHistorico();
            const ordenesResult = await getOrdenesHistoricasConCache(fechaDesde, fechaHasta);
            // Guardar info de caché de órdenes
            const ordenesUrl = `https://clientes.balanz.com/api/v1/reportehistoricoordenes/222233?FechaDesde=${fechaDesde}&FechaHasta=${fechaHasta}`;
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
            const ordenesTicker = ordenesResult.data.filter((o: Orden) => 
              tickersMatch(o.Ticker, tickerNormalizado) && (o.Estado === 'Ejecutada' || o.Estado === 'Parcialmente Cancelada')
            );
            // Mapear al modelo esperado por TickerOrders
            const operacionesMapped = ordenesTicker.map((o: Orden) => 
              mapOrdenToOperacion(o, cotizacionesHistoricas, dolarMEPValue, true)
            );
            
            // También obtener operaciones desde movimientos históricos (incluye rescates parciales)
            let operacionesDesdeMovimientos: Operacion[] = [];
            try {
              const { fechaDesde, fechaHasta } = getFechaRangoHistorico();
              const movimientosResult = await getMovimientosHistoricosConCache(fechaDesde, fechaHasta);
              
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
        const { fechaDesde, fechaHasta } = getFechaRangoHistorico();
        
        const movimientosResult = await getMovimientosHistoricosConCache(fechaDesde, fechaHasta);
        
        // Guardar información de caché de movimientos históricos
        const movimientosUrl = `https://clientes.balanz.com/api/movimientos/222233?FechaDesde=${fechaDesde}&FechaHasta=${fechaHasta}&ic=0`;
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

