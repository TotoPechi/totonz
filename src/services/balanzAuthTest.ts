/**
 * Script de prueba para verificar la autenticación de Balanz
 * Ejecutar desde la consola del navegador o como test
 */

import { clearTokenCache, getAccessToken, getCachedAccessToken } from './balanzAuth';

// Exportar funciones para uso en consola del navegador
(window as any).testBalanzAuth = {
  /**
   * Prueba obtener un nuevo token (sin caché)
   */
  async getNewToken() {
    console.log('🧪 Probando obtener nuevo token...');
    try {
      const token = await getAccessToken();
      console.log('✅ Token obtenido:', token);
      return token;
    } catch (error) {
      console.error('❌ Error:', error);
      throw error;
    }
  },

  /**
   * Prueba obtener token con caché
   */
  async getCachedToken() {
    console.log('🧪 Probando obtener token (con caché)...');
    try {
      const token = await getCachedAccessToken();
      console.log('✅ Token obtenido:', token);
      return token;
    } catch (error) {
      console.error('❌ Error:', error);
      throw error;
    }
  },

  /**
   * Limpia el caché de token
   */
  clearCache() {
    console.log('🧪 Limpiando caché de token...');
    clearTokenCache();
    console.log('✅ Caché limpiado');
  },

  /**
   * Verifica las credenciales configuradas
   */
  checkConfig() {
    const user = import.meta.env.VITE_BALANZ_USER;
    const pass = import.meta.env.VITE_BALANZ_PASS;
    
    console.log('📋 Configuración:');
    console.log('  Usuario:', user ? `${user} ✅` : '❌ NO CONFIGURADO');
    console.log('  Password:', pass ? '****** ✅' : '❌ NO CONFIGURADO');
    
    return { user: !!user, pass: !!pass };
  }
};

console.log('🧪 Test de autenticación cargado. Usa window.testBalanzAuth para probar:');
console.log('  - testBalanzAuth.checkConfig() - Verificar configuración');
console.log('  - testBalanzAuth.getNewToken() - Obtener nuevo token');
console.log('  - testBalanzAuth.getCachedToken() - Obtener token con caché');
console.log('  - testBalanzAuth.clearCache() - Limpiar caché');
