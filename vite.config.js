import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    // Full-screen WorkoutLog tests take <1s locally but hit the 5s default when
    // all files share a small CI runner. 30s still fails a hung test quickly.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    exclude: ['node_modules/**', 'dist/**', '.claude/**', 'backend/**'],
  },
})
