import { useState, useEffect } from 'react';
import CacheSection from './CacheSection';
import { clearAllTickerCache } from '../services/tickerApi';
import { 
  clearMovimientosCache, 
  clearEstadoCuentaCache, 
  clearFlujosProyectadosCache,
  getMovimientosCacheInfo
} from '../services/balanzApi';
import { clearDolarHistoricoCache, getDolarHistoricoCacheInfo } from '../services/dolarHistoricoApi';
import { getCacheInfo, getCachedDataFull, clearCache, clearCacheByPattern } from '../utils/cacheManager';

const GestionCache: React.FC = () => {
  // Estado global para habilitar/deshabilitar caché
  const [cacheEnabled, setCacheEnabled] = useState(() => {
    const stored = localStorage.getItem('global_cache_enabled');
    return stored === null ? true : stored === 'true';
  });

  // Estado para información de cachés
  const [cacheInfos, setCacheInfos] = useState<Array<{
    label: string;
    isCached: boolean;
    fecha: string;
    url: string;
    onClear: () => void;
  }>>([]);

  // Sincronizar el flag con localStorage
  useEffect(() => {
    localStorage.setItem('global_cache_enabled', cacheEnabled ? 'true' : 'false');
  }, [cacheEnabled]);

  // Función para actualizar información de cachés
  const updateCacheInfos = () => {
    const infos: Array<{
      label: string;
      isCached: boolean;
      fecha: string;
      url: string;
      onClear: () => void;
    }> = [];

    // 1. Estado de cuenta
    const estadoCuentaCache = getCacheInfo('balanz_estado_cuenta');
    const estadoCuentaFull = getCachedDataFull<any>('balanz_estado_cuenta');
    if (estadoCuentaCache?.exists && estadoCuentaFull?.timestamp) {
      const fecha = estadoCuentaFull.fecha || new Date(estadoCuentaFull.timestamp).toISOString().split('T')[0];
      infos.push({
        label: 'Estado de Cuenta',
        isCached: true,
        fecha,
        url: '/api/estadocuenta',
        onClear: () => {
          clearEstadoCuentaCache();
          setTimeout(updateCacheInfos, 100);
        }
      });
    }

    // 2. Movimientos históricos
    const movimientosInfo = getMovimientosCacheInfo();
    if (movimientosInfo.exists && movimientosInfo.count > 0) {
      const fecha = movimientosInfo.newestDate || 'N/A';
      infos.push({
        label: `Movimientos Históricos (${movimientosInfo.count} períodos)`,
        isCached: true,
        fecha,
        url: '/api/movimientos',
        onClear: () => {
          clearMovimientosCache();
          setTimeout(updateCacheInfos, 100);
        }
      });
    }

    // 3. Flujos proyectados
    const flujosCache = getCacheInfo('balanz_flujos_proyectados');
    const flujosFull = getCachedDataFull<any>('balanz_flujos_proyectados');
    if (flujosCache?.exists && flujosFull?.fecha) {
      infos.push({
        label: 'Flujos Proyectados',
        isCached: true,
        fecha: flujosFull.fecha,
        url: '/api/flujosproyectados',
        onClear: () => {
          clearFlujosProyectadosCache();
          setTimeout(updateCacheInfos, 100);
        }
      });
    }

    // 4. Dólar histórico
    const dolarInfo = getDolarHistoricoCacheInfo();
    if (dolarInfo.exists && dolarInfo.timestamp) {
      const fecha = new Date(dolarInfo.timestamp).toISOString().split('T')[0];
      infos.push({
        label: `Dólar Histórico (${dolarInfo.recordCount || 0} registros)`,
        isCached: true,
        fecha,
        url: '/api/dolarhistorico',
        onClear: () => {
          clearDolarHistoricoCache();
          setTimeout(updateCacheInfos, 100);
        }
      });
    }

    // 5. Tickers (histórico e información de instrumentos)
    const keys = Object.keys(localStorage);
    const tickerHistoryKeys = keys.filter(k => k.startsWith('ticker_history_') || k.startsWith('fondo_history_'));
    const instrumentKeys = keys.filter(k => k.startsWith('instrument_info_') || k.startsWith('fondo_info_'));
    
    if (tickerHistoryKeys.length > 0) {
      // Obtener la fecha más reciente de los caches de histórico
      let latestDate = '';
      tickerHistoryKeys.forEach(key => {
        const full = getCachedDataFull<any>(key);
        if (full?.lastUpdate) {
          const date = full.lastUpdate.split('T')[0];
          if (date > latestDate) {
            latestDate = date;
          }
        } else if (full?.timestamp) {
          const date = new Date(full.timestamp).toISOString().split('T')[0];
          if (date > latestDate) {
            latestDate = date;
          }
        }
      });
      
      if (latestDate) {
        infos.push({
          label: `Histórico de Tickers (${tickerHistoryKeys.length} tickers)`,
          isCached: true,
          fecha: latestDate,
          url: '/api/cotizacionhistorica',
          onClear: () => {
            clearAllTickerCache();
            setTimeout(updateCacheInfos, 100);
          }
        });
      }
    }

    if (instrumentKeys.length > 0) {
      // Obtener la fecha más reciente de los caches de instrumentos
      let latestDate = '';
      instrumentKeys.forEach(key => {
        const full = getCachedDataFull<any>(key);
        if (full?.timestamp) {
          const date = new Date(full.timestamp).toISOString().split('T')[0];
          if (date > latestDate) {
            latestDate = date;
          }
        }
      });
      
      if (latestDate) {
        infos.push({
          label: `Información de Instrumentos (${instrumentKeys.length} instrumentos)`,
          isCached: true,
          fecha: latestDate,
          url: '/api/cotizacioninstrumento',
          onClear: () => {
            // Limpiar solo los caches de información de instrumentos
            const count = clearCacheByPattern(/^(instrument_info_|fondo_info_)/);
            console.log(`🗑️ Limpiados ${count} caches de instrumentos`);
            setTimeout(updateCacheInfos, 100);
          }
        });
      }
    }

    setCacheInfos(infos);
  };

  // Actualizar información al montar y cuando cambia el estado de caché
  useEffect(() => {
    updateCacheInfos();
    // Actualizar cada 5 segundos para reflejar cambios
    const interval = setInterval(updateCacheInfos, 5000);
    return () => clearInterval(interval);
  }, [cacheEnabled]);

  // Handler para el toggle de caché
  const handleToggleCache = () => {
    setCacheEnabled((prev) => !prev);
  };

  // Handler para limpiar todas las cachés
  const handleClearAllCache = () => {
    const confirmClear = window.confirm('¿Estás seguro de que deseas limpiar todas las cachés? Esto recargará todos los datos desde el servidor.');
    if (confirmClear) {
      // Limpiar caché de tickers (histórico + info de instrumentos)
      clearAllTickerCache();
      
      // Limpiar caché de movimientos
      clearMovimientosCache();
      
      // Limpiar caché de estado de cuenta
      clearEstadoCuentaCache();
      
      // Limpiar caché de flujos proyectados
      clearFlujosProyectadosCache();
      
      // Limpiar caché de dólar histórico
      clearDolarHistoricoCache();
      
      // Actualizar información después de limpiar
      setTimeout(() => {
        updateCacheInfos();
        window.location.reload();
      }, 100);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
        <h2 className="text-2xl font-bold text-white mb-4">
          ⚙️ Gestión de Caché
        </h2>
        
        <div className="space-y-4">
          {/* Toggle de caché global */}
          <div className="bg-slate-700/50 rounded-lg p-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">
                Caché Global
              </h3>
              <p className="text-sm text-slate-400">
                Activa o desactiva el uso de caché en toda la aplicación
              </p>
            </div>
            <label className="cursor-pointer select-none flex items-center gap-3">
              <span className="text-slate-300 font-medium">Estado:</span>
              <input
                type="checkbox"
                checked={cacheEnabled}
                onChange={handleToggleCache}
                className="w-5 h-5 accent-blue-500"
              />
              <span className={`font-mono font-bold ${cacheEnabled ? 'text-green-400' : 'text-red-400'}`}>
                {cacheEnabled ? 'ACTIVADO' : 'DESACTIVADO'}
              </span>
            </label>
          </div>

          {/* Botón de limpieza */}
          <div className="bg-slate-700/50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              Limpieza de Cachés
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Limpia todas las cachés almacenadas y fuerza la recarga de datos desde el servidor
            </p>
            <button
              onClick={handleClearAllCache}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
            >
              🗑️ Limpiar Todas las Cachés
            </button>
          </div>
        </div>
      </div>

      {/* Sección de cachés individuales */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
        <h2 className="text-2xl font-bold text-white mb-4">
          📦 Cachés Activas
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Lista de todas las APIs que tienen datos cacheados. Puedes limpiar cachés individuales desde aquí.
        </p>
        
        {cacheInfos.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p>No hay cachés activas en este momento.</p>
            <p className="text-sm mt-2">Los datos se cachearán automáticamente cuando se utilicen las diferentes funcionalidades.</p>
          </div>
        ) : (
          <CacheSection caches={cacheInfos} />
        )}
      </div>
    </div>
  );
};

export default GestionCache;

