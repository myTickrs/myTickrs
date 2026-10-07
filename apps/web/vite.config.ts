import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, '../..'), '');
  const webPort = Number(env.WEB_PORT || 5050);
  const apiPort = Number(env.PORT || 5051);
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: webPort,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
    build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
  };
});
