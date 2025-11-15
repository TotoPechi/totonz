import React from 'react';

interface HistoricalSummaryProps {
  totalComprado: number;
  totalVendido: number;
  gananciaPerdida: number;
  gananciaPerdidaPorcentaje: number;
  ppc: number;
  precioPromedioVenta: number;
  cantidadTotalComprada: number;
  cantidadTotalVendida: number;
  showTitle?: boolean;
}

const HistoricalSummary: React.FC<HistoricalSummaryProps> = ({
  totalComprado,
  totalVendido,
  gananciaPerdida,
  gananciaPerdidaPorcentaje,
  ppc,
  precioPromedioVenta,
  cantidadTotalComprada,
  cantidadTotalVendida,
  showTitle = true
}) => {
  return (
    <div className="bg-slate-700/50 rounded-lg p-6">
      {showTitle && (
        <h4 className="text-lg font-bold text-white mb-4">📊 Resumen Histórico</h4>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Total Comprado</p>
          <p className="text-white text-xl font-semibold mt-1">
            US$ {totalComprado.toLocaleString('es-AR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </p>
          <p className="text-slate-400 text-xs mt-1">
            {cantidadTotalComprada.toLocaleString('es-AR')} unidades
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Total Vendido</p>
          <p className="text-white text-xl font-semibold mt-1">
            US$ {totalVendido.toLocaleString('es-AR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </p>
          <p className="text-slate-400 text-xs mt-1">
            {cantidadTotalVendida.toLocaleString('es-AR')} unidades
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Ganancia/Pérdida</p>
          <p className={`text-xl font-semibold mt-1 ${
            gananciaPerdida >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {gananciaPerdida >= 0 ? '+' : ''}US$ {Math.abs(gananciaPerdida).toLocaleString('es-AR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </p>
          <p className={`text-xs mt-1 ${
            gananciaPerdidaPorcentaje >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {gananciaPerdidaPorcentaje >= 0 ? '+' : ''}{gananciaPerdidaPorcentaje.toFixed(2)}%
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-slate-400 text-sm">PPC</p>
          <p className="text-white text-xl font-semibold mt-1">
            US$ {ppc.toLocaleString('es-AR', {
              minimumFractionDigits: 4,
              maximumFractionDigits: 4
            })}
          </p>
          {precioPromedioVenta > 0 && (
            <p className="text-slate-400 text-xs mt-1">
              Venta promedio: US$ {precioPromedioVenta.toLocaleString('es-AR', {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoricalSummary;

