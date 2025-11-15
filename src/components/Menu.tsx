import { useState, useEffect } from 'react';
import { clearAllTickerCache } from '../services/tickerApi';
import { clearMovimientosCache, clearEstadoCuentaCache, clearFlujosProyectadosCache } from '../services/balanzApi';
import LogoutButton from './LogoutButton';

const Menu: React.FC = () => {
  // Estado global para habilitar/deshabilitar caché (excepto login)
  const [cacheEnabled, setCacheEnabled] = useState(() => {
    const stored = localStorage.getItem('global_cache_enabled');
    return stored === null ? true : stored === 'true';
  });
  
  // Estado para controlar si el panel de menú está colapsado
  const [isCollapsed, setIsCollapsed] = useState(true);
  
  // Sincronizar el flag con localStorage
  useEffect(() => {
    localStorage.setItem('global_cache_enabled', cacheEnabled ? 'true' : 'false');
  }, [cacheEnabled]);
  
  // Handler para el toggle de caché
  const handleToggleCache = () => {
    setCacheEnabled((prev) => !prev);
  };
  
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
      
      // Recargar la página para actualizar todo
      window.location.reload();
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-2xl p-2 flex flex-col gap-2 min-w-[160px]">
        {/* Botón para colapsar/expandir */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors text-sm font-semibold flex items-center justify-center gap-2"
          title={isCollapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {isCollapsed ? "▶" : "▼"} Menú
        </button>
        
        {/* Menú colapsable */}
        {!isCollapsed && (
          <>
            <button
              onClick={handleClearAllCache}
              className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors text-sm font-semibold flex items-center justify-center gap-2"
              title="Limpiar todas las cachés y recargar datos"
            >
              🗑️ Limpiar Cachés
            </button>
            <div className="w-full px-4 py-2 bg-slate-700 rounded text-sm text-slate-300 flex items-center justify-center gap-2">
              <label htmlFor="cache-toggle" className="cursor-pointer select-none flex items-center gap-2">
                <span>Caché</span>
                <input
                  id="cache-toggle"
                  type="checkbox"
                  checked={cacheEnabled}
                  onChange={handleToggleCache}
                  className="accent-blue-500"
                />
                <span className="font-mono">{cacheEnabled ? 'SÍ' : 'NO'}</span>
              </label>
            </div>
            <LogoutButton />
          </>
        )}
      </div>
    </div>
  );
};

export default Menu;


