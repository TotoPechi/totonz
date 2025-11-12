/**
 * Helper para preservar tokens de autenticación al limpiar caché
 * Evita que se pierda la sesión cuando se limpian datos del localStorage
 */
export function preserveAuthTokens(clearFn: () => void): void {
  // Guardar tokens antes de limpiar
  const accessToken = localStorage.getItem('balanz_access_token');
  const tokenTimestamp = localStorage.getItem('balanz_token_timestamp');
  const tokenFail = localStorage.getItem('balanz_token_fail');
  
  // Ejecutar función de limpieza
  clearFn();
  
  // Restaurar tokens si existían
  if (accessToken) localStorage.setItem('balanz_access_token', accessToken);
  if (tokenTimestamp) localStorage.setItem('balanz_token_timestamp', tokenTimestamp);
  if (tokenFail) localStorage.setItem('balanz_token_fail', tokenFail);
}

