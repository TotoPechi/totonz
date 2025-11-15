import React, { useState, useMemo } from 'react';

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

interface TickerOrdersProps {
  operaciones: any[];
  hoveredOperacionIndex: number | null;
  setHoveredOperacionIndex: (idx: number | null) => void;
  showHeader?: boolean; // Para controlar si se muestra el header con el control de orden
}

const TickerOrders: React.FC<TickerOrdersProps> = ({ 
  operaciones, 
  hoveredOperacionIndex, 
  setHoveredOperacionIndex,
  showHeader = true
}) => {
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc'); // 'desc' = Más reciente primero (default), 'asc' = Más antiguo primero

  // Ordenar operaciones según el orden seleccionado y crear mapeo de índices
  const { sortedOperaciones, indexMap } = useMemo(() => {
    if (!operaciones || operaciones.length === 0) return { sortedOperaciones: [], indexMap: new Map() };
    
    // Crear array con índice original
    const withOriginalIndex = operaciones.map((op, originalIdx) => ({ op, originalIdx }));
    
    // Ordenar manteniendo el índice original
    withOriginalIndex.sort((a, b) => {
      const dateA = new Date(a.op.fecha).getTime();
      const dateB = new Date(b.op.fecha).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
    
    // Crear mapeo: índice en array ordenado -> índice en array original
    const map = new Map<number, number>();
    const sorted = withOriginalIndex.map((item, sortedIdx) => {
      map.set(sortedIdx, item.originalIdx);
      return item.op;
    });
    
    return { sortedOperaciones: sorted, indexMap: map };
  }, [operaciones, sortOrder]);

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    // Resetear el hover cuando cambia el orden para evitar índices incorrectos
    setHoveredOperacionIndex(null);
  };

  if (!operaciones || operaciones.length === 0) return null;
  
  return (
    <div className="bg-slate-700/30 rounded-lg p-4 flex flex-col h-full" style={{ maxHeight: '530px' }}>
      {showHeader && (
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h3 className="text-lg font-semibold text-white">📊 Operaciones Históricas</h3>
          <button
            onClick={toggleSortOrder}
            className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded-lg transition-colors flex items-center gap-2"
            title={sortOrder === 'desc' ? 'Mostrar Más antiguo primero' : 'Mostrar Más reciente primero'}
          >
            <span>{sortOrder === 'desc' ? '▼' : '▲'}</span>
            <span>{sortOrder === 'desc' ? 'Más reciente primero' : 'Más antiguo primero'}</span>
          </button>
        </div>
      )}
      <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0" style={{ maxHeight: 'calc(530px - 80px)' }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-800 z-10">
            <tr>
              <th className="px-2 py-2 text-left text-slate-300 font-semibold text-xs">Tipo</th>
              <th className="px-2 py-2 text-left text-slate-300 font-semibold text-xs">Fecha</th>
              <th className="px-2 py-2 text-right text-slate-300 font-semibold text-xs">Cantidad</th>
              <th className="px-2 py-2 text-right text-slate-300 font-semibold text-xs">Precio</th>
              <th className="px-2 py-2 text-right text-slate-300 font-semibold text-xs">Monto</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {sortedOperaciones.map((op, sortedIdx) => {
              // Obtener el índice original para el gráfico
              const originalIdx = indexMap.get(sortedIdx) ?? sortedIdx;
              return (
              <tr
                key={sortedIdx}
                className={`border-b border-slate-700/30 transition-colors cursor-pointer ${
                  hoveredOperacionIndex === originalIdx ? 'bg-slate-600/50' : 'hover:bg-slate-700/30'
                }`}
                onMouseEnter={() => setHoveredOperacionIndex(originalIdx)}
                onMouseLeave={() => setHoveredOperacionIndex(null)}
              >
                <td className="px-2 py-2">
                  <span className={
                    op.tipo === 'COMPRA' || op.tipo === 'LIC' 
                      ? 'text-green-400 font-bold' 
                      : op.tipo === 'RESCATE_PARCIAL'
                      ? 'text-orange-400 font-bold'
                      : 'text-red-400 font-bold'
                  }>
                    {op.tipo === 'LIC' ? 'LICIT' : op.tipo === 'RESCATE_PARCIAL' ? 'RESC' : op.tipo}
                  </span>
                </td>
                <td className="px-2 py-2 text-slate-400">{formatearFecha(op.fecha)}</td>
                <td className="px-2 py-2 text-right text-slate-300">{op.cantidad.toLocaleString('es-AR')}</td>
                <td className="px-2 py-2 text-right">
                  <span className="text-cyan-300 relative group">
                    {(() => {
                      const precioUSD = op.precioUSD;
                      const esPrecioMenorA1 = precioUSD < 1;
                      const mostrarPrecioPesos = op.monedaOriginal === 'ARS' && op.precioOriginal && esPrecioMenorA1;
                      
                      return (
                        <>
                          <span
                            className={
                              op.monedaOriginal === 'ARS' && op.precioOriginal
                                ? 'underline decoration-dotted cursor-help'
                                : ''
                            }
                          >
                            ${precioUSD.toFixed(2)}
                            {mostrarPrecioPesos && (
                              <span className="text-slate-400 ml-1">
                                (${op.precioOriginal.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS)
                              </span>
                            )}
                          </span>
                          {op.monedaOriginal === 'ARS' && op.precioOriginal && (
                            <span className="absolute left-1/2 z-20 -translate-x-1/2 mt-2 px-2 py-1 rounded bg-slate-900 text-xs text-slate-100 shadow-lg border border-slate-700 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-75 whitespace-nowrap min-w-max">
                              {esPrecioMenorA1 ? (
                                <>Dólar: ${op.dolarUsado.toFixed(2)}</>
                              ) : (
                                <>
                                  ${op.precioOriginal.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
                                  <span className="ml-1 text-slate-400">(Dólar: ${op.dolarUsado.toFixed(2)})</span>
                                </>
                              )}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">
                  <span className="text-purple-400 relative group">
                    <span
                      className={
                        op.monedaOriginal === 'ARS' && op.montoOriginal
                          ? 'underline decoration-dotted cursor-help'
                          : ''
                      }
                    >
                      ${op.montoUSD.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </span>
                    {op.monedaOriginal === 'ARS' && op.montoOriginal && (
                      <span className="absolute left-1/2 z-20 -translate-x-1/2 mt-2 px-2 py-1 rounded bg-slate-900 text-xs text-slate-100 shadow-lg border border-slate-700 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-75 whitespace-nowrap min-w-max">
                        ${op.montoOriginal.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
                        <span className="ml-1 text-slate-400">(Dólar: ${op.dolarUsado.toFixed(2)})</span>
                      </span>
                    )}
                  </span>
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

export default TickerOrders;
