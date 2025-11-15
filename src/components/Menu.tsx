import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LogoutButton from './LogoutButton';

const Menu: React.FC = () => {
  const navigate = useNavigate();
  
  // Estado para controlar si el panel de menú está colapsado
  const [isCollapsed, setIsCollapsed] = useState(true);

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
              onClick={() => {
                navigate('/gestion-cache');
                setIsCollapsed(true);
              }}
              className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors text-sm font-semibold flex items-center justify-center gap-2"
              title="Gestionar cachés de la aplicación"
            >
              ⚙️ Gestión de Caché
            </button>
            <LogoutButton />
          </>
        )}
      </div>
    </div>
  );
};

export default Menu;


