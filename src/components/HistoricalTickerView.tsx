import React from 'react';
import { Operacion } from '../types';
import HistoricalSummary from './HistoricalSummary';
import TickerOrders from './TickerOrders';

interface HistoricalSummaryData {
  totalComprado: number;
  totalVendido: number;
  gananciaPerdida: number;
  gananciaPerdidaPorcentaje: number;
  ppc: number;
  precioPromedioVenta: number;
  cantidadTotalComprada: number;
  cantidadTotalVendida: number;
  primeraOperacion?: string;
  ultimaOperacion?: string;
}

interface HistoricalTickerViewProps {
  ticker: string;
  historicalSummary: HistoricalSummaryData;
  operaciones: Operacion[];
  hoveredOperacionIndex: number | null;
  setHoveredOperacionIndex: (index: number | null) => void;
  formatDate: (dateStr: string) => string;
}

const HistoricalTickerView: React.FC<HistoricalTickerViewProps> = ({
  ticker,
  historicalSummary,
  operaciones,
  hoveredOperacionIndex,
  setHoveredOperacionIndex,
  formatDate
}) => {
  return (
    <div className="space-y-6">
      {/* Header con información básica */}
      <div className="bg-slate-700/50 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-2xl font-bold text-white mb-2">{ticker}</h3>
            <p className="text-slate-400 text-sm">
              Instrumento histórico - Información basada en operaciones históricas
            </p>
            {historicalSummary.primeraOperacion && historicalSummary.ultimaOperacion && (
              <p className="text-slate-400 text-xs mt-1">
                Período: {formatDate(historicalSummary.primeraOperacion)} - {formatDate(historicalSummary.ultimaOperacion)}
              </p>
            )}
          </div>
        </div>

        {/* Resumen de rendimiento */}
        <div className="mt-4">
          <HistoricalSummary
            totalComprado={historicalSummary.totalComprado}
            totalVendido={historicalSummary.totalVendido}
            gananciaPerdida={historicalSummary.gananciaPerdida}
            gananciaPerdidaPorcentaje={historicalSummary.gananciaPerdidaPorcentaje}
            ppc={historicalSummary.ppc}
            precioPromedioVenta={historicalSummary.precioPromedioVenta}
            cantidadTotalComprada={historicalSummary.cantidadTotalComprada}
            cantidadTotalVendida={historicalSummary.cantidadTotalVendida}
            showTitle={false}
          />
        </div>
      </div>

      {/* Operaciones Históricas */}
      <div className="bg-slate-700/50 rounded-lg p-6">
        <TickerOrders 
          operaciones={operaciones}
          hoveredOperacionIndex={hoveredOperacionIndex}
          setHoveredOperacionIndex={setHoveredOperacionIndex}
          showHeader={true}
        />
      </div>
    </div>
  );
};

export default HistoricalTickerView;

