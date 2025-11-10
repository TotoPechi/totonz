import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://clientes.balanz.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '/api/v1'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Headers requeridos por Balanz
            proxyReq.setHeader('Accept', 'application/json');
            proxyReq.setHeader('Lang', 'es');
            proxyReq.setHeader('Referer', 'https://clientes.balanz.com/');
            proxyReq.setHeader('Origin', 'https://clientes.balanz.com');
            
            const isAuthEndpoint = req.url?.includes('/auth/init') || req.url?.includes('/auth/login');
            console.log('🔄 Proxy request:', req.method, req.url, '→', proxyReq.path, isAuthEndpoint ? '(auth)' : '');
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('📡 Proxy response:', req.url, '→', proxyRes.statusCode);
          });
        },
      },
    },
  },
})
