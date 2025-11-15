import React, { useState } from 'react';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, ReferenceDot } from 'recharts';

// Función para formatear fecha de YYYY-MM-DD a DD/MM/YYYY
function formatearFecha(fecha: string): string {
  if (!fecha) return '';
  
  // Si ya está en formato DD/MM/YYYY, retornarlo
  if (fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    return fecha;
  }
  
  // Si está en formato YYYY-MM-DD
  if (fecha.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
  }
  
  // Intentar parsear como Date
  try {
    const date = new Date(fecha);
    if (!isNaN(date.getTime())) {
      const dia = String(date.getDate()).padStart(2, '0');
      const mes = String(date.getMonth() + 1).padStart(2, '0');
      const anio = date.getFullYear();
      return `${dia}/${mes}/${anio}`;
    }
  } catch (e) {
    // Ignorar error
  }
  
  return fecha; // Retornar original si no se pudo formatear
}

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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

type TimeRange = '1W' | '1M' | '6M' | '1Y' | '2Y';

const TickerChart: React.FC<TickerChartProps> = ({ data, ticker, ppc, precioPromedioVenta, operaciones, dividendos, rentas, hoveredOperacionIndex }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const [hoveredLegendType, setHoveredLegendType] = useState<string | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<{ type: string; index: number } | null>(null);

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
  const getDaysForRange = (range: TimeRange): number => {
    switch (range) {
      case '1W': return 7;
      case '1M': return 30;
      case '6M': return 180;
      case '1Y': return 365;
      case '2Y': return 730;
      default: return 365;
    }
  };

  const daysToShow = getDaysForRange(timeRange);
  
  // Filtrar por fecha real, no solo por cantidad de elementos
  // Obtener la fecha más reciente de los datos
  const latestDate = data.length > 0 ? new Date(data[data.length - 1].time) : new Date();
  // Calcular la fecha de inicio (hace N días desde la fecha más reciente)
  const startDate = new Date(latestDate);
  startDate.setDate(startDate.getDate() - daysToShow);
  
  // Filtrar datos que estén dentro del rango de fechas
  const filteredData = data.filter(item => {
    const itemDate = new Date(item.time);
    return itemDate >= startDate && itemDate <= latestDate;
  });

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
      default:
        return { day: 'numeric', month: 'numeric', year: '2-digit' }; // "5/11/24"
    }
  };

  const dateFormat = getDateFormat(timeRange);
  const chartData = filteredData.map(item => ({
    date: new Date(item.time).toLocaleDateString('es-AR', dateFormat as any),
    fullDate: item.time,
    price: item.close,
    ppc: ppc, // Agregar PPC a cada punto
    precioPromedioVenta: precioPromedioVenta, // Agregar precio promedio de venta a cada punto
  }));

  // Determinar rango de fechas del gráfico
  const minChartDate = filteredData.length > 0 ? new Date(filteredData[0].time) : null;
  const maxChartDate = filteredData.length > 0 ? new Date(filteredData[filteredData.length - 1].time) : null;

  // Función para parsear DD/MM/YYYY a YYYY-MM-DD sin problemas de zona horaria
  const parsearFechaYYYYMMDD = (fechaStr: string): string => {
    if (!fechaStr) return '';
    
    // Si ya está en formato ISO (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss)
    if (fechaStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      return fechaStr.slice(0, 10);
    }
    
    // Si está en formato DD/MM/YYYY
    const partes = fechaStr.split('/');
    if (partes.length === 3) {
      const [dia, mes, año] = partes;
      const añoCompleto = año.length === 2 ? `20${año}` : año;
      return `${añoCompleto.padStart(4, '0')}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }
    
    // Si es un objeto Date o timestamp, extraer la fecha en zona horaria local
    try {
      const date = new Date(fechaStr);
      if (!isNaN(date.getTime())) {
        // Usar getFullYear, getMonth, getDate para evitar problemas de zona horaria
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      // Ignorar error de parsing
    }
    
    return '';
  };

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

  const getRangeLabel = (range: TimeRange): string => {
    switch (range) {
      case '1W': return '1 Semana';
      case '1M': return '1 Mes';
      case '6M': return '6 Meses';
      case '1Y': return '1 Año';
      case '2Y': return '2 Años';
      default: return '1 Año';
    }
  };

  // Calcular intervalo de labels según el período
  const getXAxisInterval = (range: TimeRange, dataLength: number): number => {
    switch (range) {
      case '1W': return 0; // Mostrar todos los días
      case '1M': return Math.max(1, Math.floor(dataLength / 20)); 
      case '6M': return Math.max(1, Math.floor(dataLength / 15)); 
      case '1Y': return Math.max(1, Math.floor(dataLength / 10));
      case '2Y': return Math.max(1, Math.floor(dataLength / 10));
      default: return Math.max(1, Math.floor(dataLength / 40));
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-white">📈 Gráfico de {ticker} ({getRangeLabel(timeRange)})</h3>
        
        {/* Botones de selección de período */}
        <div className="flex gap-2">
          {(['1W', '1M', '6M', '1Y', '2Y'] as TimeRange[]).map((range) => (
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
            interval={getXAxisInterval(timeRange, chartData.length)}
          />
          <YAxis 
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8' }}
            domain={[yMin, yMax]}
            tickFormatter={(value) => `$${value.toFixed(decimals)}`}
          />
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
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6, fill: '#3b82f6' }}
          />
          {ppc && (
            <Line 
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
