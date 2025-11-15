/**
 * Normaliza un ticker eliminando espacios y mapeando variaciones conocidas
 * El ticker principal siempre será el que no tiene espacios
 * 
 * Ejemplos:
 * - "EQUITYS A" -> "EQUITYSA"
 * - "BMM A" -> "BCMMA"
 * - "EQUITYSA" -> "EQUITYSA" (sin cambios)
 * - "BCMMA" -> "BCMMA" (sin cambios)
 */
export function normalizeTicker(ticker: string): string {
  if (!ticker) return ticker;
  
  // Primero, mapeo de variaciones conocidas (antes de eliminar espacios)
  // Esto maneja casos donde el espacio es parte de la variación
  const tickerMap: Record<string, string> = {
    'EQUITYS A': 'EQUITYSA',
    'BMM A': 'BCMMA',
  };
  
  // Si el ticker (con espacios) está en el mapa, usar el valor mapeado
  if (tickerMap[ticker]) {
    return tickerMap[ticker];
  }
  
  // Eliminar espacios
  const tickerSinEspacios = ticker.replace(/\s+/g, '');
  
  // Mapeo de variaciones sin espacios a sus versiones normalizadas
  const tickerMapSinEspacios: Record<string, string> = {
    'BMMA': 'BCMMA',  // "BMM A" sin espacios -> "BCMMA"
  };
  
  // Si el ticker sin espacios está en el mapa, usar el valor mapeado
  if (tickerMapSinEspacios[tickerSinEspacios]) {
    return tickerMapSinEspacios[tickerSinEspacios];
  }
  
  // Si no está en el mapa, retornar el ticker sin espacios
  return tickerSinEspacios;
}

/**
 * Compara dos tickers de forma normalizada
 * Útil para comparaciones que deben ignorar variaciones con espacios
 */
export function tickersMatch(ticker1: string, ticker2: string): boolean {
  return normalizeTicker(ticker1) === normalizeTicker(ticker2);
}

/**
 * Normaliza una fecha a formato YYYY-MM-DD
 * Acepta varios formatos de entrada: DD/MM/YYYY, YYYY-MM-DD, o Date object
 */
export function normalizarFecha(fecha: string): string {
  if (!fecha) return '';
  
  // Si ya está en formato YYYY-MM-DD
  if (fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return fecha;
  }
  
  // Si viene en formato DD/MM/YYYY
  if (fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [dia, mes, anio] = fecha.split('/');
    return `${anio}-${mes}-${dia}`;
  }
  
  // Si viene con hora (YYYY-MM-DDTHH:mm:ss)
  const fechaSinHora = fecha.split('T')[0].trim();
  if (fechaSinHora.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return fechaSinHora;
  }
  
  // Intentar parsear como Date
  try {
    const date = new Date(fecha);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // Ignorar error
  }
  
  return fecha; // Retornar original si no se pudo normalizar
}

/**
 * Convierte una fecha a formato YYYYMMDD para usar en APIs de Balanz
 * @param fecha - Date object o string en formato YYYY-MM-DD
 * @returns String en formato YYYYMMDD
 */
export function fechaToAPIFormat(fecha: Date | string): string {
  let date: Date;
  if (typeof fecha === 'string') {
    date = new Date(fecha);
  } else {
    date = fecha;
  }
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * Obtiene el rango de fechas estándar para consultas históricas
 * @returns Objeto con fechaDesde y fechaHasta en formato YYYYMMDD
 */
export function getFechaRangoHistorico(): { fechaDesde: string; fechaHasta: string } {
  const fechaHasta = new Date();
  const fechaDesde = new Date('2021-09-05');
  return {
    fechaDesde: fechaToAPIFormat(fechaDesde),
    fechaHasta: fechaToAPIFormat(fechaHasta)
  };
}

/**
 * Formatea una fecha a formato DD/MM/YYYY para mostrar
 * Acepta varios formatos de entrada: YYYY-MM-DD, DD/MM/YYYY, o Date object
 */
export function formatearFechaParaMostrar(fecha: string | null | undefined): string {
  if (!fecha) return '';
  
  // Si ya está en formato DD/MM/YYYY
  if (fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    return fecha;
  }
  
  // Si viene en formato YYYY-MM-DD
  if (fecha.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
  }
  
  // Intentar parsear como Date
  try {
    const date = new Date(fecha);
    if (!isNaN(date.getTime())) {
      const dia = String(date.getDate()).padStart(2, '0');
      const mes = String(date.getMonth() + 1).padStart(2, '0');
      const anio = date.getFullYear();
      return `${dia}/${mes}/${anio}`;
    }
  } catch (e) {
    // Ignorar errores de parsing
  }
  
  return fecha || '';
}

