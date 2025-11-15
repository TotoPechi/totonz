import React, { useState } from 'react';
import { formatCurrency } from '../../utils/chartHelpers';
import { IngresoEgreso } from '../../services/balanzApi';

interface MovimientoConTipo extends IngresoEgreso {
  tipo: 'Depósito' | 'Extracción';
}

interface MovimientosTableProps {
  todosLosMovimientos: MovimientoConTipo[];
}

const MovimientosTable: React.FC<MovimientosTableProps> = ({ todosLosMovimientos }) => {
  const [mostrarTodosMovimientos, setMostrarTodosMovimientos] = useState(false);

  return (
    <div className="bg-slate-700/30 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-slate-600">
        <h3 className="text-lg font-bold text-white">Detalle de Movimientos</h3>
      </div>
      <div className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-700 text-slate-300">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3">Moneda Original</th>
                <th className="px-4 py-3 text-right">Importe Original</th>
                <th className="px-4 py-3 text-right">Dólar MEP</th>
                <th className="px-4 py-3 text-right">Importe USD</th>
              </tr>
            </thead>
            <tbody className="text-white">
              {(mostrarTodosMovimientos ? todosLosMovimientos : todosLosMovimientos.slice(0, 4)).map((mov, idx) => (
                <tr key={idx} className="border-b border-slate-700">
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        mov.tipo === 'Depósito'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {mov.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3">{mov.fecha}</td>
                  <td className="px-4 py-3 text-slate-300">{mov.descripcion}</td>
                  <td className="px-4 py-3">{mov.moneda}</td>
                  <td className="px-4 py-3 text-right">
                    {mov.moneda.toLowerCase().includes('pesos')
                      ? `$${mov.importeOriginal.toLocaleString('es-AR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : formatCurrency(mov.importeOriginal)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {mov.dolarUsado
                      ? `$${mov.dolarUsado.toLocaleString('es-AR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-300">
                    {mov.tipo === 'Extracción' ? '-' : ''}
                    {formatCurrency(mov.importeUSD)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!mostrarTodosMovimientos && todosLosMovimientos.length > 4 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setMostrarTodosMovimientos(true)}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors font-semibold"
            >
              Mostrar más ({todosLosMovimientos.length - 4} restantes)
            </button>
          </div>
        )}
        {mostrarTodosMovimientos && todosLosMovimientos.length > 4 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setMostrarTodosMovimientos(false)}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors font-semibold"
            >
              Mostrar menos
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovimientosTable;

