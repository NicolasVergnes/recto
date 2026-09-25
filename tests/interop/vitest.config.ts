import { defineConfig } from 'vitest/config'

// Manual interoperability check (tests/interop/README.md): not part of `npm run verify`.
export default defineConfig({
  resolve: { alias: { $lib: '/src/lib' }, conditions: ['browser'] },
  test: {
    environment: 'node',
    include: ['tests/interop/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
})
