import { useState, useEffect } from 'react';
import { getOrdenesHistoricasConCache, getMovimientosHistoricosConCache, getDividendosPorTicker, getRentasPorTicker, getDolarMEP } from '../services/balanzApi';
import { getEstadoCuentaConCache } from '../services/balanzApi';
import { getCotizacionesHistoricas, getDolarParaFechaDesdeCotizaciones } from '../services/dolarHistoricoApi';

interface Operacion {
  tipo: 'COMPRA' | 'VENTA' | 'LIC';
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
            // Solo incluir órdenes con Estado "Ejecutada"
            const ordenesTicker = ordenesResult.data.filter((o: any) => 
              o.Ticker === selectedTicker && o.Estado === 'Ejecutada'
            );
            // Mapear al modelo esperado por TickerOrders
            const operacionesMapped = ordenesTicker.map((o: any) => {
              let tipo: 'COMPRA' | 'VENTA' | 'LIC' = 'VENTA';
              const operacionStr = typeof o.Operacion === 'string' ? o.Operacion.toUpperCase() : '';
              if (operacionStr.includes('LICITACIÓN') || operacionStr.includes('LICITACION')) {
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
              
              // Obtener cantidad para usar en cálculos
              const cantidad = Number(
                (o.CantidadOperada !== undefined && o.CantidadOperada !== -1) 
                  ? o.CantidadOperada 
                  : (o.Cantidad ?? 0)
              );
              
              // Determinar precio original: si Precio y PrecioOperado no están o son -1, calcularlo
              let precioOriginal: number | undefined;
              const precioValue = typeof o.Precio === 'number' ? o.Precio : undefined;
              const precioOperadoValue = typeof o.PrecioOperado === 'number' ? o.PrecioOperado : undefined;
              
              if (precioValue !== undefined && precioValue !== -1) {
                precioOriginal = precioValue;
              } else if (precioOperadoValue !== undefined && precioOperadoValue !== -1) {
                precioOriginal = precioOperadoValue;
              } else if (montoOriginal !== undefined && cantidad > 0) {
                // Calcular precio dividiendo monto por cantidad
                precioOriginal = montoOriginal / cantidad;
              } else {
                precioOriginal = undefined;
              }
              
              let precioUSD = precioOriginal || 0;
              let montoUSD = typeof o.Monto === 'number' ? o.Monto : 0;
              let costoOperacionUSD = 0;
              let dolarUsado = 0;
              // Si la operación es en ARS, convertir a USD usando el dólar histórico de la fecha
              if (moneda === 'ARS' && precioOriginal && montoOriginal) {
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
                  montoUSD = montoOriginal / dolarUsado;
                  costoOperacionUSD = costoOriginal / dolarUsado;
                } else {
                  console.warn(`⚠️ No se pudo obtener dólar para fecha ${fechaOp}, operación sin convertir`);
                }
              } else {
                // Si ya está en USD, usar los valores originales
                precioUSD = precioOriginal || 0;
                montoUSD = montoOriginal || 0;
                costoOperacionUSD = costoOriginal || 0;
              }
              return {
                tipo,
                fecha: String(o.Fecha || o.FechaLiquidacion || ''),
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
                montoOriginal,
                costoOriginal,
                monedaOriginal: moneda,
                dolarUsado
              };
            });
            setOperaciones(operacionesMapped);
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

