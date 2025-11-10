import { useMemo, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import CarteraActual from './components/CarteraActual';
import TickerLookup from './components/TickerLookup';
import balanzDataLocal from './data/balanz_data.json';
import { BalanzData } from './types/balanz';
import { clearAllTickerCache } from './services/tickerApi';
import { clearMovimientosCache, clearEstadoCuentaCache } from './services/balanzApi';
import LogoutButton from './components/LogoutButton';
import LoggedOut from './components/LoggedOut';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Limpiar caché antiguo (versión sin _v2) al cargar la app
  useEffect(() => {
    const cacheVersion = localStorage.getItem('ticker_cache_version');
    if (cacheVersion !== 'v2') {
      const keys = Object.keys(localStorage);
      let count = 0;
      keys.forEach(key => {
        if (key.startsWith('ticker_history_') && !key.includes('_v2')) {
          localStorage.removeItem(key);
          count++;
        }
      });
      localStorage.setItem('ticker_cache_version', 'v2');
    }
  }, []);
  
  // Datos locales - siempre usamos estos para la estructura base de posiciones
  const typedBalanzData = balanzDataLocal as BalanzData;

  // Extraer tickers únicos de la cartera y agruparlos por categoría
  const availableTickers = useMemo(() => {
    const positions = typedBalanzData.resultados_por_info_completa.resultados_por_lotes_finales;
    
    // Clasificar tickers por categoría
    const acciones: string[] = [];
    const bonos: string[] = [];
    const corporativos: string[] = [];
    const cedears: string[] = [];
    
    // Mapeo de tickers vistos para mantener orden de aparición en cartera
    const tickersSet = new Set<string>();
    
    positions.forEach(position => {
      const ticker = position.Ticker;
      if (tickersSet.has(ticker)) return; // Ya procesado
      tickersSet.add(ticker);
      
      const tipo = position.Tipo?.toLowerCase() || '';
      
      if (tipo.includes('acción') || tipo.includes('accion')) {
        acciones.push(ticker);
      } else if (tipo.includes('bono')) {
        bonos.push(ticker);
      } else if (tipo.includes('corporativo')) {
        corporativos.push(ticker);
      } else if (tipo.includes('cedear')) {
        cedears.push(ticker);
      } else {
        // Si no tiene tipo definido, inferir por ticker
        if (['VIST'].includes(ticker)) {
          cedears.push(ticker);
        } else if (['AL30', 'BPOC7', 'T30J6', 'TZXD6', 'YM39O'].includes(ticker)) {
          bonos.push(ticker);
        } else if (['YMCXO', 'TLC1O'].includes(ticker)) {
          corporativos.push(ticker);
        } else {
          acciones.push(ticker); // Default a acciones
        }
      }
    });
    
    // Concatenar en orden: Acciones, Bonos, Corporativos, CEDEARs
    return [...acciones, ...bonos, ...corporativos, ...cedears];
  }, [typedBalanzData]);

  // Handler para cuando se hace click en un ticker de la cartera
  const handleTickerClick = (ticker: string) => {
    navigate(`/ticker/${ticker}`);
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
      
      
      // Recargar la página para actualizar todo
      window.location.reload();
    }
  };

  return (
    <>
      {/* Botones fijos en la esquina superior derecha */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={handleClearAllCache}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors text-sm font-semibold flex items-center gap-2 shadow-lg"
          title="Limpiar todas las cachés y recargar datos"
        >
          🗑️ Limpiar Cachés
        </button>
        <LogoutButton />
      </div>
      
      <div className="min-h-screen bg-slate-900 p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <header className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
              Totonz Trading Dashboard
            </h1>
            <p className="text-slate-400">
              Análisis de cartera e historial de operaciones
            </p>
          </header>

          {/* Navegación */}
          <nav className="flex gap-2 border-b border-slate-700 mb-6">
            <button
              onClick={() => navigate('/cartera')}
              className={`px-6 py-3 font-semibold transition ${
                location.pathname === '/cartera'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📊 Cartera Actual
            </button>
            <button
              onClick={() => navigate('/ticker')}
              className={`px-6 py-3 font-semibold transition ${
                location.pathname.startsWith('/ticker')
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🔍 Consulta de Tickers
            </button>

          </nav>

          {/* Rutas */}
          <Routes>
            <Route path="/" element={<Navigate to="/cartera" replace />} />
            <Route 
              path="/cartera" 
              element={
                <CarteraActual 
                  positions={typedBalanzData.resultados_por_info_completa.resultados_por_lotes_finales}
                  onTickerClick={handleTickerClick}
                />
              } 
            />
            <Route 
              path="/ticker/:ticker?" 
              element={
                <TickerLookup 
                  availableTickers={availableTickers}
                  positions={typedBalanzData.resultados_por_info_completa.resultados_por_lotes_finales}
                />
              } 
            />
            <Route path="/logout" element={<LoggedOut />} />
          </Routes>

        <footer className="text-center text-slate-500 text-sm mt-12">
          <p>© 2025 Totonz - Dashboard de inversiones</p>
        </footer>
        </div>
      </div>
    </>
  );
}

export default App;
