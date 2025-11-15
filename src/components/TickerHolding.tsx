import React, { useEffect, useState } from 'react';
import { getTickerHoldingData } from '../services/tickerHoldingData';
import { getDolarMEP, getEstadoCuentaConCache } from '../services/balanzApi';
import { formatearFecha } from '../utils/chartHelpers';

interface TickerHoldingProps {
  positions: any[];
  selectedTicker: string;
  tickerInfo: any;
  valorInicialConsolidado?: number;
  rendimientoATermino?: {
    valorATermino: number;
    rentasPasadas: number;
    rendimiento: number;
    porcentaje: number;
  };
}


const TickerHolding: React.FC<TickerHoldingProps> = ({ positions, selectedTicker, tickerInfo, valorInicialConsolidado, rendimientoATermino }) => {
  // Tooltip control (debe ir antes de cualquier return o condicional)
  const [showTooltip, setShowTooltip] = useState(false);
  const [showTooltipATermino, setShowTooltipATermino] = useState(false);
  const [holdingData, setHoldingData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const estadoCuenta = await getEstadoCuentaConCache();
      let mep = null;
      if (estadoCuenta.data && estadoCuenta.data.cotizacionesDolar) {
        mep = getDolarMEP(estadoCuenta.data.cotizacionesDolar);
      }
      if (mep) {
        const data = await getTickerHoldingData(selectedTicker, positions, mep);
        setHoldingData(data);
      }
    };
    fetchData();
  }, [positions, selectedTicker]);

  if (!holdingData) return null;


  const { cantidadTotal, valorInicial, valorInicialConsolidado: valorInicialConsolidadoDelServicio, valorActual } = holdingData;
  
  // Priorizar valorInicialConsolidado del servicio (calculado desde operaciones históricas)
  // Si no está disponible, usar el prop (para compatibilidad hacia atrás)
  // Finalmente, usar valorInicial de la API como último recurso
  const valorInicialFinal = valorInicialConsolidadoDelServicio !== undefined 
    ? valorInicialConsolidadoDelServicio 
    : (valorInicialConsolidado !== undefined ? valorInicialConsolidado : valorInicial);
  
  // Obtener dividendos y rentas desde props si existen (usados en TickerHeader)
  // Buscar en el árbol de React si no están en props, pero aquí asumimos que llegan por props o contexto
  // Por ahora, para compatibilidad, intentamos obtenerlos del tickerInfo si existen
  const dividendos = tickerInfo?.dividendos || [];
  const rentas = tickerInfo?.rentas || [];
  const totalDividendos = Array.isArray(dividendos) ? dividendos.reduce((sum, d) => sum + (d.montoNeto || 0), 0) : 0;
  const totalRentas = Array.isArray(rentas) ? rentas.reduce((sum, r) => sum + (r.montoNeto || 0), 0) : 0;
  const totalExtra = totalDividendos + totalRentas;
  
  // Recalcular rendimiento basado en valorInicialFinal (que puede ser consolidado o no)
  const rendimientoFinal = valorActual - valorInicialFinal;
  const rendimientoPorcentajeFinal = valorInicialFinal > 0 ? (rendimientoFinal / valorInicialFinal) * 100 : 0;
  
  const rendimientoConsolidado = rendimientoFinal + totalExtra;
  const porcentajeExtra = valorInicialFinal > 0 ? (totalExtra / valorInicialFinal) * 100 : 0;
  const porcentajeConsolidado = rendimientoPorcentajeFinal + porcentajeExtra;



  return (
    <div className="text-right space-y-3">
      <div>
        <p className="text-xs text-slate-300">Valor Actual ({cantidadTotal} {cantidadTotal === 1 ? 'unidad' : 'unidades'})</p>
        <p className="text-3xl font-bold text-cyan-400">
          USD {valorActual.toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}
        </p>

      </div>
      <div className="pt-1 border-slate-600/50">
        <p className="text-xs text-slate-300">Inversión Consolidada</p>
        <p className="text-base font-medium text-slate-300">
          USD {valorInicialFinal.toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}
        </p>
      </div>
      <div
        className="relative"
        {...(totalDividendos > 0 || totalRentas > 0 ? {
          onMouseEnter: () => setShowTooltip(true),
          onMouseLeave: () => setShowTooltip(false)
        } : {})}
      >
        <p className="text-xs text-slate-300">Rendimiento Actual</p>
        <div className={`flex items-center justify-end gap-2 ${(totalDividendos > 0 || totalRentas > 0) ? 'cursor-pointer' : ''} ${rendimientoConsolidado >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          <span className="font-semibold">
            USD {rendimientoConsolidado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs">{porcentajeConsolidado >= 0 ? '+' : ''}{porcentajeConsolidado.toFixed(2)}%</span>
        </div>
        {showTooltip && (totalDividendos > 0 || totalRentas > 0) && (
          <div className="absolute right-0 z-20 mt-2 w-[18rem] bg-slate-900 border border-slate-700 rounded-lg shadow-lg p-4 text-sm text-slate-200 text-left animate-fade-in">
            <table className="w-full text-sm">
              <tbody className="text-white">
                <tr>
                  <td className="text-slate-300 py-1">Diferencia por precio</td>
                  <td className="text-right text-slate-300 font-semibold py-1">
                    USD {rendimientoFinal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
                {totalDividendos > 0 && (
                  <tr>
                    <td className="text-slate-300 py-1">Dividendos</td>
                    <td className="text-right text-slate-300 font-semibold py-1">
                      + USD {totalDividendos.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}
                {totalRentas > 0 && (
                  <tr>
                    <td className="text-slate-300 py-1">Renta pasada</td>
                    <td className="text-right text-slate-300 font-semibold py-1">
                      + USD {totalRentas.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={2} className="border-t border-slate-600 pt-2"></td>
                </tr>
                <tr>
                  <td className="text-sm font-bold text-slate-200 pt-2">Rendimiento Actual</td>
                  <td className="text-right text-sm font-bold text-slate-200 pt-2">
                    USD {rendimientoConsolidado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      {rendimientoATermino && (
        <div
          className="relative pt-1"
          onMouseEnter={() => setShowTooltipATermino(true)}
          onMouseLeave={() => setShowTooltipATermino(false)}
        >
          <p className="text-xs text-slate-300">Rendimiento a término</p>
          <div className={`flex items-center justify-end gap-2 cursor-pointer ${rendimientoATermino.rendimiento >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            <span className="font-semibold">
              USD {rendimientoATermino.rendimiento.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs">
              {rendimientoATermino.porcentaje >= 0 ? '+' : ''}{rendimientoATermino.porcentaje.toFixed(2)}%
            </span>
          </div>
          {showTooltipATermino && (
            <div className="absolute right-0 z-20 mt-2 w-[24rem] bg-slate-900 border border-slate-700 rounded-lg shadow-lg p-4 text-sm text-slate-200 text-left animate-fade-in">
              <table className="w-full text-sm">
                <tbody className="text-white">
                  <tr>
                    <td className="text-slate-300 py-1 whitespace-nowrap">
                      <span>Pago a término</span>
                      {tickerInfo?.bond?.maturity && (
                        <span className="text-xs font-normal text-slate-400 ml-2">
                          ({formatearFecha(tickerInfo.bond.maturity)})
                        </span>
                      )}
                    </td>
                    <td className="text-right text-slate-300 font-semibold py-1">
                      USD {rendimientoATermino.valorATermino.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  {rendimientoATermino.rentasPasadas > 0 && (
                    <tr>
                      <td className="text-slate-300 py-1">Renta pasada</td>
                      <td className="text-right text-slate-300 font-semibold py-1">
                        + USD {rendimientoATermino.rentasPasadas.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                  {valorInicialFinal > 0 && (
                    <tr>
                      <td className="text-slate-300 py-1">Inversión consolidada</td>
                      <td className="text-right text-slate-300 font-semibold py-1">
                        - USD {valorInicialFinal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={2} className="border-t border-slate-600 pt-2"></td>
                  </tr>
                  <tr>
                    <td className="text-sm font-bold text-slate-200 pt-2 whitespace-nowrap">
                      <span>Rendimiento a termino</span>
                    </td>
                    <td className="text-right text-sm font-bold pt-2 whitespace-nowrap">
                      <span>
                        USD {rendimientoATermino.rendimiento.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TickerHolding;
