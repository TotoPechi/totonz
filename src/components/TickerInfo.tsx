import React from 'react';

interface TickerInfoProps {
  tickerInfo: any;
  selectedTicker: string;
  dolarMEP: number | null;
  getDecimalPlaces: (ticker: string) => number;
}

const TickerInfo: React.FC<TickerInfoProps> = ({ tickerInfo, selectedTicker, dolarMEP, getDecimalPlaces }) => {
  return (
    <div className="flex-1 min-w-0 space-y-3">
      {/* Línea 1: Ticker + mappedSymbol */}
      <div className="flex items-baseline gap-3">
        <h3 className="text-3xl font-bold text-white">{tickerInfo.ticker}</h3>
        {tickerInfo.mappedSymbol && (
          <span className="text-sm text-slate-400">
            ({tickerInfo.mappedSymbol})
          </span>
        )}
      </div>
      {/* Línea 2: Descripción */}
      {tickerInfo.description && (
        <div className="min-w-0">
          <p className="text-lg text-slate-300 truncate">
            {tickerInfo.description}
          </p>
        </div>
      )}
      {/* Línea 3: Tipo y Categoría */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {tickerInfo.type && (
          <div>
            <span className="text-slate-400">Tipo:</span>{' '}
            <span className="text-slate-300">{tickerInfo.type}</span>
          </div>
        )}
        {tickerInfo.category && (
          <div>
            <span className="text-slate-400">Categoría:</span>{' '}
            <span className="text-slate-300">{tickerInfo.category}</span>
          </div>
        )}
      </div>
      {/* Línea 4: Precios (Último Cierre y Apertura) - Con conversión a USD si es ARS */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {tickerInfo.lastClose !== undefined && (
          <div>
            <span className="text-slate-400">Últ. Cierre:</span>{' '}
            <span className="text-slate-300 font-semibold">
              {tickerInfo.tickerCurrency === 'ARS' && dolarMEP ? (
                <>
                  USD {(tickerInfo.lastClose / dolarMEP).toLocaleString('es-AR', {
                    minimumFractionDigits: getDecimalPlaces(selectedTicker),
                    maximumFractionDigits: getDecimalPlaces(selectedTicker)
                  })}
                </>
              ) : (
                <>
                  {tickerInfo.currency} {tickerInfo.lastClose.toLocaleString('es-AR', {
                    minimumFractionDigits: getDecimalPlaces(selectedTicker),
                    maximumFractionDigits: getDecimalPlaces(selectedTicker)
                  })}
                </>
              )}
            </span>
          </div>
        )}
        {tickerInfo.open !== undefined && (
          <div>
            <span className="text-slate-400">Apert.:</span>{' '}
            <span className="text-slate-300 font-semibold">
              {tickerInfo.tickerCurrency === 'ARS' && dolarMEP ? (
                <>
                  USD {(tickerInfo.open / dolarMEP).toLocaleString('es-AR', {
                    minimumFractionDigits: getDecimalPlaces(selectedTicker),
                    maximumFractionDigits: getDecimalPlaces(selectedTicker)
                  })}
                </>
              ) : (
                <>
                  {tickerInfo.currency} {tickerInfo.open.toLocaleString('es-AR', {
                    minimumFractionDigits: getDecimalPlaces(selectedTicker),
                    maximumFractionDigits: getDecimalPlaces(selectedTicker)
                  })}
                </>
              )}
            </span>
          </div>
        )}
      </div>
      {/* Línea 5: Mercado y Ratio */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {tickerInfo.marketId && (
          <div>
            <span className="text-slate-400">Mercado:</span>{' '}
            <span className="text-slate-300">
              {tickerInfo.marketId}
              {tickerInfo.ratio && (
                <span className="text-slate-400 ml-2">
                  ({tickerInfo.ratio})
                </span>
              )}
            </span>
          </div>
        )}
        {/* Si no hay marketId pero sí ratio, mostrarlo solo */}
        {!tickerInfo.marketId && tickerInfo.ratio && (
          <div>
            <span className="text-slate-400">Ratio:</span>{' '}
            <span className="text-slate-300 font-semibold">{tickerInfo.ratio}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TickerInfo;
