import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Keep Vitest's test settings in the shared config while using Vite's own
// type definitions, avoiding conflicting Vite types from nested dependencies.
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
} as any)
