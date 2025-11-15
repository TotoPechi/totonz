import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getFlujosProyectadosConCache, getEstadoCuentaConCache, getDolarMEP, FlujoProyectado } from '../services/balanzApi';
import { getDolarParaFecha } from '../services/dolarHistoricoApi';

interface FlujosProyectadosProps {
  loading?: boolean;
  apiError?: string | null;
}

// Paleta de colores para los bonos (colores azules y púrpuras)
const COLOR_PALETTE = [
  '#60a5fa', // Light blue
  '#3b82f6', // Darker blue
  '#a78bfa', // Purple
  '#c084fc', // Light purple
  '#7c3aed', // Dark purple
  '#8b5cf6', // Violet
  '#6366f1', // Indigo
  '#4f46e5', // Indigo darker
  '#818cf8', // Light indigo
  '#a5b4fc', // Very light indigo
];

// Función para generar un hash simple de un string
const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

// Función para obtener color de un bono de manera determinística
const getBonoColor = (codigo: string): string => {
  const hash = hashString(codigo);
  const index = hash % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
};

const FlujosProyectados: React.FC<FlujosProyectadosProps> = ({ loading, apiError }) => {
  const [flujos, setFlujos] = useState<FlujoProyectado[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dolarMEPActual, setDolarMEPActual] = useState<number | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'3M' | '1Y' | '3Y' | '10Y' | 'MAX'>('MAX');
  const [groupingMode, setGroupingMode] = useState<'year' | 'month'>('year');
  const [bonosConvertidos, setBonosConvertidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Obtener flujos proyectados
        const flujosResult = await getFlujosProyectadosConCache();
        if (!flujosResult.data || flujosResult.data.length === 0) {
          setError('No se encontraron flujos proyectados');
          setIsLoading(false);
          return;
        }

        // Obtener dólar MEP actual para conversión de pesos
        const estadoCuenta = await getEstadoCuentaConCache();
        const dolarMEP = getDolarMEP(estadoCuenta.data?.cotizacionesDolar || []);
        setDolarMEPActual(dolarMEP || 1000); // Fallback a 1000 si no hay dólar MEP

        // Rastrear qué bonos fueron convertidos
        const bonosConvertidosSet = new Set<string>();

        // Convertir flujos en pesos a USD
        const flujosConvertidos = await Promise.all(
          flujosResult.data.map(async (flujo) => {
            if (flujo.tipo_moneda === 1) {
              // Es en pesos, convertir a USD
              // Registrar el bono como convertido
              bonosConvertidosSet.add(flujo.codigoespeciebono);
              
              // Para fechas futuras, usar dólar MEP actual (con advertencia)
              // Para fechas pasadas, intentar usar dólar histórico
              const fechaFlujo = new Date(flujo.fecha);
              const hoy = new Date();
              hoy.setHours(0, 0, 0, 0);
              
              let dolarUsado = dolarMEP || 1000;
              
              // Si la fecha es pasada, intentar obtener dólar histórico
              if (fechaFlujo < hoy) {
                const dolarHistorico = await getDolarParaFecha(flujo.fecha);
                if (dolarHistorico) {
                  dolarUsado = dolarHistorico;
                }
              }
              
              return {
                ...flujo,
                total: flujo.total / dolarUsado,
                renta: flujo.renta / dolarUsado,
                amort: flujo.amort / dolarUsado,
                tipo_moneda: 2, // Marcar como convertido a USD
              };
            }
            return flujo;
          })
        );

        setBonosConvertidos(bonosConvertidosSet);
        setFlujos(flujosConvertidos);
      } catch (err: any) {
        console.error('Error cargando flujos proyectados:', err);
        setError(err?.message || 'Error al cargar flujos proyectados');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Filtrar flujos según el período seleccionado
  const flujosFiltrados = useMemo(() => {
    if (selectedPeriod === 'MAX') return flujos;
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaLimite = new Date(hoy);
    
    switch (selectedPeriod) {
      case '3M':
        fechaLimite.setMonth(fechaLimite.getMonth() + 3);
        break;
      case '1Y':
        fechaLimite.setFullYear(fechaLimite.getFullYear() + 1);
        break;
      case '3Y':
        fechaLimite.setFullYear(fechaLimite.getFullYear() + 3);
        break;
      case '10Y':
        fechaLimite.setFullYear(fechaLimite.getFullYear() + 10);
        break;
    }
    
    return flujos.filter(flujo => {
      const fechaFlujo = new Date(flujo.fecha);
      fechaFlujo.setHours(0, 0, 0, 0);
      return fechaFlujo <= fechaLimite;
    });
  }, [flujos, selectedPeriod]);

  // Agrupar flujos por año o mes y por bono
  const chartData = useMemo(() => {
    const bonosUnicos = new Set<string>();
    flujosFiltrados.forEach(flujo => bonosUnicos.add(flujo.codigoespeciebono));
    const bonosArray = Array.from(bonosUnicos).sort();

    if (groupingMode === 'year') {
      // Agrupar por año
      const porAno = new Map<number, Map<string, number>>();
      
      flujosFiltrados.forEach((flujo) => {
        const fecha = new Date(flujo.fecha);
        const ano = fecha.getFullYear();
        
        if (!porAno.has(ano)) {
          porAno.set(ano, new Map());
        }
        
        const bonosDelAno = porAno.get(ano)!;
        const codigo = flujo.codigoespeciebono;
        const totalActual = bonosDelAno.get(codigo) || 0;
        bonosDelAno.set(codigo, totalActual + flujo.total);
      });

      // Convertir a formato para el gráfico
      const anos = Array.from(porAno.keys()).sort();
      const data = anos.map(ano => {
        const bonosDelAno = porAno.get(ano)!;
        const entry: any = { periodo: ano.toString() };
        
        bonosArray.forEach(bono => {
          entry[bono] = bonosDelAno.get(bono) || 0;
        });
        
        return entry;
      });

      return { data, bonos: bonosArray, labelKey: 'periodo' };
    } else {
      // Agrupar por mes-año
      const porMes = new Map<string, Map<string, number>>();
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      
      // Primero, encontrar el rango de fechas
      let fechaMin: Date | null = null;
      let fechaMax: Date | null = null;
      
      flujosFiltrados.forEach((flujo) => {
        const fecha = new Date(flujo.fecha);
        if (!fechaMin || fecha < fechaMin) {
          fechaMin = new Date(fecha);
        }
        if (!fechaMax || fecha > fechaMax) {
          fechaMax = new Date(fecha);
        }
      });
      
      // Si no hay fechas, retornar datos vacíos
      if (!fechaMin || !fechaMax) {
        return { data: [], bonos: bonosArray, labelKey: 'periodo' };
      }
      
      // Agrupar los flujos existentes por mes
      flujosFiltrados.forEach((flujo) => {
        const fecha = new Date(flujo.fecha);
        const ano = fecha.getFullYear();
        const mes = fecha.getMonth();
        const mesAnoKey = `${ano}-${String(mes + 1).padStart(2, '0')}`;
        
        if (!porMes.has(mesAnoKey)) {
          porMes.set(mesAnoKey, new Map());
        }
        
        const bonosDelMes = porMes.get(mesAnoKey)!;
        const codigo = flujo.codigoespeciebono;
        const totalActual = bonosDelMes.get(codigo) || 0;
        bonosDelMes.set(codigo, totalActual + flujo.total);
      });

      // Generar todos los meses en el rango
      const todosLosMeses: string[] = [];
      const fechaActual = new Date(fechaMin);
      fechaActual.setDate(1); // Primer día del mes
      const fechaMaxFinal = new Date(fechaMax);
      fechaMaxFinal.setDate(1); // Primer día del mes para comparación
      
      while (fechaActual <= fechaMaxFinal) {
        const ano = fechaActual.getFullYear();
        const mes = fechaActual.getMonth();
        const mesAnoKey = `${ano}-${String(mes + 1).padStart(2, '0')}`;
        todosLosMeses.push(mesAnoKey);
        
        // Avanzar al siguiente mes
        fechaActual.setMonth(fechaActual.getMonth() + 1);
      }

      // Crear datos para todos los meses, usando valores de porMes si existen
      const data = todosLosMeses.map((mesAnoKey) => {
        const [ano, mes] = mesAnoKey.split('-');
        const mesIndex = parseInt(mes) - 1;
        const mesNombre = meses[mesIndex];
        const entry: any = { periodo: `${mesNombre} ${ano}` };
        
        // Obtener valores del mes si existen, sino usar 0
        const bonosDelMes = porMes.get(mesAnoKey) || new Map();
        
        bonosArray.forEach(bono => {
          entry[bono] = bonosDelMes.get(bono) || 0;
        });
        
        return entry;
      });

      return { data, bonos: bonosArray, labelKey: 'periodo' };
    }
  }, [flujosFiltrados, groupingMode]);

  if (loading || isLoading) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-white mb-6">📊 Flujos Proyectados</h2>
        <div className="text-center py-12">
          <p className="text-slate-400">Cargando flujos proyectados...</p>
        </div>
      </div>
    );
  }

  if (error || apiError) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-white mb-6">📊 Flujos Proyectados</h2>
        <div className="text-center py-12">
          <p className="text-red-400">{error || apiError}</p>
        </div>
      </div>
    );
  }

  if (chartData.data.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-white mb-6">📊 Flujos Proyectados</h2>
        <div className="text-center py-12">
          <p className="text-slate-400">No hay flujos proyectados disponibles</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">📊 Flujos Proyectados</h2>
        
        <div className="flex items-center gap-4">
          {/* Selector de modo de agrupación */}
          <div className="flex gap-2 bg-slate-700 rounded-lg p-1">
            <button
              onClick={() => setGroupingMode('year')}
              className={`px-3 py-1 text-sm font-semibold rounded transition ${
                groupingMode === 'year'
                  ? 'bg-blue-500 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Por Año
            </button>
            <button
              onClick={() => setGroupingMode('month')}
              className={`px-3 py-1 text-sm font-semibold rounded transition ${
                groupingMode === 'month'
                  ? 'bg-blue-500 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Por Mes
            </button>
          </div>
          
          {/* Selector de período */}
          <div className="flex gap-2">
            {(['3M', '1Y', '3Y', '10Y', 'MAX'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-3 py-1 text-sm font-semibold rounded transition ${
                  selectedPeriod === period
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {period === '3M' ? '3 Meses' : period === '1Y' ? '1 Año' : period === '3Y' ? '3 Años' : period === '10Y' ? '10 Años' : 'MAX'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="bg-slate-900/50 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">Pago en dólares</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={chartData.data}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            barCategoryGap="10%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey={chartData.labelKey}
              tick={{ fill: '#94a3b8', fontSize: groupingMode === 'month' ? 10 : 12 }}
              axisLine={{ stroke: '#64748b' }}
              tickLine={{ stroke: '#64748b' }}
              angle={groupingMode === 'month' ? -45 : 0}
              textAnchor={groupingMode === 'month' ? 'end' : 'middle'}
              height={groupingMode === 'month' ? 80 : 40}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={(value) => {
                if (value >= 1000) {
                  return `${(value / 1000).toFixed(0)}k`;
                }
                return value.toString();
              }}
              axisLine={{ stroke: '#64748b' }}
              tickLine={{ stroke: '#64748b' }}
              label={{ value: 'Dólares', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '6px',
                color: '#f1f5f9',
              }}
              formatter={(value: number, name: string) => [
                `USD ${value.toLocaleString('es-AR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}`,
                name
              ]}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="square"
              content={({ payload }) => (
                <div className="flex flex-wrap gap-4 justify-center">
                  {payload?.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span
                        style={{
                          display: 'inline-block',
                          width: '14px',
                          height: '14px',
                          backgroundColor: entry.color,
                          borderRadius: '2px',
                        }}
                      />
                      <Link
                        to={`/ticker/${entry.value}`}
                        className="text-blue-400 hover:text-blue-300 hover:underline transition text-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {entry.value}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            />
            {chartData.bonos.map((bono) => (
              <Bar
                key={bono}
                dataKey={bono}
                stackId="flujos"
                fill={getBonoColor(bono)}
                stroke="none"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla de resumen */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50">
            <tr>
              <th className="py-2 px-3 text-left text-slate-300 font-semibold">
                {groupingMode === 'year' ? 'Año' : 'Mes'}
              </th>
              {chartData.bonos.map((bono) => (
                <th key={bono} className="py-2 px-3 text-right text-slate-300 font-semibold">
                  <Link 
                    to={`/ticker/${bono}`}
                    className="text-blue-400 hover:text-blue-300 hover:underline transition"
                  >
                    {bono}
                  </Link>
                </th>
              ))}
              <th className="py-2 px-3 text-right text-slate-300 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {chartData.data.map((row, idx) => {
              const total = chartData.bonos.reduce((sum, bono) => sum + (row[bono] || 0), 0);
              return (
                <tr
                  key={idx}
                  className="border-b border-slate-700/50 hover:bg-slate-700/30"
                >
                  <td className="py-2 px-3 text-slate-300">{row.periodo}</td>
                  {chartData.bonos.map((bono) => (
                    <td key={bono} className="py-2 px-3 text-right text-slate-400">
                      {row[bono] > 0
                        ? `USD ${row[bono].toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}`
                        : '-'}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right text-cyan-400 font-semibold">
                    USD {total.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                </tr>
              );
            })}
            {/* Fila de totales */}
            {(() => {
              const totalesPorBono = chartData.bonos.map(bono => {
                return chartData.data.reduce((sum, row) => sum + (row[bono] || 0), 0);
              });
              const totalGeneral = totalesPorBono.reduce((sum, total) => sum + total, 0);
              
              return (
                <tr className="bg-slate-900/70 border-t-2 border-slate-600 font-bold">
                  <td className="py-3 px-3 text-left text-slate-200">Total</td>
                  {chartData.bonos.map((bono, idx) => (
                    <td key={bono} className="py-3 px-3 text-right text-slate-200">
                      USD {totalesPorBono[idx].toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </td>
                  ))}
                  <td className="py-3 px-3 text-right text-cyan-300 font-bold">
                    USD {totalGeneral.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      {/* Advertencia sobre conversión de pesos */}
      {bonosConvertidos.size > 0 && (
        <div className="mt-6 p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
          <p className="text-yellow-300 text-sm mb-2">
            <strong>⚠️ Nota importante:</strong> Los siguientes bonos estaban en pesos y han sido convertidos a USD usando el dólar MEP actual ({dolarMEPActual}):
            {Array.from(bonosConvertidos).sort().map((bono) => (
              <Link
                key={bono}
                to={`/ticker/${bono}`}
                className="px-2 py-1 bg-yellow-800/50 border border-yellow-600/50 rounded text-yellow-200 text-xs font-mono hover:bg-yellow-700/50 hover:text-yellow-100 hover:underline transition inline-block mx-1"
              >
                {bono}
              </Link>
            ))}
            </p>
        </div>
      )}
    </div>
  );
};

export default FlujosProyectados;

