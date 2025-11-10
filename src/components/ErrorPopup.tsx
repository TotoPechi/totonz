import React from 'react';

interface ErrorPopupProps {
  message: string;
  onRetry: () => void;
}

const ErrorPopup: React.FC<ErrorPopupProps> = ({ message, onRetry }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-slate-800 rounded-lg shadow-lg p-8 max-w-sm w-full text-center border border-red-500">
        <h2 className="text-xl font-bold text-red-400 mb-3">Error de autenticación</h2>
        <p className="text-slate-200 mb-6 whitespace-pre-line">{message}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-semibold transition"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
};

export default ErrorPopup;
