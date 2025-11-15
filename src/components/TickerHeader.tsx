import React from 'react';
import TickerInfo from './TickerInfo';
import BondInfo from './BondInfo';
import BondCoupons from './BondCoupons';
import StockDividends from './StockDividends';
import TickerHolding from './TickerHolding';

interface TickerHeaderProps {
  tickerInfo: any;
  selectedTicker: string;
  dolarMEP: number | null;
  getDecimalPlaces: (ticker: string) => number;
  bond?: any;
  showBondDescTooltip: boolean;
  setShowBondDescTooltip: (show: boolean) => void;
  dividendos: Array<{ fecha: string; montoNeto: number }>;
  rentas: Array<{ fecha: string; montoNeto: number; impuestosRetenidos: number; esInteresDevengado?: boolean }>;
  positions: any[];
  valorInicialConsolidado?: number;
  precioPromedioVenta?: number;
  rendimientoATermino?: {
    valorATermino: number;
    rentasPasadas: number;
    rendimiento: number;
    porcentaje: number;
  };
}

const TickerHeader: React.FC<TickerHeaderProps> = ({
  tickerInfo,
  selectedTicker,
  dolarMEP,
  getDecimalPlaces,
  bond,
  showBondDescTooltip,
  setShowBondDescTooltip,
  dividendos,
  rentas,
  positions,
  valorInicialConsolidado,
  precioPromedioVenta,
  rendimientoATermino
}) => {
  return (
    <div className="flex items-start justify-between gap-6">
      <TickerInfo 
        tickerInfo={tickerInfo}
        selectedTicker={selectedTicker}
        dolarMEP={dolarMEP}
        getDecimalPlaces={getDecimalPlaces}
      />
      {bond && (
        <BondInfo 
          bond={bond}
          showBondDescTooltip={showBondDescTooltip}
          setShowBondDescTooltip={setShowBondDescTooltip}
        />
      )}
      {dividendos.length > 0 && (
        <StockDividends dividendos={dividendos} />
      )}
      {rentas.length > 0 && (
        <BondCoupons 
          rentas={rentas}
          nextPaymentDate={bond?.nextPaymentDate}
            nextPaymentAmount={(() => {
              const nextDate = bond?.nextPaymentDate ? String(bond.nextPaymentDate).slice(0, 10) : 'N/A';
              // Log para depuración: mostrar todas las fechas y el valor buscado
              if (!bond || !bond.nextPaymentDate || !Array.isArray(bond.cashFlow)) {
                return undefined;
              }
              const cf = bond.cashFlow.find((c: any) => {
                const cfDate = String(c.date).slice(0, 10);
                if (cfDate === nextDate) {
                }
                return cfDate === nextDate;
              });
              const position = positions.find(p => p.Ticker === selectedTicker);
              const unidades = position ? position.Cantidad : 0;
              if (!cf) {
                return undefined;
              }
              // Desglose para mostrar en BondCoupons
              return {
                total: unidades * (Number(cf.rent || 0) + Number(cf.amortizationValue || 0)),
                renta: unidades * Number(cf.rent || 0),
                amortizacion: unidades * Number(cf.amortizationValue || 0),
                unidades,
                currency: cf.currency,
                raw: cf
              };
            })()}
            nextPaymentInfo={bond?.nextPaymentInfo}
        />
      )}
      <TickerHolding 
        positions={positions}
        selectedTicker={selectedTicker}
        tickerInfo={{
          ...tickerInfo,
          dividendos,
          rentas
        }}
        valorInicialConsolidado={valorInicialConsolidado}
        rendimientoATermino={rendimientoATermino}
      />
    </div>
  );
};

export default TickerHeader;
