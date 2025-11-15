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

