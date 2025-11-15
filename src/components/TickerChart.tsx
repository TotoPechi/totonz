import React, { useState, useMemo } from 'react';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, ReferenceDot, Area } from 'recharts';
import { formatearFecha } from '../utils/chartHelpers';
import { normalizarFecha } from '../utils/tickerHelpers';

import { CandleData } from '../types';

interface TickerChartProps {
  data: CandleData[];
  ticker: string;
  ppc?: number; // Precio Promedio Ponderado
  precioPromedioVenta?: number; // Precio Promedio de Venta
  operaciones?: Array<{
    tipo: 'COMPRA' | 'VENTA' | 'LIC' | 'RESCATE_PARCIAL';
    fecha: string;
    cantidad: number;
    precioUSD: number;
  }>;
  dividendos?: Array<{
    fecha: string;
    montoNeto: number;
  }>;
  rentas?: Array<{
    fecha: string;
    montoNeto: number;
  }>;
  hoveredOperacionIndex?: number | null;
}

type TimeRange = '1W' | '1M' | '6M' | '1Y' | '2Y' | 'MAX';

const TickerChart: React.FC<TickerChartProps> = ({ data, ticker, ppc, precioPromedioVenta, operaciones, dividendos, rentas, hoveredOperacionIndex }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const [hoveredLegendType, setHoveredLegendType] = useState<string | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<{ type: string; index: number } | null>(null);
  const [showTenencias, setShowTenencias] = useState<boolean>(false);

  // Determinar número de decimales según el ticker
  const getDecimalPlaces = (tickerSymbol: string): number => {
    const cleanTicker = tickerSymbol.replace('.E', '');
    // Tickers con precios muy pequeños necesitan más decimales
    if (['TZXD6', 'T30J6'].includes(cleanTicker)) {
      return 6;
    }
    return 2; // Default para la mayoría de tickers
  };

  const decimals = getDecimalPlaces(ticker);


  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h3 className="text-xl font-bold text-white mb-4">📈 Gráfico de {ticker}</h3>
        <div className="text-center py-12">
          <div className="text-slate-400 mb-4">
            <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <p className="text-lg font-semibold mb-2">Datos históricos no disponibles</p>
            <p className="text-sm text-slate-400">
              No se pudieron obtener datos históricos.
              <br />
              Por favor intenta nuevamente más tarde.
            </p>
          </div>
          <div className="mt-6 p-4 bg-slate-700/50 rounded-lg inline-block">
            <p className="text-sm text-slate-400">
              💡 Puedes ver gráficos en:{' '}
              <a 
                href={`https://www.tradingview.com/symbols/${ticker.replace('.E', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                TradingView
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Filtrar datos según el período seleccionado
  const getDaysForRange = (range: TimeRange): number | null => {
    switch (range) {
      case '1W': return 7;
      case '1M': return 30;
      case '6M': return 180;
      case '1Y': return 365;
      case '2Y': return 730;
      case 'MAX': return null; // null significa mostrar todos los datos
      default: return 365;
    }
  };

  const daysToShow = getDaysForRange(timeRange);
  
  // Filtrar por fecha real, no solo por cantidad de elementos
  // Obtener la fecha más reciente de los datos
  const latestDate = data.length > 0 ? new Date(data[data.length - 1].time) : new Date();
  
  // Si daysToShow es null (MAX), mostrar todos los datos sin filtrar
  const filteredData = daysToShow === null 
    ? data 
    : (() => {
        // Calcular la fecha de inicio (hace N días desde la fecha más reciente)
        const startDate = new Date(latestDate);
        startDate.setDate(startDate.getDate() - daysToShow);
        
        // Filtrar datos que estén dentro del rango de fechas
        return data.filter(item => {
          const itemDate = new Date(item.time);
          return itemDate >= startDate && itemDate <= latestDate;
        });
      })();

  // Formatear datos para el gráfico
  const getDateFormat = (range: TimeRange) => {
    switch (range) {
      case '1W':
      case '1M':
        return { month: 'short', day: 'numeric' }; // "Nov 5"
      case '6M':
        return { day: 'numeric', month: 'short' }; // "5 nov"
      case '1Y':
      case '2Y':
      case 'MAX':
      default:
        return { day: 'numeric', month: 'numeric', year: '2-digit' }; // "5/11/24"
    }
  };

  const dateFormat = getDateFormat(timeRange);
  
  // Usar función centralizada para normalizar fechas
  const parsearFechaYYYYMMDD = normalizarFecha;
  
  // Calcular tenencias históricas basándose en las operaciones
  const tenenciasHistoricas = useMemo(() => {
    if (!operaciones || operaciones.length === 0) {
      return new Map<string, number>();
    }
    
    // Ordenar operaciones por fecha
    const operacionesOrdenadas = [...operaciones].sort((a, b) => 
      a.fecha.localeCompare(b.fecha)
    );
    
    // Crear un mapa de fecha -> cantidad acumulada
    const tenenciasMap = new Map<string, number>();
    let cantidadAcumulada = 0;
    
    // Procesar cada operación
    operacionesOrdenadas.forEach(op => {
      const fechaOp = parsearFechaYYYYMMDD(op.fecha);
      if (!fechaOp) return;
      
      if (op.tipo === 'COMPRA' || op.tipo === 'LIC') {
        cantidadAcumulada += op.cantidad;
      } else if (op.tipo === 'VENTA' || op.tipo === 'RESCATE_PARCIAL') {
        cantidadAcumulada -= op.cantidad;
        if (cantidadAcumulada < 0) cantidadAcumulada = 0; // No permitir negativos
      }
      
      tenenciasMap.set(fechaOp, cantidadAcumulada);
    });
    
    return tenenciasMap;
  }, [operaciones]);
  
  // Calcular tenencias para cada punto del gráfico
  // Convertir el mapa a un array ordenado para búsqueda más eficiente
  const tenenciasArray = Array.from(tenenciasHistoricas.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
  
  const chartData = filteredData.map(item => {
    const itemDateStr = parsearFechaYYYYMMDD(item.time);
    let cantidadTenencias = 0;
    
    // Buscar la cantidad de tenencias más reciente hasta esta fecha
    if (tenenciasArray.length > 0) {
      // Buscar la operación más reciente antes o en esta fecha
      // Recorrer desde el final hacia atrás para encontrar la más reciente
      for (let i = tenenciasArray.length - 1; i >= 0; i--) {
        const [fecha, cantidad] = tenenciasArray[i];
        if (fecha <= itemDateStr) {
          cantidadTenencias = cantidad;
          break;
        }
      }
    }
    
    return {
      date: new Date(item.time).toLocaleDateString('es-AR', dateFormat as any),
      fullDate: item.time,
      price: item.close,
      ppc: ppc, // Agregar PPC a cada punto
      precioPromedioVenta: precioPromedioVenta, // Agregar precio promedio de venta a cada punto
      cantidadTenencias: cantidadTenencias, // Agregar cantidad de tenencias
    };
  });

  // Determinar rango de fechas del gráfico
  const minChartDate = filteredData.length > 0 ? new Date(filteredData[0].time) : null;
  const maxChartDate = filteredData.length > 0 ? new Date(filteredData[filteredData.length - 1].time) : null;

  // Filtrar operaciones por rango de fechas del gráfico antes de mapear
  const operacionesPuntos = operaciones?.map((op, originalIndex) => {
    const opDateStr = parsearFechaYYYYMMDD(op.fecha);
    if (!opDateStr) {
      console.warn('⚠️ Fecha de operación inválida:', op.fecha);
      return null;
    }
    
    // Buscar índice donde la fecha del histórico coincida EXACTAMENTE
    const idx = filteredData.findIndex(d => {
      const historicoDateStr = parsearFechaYYYYMMDD(d.time);
      return historicoDateStr === opDateStr;
    });
    
    // Si no hay match exacto, NO mostrar la operación
    if (idx === -1) {
      return null;
    }
    
    const closestPoint = filteredData[idx];
    const closestChartData = chartData[idx];
    
    // Para rescates parciales con precio 0, usar el precio del gráfico en esa fecha
    let precioY = op.precioUSD;
    if (op.tipo === 'RESCATE_PARCIAL' && (op.precioUSD === 0 || op.precioUSD < 0.01)) {
      precioY = closestPoint.close; // Usar precio de cierre del gráfico
    }
    
    return {
      date: closestChartData.date,
      fullDate: closestPoint.time,
      price: op.precioUSD,
      tipo: op.tipo,
      cantidad: op.cantidad,
      fechaOperacion: op.fecha, // Fecha original de la operación
      originalIndex: originalIndex, // Índice original en el array de operaciones
      x: closestChartData.date, // Usar la fecha formateada como x
      y: precioY, // Precio para el eje Y (usar precio del gráfico si es rescate parcial con precio 0)
    };
  }).filter(Boolean) || [];
  

  // Mapear dividendos a los puntos del gráfico, solo si están dentro del rango
  const dividendosPuntos = dividendos?.map(div => {
    const divDate = new Date(div.fecha);
    if (!minChartDate || !maxChartDate || divDate < minChartDate || divDate > maxChartDate) {
      return null;
    }
    // Buscar el punto más cercano en filteredData
    let closestIndex = -1;
    let minDiff = Infinity;
    filteredData.forEach((d, index) => {
      const chartDate = new Date(d.time);
      const diff = Math.abs(chartDate.getTime() - divDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = index;
      }
    });
    if (closestIndex >= 0 && minDiff < 30 * 24 * 60 * 60 * 1000) { // Dentro de 30 días
      const closestPoint = filteredData[closestIndex];
      const closestChartData = chartData[closestIndex];
      return {
        date: closestChartData.date,
        fullDate: closestPoint.time,
        price: closestPoint.close, // Usar el precio de cierre del día
        tipo: 'DIVIDENDO',
        monto: div.montoNeto,
        x: closestChartData.date, // Usar la fecha formateada como x
        y: closestPoint.close,
      };
    }
    return null;
  }).filter(Boolean) || [];

  // Mapear rentas a los puntos del gráfico, solo si están dentro del rango
  const rentasPuntos = rentas?.map(renta => {
    const rentaDate = new Date(renta.fecha);
    if (!minChartDate || !maxChartDate || rentaDate < minChartDate || rentaDate > maxChartDate) {
      return null;
    }
    // Buscar el punto más cercano en filteredData
    let closestIndex = -1;
    let minDiff = Infinity;
    filteredData.forEach((d, index) => {
      const chartDate = new Date(d.time);
      const diff = Math.abs(chartDate.getTime() - rentaDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = index;
      }
    });
    if (closestIndex >= 0 && minDiff < 30 * 24 * 60 * 60 * 1000) { // Dentro de 30 días
      const closestPoint = filteredData[closestIndex];
      const closestChartData = chartData[closestIndex];
      return {
        date: closestChartData.date,
        fullDate: closestPoint.time,
        price: closestPoint.close, // Usar el precio de cierre del día
        tipo: 'RENTA',
        monto: renta.montoNeto,
        x: closestChartData.date, // Usar la fecha formateada como x
        y: closestPoint.close,
      };
    }
    return null;
  }).filter(Boolean) || [];


  // Calcular rango de precios para el eje Y
  const prices = filteredData.map(d => d.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;
  const yMin = minPrice - (priceRange * 0.1);
  const yMax = maxPrice + (priceRange * 0.1);
  
  // Calcular rango de cantidades para el eje Y secundario
  const cantidades = chartData.map(d => d.cantidadTenencias);
  const maxCantidad = Math.max(...cantidades, 0);
  const cantidadYMax = maxCantidad > 0 ? maxCantidad * 1.1 : 1; // Agregar 10% de margen

  // Calcular intervalo de labels según el período
  const getXAxisInterval = (range: TimeRange, dataLength: number, filteredData?: any[]): number => {
    switch (range) {
      case '1W': return 0; // Mostrar todos los días
      case '1M': return Math.max(1, Math.floor(dataLength / 10)); 
      case '6M': return Math.max(1, Math.floor(dataLength / 8)); 
      case '1Y': return Math.max(1, Math.floor(dataLength / 8));
      case '2Y': return Math.max(1, Math.floor(dataLength / 8));
      case 'MAX': 
        // Calcular intervalo para mostrar un label por año
        if (filteredData && filteredData.length > 0) {
          const firstDate = new Date(filteredData[0].time);
          const lastDate = new Date(filteredData[filteredData.length - 1].time);
          const yearsDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
          const numberOfYears = Math.max(1, Math.ceil(yearsDiff));
          // Calcular cuántos puntos de datos hay por año
          const pointsPerYear = dataLength / numberOfYears;
          // Mostrar un label por año, así que el intervalo debe ser aproximadamente pointsPerYear
          return Math.max(1, Math.floor(pointsPerYear));
        }
        return Math.max(1, Math.floor(dataLength / 15)); // Fallback
      default: return Math.max(1, Math.floor(dataLength / 40));
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-white">📈 {ticker}</h3>
        
        {/* Controles */}
        <div className="flex gap-2 items-center">
          {/* Switch de tenencias */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Tenencias</span>
            <button
              onClick={() => setShowTenencias(!showTenencias)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 ${
                showTenencias ? 'bg-cyan-500' : 'bg-slate-600'
              }`}
              role="switch"
              aria-checked={showTenencias}
              title={showTenencias ? 'Ocultar tenencias' : 'Mostrar tenencias'}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showTenencias ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          
          {/* Botones de selección de período */}
          {(['1W', '1M', '6M', '1Y', '2Y', 'MAX'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition ${
                timeRange === range
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 'calc(530px - 100px)', maxHeight: '430px' }}>
        <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            dataKey="date" 
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            interval={getXAxisInterval(timeRange, chartData.length, filteredData)}
          />
          <YAxis 
            yAxisId="left"
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8' }}
            domain={[yMin, yMax]}
            tickFormatter={(value) => `$${value.toFixed(decimals)}`}
          />
          {showTenencias && (
            <YAxis 
              yAxisId="right"
              orientation="right"
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8' }}
              domain={[0, cantidadYMax]}
              tickFormatter={(value) => value.toFixed(0)}
            />
          )}
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1e293b', 
              border: '1px solid #475569',
              borderRadius: '8px',
              color: '#fff'
            }}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              
              const dataPoint = chartData.find(d => d.date === label);
              const fullDate = dataPoint ? dataPoint.fullDate : label;
              
              // Formatear la fecha completa para mostrar
              const formattedFullDate = fullDate ? formatearFecha(fullDate) : formatearFecha(label);
              
              // Buscar si hay operaciones, dividendos o rentas en este punto
              const operacionesEnPunto = operacionesPuntos.filter((op: any) => op.date === label);
              const dividendosEnPunto = dividendosPuntos.filter((div: any) => div.date === label);
              const rentasEnPunto = rentasPuntos.filter((renta: any) => renta.date === label);
              
              return (
                <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
                  <p className="text-slate-300 font-semibold mb-2">{formattedFullDate}</p>
                  
                  {/* Precio actual */}
                  {payload[0] && (
                    <div className="text-sm mb-2">
                      <span className="text-slate-400">Precio: </span>
                      <span className="text-blue-400 font-semibold">
                        ${Number(payload[0].value).toFixed(decimals)}
                      </span>
                    </div>
                  )}
                  
                  {/* PPC si existe */}
                  {ppc && (
                    <div className="text-sm mb-2">
                      <span className="text-slate-400">PPC: </span>
                      <span className="text-green-400 font-semibold">
                        ${ppc.toFixed(decimals)}
                      </span>
                    </div>
                  )}
                  
                  {/* PPV si existe */}
                  {precioPromedioVenta && (
                    <div className="text-sm mb-2">
                      <span className="text-slate-400">PPV: </span>
                      <span className="text-orange-400 font-semibold">
                        ${precioPromedioVenta.toFixed(decimals)}
                      </span>
                    </div>
                  )}
                  
                  {/* Cantidad de tenencias si existe */}
                  {showTenencias && dataPoint && dataPoint.cantidadTenencias > 0 && (
                    <div className="text-sm mb-2">
                      <span className="text-slate-400">Tenencias: </span>
                      <span className="text-cyan-400 font-semibold">
                        {dataPoint.cantidadTenencias.toFixed(2)}
                      </span>
                    </div>
                  )}
                  
                  {/* Operaciones en este punto */}
                  {operacionesEnPunto.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-600">
                      {operacionesEnPunto.map((op: any, idx: number) => (
                        <div key={idx} className="mb-2">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-3 h-3 rounded-full ${
                              op.tipo === 'COMPRA' || op.tipo === 'LIC' 
                                ? 'bg-green-500' 
                                : op.tipo === 'RESCATE_PARCIAL'
                                ? 'bg-orange-500'
                                : 'bg-red-500'
                            }`}></div>
                            <span className={`font-semibold ${
                              op.tipo === 'COMPRA' || op.tipo === 'LIC' 
                                ? 'text-green-400' 
                                : op.tipo === 'RESCATE_PARCIAL'
                                ? 'text-orange-400'
                                : 'text-red-400'
                            }`}>
                              {op.tipo === 'LIC' ? 'LIC.' : op.tipo === 'RESCATE_PARCIAL' ? 'RESC' : op.tipo}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 ml-5">
                            <div>Fecha: <span className="text-slate-300">{formatearFecha(op.fechaOperacion)}</span></div>
                            <div>Cantidad: <span className="text-slate-300">{op.cantidad}</span></div>
                            <div>Precio: <span className="text-slate-300">${op.price.toFixed(decimals)}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Dividendos en este punto */}
                  {dividendosEnPunto.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-600">
                      {dividendosEnPunto.map((div: any, idx: number) => (
                        <div key={idx} className="mb-2">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                            <span className="font-semibold text-purple-400">DIVIDENDO</span>
                          </div>
                          <div className="text-xs text-slate-400 ml-5">
                            <div>Monto: <span className="text-purple-300 font-semibold">${div.monto.toFixed(2)}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Rentas en este punto */}
                  {rentasEnPunto.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-600">
                      {rentasEnPunto.map((renta: any, idx: number) => (
                        <div key={idx} className="mb-2">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                            <span className="font-semibold text-amber-400">RENTA</span>
                          </div>
                          <div className="text-xs text-slate-400 ml-5">
                            <div>Monto: <span className="text-amber-300 font-semibold">${renta.monto.toFixed(2)}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }}
            labelStyle={{ color: '#94a3b8' }}
          />
          {showTenencias && (
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="cantidadTenencias"
              fill="#06b6d4"
              fillOpacity={0.05}
              stroke="#06b6d4"
              strokeWidth={1}
              strokeDasharray="0"
              dot={false}
            />
          )}
          <Line 
            yAxisId="left"
            type="monotone" 
            dataKey="price" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6, fill: '#3b82f6' }}
          />
          {ppc && (
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="ppc" 
              stroke="#10b981" 
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          )}
          {precioPromedioVenta && (
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="precioPromedioVenta" 
              stroke="#f97316" 
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          )}
          
          {/* Marcadores de operaciones usando ReferenceDot con índice numérico */}
          {operacionesPuntos.map((op: any, idx: number) => {
            // Usar el índice original de la operación para comparar con hoveredOperacionIndex
            const isHovered = hoveredOperacionIndex === op.originalIndex;
            const isMarkerHovered = hoveredMarker?.type === 'operacion' && hoveredMarker?.index === idx;
            const shouldShow = !hoveredLegendType || hoveredLegendType === 'COMPRA' || hoveredLegendType === 'VENTA' || hoveredLegendType === 'RESCATE_PARCIAL';
            const isTypeMatch = !hoveredLegendType || hoveredLegendType === op.tipo;
            // Hacer los marcadores de rescate parcial más grandes para mejor visibilidad
            const baseRadius = op.tipo === 'RESCATE_PARCIAL' ? 8 : 6;
            return (
              <ReferenceDot
                key={`op-${idx}`}
                yAxisId="left"
                x={op.x}
                y={op.y}
                r={isHovered ? 12 : isMarkerHovered ? 11 : baseRadius}
                fill={
                  op.tipo === 'COMPRA' || op.tipo === 'LIC' 
                    ? '#10b981' 
                    : op.tipo === 'RESCATE_PARCIAL'
                    ? '#f97316'
                    : '#ef4444'
                }
                stroke={isHovered || isMarkerHovered ? '#fbbf24' : op.tipo === 'RESCATE_PARCIAL' ? '#fff' : '#fff'}
                strokeWidth={isHovered || isMarkerHovered ? 3 : op.tipo === 'RESCATE_PARCIAL' ? 2.5 : 2}
                isFront={true}
                fillOpacity={shouldShow && isTypeMatch ? 1 : 0.15}
                strokeOpacity={shouldShow && isTypeMatch ? 1 : 0.15}
                onMouseEnter={() => setHoveredMarker({ type: 'operacion', index: idx })}
                onMouseLeave={() => setHoveredMarker(null)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
          
          {/* Marcadores de dividendos */}
          {dividendosPuntos.map((div: any, idx: number) => {
            const isMarkerHovered = hoveredMarker?.type === 'dividendo' && hoveredMarker?.index === idx;
            const shouldShow = !hoveredLegendType || hoveredLegendType === 'DIVIDENDO';
            return (
              <ReferenceDot
                key={`div-${idx}`}
                yAxisId="left"
                x={div.x}
                y={div.y}
                r={isMarkerHovered ? 8 : 5}
                fill="#8b5cf6"
                stroke={isMarkerHovered ? '#fbbf24' : '#fff'}
                strokeWidth={isMarkerHovered ? 3 : 2}
                isFront={true}
                fillOpacity={shouldShow ? 1 : 0.15}
                strokeOpacity={shouldShow ? 1 : 0.15}
                onMouseEnter={() => setHoveredMarker({ type: 'dividendo', index: idx })}
                onMouseLeave={() => setHoveredMarker(null)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
          
          {/* Marcadores de rentas */}
          {rentasPuntos.map((renta: any, idx: number) => {
            const isMarkerHovered = hoveredMarker?.type === 'renta' && hoveredMarker?.index === idx;
            const shouldShow = !hoveredLegendType || hoveredLegendType === 'RENTA';
            return (
              <ReferenceDot
                key={`renta-${idx}`}
                yAxisId="left"
                x={renta.x}
                y={renta.y}
                r={isMarkerHovered ? 8 : 5}
                fill="#f59e0b"
                stroke={isMarkerHovered ? '#fbbf24' : '#fff'}
                strokeWidth={isMarkerHovered ? 3 : 2}
                isFront={true}
                fillOpacity={shouldShow ? 1 : 0.15}
                strokeOpacity={shouldShow ? 1 : 0.15}
                onMouseEnter={() => setHoveredMarker({ type: 'renta', index: idx })}
                onMouseLeave={() => setHoveredMarker(null)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
          
        </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      {/* Leyenda - Solo mostrar elementos que están en el gráfico */}
      <div className="flex justify-center gap-6 mt-4 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-blue-500"></div>
          <span className="text-slate-400">Precio Actual</span>
        </div>
        {showTenencias && maxCantidad > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-3 bg-cyan-500/20 border border-cyan-500"></div>
            <span className="text-slate-400">Tenencias</span>
          </div>
        )}
        {ppc && (
          <div className="flex items-center gap-2">
            <div className="w-8 border-t-2 border-dashed border-green-500"></div>
            <span className="text-slate-400">PPC: ${ppc.toFixed(decimals)}</span>
          </div>
        )}
        {precioPromedioVenta && (
          <div className="flex items-center gap-2">
            <div className="w-8 border-t-2 border-dashed border-orange-500"></div>
            <span className="text-slate-400">PPV: ${precioPromedioVenta.toFixed(decimals)}</span>
          </div>
        )}
        {/* Verificar qué tipos de operaciones están realmente en el gráfico */}
        {(() => {
          const tiposEnGrafico = new Set(operacionesPuntos.map((op: any) => op.tipo));
          const tieneCompra = tiposEnGrafico.has('COMPRA') || tiposEnGrafico.has('LIC');
          const tieneVenta = tiposEnGrafico.has('VENTA');
          const tieneRescate = tiposEnGrafico.has('RESCATE_PARCIAL');
          const tieneDividendos = dividendosPuntos.length > 0;
          const tieneRentas = rentasPuntos.length > 0;
          
          return (
            <>
              {tieneCompra && (
                <div 
                  className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-100"
                  style={{ opacity: !hoveredLegendType || hoveredLegendType === 'COMPRA' || hoveredLegendType === 'LIC' ? 1 : 0.4 }}
                  onMouseEnter={() => setHoveredLegendType('COMPRA')}
                  onMouseLeave={() => setHoveredLegendType(null)}
                >
                  <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white"></div>
                  <span className="text-slate-400">Compra</span>
                </div>
              )}
              {tieneVenta && (
                <div 
                  className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-100"
                  style={{ opacity: !hoveredLegendType || hoveredLegendType === 'VENTA' ? 1 : 0.4 }}
                  onMouseEnter={() => setHoveredLegendType('VENTA')}
                  onMouseLeave={() => setHoveredLegendType(null)}
                >
                  <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white"></div>
                  <span className="text-slate-400">Venta</span>
                </div>
              )}
              {tieneRescate && (
                <div 
                  className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-100"
                  style={{ opacity: !hoveredLegendType || hoveredLegendType === 'RESCATE_PARCIAL' ? 1 : 0.4 }}
                  onMouseEnter={() => setHoveredLegendType('RESCATE_PARCIAL')}
                  onMouseLeave={() => setHoveredLegendType(null)}
                >
                  <div className="w-4 h-4 rounded-full bg-orange-500 border-2 border-white"></div>
                  <span className="text-slate-400">Rescate Parcial</span>
                </div>
              )}
              {tieneDividendos && (
                <div 
                  className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-100"
                  style={{ opacity: !hoveredLegendType || hoveredLegendType === 'DIVIDENDO' ? 1 : 0.4 }}
                  onMouseEnter={() => setHoveredLegendType('DIVIDENDO')}
                  onMouseLeave={() => setHoveredLegendType(null)}
                >
                  <div className="w-4 h-4 rounded-full bg-purple-500 border-2 border-white"></div>
                  <span className="text-slate-400">Dividendo</span>
                </div>
              )}
              {tieneRentas && (
                <div 
                  className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-100"
                  style={{ opacity: !hoveredLegendType || hoveredLegendType === 'RENTA' ? 1 : 0.4 }}
                  onMouseEnter={() => setHoveredLegendType('RENTA')}
                  onMouseLeave={() => setHoveredLegendType(null)}
                >
                  <div className="w-4 h-4 rounded-full bg-amber-500 border-2 border-white"></div>
                  <span className="text-slate-400">Renta</span>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
};

export default TickerChart;
