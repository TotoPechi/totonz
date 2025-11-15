import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import CarteraActual from './components/CarteraActual';
import TickerLookup from './components/TickerLookup';
import Rendimientos from './components/Rendimientos';
import FlujosProyectados from './components/FlujosProyectados';
import { getEstadoCuentaConCache } from './services/balanzApi';
import Menu from './components/Menu';
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
  
  // Estado para posiciones y tickers disponibles desde la API
  const [positions, setPositions] = useState<any[]>([]);
  const [availableTickers, setAvailableTickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPositions() {
      setLoading(true);
      setApiError(null);
      try {
        const result = await getEstadoCuentaConCache();
        if (result.data && result.data.tenencia) {
          setPositions(result.data.tenencia);
          // Extraer tickers únicos y ordenados
          const tickers: string[] = [];
          const seen = new Set<string>();
          result.data.tenencia.forEach((t: any) => {
            if (!seen.has(t.Ticker)) {
              seen.add(t.Ticker);
              tickers.push(t.Ticker);
            }
          });
          setAvailableTickers(tickers);
        } else {
          setPositions([]);
          setAvailableTickers([]);
        }
      } catch (e: any) {
        setApiError(e?.message || 'Error al obtener la cartera de la API');
      } finally {
        setLoading(false);
      }
    }
    fetchPositions();
  }, []);

  // Handler para cuando se hace click en un ticker de la cartera
  const handleTickerClick = (ticker: string) => {
    navigate(`/ticker/${ticker}`);
  };

  return (
    <>
      <Menu />
      
      <div className="min-h-screen bg-slate-900 p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <header className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
              Totonz
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
            <button
              onClick={() => navigate('/rendimientos')}
              className={`px-6 py-3 font-semibold transition ${
                location.pathname === '/rendimientos'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              💰 Rendimientos
            </button>
            <button
              onClick={() => navigate('/flujos-proyectados')}
              className={`px-6 py-3 font-semibold transition ${
                location.pathname === '/flujos-proyectados'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📊 Flujos Proyectados
            </button>

          </nav>

          {/* Rutas */}
          <Routes>
            <Route path="/" element={<Navigate to="/cartera" replace />} />
            <Route 
              path="/cartera" 
              element={
                <CarteraActual 
                  positions={positions}
                  onTickerClick={handleTickerClick}
                  loading={loading}
                  apiError={apiError}
                />
              } 
            />
            <Route 
              path="/ticker/:ticker?" 
              element={
                <TickerLookup 
                  availableTickers={availableTickers}
                  positions={positions}
                  loading={loading}
                  apiError={apiError}
                />
              } 
            />
            <Route 
              path="/rendimientos" 
              element={
                <Rendimientos 
                  positions={positions}
                  loading={loading}
                  apiError={apiError}
                />
              } 
            />
            <Route 
              path="/flujos-proyectados" 
              element={
                <FlujosProyectados 
                  positions={positions}
                  loading={loading}
                  apiError={apiError}
                />
              } 
            />
            <Route path="/logout" element={<LoggedOut />} />
          </Routes>

        <footer className="text-center text-slate-400 text-sm mt-12">
          <p>© 2025 Totonz - Dashboard de inversiones</p>
        </footer>
        </div>
      </div>
    </>
  );
}

export default App;
