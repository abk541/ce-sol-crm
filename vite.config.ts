/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths work on both GitHub Pages (/ce-sol-crm/) and any
  // custom domain root (crm.cesolutionplus.com/). Safe because we use
  // HashRouter — no server-side path routing needed.
  base: './',
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: [],
  },
})
