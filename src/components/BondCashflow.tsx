import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getDolarParaFecha } from '../services/dolarHistoricoApi';
import { getEstadoCuentaConCache, getDolarMEP } from '../services/balanzApi';

// Función para formatear fecha
function formatearFecha(fecha: string): string {
  if (!fecha) return '';
  if (fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) return fecha;
  if (fecha.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
  }
  try {
    const date = new Date(fecha);
    if (!isNaN(date.getTime())) {
      const dia = String(date.getDate()).padStart(2, '0');
      const mes = String(date.getMonth() + 1).padStart(2, '0');
      const anio = date.getFullYear();
      return `${dia}/${mes}/${anio}`;
    }
  } catch (e) {}
  return fecha;
}

interface CashFlowItem {
  date: string;
  coupon: string;
  amortization: string;
  effectiveRent: string;
  residualValue: number;
  amortizationValue: number;
  rent: number;
  cashflow: number;
  currency: number;
}

interface BondCashflowProps {
  cashFlow: CashFlowItem[];
  unidades: number;
  currency?: number; // 1 = ARS, 2 = USD, etc.
  showOnlyFuture?: boolean; // Mostrar solo pagos futuros
  valorInicialConsolidado?: number; // Inversión consolidada para calcular rendimiento
  rentasReales?: Array<{ fecha: string; montoNeto: number; impuestosRetenidos: number; esInteresDevengado?: boolean }>; // Rentas reales de movimientos históricos
}

// Componente helper para tooltip de columna
const ColumnHeaderWithTooltip: React.FC<{
  title: string;
  explanation: string;
  align?: 'left' | 'right';
}> = ({ title, explanation, align = 'left' }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const iconRef = React.useRef<HTMLSpanElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const hideTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const alignClass = align === 'right' ? 'text-right' : 'text-left';
  const justifyClass = align === 'right' ? 'justify-end' : 'justify-start';

  const updateTooltipPosition = useCallback(() => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const tooltipWidth = 256; // w-64 = 16rem = 256px
      const tooltipHeight = 200; // Altura aproximada del tooltip
      const spacing = 8; // Espacio entre icono y tooltip
      
      // Calcular posición horizontal
      let left: number;
      if (align === 'right') {
        // Alinear a la derecha del icono
        left = rect.right - tooltipWidth;
      } else {
        // Alinear a la izquierda del icono
        left = rect.left;
      }
      
      // Asegurar que no se salga del viewport horizontalmente
      if (left < 8) left = 8; // Margen mínimo
      if (left + tooltipWidth > viewportWidth - 8) {
        left = viewportWidth - tooltipWidth - 8;
      }
      
      // Calcular posición vertical
      let top: number;
      
      // Verificar si hay espacio abajo
      if (rect.bottom + tooltipHeight + spacing < viewportHeight) {
        // Mostrar abajo
        top = rect.bottom + spacing;
      } else if (rect.top - tooltipHeight - spacing > 0) {
        // Mostrar arriba
        top = rect.top - tooltipHeight - spacing;
      } else {
        // No hay espacio ni arriba ni abajo, centrar verticalmente
        top = Math.max(8, (viewportHeight - tooltipHeight) / 2);
      }
      
      setTooltipStyle({
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 9999,
      });
    }
  }, [align]);

  const handleMouseEnter = () => {
    // Cancelar cualquier timeout de ocultar pendiente
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    updateTooltipPosition();
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    // Usar un pequeño delay para permitir que el mouse se mueva al tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
      hideTimeoutRef.current = null;
    }, 100); // 100ms de delay
  };

  const handleTooltipMouseEnter = () => {
    // Cancelar timeout si el mouse entra al tooltip
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseLeave = () => {
    setShowTooltip(false);
  };

  // Calcular posición de la flecha dinámicamente
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  
  useEffect(() => {
    if (showTooltip) {
      const updatePositions = () => {
        // Actualizar posición del tooltip
        updateTooltipPosition();
        
        // Actualizar posición de la flecha
        if (iconRef.current && tooltipRef.current) {
          const iconRect = iconRef.current.getBoundingClientRect();
          const tooltipRect = tooltipRef.current.getBoundingClientRect();
          
          // Determinar si el tooltip está arriba o abajo del icono
          const isAbove = tooltipRect.bottom < iconRect.top;
          
          const newArrowStyle: React.CSSProperties = {};
          
          if (isAbove) {
            // Tooltip arriba, flecha apunta hacia abajo (en la parte inferior del tooltip)
            newArrowStyle.bottom = '-4px';
            newArrowStyle.borderRight = '1px solid #475569';
            newArrowStyle.borderBottom = '1px solid #475569';
            newArrowStyle.borderLeft = 'none';
            newArrowStyle.borderTop = 'none';
          } else {
            // Tooltip abajo, flecha apunta hacia arriba (en la parte superior del tooltip)
            newArrowStyle.top = '-4px';
            newArrowStyle.borderLeft = '1px solid #475569';
            newArrowStyle.borderTop = '1px solid #475569';
            newArrowStyle.borderRight = 'none';
            newArrowStyle.borderBottom = 'none';
          }
          
          // Calcular posición horizontal de la flecha
          const iconCenterX = iconRect.left + iconRect.width / 2;
          const tooltipLeft = tooltipRect.left;
          const arrowOffset = iconCenterX - tooltipLeft;
          
          // Limitar la flecha dentro del tooltip (con margen)
          const maxOffset = tooltipRect.width - 16; // 16px de margen
          const minOffset = 16;
          const clampedOffset = Math.max(minOffset, Math.min(maxOffset, arrowOffset));
          
          newArrowStyle.left = `${clampedOffset}px`;
          
          setArrowStyle(newArrowStyle);
        }
      };
      
      updatePositions();
      
      // Actualizar posición cuando se hace scroll o resize
      window.addEventListener('scroll', updatePositions, true);
      window.addEventListener('resize', updatePositions);
      
      return () => {
        window.removeEventListener('scroll', updatePositions, true);
        window.removeEventListener('resize', updatePositions);
      };
    }
  }, [showTooltip, align, updateTooltipPosition]);

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  return (
    <th className={`py-2 px-3 text-slate-300 font-semibold ${alignClass} relative`}>
      <div className={`flex items-center gap-1 ${justifyClass}`}>
        <span>{title}</span>
        <div className="relative">
          <span
            ref={iconRef}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-xs cursor-help border border-blue-400/30 hover:bg-blue-500/30"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            ℹ
          </span>
        </div>
      </div>
      {showTooltip && typeof document !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          style={{ ...tooltipStyle, pointerEvents: 'auto' }}
          className="w-64 bg-slate-900 text-slate-200 text-xs rounded-lg p-3 shadow-xl border border-slate-700"
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <div className="text-slate-300 leading-relaxed">{explanation}</div>
          <div
            style={arrowStyle}
            className="absolute w-2 h-2 bg-slate-900 transform rotate-45 pointer-events-none"
          ></div>
        </div>,
        document.body
      )}
    </th>
  );
};

const BondCashflow: React.FC<BondCashflowProps> = ({ 
  cashFlow, 
  unidades, 
  currency = 2,
  showOnlyFuture = true,
  valorInicialConsolidado,
  rentasReales = []
}) => {
  const [showAll, setShowAll] = useState(!showOnlyFuture);
  const [dolarMEPActual, setDolarMEPActual] = useState<number | null>(null);
  const [convertedCashflow, setConvertedCashflow] = useState<CashFlowItem[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Cargar dólar MEP actual y convertir cashflow si es necesario
  useEffect(() => {
    const loadDolarAndConvert = async () => {
      // Si la moneda es USD, no necesitamos convertir
      if (currency !== 1) {
        setConvertedCashflow(cashFlow);
        return;
      }

      setIsConverting(true);
      try {
        // Obtener dólar MEP actual para fechas futuras
        const estadoCuenta = await getEstadoCuentaConCache();
        const dolarMEP = getDolarMEP(estadoCuenta.data?.cotizacionesDolar || []);
        setDolarMEPActual(dolarMEP || 1000); // Fallback a 1000 si no hay dólar MEP

        // Convertir cada item del cashflow
        const converted = await Promise.all(
          cashFlow.map(async (cf) => {
            const fechaFlujo = new Date(cf.date);
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            
            let dolarUsado = dolarMEP || 1000;
            
            // Si la fecha es pasada, intentar obtener dólar histórico
            if (fechaFlujo < hoy) {
              // Convertir fecha a formato YYYY-MM-DD
              const fechaStr = fechaFlujo.toISOString().split('T')[0];
              const dolarHistorico = await getDolarParaFecha(fechaStr);
              if (dolarHistorico) {
                dolarUsado = dolarHistorico;
              }
            }
            
            return {
              ...cf,
              rent: cf.rent / dolarUsado,
              amortizationValue: cf.amortizationValue / dolarUsado,
              cashflow: cf.cashflow / dolarUsado,
              currency: 2, // Marcar como convertido a USD
            };
          })
        );

        setConvertedCashflow(converted);
      } catch (error) {
        console.error('Error convirtiendo cashflow a USD:', error);
        // En caso de error, usar los valores originales
        setConvertedCashflow(cashFlow);
      } finally {
        setIsConverting(false);
      }
    };

    if (cashFlow && cashFlow.length > 0) {
      loadDolarAndConvert();
    }
  }, [cashFlow, currency]);

  // Filtrar y procesar cashflow
  const processedCashflow = useMemo(() => {
    const sourceCashflow = currency === 1 ? convertedCashflow : cashFlow;

    if (!sourceCashflow || !Array.isArray(sourceCashflow) || sourceCashflow.length === 0) return [];

    let filtered = sourceCashflow;
    
    // Filtrar solo futuros si está habilitado y showAll es false
    if (showOnlyFuture && !showAll) {
      filtered = sourceCashflow.filter((cf) => {
        const cfDate = new Date(cf.date);
        cfDate.setHours(0, 0, 0, 0);
        return cfDate >= today;
      });
    }

    // Ordenar por fecha
    return filtered.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
  }, [cashFlow, convertedCashflow, currency, showOnlyFuture, showAll, today]);

  // Calcular totales (futuros)
  const totals = useMemo(() => {
    return processedCashflow.reduce(
      (acc, cf) => {
        const rentTotal = unidades * (cf.rent || 0);
        const amortTotal = unidades * (cf.amortizationValue || 0);
        const cashflowTotal = unidades * (cf.cashflow || 0);
        
        return {
          rent: acc.rent + rentTotal,
          amortization: acc.amortization + amortTotal,
          cashflow: acc.cashflow + cashflowTotal,
        };
      },
      { rent: 0, amortization: 0, cashflow: 0 }
    );
  }, [processedCashflow, unidades]);

  // Calcular rentas pasadas usando rentas reales (de movimientos históricos)
  const rentasPasadas = useMemo(() => {
    // Si hay rentas reales, usarlas (son las que realmente se recibieron)
    if (rentasReales && Array.isArray(rentasReales) && rentasReales.length > 0) {
      return rentasReales.reduce((acc, renta) => {
        return acc + (renta.montoNeto || 0);
      }, 0);
    }
    
    // Fallback: calcular desde cashflow teórico si no hay rentas reales
    // Si la moneda es ARS, esperar a que se complete la conversión
    if (currency === 1) {
      if (!convertedCashflow || convertedCashflow.length === 0) return 0;
    }
    
    const sourceCashflow = currency === 1 ? convertedCashflow : cashFlow;
    if (!sourceCashflow || !Array.isArray(sourceCashflow) || sourceCashflow.length === 0) return 0;
    
    return sourceCashflow.reduce((acc, cf) => {
      const cfDate = new Date(cf.date);
      cfDate.setHours(0, 0, 0, 0);
      if (cfDate < today) {
        // Sumar solo las rentas (cupones) pasadas, no las amortizaciones
        return acc + (unidades * (cf.rent || 0));
      }
      return acc;
    }, 0);
  }, [rentasReales, cashFlow, convertedCashflow, currency, unidades, today]);

  // Calcular rendimiento a término
  const valorATermino = totals.cashflow; // Total Cupones + Total Amortización
  const rendimientoATermino = valorATermino + rentasPasadas - (valorInicialConsolidado || 0);
  const rendimientoATerminoPorcentaje = valorInicialConsolidado && valorInicialConsolidado > 0
    ? (rendimientoATermino / valorInicialConsolidado) * 100
    : 0;

  // Obtener fecha de vencimiento (última fecha del cashflow)
  const fechaVencimiento = useMemo(() => {
    const sourceCashflow = currency === 1 ? convertedCashflow : cashFlow;
    if (!sourceCashflow || !Array.isArray(sourceCashflow) || sourceCashflow.length === 0) return null;
    
    const fechas = sourceCashflow.map(cf => new Date(cf.date));
    const ultimaFecha = new Date(Math.max(...fechas.map(d => d.getTime())));
    return ultimaFecha;
  }, [cashFlow, convertedCashflow, currency]);


  // Preparar datos para el gráfico agrupados por mes
  const chartData = useMemo(() => {
    // Agrupar por mes-año
    const groupedByMonth = new Map<string, {
      mes: string;
      mesAno: string;
      renta: number;
      amortizacion: number;
      cashflow: number;
      fechaInicio: Date;
      fechaFin: Date;
      isPast: boolean;
      pagos: number; // cantidad de pagos en este mes
    }>();

    processedCashflow.forEach((cf) => {
      const cfDate = new Date(cf.date);
      const isPast = cfDate < today;
      const cashflowTotal = unidades * (cf.cashflow || 0);
      const rentTotal = unidades * (cf.rent || 0);
      const amortTotal = unidades * (cf.amortizationValue || 0);
      
      // Crear clave mes-año (YYYY-MM)
      const mesAno = `${cfDate.getFullYear()}-${String(cfDate.getMonth() + 1).padStart(2, '0')}`;
      
      // Nombre del mes en español
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const mes = `${meses[cfDate.getMonth()]} ${cfDate.getFullYear()}`;
      
      if (groupedByMonth.has(mesAno)) {
        const existing = groupedByMonth.get(mesAno)!;
        existing.renta += rentTotal;
        existing.amortizacion += amortTotal;
        existing.cashflow += cashflowTotal;
        existing.pagos += 1;
        // Actualizar fechas si es necesario
        if (cfDate < existing.fechaInicio) existing.fechaInicio = cfDate;
        if (cfDate > existing.fechaFin) existing.fechaFin = cfDate;
        // Si hay al menos un pago futuro, el mes no es completamente pasado
        if (!isPast) existing.isPast = false;
      } else {
        groupedByMonth.set(mesAno, {
          mes,
          mesAno,
          renta: rentTotal,
          amortizacion: amortTotal,
          cashflow: cashflowTotal,
          fechaInicio: cfDate,
          fechaFin: cfDate,
          isPast,
          pagos: 1,
        });
      }
    });

    // Convertir a array y ordenar por fecha
    return Array.from(groupedByMonth.values())
      .sort((a, b) => a.fechaInicio.getTime() - b.fechaInicio.getTime());
  }, [processedCashflow, unidades, today]);

  if (!cashFlow || cashFlow.length === 0) return null;

  // Siempre mostrar en USD (si era ARS, ya fue convertido)
  const currencySymbol = 'USD';
  const futureCount = cashFlow.filter((cf) => {
    const cfDate = new Date(cf.date);
    cfDate.setHours(0, 0, 0, 0);
    return cfDate >= today;
  }).length;

  return (
    <div className="bg-slate-800/70 rounded-lg p-6">
      {isConverting && (
        <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
          <p className="text-blue-300 text-sm">🔄 Convirtiendo valores de ARS a USD...</p>
        </div>
      )}
      {currency === 1 && dolarMEPActual && !isConverting && (
        <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
          <p className="text-yellow-300 text-sm">
            ⚠️ <strong>Nota:</strong> Los valores estaban en pesos y han sido convertidos a USD usando el dólar MEP actual ({dolarMEPActual.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).
          </p>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xl font-semibold text-white">
          💰 Cashflow del Bono
          <span className="text-sm font-normal text-slate-400 ml-2">
            ({unidades} {unidades === 1 ? 'unidad' : 'unidades'})
          </span>
        </h4>
        {showOnlyFuture && futureCount < cashFlow.length && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
          >
            {showAll ? 'Mostrar solo futuros' : `Mostrar todos (${cashFlow.length})`}
          </button>
        )}
      </div>

      {/* Cuentas lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Cuenta de Cashflow Final */}
        <div className="bg-slate-700/50 rounded-lg p-6">
          <h5 className="text-lg font-bold text-white mb-4">Cashflow Final</h5>
          <table className="w-full text-sm">
            <tbody className="text-white">
              <tr>
                <td className="text-slate-300 py-1">Total Cupones</td>
                <td className="text-right text-slate-300 font-semibold py-1">
                  {currencySymbol} {totals.rent.toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </td>
              </tr>
              <tr>
                <td className="text-slate-300 py-1">Total Amortización</td>
                <td className="text-right text-slate-300 font-semibold py-1">
                  + {currencySymbol} {totals.amortization.toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="border-t border-slate-600 pt-2"></td>
              </tr>
              <tr>
                <td className="text-lg font-bold text-slate-200 pt-2">
                  <span>Pago a término</span>
                  {fechaVencimiento && (
                    <span className="text-xs font-normal text-slate-400 ml-2">
                      ({formatearFecha(fechaVencimiento.toISOString().split('T')[0])})
                    </span>
                  )}
                </td>
                <td className="text-right text-lg font-bold text-cyan-400 pt-2">
                  {currencySymbol} {valorATermino.toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Cuenta de Rendimiento Final */}
        {valorInicialConsolidado !== undefined && (
          <div className="bg-slate-700/50 rounded-lg p-6">
            <h5 className="text-lg font-bold text-white mb-4">Rendimiento Final</h5>
            <table className="w-full text-sm">
              <tbody className="text-white">
                <tr>
                  <td className="text-slate-300 py-1">
                    <span>Pago a término</span>
                    {fechaVencimiento && (
                      <span className="text-xs font-normal text-slate-400 ml-2">
                        ({formatearFecha(fechaVencimiento.toISOString().split('T')[0])})
                      </span>
                    )}
                  </td>
                  <td className="text-right text-slate-300 font-semibold py-1">
                    {currencySymbol} {valorATermino.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                </tr>
                <tr>
                  <td className="text-slate-300 py-1">Rentas pasadas</td>
                  <td className="text-right text-slate-300 font-semibold py-1">
                    + {currencySymbol} {rentasPasadas.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                </tr>
                <tr>
                  <td className="text-slate-300 py-1">Inversión Consolidada</td>
                  <td className="text-right text-slate-300 font-semibold py-1">
                    - {currencySymbol} {valorInicialConsolidado.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="border-t border-slate-600 pt-2"></td>
                </tr>
                <tr>
                  <td className="text-lg font-bold text-slate-200 pt-2">
                    <span>Rendimiento a término</span>
                    {fechaVencimiento && (
                      <span className="text-xs font-normal text-slate-400 ml-2">
                        ({formatearFecha(fechaVencimiento.toISOString().split('T')[0])})
                      </span>
                    )}
                  </td>
                  <td className="text-right pt-2">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={`text-lg font-bold ${rendimientoATermino >= 0 ? 'text-green-400' : 'text-red-400'}`}
                      >
                        {currencySymbol} {rendimientoATermino.toLocaleString('es-AR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                      <span
                        className={`text-sm ${rendimientoATerminoPorcentaje >= 0 ? 'text-green-400' : 'text-red-400'}`}
                      >
                        ({rendimientoATerminoPorcentaje >= 0 ? '+' : ''}
                        {rendimientoATerminoPorcentaje.toFixed(2)}%)
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gráfico de barras */}
      <div className="mb-6 bg-slate-800/50 rounded-lg p-6">
        <h5 className="text-sm font-semibold text-slate-300 mb-6">
          Gráfico de Cashflow por Mes
        </h5>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 40, left: 40, bottom: 10 }}
            barCategoryGap="80%"
            barGap={0}
            barSize={20}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#475569" 
              horizontal={true}
              vertical={false}
            />
            <XAxis
              dataKey="mes"
              angle={0}
              textAnchor="middle"
              height={40}
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 400 }}
              interval={0}
              axisLine={{ stroke: '#64748b' }}
              tickLine={{ stroke: '#64748b' }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 400 }}
              tickFormatter={(value) => {
                if (value >= 1000) {
                  return `${(value / 1000).toFixed(1)}k`;
                }
                return value.toString();
              }}
              axisLine={{ stroke: '#64748b' }}
              tickLine={{ stroke: '#64748b' }}
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '6px',
                color: '#f1f5f9',
                padding: '8px 12px',
                fontSize: '12px',
                minWidth: 'auto',
                maxWidth: 'none'
              }}
              itemStyle={{
                padding: '2px 0',
                fontSize: '12px',
                color: '#e2e8f0'
              }}
              formatter={(value: number, name: string) => {
                if (name === 'renta') {
                  return [
                    `${currencySymbol} ${value.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}`,
                    'Renta (Cupones)'
                  ];
                }
                if (name === 'amortizacion') {
                  return [
                    `${currencySymbol} ${value.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}`,
                    'Amortización'
                  ];
                }
                return value;
              }}
              labelStyle={{
                marginBottom: '4px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#f1f5f9'
              }}
              labelFormatter={(label: any, payload: any) => {
                if (payload && payload.length > 0 && payload[0].payload) {
                  const data = payload[0].payload;
                  return `${label} (${data.pagos} ${data.pagos === 1 ? 'pago' : 'pagos'})`;
                }
                return label;
              }}
            />
            <Bar 
              dataKey="amortizacion" 
              name="amortizacion" 
              stackId="cashflow"
              radius={[0, 0, 0, 0]}
              stroke="none"
              activeBar={false}
            >
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-amortizacion-${index}`}
                  fill="#60a5fa"
                  stroke="none"
                />
              ))}
            </Bar>
            <Bar 
              dataKey="renta" 
              name="renta" 
              stackId="cashflow"
              radius={[0, 0, 0, 0]}
              stroke="none"
              activeBar={false}
            >
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-renta-${index}`}
                  fill="#a78bfa"
                  stroke="none"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Leyenda */}
        <div className="flex items-center justify-center gap-8 mt-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-400 rounded-sm"></div>
            <span className="text-slate-400">Renta (Cupones)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-400 rounded-sm"></div>
            <span className="text-slate-400">Amortización</span>
          </div>
        </div>
      </div>

      {/* Tabla de pagos */}
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900/95 z-10">
            <tr className="border-b border-slate-600">
              <ColumnHeaderWithTooltip
                title="Fecha"
                explanation="Fecha del pago (cupón o amortización). Formato DD/MM/YYYY."
                align="left"
              />
              <ColumnHeaderWithTooltip
                title="Cupón"
                explanation="Porcentaje del cupón que se paga en esa fecha (ej: '0.125%', '0.5%', '1.75%'). Es la tasa nominal del cupón."
                align="right"
              />
              <ColumnHeaderWithTooltip
                title="Amort."
                explanation="Porcentaje de amortización del capital en esa fecha (ej: '0%', '4%', '8%'). Si es '0%', solo se paga cupón; si es mayor, también se devuelve capital."
                align="right"
              />
              <ColumnHeaderWithTooltip
                title="Renta"
                explanation={`Monto en dinero del cupón calculado para tus ${unidades} unidades. Fórmula: unidades × rent. Muestra el monto real que recibirás por cupones.`}
                align="right"
              />
              <ColumnHeaderWithTooltip
                title="Amort. Valor"
                explanation={`Monto en dinero de la amortización calculado para tus ${unidades} unidades. Fórmula: unidades × amortizationValue. Muestra el capital que recibirás si hay amortización.`}
                align="right"
              />
              <ColumnHeaderWithTooltip
                title="Cashflow"
                explanation={`Total del flujo de caja en esa fecha. Fórmula: unidades × cashflow = Renta + Amort. Valor. Es lo que recibirás en total ese día.`}
                align="right"
              />
              <ColumnHeaderWithTooltip
                title="Valor Residual"
                explanation="Porcentaje del valor nominal que queda pendiente después de ese pago (ej: 100%, 96%, 88%). Empieza en 100% y va disminuyendo con las amortizaciones."
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {processedCashflow.map((cf, idx) => {
              const rentTotal = unidades * (cf.rent || 0);
              const amortTotal = unidades * (cf.amortizationValue || 0);
              const cashflowTotal = unidades * (cf.cashflow || 0);
              const cfDate = new Date(cf.date);
              const isPast = cfDate < today;
              return (
                <tr 
                  key={idx} 
                  className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${
                    isPast ? 'opacity-60' : ''
                  }`}
                >
                  <td className="py-2 px-3 text-slate-300">
                    {formatearFecha(cf.date)}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-400">
                    {cf.coupon}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-400">
                    {cf.amortization}
                  </td>
                  <td className="py-2 px-3 text-right text-green-400 font-medium">
                    {currencySymbol} {rentTotal.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                  <td className="py-2 px-3 text-right text-blue-400 font-medium">
                    {currencySymbol} {amortTotal.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                  <td className="py-2 px-3 text-right text-cyan-400 font-semibold">
                    {currencySymbol} {cashflowTotal.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-400">
                    {cf.residualValue}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BondCashflow;

