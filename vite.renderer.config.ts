import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const DEV_SERVER = '127.0.0.1:5173';

/**
 * index.html의 CSP는 배포용으로 connect-src를 'self'로만 둔다.
 * 개발 서버(HMR 웹소켓)를 쓸 때만 그 주소를 더해, 배포물이 로컬 서비스에 요청할 통로를 남기지 않는다.
 */
function devServerCsp(): Plugin {
  return {
    name: 'dev-server-csp',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html.replace("connect-src 'self'", `connect-src 'self' ws://${DEV_SERVER} http://${DEV_SERVER}`),
  };
}

export default defineConfig({
  plugins: [react(), devServerCsp()],
  root: '.',
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
  },
});
