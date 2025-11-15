import React, { useState, useEffect, useMemo } from 'react';
import {
  getMovimientosHistoricosConCache,
  getIngresosYEgresos,
  getDividendosTotales,
  getRentasTotales,
  getSaldosActuales,
  getEstadoCuentaConCache,
  getDolarMEP,
  IngresoEgreso,
} from '../services/balanzApi';
import { getTickerHoldingData } from '../services/tickerHoldingData';
import { Position } from '../types/balanz';
import { formatearFechaParaMostrar, getFechaRangoHistorico } from '../utils/tickerHelpers';
import ResumenCards from './rendimientos/ResumenCards';
import ResumenCharts from './rendimientos/ResumenCharts';
import MovimientosChart from './rendimientos/MovimientosChart';
import MovimientosTable from './rendimientos/MovimientosTable';

interface RendimientosProps {
  positions: Position[];
  loading?: boolean;
  apiError?: string | null;
}

const Rendimientos: React.FC<RendimientosProps> = ({ positions, loading, apiError }) => {
  const [ingresos, setIngresos] = useState<IngresoEgreso[]>([]);
  const [egresos, setEgresos] = useState<IngresoEgreso[]>([]);
  const [dividendosTotal, setDividendosTotal] = useState<number>(0);
  const [dividendosPorTicker, setDividendosPorTicker] = useState<Map<string, number>>(new Map());
  const [rentasTotal, setRentasTotal] = useState<number>(0);
  const [rentasPorTicker, setRentasPorTicker] = useState<Map<string, number>>(new Map());
  const [saldosActuales, setSaldosActuales] = useState<{ usd: number; cable: number; pesos: number }>({
    usd: 0,
    cable: 0,
    pesos: 0,
  });
  const [valorActualTotal, setValorActualTotal] = useState<number>(0);
  const [groupedPositions, setGroupedPositions] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Obtener movimientos históricos
        const { fechaDesde, fechaHasta } = getFechaRangoHistorico();
        const movimientosResult = await getMovimientosHistoricosConCache(fechaDesde, fechaHasta);

        if (!movimientosResult.data || movimientosResult.data.length === 0) {
          setError('No se encontraron movimientos históricos');
          setIsLoading(false);
          return;
        }

        // Obtener ingresos y egresos
        const { ingresos: ingresosData, egresos: egresosData } = await getIngresosYEgresos(movimientosResult.data);
        setIngresos(ingresosData);
        setEgresos(egresosData);

        // Obtener dividendos totales
        const dividendosData = await getDividendosTotales(movimientosResult.data);
        setDividendosTotal(dividendosData.total);
        setDividendosPorTicker(dividendosData.porTicker);

        // Obtener rentas totales
        const rentasData = await getRentasTotales(movimientosResult.data);
        setRentasTotal(rentasData.total);
        setRentasPorTicker(rentasData.porTicker);

        // Obtener saldos actuales
        const saldos = await getSaldosActuales();
        setSaldosActuales(saldos);

        // Calcular valor actual total de activos (usando la misma lógica que CarteraActual)
        const estadoCuenta = await getEstadoCuentaConCache();
        const dolarMEP = getDolarMEP(estadoCuenta.data?.cotizacionesDolar || []) || 1000;

        const tickersUnicos = Array.from(new Set(positions.map((p) => p.Ticker).filter(Boolean)));

        // Agrupar posiciones por ticker y calcular valor actual
        const grouped: Record<string, any> = {};
        await Promise.all(
          tickersUnicos.map(async (ticker) => {
            const data = await getTickerHoldingData(ticker, positions, dolarMEP);
            if (data) {
              grouped[ticker] = data;
            }
          })
        );

        setGroupedPositions(grouped);

        // Sumar valor actual de todas las posiciones
        const valorActual = Object.values(grouped).reduce(
          (sum: number, position: any) => sum + (position.valorActual || 0),
          0
        );

        setValorActualTotal(valorActual);
      } catch (err: any) {
        console.error('Error cargando datos de rendimientos:', err);
        setError(err?.message || 'Error al cargar datos de rendimientos');
      } finally {
        setIsLoading(false);
      }
    };

    if (positions && positions.length > 0) {
      loadData();
    }
  }, [positions]);

  // Calcular totales
  const totalIngresosUSD = ingresos.reduce((sum, ing) => sum + ing.importeUSD, 0);
  const totalEgresosUSD = egresos.reduce((sum, eg) => sum + eg.importeUSD, 0);
  const montoInvertido = totalIngresosUSD - totalEgresosUSD;
  const saldosTotalUSD = saldosActuales.usd + saldosActuales.cable + saldosActuales.pesos;
  const rendimientoTotal = valorActualTotal + saldosTotalUSD - montoInvertido;
  const rendimientoPorcentaje = montoInvertido > 0 ? (rendimientoTotal / montoInvertido) * 100 : 0;

  // Datos para gráfico de torta de valor actual de activos
  const pieChartDataActivos = useMemo(() => {
    const categorias = {
      'Acciones': 0,
      'Bonos': 0,
      'Corporativos': 0,
      'CEDEARs': 0,
    };

    Object.values(groupedPositions).forEach((position: any) => {
      const tipo = position.tipo?.toLowerCase() || '';
      const valorActual = position.valorActual || 0;

      if (tipo.includes('acción') || tipo.includes('accion')) {
        categorias['Acciones'] += valorActual;
      } else if (tipo.includes('bono')) {
        categorias['Bonos'] += valorActual;
      } else if (tipo.includes('corporativo')) {
        categorias['Corporativos'] += valorActual;
      } else if (tipo.includes('cedear')) {
        categorias['CEDEARs'] += valorActual;
      } else {
        // Inferir por ticker si no podemos categorizar por tipo
        const ticker = position.ticker;
        if (['VIST'].includes(ticker)) {
          categorias['CEDEARs'] += valorActual;
        } else if (['AL30', 'BPOC7', 'T30J6', 'TZXD6', 'YM39O'].includes(ticker)) {
          categorias['Bonos'] += valorActual;
        } else if (['YMCXO', 'TLC1O'].includes(ticker)) {
          categorias['Corporativos'] += valorActual;
        } else {
          categorias['Acciones'] += valorActual;
        }
      }
    });

    return Object.entries(categorias)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value,
        percentage: valorActualTotal > 0 ? (value / valorActualTotal) * 100 : 0,
      }));
  }, [groupedPositions, valorActualTotal]);

  // Datos para gráfico de torta de dividendos por ticker
  const pieChartDataDividendos = useMemo(() => {
    return Array.from(dividendosPorTicker.entries())
      .map(([ticker, value]) => ({
        name: ticker,
        value,
        percentage: dividendosTotal > 0 ? (value / dividendosTotal) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [dividendosPorTicker, dividendosTotal]);

  // Datos para gráfico de torta de rentas por ticker
  const pieChartDataRentas = useMemo(() => {
    return Array.from(rentasPorTicker.entries())
      .map(([ticker, value]) => ({
        name: ticker,
        value,
        percentage: rentasTotal > 0 ? (value / rentasTotal) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [rentasPorTicker, rentasTotal]);

  // Datos para gráfico de torta de saldos por moneda
  const pieChartDataSaldos = useMemo(() => {
    const saldos = [
      { name: 'USD', value: saldosActuales.usd },
      { name: 'Cable', value: saldosActuales.cable },
      { name: 'Pesos', value: saldosActuales.pesos },
    ].filter((item) => item.value > 0);

    return saldos.map((item) => ({
      ...item,
      percentage: saldosTotalUSD > 0 ? (item.value / saldosTotalUSD) * 100 : 0,
    }));
  }, [saldosActuales, saldosTotalUSD]);

  // Combinar ingresos y egresos para tabla unificada
  const todosLosMovimientos = useMemo(() => {
    const movimientos = [
      ...ingresos.map((ing) => ({ ...ing, tipo: 'Depósito' as const })),
      ...egresos.map((eg) => ({ ...eg, tipo: 'Extracción' as const })),
    ];
    return movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [ingresos, egresos]);

  // Usar función centralizada para formatear fechas
  const formatearFechaGrafico = formatearFechaParaMostrar;

  // Datos para gráfico de movimientos con acumulado
  const chartDataMovimientos = useMemo(() => {
    // Agrupar movimientos por fecha
    const movimientosPorFecha: Record<string, { ingresos: number; egresos: number }> = {};
    
    ingresos.forEach((ing) => {
      const fecha = ing.fecha;
      if (!movimientosPorFecha[fecha]) {
        movimientosPorFecha[fecha] = { ingresos: 0, egresos: 0 };
      }
      movimientosPorFecha[fecha].ingresos += ing.importeUSD;
    });

    egresos.forEach((eg) => {
      const fecha = eg.fecha;
      if (!movimientosPorFecha[fecha]) {
        movimientosPorFecha[fecha] = { ingresos: 0, egresos: 0 };
      }
      movimientosPorFecha[fecha].egresos += eg.importeUSD;
    });

    // Convertir a array y ordenar por fecha
    const fechas = Object.keys(movimientosPorFecha).sort((a, b) => {
      // Manejar formato YYYY-MM-DD o DD/MM/YYYY
      let dateA: Date;
      let dateB: Date;
      
      if (a.match(/^\d{4}-\d{2}-\d{2}/)) {
        // Formato YYYY-MM-DD
        dateA = new Date(a);
      } else if (a.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        // Formato DD/MM/YYYY
        const [diaA, mesA, anioA] = a.split('/');
        dateA = new Date(parseInt(anioA), parseInt(mesA) - 1, parseInt(diaA));
      } else {
        dateA = new Date(a);
      }
      
      if (b.match(/^\d{4}-\d{2}-\d{2}/)) {
        // Formato YYYY-MM-DD
        dateB = new Date(b);
      } else if (b.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        // Formato DD/MM/YYYY
        const [diaB, mesB, anioB] = b.split('/');
        dateB = new Date(parseInt(anioB), parseInt(mesB) - 1, parseInt(diaB));
      } else {
        dateB = new Date(b);
      }
      
      return dateA.getTime() - dateB.getTime();
    });

    // Calcular acumulado
    let acumulado = 0;
    const datos = fechas.map((fecha) => {
      const { ingresos, egresos } = movimientosPorFecha[fecha];
      acumulado += ingresos - egresos;
      return {
        fecha: formatearFechaGrafico(fecha), // Formatear para mostrar
        fechaOriginal: fecha, // Guardar original para ordenamiento
        ingresos,
        egresos: -egresos, // Negativo para mostrar como barra hacia abajo
        acumulado,
      };
    });

    return datos;
  }, [ingresos, egresos]);

  if (loading || isLoading) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-white mb-6">💰 Rendimientos</h2>
        <div className="text-center py-12">
          <p className="text-slate-400">Cargando datos de rendimientos...</p>
        </div>
      </div>
    );
  }

  if (error || apiError) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-white mb-6">💰 Rendimientos</h2>
        <div className="text-center py-12">
          <p className="text-red-400">{error || apiError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-white mb-6">💰 Rendimientos</h2>

      <ResumenCards
        totalIngresosUSD={totalIngresosUSD}
        totalEgresosUSD={totalEgresosUSD}
        montoInvertido={montoInvertido}
        valorActualTotal={valorActualTotal}
        saldosTotalUSD={saldosTotalUSD}
        rendimientoTotal={rendimientoTotal}
        rendimientoPorcentaje={rendimientoPorcentaje}
      />

      <ResumenCharts
        valorActualTotal={valorActualTotal}
        pieChartDataActivos={pieChartDataActivos}
        saldosTotalUSD={saldosTotalUSD}
        pieChartDataSaldos={pieChartDataSaldos}
        dividendosTotal={dividendosTotal}
        pieChartDataDividendos={pieChartDataDividendos}
        rentasTotal={rentasTotal}
        pieChartDataRentas={pieChartDataRentas}
      />

      <MovimientosChart chartDataMovimientos={chartDataMovimientos} />

      <MovimientosTable todosLosMovimientos={todosLosMovimientos} />

    </div>
  );
};

export default Rendimientos;
