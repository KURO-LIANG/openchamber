import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'bun:test': fileURLToPath(new URL('./test/bun-test-shim.ts', import.meta.url)),
      '@openchamber/ui': fileURLToPath(new URL('../ui/src', import.meta.url)),
      // Mirrors vite.config.ts so shared UI files that import with the `@/`
      // alias (e.g. lib/desktop.ts) resolve under vitest too.
      '@': fileURLToPath(new URL('../ui/src', import.meta.url)),
    },
  },
});
