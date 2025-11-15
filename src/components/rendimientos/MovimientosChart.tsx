import React from 'react';
import { formatCurrency } from '../../utils/chartHelpers';
import { ComposedChart, Bar, Line, CartesianGrid, XAxis, YAxis, Legend, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartDataPoint {
  fecha: string;
  fechaOriginal: string;
  ingresos: number;
  egresos: number;
  acumulado: number;
}

interface MovimientosChartProps {
  chartDataMovimientos: ChartDataPoint[];
}

const MovimientosChart: React.FC<MovimientosChartProps> = ({ chartDataMovimientos }) => {
  if (chartDataMovimientos.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-700/30 rounded-lg overflow-hidden mt-8">
      <div className="p-4 border-b border-slate-600">
        <h3 className="text-lg font-bold text-white">Gráfico de Movimientos y Acumulado</h3>
      </div>
      <div className="p-6">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
            data={chartDataMovimientos}
            margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="fecha"
              angle={0}
              textAnchor="middle"
              height={30}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              interval={chartDataMovimientos.length > 20 ? Math.floor(chartDataMovimientos.length / 10) : 0}
            />
            <YAxis
              yAxisId="left"
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={(value) => formatCurrency(value)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#3b82f6"
              tick={{ fill: '#3b82f6', fontSize: 12 }}
              tickFormatter={(value) => formatCurrency(value)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '8px',
                padding: '12px',
              }}
              labelStyle={{
                color: '#f1f5f9',
                fontWeight: 600,
                marginBottom: '8px',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'egresos') {
                  return [formatCurrency(-value), 'Extracciones'];
                }
                if (name === 'ingresos') {
                  return [formatCurrency(value), 'Depósitos'];
                }
                if (name === 'acumulado') {
                  return [formatCurrency(value), 'Acumulado'];
                }
                return [formatCurrency(value), name];
              }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ paddingBottom: '20px' }}
              iconType="line"
              formatter={(value) => {
                if (value === 'egresos') return 'Extracciones';
                if (value === 'ingresos') return 'Depósitos';
                if (value === 'acumulado') return 'Acumulado';
                return value;
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="ingresos"
              fill="#10b981"
              name="ingresos"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="left"
              dataKey="egresos"
              fill="#ef4444"
              name="egresos"
              radius={[0, 0, 4, 4]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="acumulado"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6 }}
              name="acumulado"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MovimientosChart;

