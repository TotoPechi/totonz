import React from 'react';

const LoggedOut: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white">
      <div className="bg-slate-800 rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        <h2 className="text-2xl font-bold mb-4">Sesión finalizada</h2>
        <p className="text-slate-300 mb-6">
          Has cerrado sesión de Balanz correctamente.<br/>
          Ahora puedes navegar y consultar datos públicos de Balanz sin restricciones.
        </p>
        <a href="/cartera" className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-semibold transition">Ir a la Cartera</a>
      </div>
    </div>
  );
};

export default LoggedOut;
