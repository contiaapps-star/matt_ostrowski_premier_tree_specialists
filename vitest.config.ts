import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
    testTimeout: 15000,
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'app'),
      '@routes': resolve(__dirname, 'app/routes'),
      '@services': resolve(__dirname, 'app/services'),
      '@clients': resolve(__dirname, 'app/clients'),
      '@db': resolve(__dirname, 'app/db'),
      '@views': resolve(__dirname, 'app/views'),
      '@middleware': resolve(__dirname, 'app/middleware'),
      '@lib': resolve(__dirname, 'app/lib'),
    },
  },
});
