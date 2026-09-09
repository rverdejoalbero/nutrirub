import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // fake-indexeddb da un IndexedDB de mentira para poder probar Dexie
    // sin navegador: la exportacion es el unico respaldo que hay y tiene
    // que estar cubierta de verdad.
    setupFiles: ['src/pruebas/preparar.ts'],
  },
})
