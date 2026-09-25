import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

const covered = { lines: 90, functions: 90, statements: 90, branches: 90 }

export default defineConfig({
  plugins: [svelte()],
  resolve: { alias: { $lib: '/src/lib' }, conditions: ['browser'] },
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.svelte.ts', 'src/lib/**/*.worker.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: {
        'src/lib/scheduler/**': covered,
        'src/lib/queue/**': covered,
        'src/lib/import/**': covered,
      },
    },
  },
})
