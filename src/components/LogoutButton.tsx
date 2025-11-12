import React from 'react';
import { useNavigate } from 'react-router-dom';
import { clearTokenCache, logoutBalanz } from '../services/balanzAuth';
import { clearEstadoCuentaCache, clearMovimientosCache } from '../services/balanzApi';

const LogoutButton: React.FC = () => {
  const navigate = useNavigate();
  const handleLogout = async () => {
    try {
      await logoutBalanz();
    } catch (e) {
      // Si falla el logout, igual limpiamos el cache local
      console.error('Error en logout remoto:', e);
    }
    clearTokenCache();
    clearEstadoCuentaCache();
    clearMovimientosCache();
    navigate('/logout');
  };

  return (
    <button
      onClick={handleLogout}
      className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow"
      title="Cerrar sesión de Balanz"
    >
      Cerrar sesión
    </button>
  );
};

export default LogoutButton;
