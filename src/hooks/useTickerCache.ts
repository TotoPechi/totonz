import { useEffect, useState } from 'react';

interface CandleCacheInfo {
  isCached: boolean;
  fecha: string;
  usdTicker?: string;
}

interface InstrumentCacheInfo {
  isCached: boolean;
  fecha: string;
}

export function useTickerCache(selectedTicker: string | null) {
  const [candlesCacheInfo, setCandlesCacheInfo] = useState<CandleCacheInfo | null>(null);
  const [instrumentCacheInfo, setInstrumentCacheInfo] = useState<InstrumentCacheInfo | null>(null);

  useEffect(() => {
    if (!selectedTicker) {
      setCandlesCacheInfo(null);
      setInstrumentCacheInfo(null);
      return;
    }

    // Verificar caché de información del instrumento
    const instrumentCacheKey = `instrument_info_${selectedTicker}`;
    const instrumentTimestampKey = `instrument_info_${selectedTicker}_timestamp`;
    const cachedInstrumentData = localStorage.getItem(instrumentCacheKey);
    const cachedInstrumentTimestamp = localStorage.getItem(instrumentTimestampKey);

    if (cachedInstrumentData && cachedInstrumentTimestamp) {
      try {
        const timestamp = new Date(cachedInstrumentTimestamp);
        const now = new Date();
        const diffHours = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
        
        if (diffHours < 24) {
          setInstrumentCacheInfo({
            isCached: true,
            fecha: timestamp.toISOString().split('T')[0]
          });
        } else {
          setInstrumentCacheInfo(null);
        }
      } catch (e) {
        setInstrumentCacheInfo(null);
      }
    } else {
      setInstrumentCacheInfo(null);
    }

    // Verificar caché de histórico de precios
    // IMPORTANTE: El caché se guarda con el usdTicker, no con el ticker original
    // Necesitamos obtener el usdTicker del instrumentInfo
    let usdTicker = selectedTicker; // Por defecto usar el ticker original

    // Intentar obtener el usdTicker desde el instrumentInfo en caché
    try {
      const instrumentData = cachedInstrumentData ? JSON.parse(cachedInstrumentData) : null;
      if (instrumentData && instrumentData.Cotizacion && instrumentData.Cotizacion.currencies) {
        const currencies = instrumentData.Cotizacion.currencies;
        const usdCurrency = currencies.find((c: string[]) => c[2] === 'USD');
        if (usdCurrency && usdCurrency[0]) {
          usdTicker = usdCurrency[0];
        }
      }
    } catch (e) {
      // Si no podemos obtener el usdTicker del caché, se usará el ticker original
    }

    // Verificar caché con el usdTicker (que es el que se usa para guardar)
    const candlesCacheKey = `ticker_history_${usdTicker}_v3`;
    const candlesCacheRaw = localStorage.getItem(candlesCacheKey);
    if (candlesCacheRaw) {
      try {
        const candlesCache = JSON.parse(candlesCacheRaw);
        if (candlesCache.lastUpdate) {
          setCandlesCacheInfo({
            isCached: true,
            fecha: candlesCache.lastUpdate,
            usdTicker: usdTicker
          });
        } else {
          setCandlesCacheInfo(null);
        }
      } catch {
        setCandlesCacheInfo(null);
      }
    } else {
      // También verificar con el ticker original por si acaso
      const candlesCacheKeyOriginal = `ticker_history_${selectedTicker}_v3`;
      const candlesCacheRawOriginal = localStorage.getItem(candlesCacheKeyOriginal);
      if (candlesCacheRawOriginal) {
        try {
          const candlesCache = JSON.parse(candlesCacheRawOriginal);
          if (candlesCache.lastUpdate) {
            setCandlesCacheInfo({
              isCached: true,
              fecha: candlesCache.lastUpdate,
              usdTicker: selectedTicker // En este caso el ticker original es el usado
            });
          } else {
            setCandlesCacheInfo(null);
          }
        } catch {
          setCandlesCacheInfo(null);
        }
      } else {
        setCandlesCacheInfo(null);
      }
    }
  }, [selectedTicker]);

  return {
    candlesCacheInfo,
    instrumentCacheInfo
  };
}

