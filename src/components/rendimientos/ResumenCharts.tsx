import React from 'react';
import { formatCurrency } from '../../utils/chartHelpers';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ResumenChartsProps {
  valorActualTotal: number;
  pieChartDataActivos: Array<{ name: string; value: number; percentage: number }>;
  saldosTotalUSD: number;
  pieChartDataSaldos: Array<{ name: string; value: number; percentage: number }>;
  dividendosTotal: number;
  pieChartDataDividendos: Array<{ name: string; value: number; percentage: number }>;
  rentasTotal: number;
  pieChartDataRentas: Array<{ name: string; value: number; percentage: number }>;
}

const COLORS_ACTIVOS = {
  'Acciones': '#10b981',
  'Bonos': '#3b82f6',
  'Corporativos': '#f59e0b',
  'CEDEARs': '#8b5cf6',
};

const COLORS_SALDOS = {
  'USD': '#3b82f6',
  'Cable': '#8b5cf6',
  'Pesos': '#10b981',
};

const ResumenCharts: React.FC<ResumenChartsProps> = ({
  valorActualTotal,
  pieChartDataActivos,
  saldosTotalUSD,
  pieChartDataSaldos,
  dividendosTotal,
  pieChartDataDividendos,
  rentasTotal,
  pieChartDataRentas,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Valor Actual de Activos */}
      <div className="bg-slate-700/50 rounded-lg p-4">
        <p className="text-sm text-slate-400 mb-2">Valor Actual de Activos</p>
        <p className="text-2xl font-bold text-green-400 mb-3">{formatCurrency(valorActualTotal)}</p>
        {pieChartDataActivos.length > 0 && (
          <div className="flex items-center gap-3 mt-3">
            <div style={{ width: 126, height: 126 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartDataActivos}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={27}
                    outerRadius={54}
                    paddingAngle={2}
                  >
                    {pieChartDataActivos.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS_ACTIVOS[entry.name as keyof typeof COLORS_ACTIVOS] || '#8884d8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #475569',
                      borderRadius: '8px',
                      padding: '8px 12px'
                    }}
                    labelStyle={{
                      color: '#f1f5f9',
                      fontWeight: 600,
                      marginBottom: '4px'
                    }}
                    itemStyle={{
                      color: '#e2e8f0'
                    }}
                    formatter={(value: number) => [
                      `${formatCurrency(value)} (${((value / valorActualTotal) * 100).toFixed(1)}%)`,
                      ''
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              {pieChartDataActivos.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: COLORS_ACTIVOS[entry.name as keyof typeof COLORS_ACTIVOS] }}
                  />
                  <span className="text-slate-300">
                    {entry.name}: {entry.percentage.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Saldos en Moneda */}
      <div className="bg-slate-700/50 rounded-lg p-4">
        <p className="text-sm text-slate-400 mb-2">Saldos en Moneda</p>
        <p className="text-2xl font-bold text-cyan-400 mb-3">{formatCurrency(saldosTotalUSD)}</p>
        {pieChartDataSaldos.length > 0 && (
          <div className="flex items-center gap-3 mt-3">
            <div style={{ width: 126, height: 126 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartDataSaldos}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={27}
                    outerRadius={54}
                    paddingAngle={2}
                  >
                    {pieChartDataSaldos.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS_SALDOS[entry.name as keyof typeof COLORS_SALDOS] || '#8884d8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #475569',
                      borderRadius: '8px',
                      padding: '8px 12px'
                    }}
                    labelStyle={{
                      color: '#f1f5f9',
                      fontWeight: 600,
                      marginBottom: '4px'
                    }}
                    itemStyle={{
                      color: '#e2e8f0'
                    }}
                    formatter={(value: number) => [
                      `${formatCurrency(value)} (${((value / saldosTotalUSD) * 100).toFixed(1)}%)`,
                      ''
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              {pieChartDataSaldos.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: COLORS_SALDOS[entry.name as keyof typeof COLORS_SALDOS] }}
                  />
                  <span className="text-slate-300">
                    {entry.name}: {entry.percentage.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dividendos Totales */}
      <div className="bg-slate-700/50 rounded-lg p-4">
        <p className="text-sm text-slate-400 mb-2">Dividendos Totales</p>
        <p className="text-2xl font-bold text-blue-400 mb-3">{formatCurrency(dividendosTotal)}</p>
        {pieChartDataDividendos.length > 0 && (
          <div className="flex items-center gap-3 mt-3">
            <div style={{ width: 126, height: 126 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartDataDividendos}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={27}
                    outerRadius={54}
                    paddingAngle={2}
                  >
                    {pieChartDataDividendos.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={`hsl(${(index * 60) % 360}, 70%, 50%)`}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #475569',
                      borderRadius: '8px',
                      padding: '8px 12px'
                    }}
                    labelStyle={{
                      color: '#f1f5f9',
                      fontWeight: 600,
                      marginBottom: '4px'
                    }}
                    itemStyle={{
                      color: '#e2e8f0'
                    }}
                    formatter={(value: number) => [
                      `${formatCurrency(value)} (${((value / dividendosTotal) * 100).toFixed(1)}%)`,
                      ''
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              {pieChartDataDividendos.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: `hsl(${(pieChartDataDividendos.findIndex(e => e.name === entry.name) * 60) % 360}, 70%, 50%)` }}
                  />
                  <span className="text-slate-300">
                    {entry.name}: {entry.percentage.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rentas Totales */}
      <div className="bg-slate-700/50 rounded-lg p-4">
        <p className="text-sm text-slate-400 mb-2">Rentas Totales</p>
        <p className="text-2xl font-bold text-purple-400 mb-3">{formatCurrency(rentasTotal)}</p>
        {pieChartDataRentas.length > 0 && (
          <div className="flex items-center gap-3 mt-3">
            <div style={{ width: 126, height: 126 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartDataRentas}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={27}
                    outerRadius={54}
                    paddingAngle={2}
                  >
                    {pieChartDataRentas.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={`hsl(${(index * 60 + 180) % 360}, 70%, 50%)`}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #475569',
                      borderRadius: '8px',
                      padding: '8px 12px'
                    }}
                    labelStyle={{
                      color: '#f1f5f9',
                      fontWeight: 600,
                      marginBottom: '4px'
                    }}
                    itemStyle={{
                      color: '#e2e8f0'
                    }}
                    formatter={(value: number) => [
                      `${formatCurrency(value)} (${((value / rentasTotal) * 100).toFixed(1)}%)`,
                      ''
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              {pieChartDataRentas.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: `hsl(${(pieChartDataRentas.findIndex(e => e.name === entry.name) * 60 + 180) % 360}, 70%, 50%)` }}
                  />
                  <span className="text-slate-300">
                    {entry.name}: {entry.percentage.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumenCharts;

