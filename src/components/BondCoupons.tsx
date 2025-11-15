import React from 'react';
import { formatearFecha } from '../utils/chartHelpers';

interface BondCouponsProps {
  rentas: Array<{ fecha: string; montoNeto: number; impuestosRetenidos: number; esInteresDevengado?: boolean }>;
  nextPaymentDate?: string;
  nextPaymentAmount?: {
    total: number;
    renta: number;
    amortizacion: number;
    unidades: number;
    currency: any;
    raw: any;
  };
  nextPaymentInfo?: string;
}

const BondCoupons: React.FC<BondCouponsProps> = ({ rentas, nextPaymentDate, nextPaymentAmount, nextPaymentInfo }) => {
  if (!rentas || rentas.length === 0) return null;
  return (
    <div className="bg-slate-800/70 rounded-lg p-4 w-80 h-[210px] flex flex-col">
      <h4 className="text-lg font-semibold text-white border-b border-slate-600 pb-2 flex-shrink-0">
        💵 Renta:
        <span className="text-sm font-normal text-green-400 ml-2">
          ${rentas.reduce((sum, rent) => sum + rent.montoNeto, 0).toFixed(2)}
        </span>
      </h4>
      <div className="space-y-2 text-sm overflow-y-auto pr-2 flex-1 min-h-0 mt-3">
        {/* Próximo pago */}
        {nextPaymentDate && nextPaymentAmount !== undefined && (
          <div className="text-slate-300">
            <span className="text-slate-400">{formatearFecha(nextPaymentDate)}</span>
            <span className="text-slate-300"> - </span>
            <span className="font-semibold">${nextPaymentAmount.total.toFixed(2)}</span>
            <span className="text-slate-400 text-xs ml-1">(próximo pago)</span>
          </div>
        )}
        {/* Pagos históricos */}
        {rentas.map((rent, idx) => (
          <div key={idx} className="text-slate-300">
            <span className="text-slate-400">{formatearFecha(rent.fecha)}</span>
            <span className="text-slate-300"> - </span>
            <span className="text-green-400 font-semibold">
              ${rent.montoNeto.toFixed(2)}
            </span>
            {rent.esInteresDevengado && (
              <span className="text-purple-400 text-xs ml-1 font-semibold">
                (I.D.)
              </span>
            )}
            <span className="text-slate-400 text-xs ml-1">
              (+${rent.impuestosRetenidos.toFixed(2)} de imp.)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BondCoupons;
