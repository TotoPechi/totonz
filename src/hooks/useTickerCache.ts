import { useEffect, useState } from 'react';
import { getCachedDataFull, getCacheInfo } from '../utils/cacheManager';

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
    const cacheInfo = getCacheInfo(instrumentCacheKey);
    const cacheFull = getCachedDataFull<any>(instrumentCacheKey);

    if (cacheInfo && cacheInfo.exists && cacheFull?.timestamp) {
      const cacheAge = cacheInfo.age || 0;
      const cacheAgeHours = cacheAge / (1000 * 60 * 60);
      
      if (cacheAgeHours < 24) {
        const timestamp = new Date(cacheFull.timestamp);
        setInstrumentCacheInfo({
          isCached: true,
          fecha: timestamp.toISOString().split('T')[0]
        });
      } else {
        setInstrumentCacheInfo(null);
      }
    } else {
      setInstrumentCacheInfo(null);
    }

    // Verificar caché de histórico de precios
    // Primero verificar si es un fondo (usa caché diferente)
    const fondoCacheKey = `fondo_history_${selectedTicker}_v1`;
    const fondoCacheFull = getCachedDataFull<any>(fondoCacheKey);
    
    if (fondoCacheFull && fondoCacheFull.lastUpdate) {
      setCandlesCacheInfo({
        isCached: true,
        fecha: fondoCacheFull.lastUpdate.split('T')[0], // Convertir ISO a fecha
        usdTicker: selectedTicker
      });
    } else {
      // Si no es fondo, verificar caché normal (acciones/bonos)
      // IMPORTANTE: El caché se guarda con el usdTicker, no con el ticker original
      // Necesitamos obtener el usdTicker del instrumentInfo
      let usdTicker = selectedTicker; // Por defecto usar el ticker original

      // Intentar obtener el usdTicker desde el instrumentInfo en caché
      if (cacheFull && cacheFull.data) {
        try {
          const instrumentData = cacheFull.data;
          if (instrumentData.Cotizacion && instrumentData.Cotizacion.currencies) {
            const currencies = instrumentData.Cotizacion.currencies;
            const usdCurrency = currencies.find((c: string[]) => c[2] === 'USD');
            if (usdCurrency && usdCurrency[0]) {
              usdTicker = usdCurrency[0];
            }
          }
        } catch (e) {
          // Si no podemos obtener el usdTicker del caché, se usará el ticker original
        }
      }

      // Verificar caché con el usdTicker (que es el que se usa para guardar)
      const candlesCacheKey = `ticker_history_${usdTicker}_v3`;
      const candlesCacheFull = getCachedDataFull<any>(candlesCacheKey);
      
      if (candlesCacheFull && candlesCacheFull.lastUpdate) {
        setCandlesCacheInfo({
          isCached: true,
          fecha: candlesCacheFull.lastUpdate.split('T')[0], // Convertir ISO a fecha
          usdTicker: usdTicker
        });
      } else {
        // También verificar con el ticker original por si acaso
        const candlesCacheKeyOriginal = `ticker_history_${selectedTicker}_v3`;
        const candlesCacheFullOriginal = getCachedDataFull<any>(candlesCacheKeyOriginal);
        
        if (candlesCacheFullOriginal && candlesCacheFullOriginal.lastUpdate) {
          setCandlesCacheInfo({
            isCached: true,
            fecha: candlesCacheFullOriginal.lastUpdate.split('T')[0],
            usdTicker: selectedTicker // En este caso el ticker original es el usado
          });
        } else {
          setCandlesCacheInfo(null);
        }
      }
    }
  }, [selectedTicker]);

  return {
    candlesCacheInfo,
    instrumentCacheInfo
  };
}

