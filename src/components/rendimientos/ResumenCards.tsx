import React from 'react';
import { formatCurrency } from '../../utils/chartHelpers';

interface ResumenCardsProps {
  totalIngresosUSD: number;
  totalEgresosUSD: number;
  montoInvertido: number;
  valorActualTotal: number;
  saldosTotalUSD: number;
  dividendosTotal: number;
  rentasTotal: number;
  tenenciaTotal: number;
  rendimientoTotal: number;
  rendimientoPorcentaje: number;
}

const ResumenCards: React.FC<ResumenCardsProps> = ({
  totalIngresosUSD,
  totalEgresosUSD,
  montoInvertido,
  valorActualTotal,
  saldosTotalUSD,
  dividendosTotal,
  rentasTotal,
  tenenciaTotal,
  rendimientoTotal,
  rendimientoPorcentaje,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {/* Cuenta 1: Monto Invertido */}
      <div className="bg-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Monto Invertido</h3>
        <table className="w-full text-sm">
          <tbody className="text-white">
            <tr>
              <td className="text-slate-300 py-1">Depósitos</td>
              <td className="text-right text-slate-300 font-semibold py-1">{formatCurrency(totalIngresosUSD)}</td>
            </tr>
            <tr>
              <td className="text-slate-300 py-1">Extracciones</td>
              <td className="text-right text-slate-300 font-semibold py-1">- {formatCurrency(totalEgresosUSD)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="border-t border-slate-600 pt-2"></td>
            </tr>
            <tr>
              <td className="text-lg font-bold text-slate-200 pt-2">Monto Invertido</td>
              <td className="text-right text-lg font-bold text-slate-200 pt-2">{formatCurrency(montoInvertido)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cuenta 2: Tenencia Total */}
      <div className="bg-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Tenencia Total</h3>
        <table className="w-full text-sm">
          <tbody className="text-white">
            <tr>
              <td className="text-slate-300 py-1">Valor de activos</td>
              <td className="text-right text-slate-300 font-semibold py-1">{formatCurrency(valorActualTotal)}</td>
            </tr>
            <tr>
              <td className="text-slate-300 py-1">Saldos en Moneda</td>
              <td className="text-right text-slate-300 font-semibold py-1">+ {formatCurrency(saldosTotalUSD)}</td>
            </tr>
            <tr>
              <td className="text-slate-300 py-1">Dividendos Totales</td>
              <td className="text-right text-slate-300 font-semibold py-1">+ {formatCurrency(dividendosTotal)}</td>
            </tr>
            <tr>
              <td className="text-slate-300 py-1">Rentas Totales</td>
              <td className="text-right text-slate-300 font-semibold py-1">+ {formatCurrency(rentasTotal)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="border-t border-slate-600 pt-2"></td>
            </tr>
            <tr>
              <td className="text-lg font-bold text-slate-200 pt-2">Tenencia total</td>
              <td className="text-right text-lg font-bold text-green-400 pt-2">{formatCurrency(tenenciaTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cuenta 3: Rendimiento Total */}
      <div className="bg-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Rendimiento Total</h3>
        <table className="w-full text-sm">
          <tbody className="text-white">
            <tr>
              <td className="text-slate-300 py-1">Tenencia total</td>
              <td className="text-right text-slate-300 font-semibold py-1">{formatCurrency(tenenciaTotal)}</td>
            </tr>
            <tr>
              <td className="text-slate-300 py-1">Monto Invertido</td>
              <td className="text-right text-slate-300 font-semibold py-1">- {formatCurrency(montoInvertido)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="border-t border-slate-600 pt-2"></td>
            </tr>
            <tr>
              <td className="text-lg font-bold text-slate-200 pt-2">Rendimiento</td>
              <td className="text-right pt-2">
                <div className="flex items-center justify-end gap-2">
                  <span
                    className={`text-lg font-bold ${rendimientoTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {formatCurrency(rendimientoTotal)}
                  </span>
                  <span
                    className={`text-sm ${rendimientoPorcentaje >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    ({rendimientoPorcentaje >= 0 ? '+' : ''}
                    {rendimientoPorcentaje.toFixed(2)}%)
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResumenCards;

