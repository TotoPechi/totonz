import React from 'react';

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

interface BondInfoProps {
  bond: any;
  showBondDescTooltip: boolean;
  setShowBondDescTooltip: (show: boolean) => void;
}

const BondInfo: React.FC<BondInfoProps> = ({ bond, showBondDescTooltip, setShowBondDescTooltip }) => {
  if (!bond) return null;
  return (
    <div className="bg-slate-800/70 rounded-lg p-4 w-80 h-[210px] flex flex-col">
      <h4 className="text-base font-semibold text-white border-b border-slate-600 pb-2 flex items-center gap-2 flex-shrink-0">
        Información del Bono
        {bond.description && (
          <div className="relative flex">
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-xs cursor-help border border-blue-400/30"
              onMouseEnter={() => setShowBondDescTooltip(true)}
              onMouseLeave={() => setShowBondDescTooltip(false)}
            >
              ℹ
            </span>
            {showBondDescTooltip && (
              <div className="absolute left-0 top-full mt-2 w-64 bg-slate-900 text-slate-200 text-xs rounded-lg p-3 shadow-xl border border-slate-700 z-50">
                <div className="font-semibold text-blue-400 mb-1">Descripción del Bono:</div>
                <div className="text-slate-300">{bond.description}</div>
                <div className="absolute -top-1 left-3 w-2 h-2 bg-slate-900 border-l border-t border-slate-700 transform rotate-45"></div>
              </div>
            )}
          </div>
        )}
      </h4>
      <div className="mt-3 space-y-3 text-xs">
        {/* 3 líneas: label a la izq, dato a la derecha */}
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Cupón:</span>
          <span className="text-slate-200 font-semibold text-right">
            {bond.couponType && `${bond.couponType} `}{bond.coupon}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Próximo Pago:</span>
          <span className="text-slate-200 text-right">
            {formatearFecha(bond.nextPaymentDate)}
            {bond.nextPaymentDays !== undefined && (
              <span className="text-slate-400 text-xs ml-1">
                ({bond.nextPaymentDays}d)
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Rendimiento:</span>
          <span className="text-slate-200 font-semibold text-right">
            {bond.currentYield}
            {bond.frequency && (
              <span className="text-slate-400 text-xs ml-1">
                ({bond.frequency})
              </span>
            )}
          </span>
        </div>
        {/* 2 líneas: 2 columnas, label y valor juntos */}
        <div className="flex gap-6 mt-4">
          <div className="flex flex-col flex-1 gap-2">
            <div className="text-slate-400">
              Emisión: <span className="text-slate-200">{formatearFecha(bond.issuanceDate)}</span>
            </div>
            <div className="text-slate-400">
              TIR: <span className="text-green-400 font-bold">{bond.yield}</span>
            </div>
          </div>
          <div className="flex flex-col flex-1 items-end gap-2">
            <div className="text-slate-400">
              Vto: <span className="text-slate-200">{formatearFecha(bond.maturity)}</span>
            </div>
            <div className="text-slate-400">
              Jurisdicción: <span className="text-slate-200">{bond.jurisdiction}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BondInfo;
