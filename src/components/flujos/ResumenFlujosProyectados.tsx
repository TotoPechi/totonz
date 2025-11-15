import React from 'react';
import { formatCurrency } from '../../utils/chartHelpers';

interface ResumenFlujosProyectadosProps {
  valorAcciones: number;
  valorCedear: number;
  saldosTotalUSD: number;
  tenenciaNoAmortizable: number;
  flujoProyectadoTotal: number;
  fechaUltimoCobro: string | null;
  tenenciaTotalATermino: number;
  montoInvertido: number;
  rendimientoATermino: number;
  rendimientoPorcentaje: number;
}

// Función para formatear fecha
function formatearFecha(fecha: string | null): string {
  if (!fecha) return '';
  if (fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) return fecha;
  if (fecha.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
  }
  try {
    const date = new Date(fecha);
    if (!isNaN(date.getTime())) {
      const dia = String(date.getDate()).padStart(2, '0');
      const mes = String(date.getMonth() + 1).padStart(2, '0');
      const anio = date.getFullYear();
      return `${dia}/${mes}/${anio}`;
    }
  } catch (e) {}
  return fecha || '';
}

const ResumenFlujosProyectados: React.FC<ResumenFlujosProyectadosProps> = ({
  valorAcciones,
  valorCedear,
  saldosTotalUSD,
  tenenciaNoAmortizable,
  flujoProyectadoTotal,
  fechaUltimoCobro,
  tenenciaTotalATermino,
  montoInvertido,
  rendimientoATermino,
  rendimientoPorcentaje,
}) => {
  const fechaFormateada = formatearFecha(fechaUltimoCobro);
  const accionesYCedears = valorAcciones + valorCedear;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {/* Cuenta 1: Tenencia no amortizable */}
      <div className="bg-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Tenencia no amortizable</h3>
        <table className="w-full text-sm">
          <tbody className="text-white">
            <tr>
              <td className="text-slate-300 py-1">Acciones + CEDEARs</td>
              <td className="text-right text-slate-300 font-semibold py-1">{formatCurrency(accionesYCedears)}</td>
            </tr>
            <tr>
              <td className="text-slate-300 py-1">Monedas</td>
              <td className="text-right text-slate-300 font-semibold py-1">+ {formatCurrency(saldosTotalUSD)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="border-t border-slate-600 pt-2"></td>
            </tr>
            <tr>
              <td className="text-lg font-bold text-slate-200 pt-2">Total</td>
              <td className="text-right text-lg font-bold text-slate-200 pt-2">{formatCurrency(tenenciaNoAmortizable)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cuenta 2: Tenencia total a término */}
      <div className="bg-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">
          Tenencia total a término
        </h3>
        <table className="w-full text-sm">
          <tbody className="text-white">
            <tr>
              <td className="text-slate-300 py-1 whitespace-nowrap">
                Flujo proyectado al {fechaFormateada ? ` ${fechaFormateada}` : ''}
              </td>
              <td className="text-right text-slate-300 font-semibold py-1">{formatCurrency(flujoProyectadoTotal)}</td>
            </tr>
            <tr>
              <td className="text-slate-300 py-1">Tenencias no amortizables</td>
              <td className="text-right text-slate-300 font-semibold py-1">+ {formatCurrency(tenenciaNoAmortizable)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="border-t border-slate-600 pt-2"></td>
            </tr>
            <tr>
              <td className="text-lg font-bold text-slate-200 pt-2">
                Total
              </td>
              <td className="text-right text-lg font-bold text-green-400 pt-2">{formatCurrency(tenenciaTotalATermino)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cuenta 3: Rendimiento a término */}
      <div className="bg-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">
          Rendimiento a término
        </h3>
        <table className="w-full text-sm">
          <tbody className="text-white">
            <tr>
              <td className="text-slate-300 py-1 whitespace-nowrap">
                Tenencias al {fechaFormateada ? ` ${fechaFormateada}` : ''}
              </td>
              <td className="text-right text-slate-300 font-semibold py-1">{formatCurrency(tenenciaTotalATermino)}</td>
            </tr>
            <tr>
              <td className="text-slate-300 py-1">Monto invertido</td>
              <td className="text-right text-slate-300 font-semibold py-1">- {formatCurrency(montoInvertido)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="border-t border-slate-600 pt-2"></td>
            </tr>
            <tr>
              <td className="text-lg font-bold text-slate-200 pt-2">
                Rendimiento
              </td>
              <td className="text-right pt-2">
                <div className="flex items-center justify-end gap-2">
                  <span
                    className={`text-lg font-bold ${rendimientoATermino >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {formatCurrency(rendimientoATermino)}
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

export default ResumenFlujosProyectados;

