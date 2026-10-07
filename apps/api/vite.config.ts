import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

const external = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  ...Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@tickrs/')),
];

export default defineConfig({
  build: {
    ssr: true,
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: { server: 'src/server.ts', 'migrate-cli': 'src/db/migrate-cli.ts' },
      external: (id) => external.some((e) => id === e || id.startsWith(`${e}/`)),
      output: { format: 'esm', entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
    },
  },
  ssr: { noExternal: [/^@tickrs\//] },
});
