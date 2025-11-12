import React, { useEffect, useState } from 'react';
import { getTickerHoldingData } from '../services/tickerHoldingData';
import { getDolarMEP, getEstadoCuentaConCache } from '../services/balanzApi';

interface TickerHoldingProps {
  positions: any[];
  selectedTicker: string;
  tickerInfo: any;
}


const TickerHolding: React.FC<TickerHoldingProps> = ({ positions, selectedTicker, tickerInfo }) => {
  // Tooltip control (debe ir antes de cualquier return o condicional)
  const [showTooltip, setShowTooltip] = useState(false);
  const [holdingData, setHoldingData] = useState<any>(null);
  const [dolarMEP, setDolarMEP] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const estadoCuenta = await getEstadoCuentaConCache();
      let mep = null;
      if (estadoCuenta.data && estadoCuenta.data.cotizacionesDolar) {
        mep = getDolarMEP(estadoCuenta.data.cotizacionesDolar);
        setDolarMEP(mep);
      }
      if (mep) {
        const data = await getTickerHoldingData(selectedTicker, positions, mep);
        setHoldingData(data);
      }
    };
    fetchData();
  }, [positions, selectedTicker]);

  if (!holdingData) return null;


  const { cantidadTotal, valorInicial, valorActual, rendimiento, rendimientoPorcentaje } = holdingData;

  // Obtener dividendos y rentas desde props si existen (usados en TickerHeader)
  // Buscar en el árbol de React si no están en props, pero aquí asumimos que llegan por props o contexto
  // Por ahora, para compatibilidad, intentamos obtenerlos del tickerInfo si existen
  const dividendos = tickerInfo?.dividendos || [];
  const rentas = tickerInfo?.rentas || [];
  const totalDividendos = Array.isArray(dividendos) ? dividendos.reduce((sum, d) => sum + (d.montoNeto || 0), 0) : 0;
  const totalRentas = Array.isArray(rentas) ? rentas.reduce((sum, r) => sum + (r.montoNeto || 0), 0) : 0;
  const totalExtra = totalDividendos + totalRentas;
  const rendimientoConsolidado = rendimiento + totalExtra;
  const porcentajeExtra = valorInicial > 0 ? (totalExtra / valorInicial) * 100 : 0;
  const porcentajeConsolidado = rendimientoPorcentaje + porcentajeExtra;



  return (
    <div className="text-right space-y-3">
      <div>
        <p className="text-xs text-slate-400 mb-1">Valor Actual</p>
        <p className="text-3xl font-bold text-cyan-400">
          USD {valorActual.toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}
        </p>
        <p className="text-sm text-slate-400 mt-1">
          {cantidadTotal} {cantidadTotal === 1 ? 'unidad' : 'unidades'}
        </p>
      </div>
      <div className="pt-3 border-t border-slate-600/50">
        <p className="text-xs text-slate-400 mb-1">Inversión Inicial</p>
        <p className="text-base font-medium text-slate-300">
          USD {valorInicial.toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}
        </p>
      </div>
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <p className="text-xs text-slate-400 mb-1">Rendimiento Consolidado</p>
        <div className="flex flex-col items-end cursor-pointer">
          <span className={rendimientoConsolidado >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
            USD {rendimientoConsolidado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={`text-xs ${porcentajeConsolidado >= 0 ? 'text-green-400' : 'text-red-400'}`}>{porcentajeConsolidado >= 0 ? '+' : ''}{porcentajeConsolidado.toFixed(2)}%</span>
        </div>
        {showTooltip && (
          <div className="absolute right-0 z-20 mt-2 w-[15rem] bg-slate-900 border border-slate-700 rounded-lg shadow-lg p-4 text-xs text-slate-200 text-left animate-fade-in">
            <div className="mb-2">
            <span className="text-slate-400 font-normal">diferencia por precio + dividendos</span>
            </div>
            <div className="mb-2">
                <span className={rendimiento >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                {rendimiento >= 0 ? '+' : ''}{rendimiento.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {totalDividendos > 0 && <span> +{totalDividendos.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-slate-400 font-normal"></span></span>}
              {totalRentas > 0 && <span> +{totalRentas.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-slate-400 font-normal"></span></span>}
              <span> = </span>
              <span className={rendimientoConsolidado >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                USD {rendimientoConsolidado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className={rendimientoPorcentaje >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                {rendimientoPorcentaje >= 0 ? '+' : ''}{rendimientoPorcentaje.toFixed(2)}%
              </span>
              {totalDividendos > 0 && <span> +{porcentajeExtra.toFixed(2)}% <span className="text-slate-400 font-normal"></span></span>}
              {totalRentas > 0 && <span> +{porcentajeExtra.toFixed(2)}% <span className="text-slate-400 font-normal"></span></span>}
              <span> = </span>
              <span className={porcentajeConsolidado >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                {porcentajeConsolidado >= 0 ? '+' : ''}{porcentajeConsolidado.toFixed(2)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TickerHolding;
