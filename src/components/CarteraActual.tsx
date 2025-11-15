import React, { useState, useEffect } from 'react';
import ErrorPopup from './ErrorPopup';
import { getDolarMEP } from '../services/balanzApi';
import { formatCurrency } from '../utils/chartHelpers';
import { getTickerHoldingData } from '../services/tickerHoldingData';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface CarteraActualProps {
  positions: any[];
  onTickerClick?: (ticker: string) => void;
  loading?: boolean;
  apiError?: string | null;
}

interface GroupedPosition {
  ticker: string;
  descripcion: string;
  tipo: string;
  cantidadTotal: number;
  ppc: number;
  valorInicial: number;
  precioActual?: number;
  valorActual?: number;
  rendimiento?: number;
  rendimientoPorcentaje?: number;
  operaciones: {
    cantidad: number;
    precioUSD: number;
    moneda: string;
    precioOriginal: number;
    dolarMEP: number;
  }[];
}

interface GroupedByCurrency {
  moneda: string;
  positions: GroupedPosition[];
  totalValor: number;
  totalValorActual?: number;
}


const CarteraActual: React.FC<CarteraActualProps> = ({ positions, onTickerClick, loading, apiError }) => {
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [groupedPositions, setGroupedPositions] = useState<Record<string, any>>({});

  // Ya no se carga precios actuales desde la API aquí, solo se usan los props

  // Calcular dolarMEP desde las posiciones (si está disponible)
  const dolarMEP = getDolarMEP(positions[0]?.cotizacionesDolar || []);
  // Usar un valor por defecto si dolarMEP es null (para evitar errores de tipo)
  const dolarMEPValue = dolarMEP ?? 1000; // Valor por defecto razonable para dólar MEP

  // Agrupar posiciones por ticker usando la función unificada
  useEffect(() => {
    const agrupar = async () => {
      if (!positions || positions.length === 0) return;
      const tickers = Array.from(new Set(positions.map(p => p.Ticker)));
      const result: Record<string, any> = {};
      await Promise.all(tickers.map(async (ticker) => {
        const data = await getTickerHoldingData(ticker, positions, dolarMEPValue);
        if (data) {
          // Usar inversión consolidada si está disponible, sino usar valorInicial de la API
          const valorInicialFinal = data.valorInicialConsolidado !== undefined 
            ? data.valorInicialConsolidado 
            : data.valorInicial;
          
          result[ticker] = {
            ticker: data.ticker,
            descripcion: positions.find(p => p.Ticker === ticker)?.Descripcion || '',
            tipo: positions.find(p => p.Ticker === ticker)?.Tipo || '',
            cantidadTotal: data.cantidadTotal,
            ppc: data.ppc,
            valorInicial: valorInicialFinal, // Usar inversión consolidada si está disponible
            precioActual: data.precioActual,
            valorActual: data.valorActual,
            rendimiento: data.valorActual - valorInicialFinal, // Recalcular rendimiento
            rendimientoPorcentaje: valorInicialFinal > 0 ? ((data.valorActual - valorInicialFinal) / valorInicialFinal) * 100 : 0,
            operaciones: data.operaciones
          };
        }
      }));
      setGroupedPositions(result);
    };
    agrupar();
  }, [positions, dolarMEPValue]);

  // Ya no se usa preciosActuales, los datos vienen directamente de groupedPositions

  // Usar groupedPositions para la agrupación y visualización
  const groupedByType: Record<string, any> = {};
  Object.values(groupedPositions).forEach(position => {
    // Normalizar tipo: eliminar sufijos de moneda y agrupar por tipo base
    let tipo = position.tipo;
    tipo = tipo.replace(/ - (Dólar|ARS|CER)$/, '');
    let moneda = position.operaciones[0].moneda;
    if (moneda === 'US Dollar (Cable)' || moneda === 'Dólares' || moneda === 'Dólar') {
      moneda = 'Dólar';
    }
    if (!groupedByType[tipo]) {
      groupedByType[tipo] = {
        tipo,
        currencies: [],
        totalValor: 0,
        totalValorActual: 0
      };
    }
    let currencyGroup = groupedByType[tipo].currencies.find((c: any) => c.moneda === moneda);
    if (!currencyGroup) {
      currencyGroup = {
        moneda,
        positions: [],
        totalValor: 0,
        totalValorActual: 0
      };
      groupedByType[tipo].currencies.push(currencyGroup);
    }
    currencyGroup.positions.push(position);
    currencyGroup.totalValor += position.valorInicial;
    currencyGroup.totalValorActual += position.valorActual || position.valorInicial;
    groupedByType[tipo].totalValor += position.valorInicial;
    groupedByType[tipo].totalValorActual += position.valorActual || position.valorInicial;
  });

  const sortedTypes = Object.values(groupedByType).sort((a, b) => (b as any).totalValor - (a as any).totalValor);
  // Inicializar tipos expandidos con todos los tipos normalizados (solo la primera vez)
  if (expandedTypes.size === 0 && sortedTypes.length > 0) {
    setExpandedTypes(new Set(sortedTypes.map((t: any) => t.tipo)));
  }
  // Ordenar monedas dentro de cada tipo y posiciones dentro de cada moneda
  sortedTypes.forEach((typeGroup: any) => {
    typeGroup.currencies.sort((a: any, b: any) => b.totalValor - a.totalValor);
    typeGroup.currencies.forEach((currencyGroup: any) => {
      currencyGroup.positions.sort((a: any, b: any) => b.valorInicial - a.valorInicial);
    });
  });
  // Inversión consolidada total: suma de la INVERSIÓN CONSOLIDADA de cada instrumento
  const totalValorInicial = Object.values(groupedPositions).reduce((sum: number, position: any) => sum + (position.valorInicial || 0), 0);
  // Valor actual total: suma del VALOR ACTUAL de todos los instrumentos
  const totalValorActual = Object.values(groupedPositions).reduce((sum: number, position: any) => sum + (position.valorActual || 0), 0);
  const rendimientoTotal = totalValorActual - totalValorInicial;
  const rendimientoTotalPorcentaje = totalValorInicial > 0 ? (rendimientoTotal / totalValorInicial) * 100 : 0;

  // Crear datos para el gráfico de torta agrupando por categoría
  const pieChartData = React.useMemo(() => {
    const categorias = {
      'Acciones': 0,
      'Bonos': 0,
      'Corporativos': 0,
      'CEDEARs': 0,
    };

    Object.values(groupedPositions).forEach(position => {
      const tipo = position.tipo.toLowerCase();
      const valorActual = position.valorActual || position.valorInicial;
      
      if (tipo.includes('acción') || tipo.includes('accion')) {
        categorias['Acciones'] += valorActual;
      } else if (tipo.includes('bono')) {
        categorias['Bonos'] += valorActual;
      } else if (tipo.includes('corporativo')) {
        categorias['Corporativos'] += valorActual;
      } else if (tipo.includes('cedear')) {
        categorias['CEDEARs'] += valorActual;
      } else {
        // Inferir por ticker si no podemos categorizar por tipo
        const ticker = position.ticker;
        if (['VIST'].includes(ticker)) {
          categorias['CEDEARs'] += valorActual;
        } else if (['AL30', 'BPOC7', 'T30J6', 'TZXD6', 'YM39O'].includes(ticker)) {
          categorias['Bonos'] += valorActual;
        } else if (['YMCXO', 'TLC1O'].includes(ticker)) {
          categorias['Corporativos'] += valorActual;
        } else {
          categorias['Acciones'] += valorActual;
        }
      }
    });

    return Object.entries(categorias)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value,
        percentage: (value / totalValorActual) * 100
      }));
  }, [groupedPositions, totalValorActual]);

  // Colores para cada categoría
  const COLORS = {
    'Acciones': '#10b981', // green-500
    'Bonos': '#3b82f6', // blue-500
    'Corporativos': '#f59e0b', // amber-500
    'CEDEARs': '#8b5cf6', // violet-500
  };

  const toggleExpand = (ticker: string) => {
    setExpandedTickers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ticker)) {
        newSet.delete(ticker);
      } else {
        newSet.add(ticker);
      }
      return newSet;
    });
  };

  const toggleTypeExpand = (tipo: string) => {
    setExpandedTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tipo)) {
        newSet.delete(tipo);
      } else {
        newSet.add(tipo);
      }
      return newSet;
    });
  };

  const handleRetry = () => {
    // Forzar recarga de datos
    window.location.reload();
  };

  // Mostrar el popup de error SIEMPRE que haya error, aunque no haya datos cargados
  if (apiError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
        <ErrorPopup message={apiError} onRetry={handleRetry} />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-slate-400 text-lg">Cargando cartera desde la API...</div>
    );
  }
  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <div className="flex items-center mb-6 gap-6">
        {/* Título */}
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white">📊 Cartera Actual</h2>
          <p className="text-slate-400 text-sm mt-1">
            {sortedTypes.reduce((sum: number, t: any) => sum + t.currencies.reduce((s: number, c: any) => s + c.positions.length, 0), 0)} instrumentos en {sortedTypes.length} categorías
          </p>
          {dolarMEP && (
            <p className="text-slate-400 text-xs mt-1">
              💵 Dólar MEP: ${dolarMEP.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </p>
          )}
        </div>
        
        {/* Contenedor de gráfico y valores alineados a la derecha */}
        <div className="flex items-center gap-6">
          {/* Gráfico de torta con leyenda */}
          {/* Gráfico de torta, leyenda y valores alineados a la derecha */}
          <>
            {pieChartData.length > 0 && (
              <div className="flex items-center gap-3">
                <div style={{ width: 126, height: 126 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={27}
                        outerRadius={54}
                        paddingAngle={2}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={COLORS[entry.name as keyof typeof COLORS]} 
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #475569',
                          borderRadius: '8px',
                          padding: '8px 12px'
                        }}
                        labelStyle={{
                          color: '#f1f5f9',
                          fontWeight: 600,
                          marginBottom: '4px'
                        }}
                        itemStyle={{
                          color: '#e2e8f0'
                        }}
                        formatter={(value: number) => [
                          `${formatCurrency(value)} (${((value / totalValorActual) * 100).toFixed(1)}%)`,
                          ''
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Leyenda personalizada */}
                <div className="flex flex-col gap-2 text-xs">
                  {pieChartData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-sm" 
                        style={{ backgroundColor: COLORS[entry.name as keyof typeof COLORS] }}
                      />
                      <span className="text-slate-300">
                        {entry.name}: {entry.percentage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Inversión Consolidada Total */}
            <div className="text-right">
              <p className="text-sm text-slate-400">Inversión Consolidada Total</p>
              <p className="text-2xl font-bold text-slate-300">{formatCurrency(totalValorInicial)}</p>
              {dolarMEP && (
                <p className="text-xs text-slate-400 mt-1">
                  ${(totalValorInicial * dolarMEP).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ARS
                </p>
              )}
            </div>
            {/* Valor Actual Total */}
            <div className="text-right">
              <p className="text-sm text-slate-400">Valor Actual Total</p>
              <p className="text-2xl font-bold text-green-400">{formatCurrency(totalValorActual)}</p>
              {dolarMEP && (
                <p className="text-xs text-slate-400 mt-1">
                  ${(totalValorActual * dolarMEP).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ARS
                </p>
              )}
              <div className="mt-2 text-sm">
                <span className={rendimientoTotal >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {rendimientoTotal >= 0 ? '+' : ''}{formatCurrency(rendimientoTotal)} ({rendimientoTotal >= 0 ? '+' : ''}{rendimientoTotalPorcentaje.toFixed(2)}%)
                </span>
              </div>
            </div>
          </>
        </div>
      </div>

      <div className="space-y-4">
        {sortedTypes.map((typeGroup) => {
          const isTypeExpanded = expandedTypes.has(typeGroup.tipo);
          // Porcentaje basado en el valor actual del subtotal sobre el valor actual total
          const percentage = totalValorActual > 0 ? (typeGroup.totalValorActual / totalValorActual) * 100 : 0;
          // Calcular rendimiento de la sección: valor actual - inversión consolidada
          const rendimientoSeccion = (typeGroup.totalValorActual || 0) - (typeGroup.totalValor || 0);
          // Determinar color según el rendimiento
          const colorRendimiento = rendimientoSeccion >= 0 ? 'text-green-400' : 'text-red-400';

          return (
            <div key={typeGroup.tipo} className="bg-slate-700/30 rounded-lg overflow-hidden">
              {/* Header del tipo */}
              <div 
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-700/50 transition"
                onClick={() => toggleTypeExpand(typeGroup.tipo)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {isTypeExpanded ? '▼' : '▶'}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-white">{typeGroup.tipo}</h3>
                    <p className="text-sm text-slate-400">
                      {typeGroup.currencies.reduce((sum: number, c: any) => sum + c.positions.length, 0)} instrumento{typeGroup.currencies.reduce((sum: number, c: any) => sum + c.positions.length, 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${colorRendimiento}`}>{formatCurrency(typeGroup.totalValorActual || 0)}</p>
                  <p className="text-sm text-slate-400">{percentage.toFixed(1)}% del total</p>
                </div>
              </div>

              {/* Contenido expandido del tipo - agrupado por moneda */}
              {isTypeExpanded && (
                <div className="p-4">
                  {/* Tabla única para todas las monedas */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-700 text-slate-300">
                        <tr>
                          <th className="px-4 py-3 w-8"></th>
                          <th className="px-4 py-3">Ticker</th>
                          <th className="px-4 py-3">Descripción</th>
                          <th className="px-4 py-3 text-right">Cantidad</th>
                          <th className="px-4 py-3 text-right">PPC</th>
                          <th className="px-4 py-3 text-right">Precio Actual</th>
                          <th className="px-4 py-3 text-right">Inversión Consolidada</th>
                          <th className="px-4 py-3 text-right">Valor Actual</th>
                          <th className="px-4 py-3 text-right">Rendimiento</th>
                        </tr>
                      </thead>
                      <tbody className="text-white">
                        {typeGroup.currencies.map((currencyGroup: any) => (
                          <React.Fragment key={`${typeGroup.tipo}-${currencyGroup.moneda}`}>
                            {/* Fila de encabezado de moneda */}
                            <tr className="bg-slate-600/30">
                              <td className="px-4 py-2" colSpan={9}>
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-semibold text-slate-300">
                                    {currencyGroup.moneda === 'Dólar' ? '💵 Dólar' : currencyGroup.moneda === 'Pesos' ? '💰 Pesos' : currencyGroup.moneda}
                                  </h4>
                                  <span className="text-xs text-slate-400">
                                    {currencyGroup.positions.length} instrumento{currencyGroup.positions.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              </td>
                            </tr>
                            {/* Filas de instrumentos de esta moneda */}
                            {currencyGroup.positions.map((group: any) => {
                              const isExpanded = expandedTickers.has(group.ticker);
                              const hasMultipleOperations = group.operaciones.length > 1;
                              
                              return (
                                <React.Fragment key={group.ticker}>
                                  {/* Fila principal */}
                                  <tr 
                                    className={`border-b border-slate-700 hover:bg-slate-700/50 transition ${hasMultipleOperations ? 'cursor-pointer' : ''}`}
                                    onClick={(e) => {
                                      if (hasMultipleOperations) {
                                        e.stopPropagation();
                                        toggleExpand(group.ticker);
                                      }
                                    }}
                                  >
                                    <td className="px-4 py-3 text-slate-400">
                                      {hasMultipleOperations && (
                                        <span className="text-sm">
                                          {isExpanded ? '▼' : '▶'}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      <a
                                        href={`/ticker/${group.ticker}`}
                                        onClick={e => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          onTickerClick?.(group.ticker);
                                        }}
                                        className="font-mono font-bold text-blue-400 hover:text-blue-300 hover:underline transition cursor-pointer"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        {group.ticker}
                                      </a>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="text-slate-300 text-xs">
                                        {group.descripcion}
                                        {hasMultipleOperations && ` (${group.operaciones.length} ops)`}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                      {group.cantidadTotal.toLocaleString('es-AR')}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-300 font-semibold">
                                      {formatCurrency(group.ppc)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                      {group.precioActual ? (
                                        <div className="flex items-center justify-end gap-1">
                                          {group.precioActual > group.ppc ? (
                                            <span className="text-green-400">▲</span>
                                          ) : group.precioActual < group.ppc ? (
                                            <span className="text-red-400">▼</span>
                                          ) : (
                                            <span className="text-slate-400">●</span>
                                          )}
                                          <span className={group.precioActual >= group.ppc ? 'text-cyan-400' : 'text-orange-400'}>
                                            {formatCurrency(group.precioActual)}
                                          </span>
                                        </div>
                                      ) : (
                                        loading ? <span className="text-slate-400">...</span> : <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-slate-400">
                                      {formatCurrency(group.valorInicial)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold">
                                      {group.valorActual ? (
                                        <span className={group.valorActual >= group.valorInicial ? 'text-green-400' : 'text-red-400'}>
                                          {formatCurrency(group.valorActual)}
                                        </span>
                                      ) : (
                                        loading ? <span className="text-slate-400">...</span> : <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                      {group.rendimiento !== undefined ? (
                                        <div className="flex flex-col items-end">
                                          <span className={group.rendimiento >= 0 ? 'text-green-400' : 'text-red-400'}>
                                            {group.rendimiento >= 0 ? '+' : ''}{formatCurrency(group.rendimiento)}
                                          </span>
                                          <span className={`text-xs ${group.rendimientoPorcentaje && group.rendimientoPorcentaje >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {group.rendimientoPorcentaje !== undefined ? `${group.rendimientoPorcentaje >= 0 ? '+' : ''}${group.rendimientoPorcentaje.toFixed(2)}%` : ''}
                                          </span>
                                        </div>
                                      ) : (
                                        loading ? <span className="text-slate-400">...</span> : <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                  </tr>
                                  
                                  {/* Filas expandidas - detalle de operaciones (solo si hay múltiples) */}
                                  {hasMultipleOperations && isExpanded && group.operaciones.map((op: any, idx: number) => {
                                    const percentageOfTotal = (op.cantidad / group.cantidadTotal) * 100;
                                    return (
                                      <tr 
                                        key={`${group.ticker}-${idx}`}
                                        className="bg-slate-700/30 border-b border-slate-700/50 text-sm"
                                      >
                                        <td className="px-4 py-2"></td>
                                        <td className="px-4 py-2 text-slate-400">└─</td>
                                        <td className="px-4 py-2 text-slate-400 text-xs">
                                          Operación {idx + 1}
                                          {op.moneda === 'Pesos' && (
                                            <span className="ml-2 text-xs text-amber-400">
                                              (convertido de ${op.precioOriginal.toLocaleString('es-AR', {minimumFractionDigits: 2})} ARS)
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-right text-slate-400">
                                          <div className="flex flex-col items-end">
                                            <span>{op.cantidad.toLocaleString('es-AR')}</span>
                                            <span className="text-xs text-slate-400">{percentageOfTotal.toFixed(1)}%</span>
                                          </div>
                                        </td>
                                        <td className="px-4 py-2 text-right text-slate-300">
                                          {op.moneda === 'Pesos' ? (
                                            <span className="relative group cursor-help inline-flex items-center">
                                              {/* Tooltip visual inmediato a la izquierda */}
                                              <span className="absolute right-full mr-2 z-20 px-3 py-2 rounded bg-slate-900 text-xs text-slate-100 shadow-lg border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus:opacity-100 pointer-events-none transition-opacity duration-75"
                                                style={{top: '50%', transform: 'translateY(-50%)'}}
                                              >
                                                Dólar MEP: ${op.dolarMEP?.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}<br/>
                                                Fecha: {op.fechaDolarMEP || '-'}<br/>
                                                Valor original: ${op.precioOriginal?.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ARS
                                              </span>
                                              <span className="underline decoration-dotted underline-offset-2">
                                                {formatCurrency(op.precioUSD)}
                                              </span>
                                            </span>
                                          ) : (
                                            formatCurrency(op.precioUSD)
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-right text-slate-300">
                                        </td>
                                        <td className="px-4 py-2 text-right text-slate-300">
                                          {/* Inversión Consolidada de la operación */}
                                          US$ {(op.precioUSD * op.cantidad).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {/* Precio Actual no aplica a la operación individual, dejar vacío o mostrar '-' */}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-4 bg-slate-700/30 rounded-lg">
        <p className="text-xs text-slate-400">
          💡 <strong>Nota:</strong> Todos los valores están expresados en dólares (USD). 
          Las operaciones en pesos se convierten usando el dólar MEP del día de la operación. 
          El PPC (Precio Promedio de Compra) se calcula ponderando por cantidad.
        </p>
      </div>
    </div>
  );
};

export default CarteraActual;
