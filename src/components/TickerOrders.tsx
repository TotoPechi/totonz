import React from 'react';

interface TickerOrdersProps {
  operaciones: any[];
  hoveredOperacionIndex: number | null;
  setHoveredOperacionIndex: (idx: number | null) => void;
}

const TickerOrders: React.FC<TickerOrdersProps> = ({ operaciones, hoveredOperacionIndex, setHoveredOperacionIndex }) => {
  if (!operaciones || operaciones.length === 0) return null;
  return (
    <div className="bg-slate-700/30 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-4">📊 Operaciones Históricas</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden" style={{ padding: '5px' }}>
        {operaciones.map((op, idx) => (
          <div 
            key={idx} 
            className="bg-slate-800/50 rounded p-3 pr-6 text-sm font-mono transition-all cursor-pointer"
            onMouseEnter={() => setHoveredOperacionIndex(idx)}
            onMouseLeave={() => setHoveredOperacionIndex(null)}
            style={{
              backgroundColor: hoveredOperacionIndex === idx ? 'rgba(100, 116, 139, 0.5)' : undefined,
            }}
          >
            <span className={op.tipo === 'COMPRA' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
              {op.tipo}
            </span>
            <span className="mx-3 text-slate-400">{op.fecha}</span>
            <span className="mx-3 text-slate-300">{op.cantidad} unidades</span>
            <span className="mx-3 text-cyan-300">Precio: ${op.precioUSD.toFixed(2)}</span>
            <span className="mx-3 text-purple-400">Monto: ${op.montoUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="mx-3 text-amber-400">Costo: ${op.costoOperacionUSD.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TickerOrders;
