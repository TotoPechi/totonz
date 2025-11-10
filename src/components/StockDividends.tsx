import React from 'react';

interface StockDividendsProps {
  dividendos: Array<{ fecha: string; montoNeto: number }>;
}

const StockDividends: React.FC<StockDividendsProps> = ({ dividendos }) => {
  if (!dividendos || dividendos.length === 0) return null;
  return (
    <div className="bg-slate-800/70 rounded-lg p-4 w-80 h-[210px] flex flex-col">
      <h4 className="text-lg font-semibold text-white border-b border-slate-600 pb-2 flex-shrink-0">
        💰 Dividendos:
        <span className="text-sm font-normal text-green-400 ml-2">
          ${dividendos.reduce((sum, div) => sum + div.montoNeto, 0).toFixed(2)}
        </span>
      </h4>
      <div className="space-y-2 text-sm overflow-y-auto pr-2 flex-1 min-h-0 mt-3">
        {dividendos.map((div, idx) => (
          <div key={idx} className="text-slate-300">
            {div.fecha} - <span className="text-green-400 font-semibold">${div.montoNeto.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockDividends;
