import React from 'react';

interface TickerOrdersProps {
  operaciones: any[];
  hoveredOperacionIndex: number | null;
  setHoveredOperacionIndex: (idx: number | null) => void;
}

const TickerOrders: React.FC<TickerOrdersProps> = ({ operaciones, hoveredOperacionIndex, setHoveredOperacionIndex }) => {
  if (!operaciones || operaciones.length === 0) return null;
  return (
    <div className="bg-slate-700/30 rounded-lg p-4 flex flex-col h-full" style={{ maxHeight: '530px' }}>
      <h3 className="text-lg font-semibold text-white mb-4 flex-shrink-0">📊 Operaciones Históricas</h3>
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
            {operaciones.map((op, idx) => (
              <tr
                key={idx}
                className={`border-b border-slate-700/30 transition-colors cursor-pointer ${
                  hoveredOperacionIndex === idx ? 'bg-slate-600/50' : 'hover:bg-slate-700/30'
                }`}
                onMouseEnter={() => setHoveredOperacionIndex(idx)}
                onMouseLeave={() => setHoveredOperacionIndex(null)}
              >
                <td className="px-2 py-2">
                  <span className={
                    op.tipo === 'COMPRA' || op.tipo === 'LIC' 
                      ? 'text-green-400 font-bold' 
                      : 'text-red-400 font-bold'
                  }>
                    {op.tipo === 'LIC' ? 'LIC.' : op.tipo}
                  </span>
                </td>
                <td className="px-2 py-2 text-slate-400">{op.fecha}</td>
                <td className="px-2 py-2 text-right text-slate-300">{op.cantidad.toLocaleString('es-AR')}</td>
                <td className="px-2 py-2 text-right">
                  <span className="text-cyan-300 relative group">
                    <span
                      className={
                        op.monedaOriginal === 'ARS' && op.precioOriginal
                          ? 'underline decoration-dotted cursor-help'
                          : ''
                      }
                    >
                      ${op.precioUSD.toFixed(2)}
                    </span>
                    {op.monedaOriginal === 'ARS' && op.precioOriginal && (
                      <span className="absolute left-1/2 z-20 -translate-x-1/2 mt-2 px-2 py-1 rounded bg-slate-900 text-xs text-slate-100 shadow-lg border border-slate-700 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-75 whitespace-nowrap min-w-max">
                        ${op.precioOriginal.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                        <span className="ml-1 text-slate-400">(Dólar: ${op.dolarUsado.toFixed(2)})</span>
                      </span>
                    )}
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
                        ${op.montoOriginal.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                        <span className="ml-1 text-slate-400">(Dólar: ${op.dolarUsado.toFixed(2)})</span>
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TickerOrders;
