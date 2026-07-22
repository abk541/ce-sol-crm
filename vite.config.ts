/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const apiValue = loadEnv(mode, '.', '').VITE_API_URL?.trim()
    let apiUrl: URL | null = null
    try {
      apiUrl = apiValue ? new URL(apiValue) : null
    } catch {
      apiUrl = null
    }
    const isLocalHttp = apiUrl?.protocol === 'http:'
      && ['127.0.0.1', 'localhost'].includes(apiUrl.hostname)
    if (
      !apiUrl
      || (!isLocalHttp && apiUrl.protocol !== 'https:')
      || !apiUrl.pathname.replace(/\/+$/, '').endsWith('/api/v1')
    ) {
      throw new Error(
        'VITE_API_URL must be an HTTPS API URL ending in /api/v1 (local HTTP is allowed only for localhost).',
      )
    }
  }

  return {
    plugins: [react()],
    // Relative asset paths work on both GitHub Pages (/ce-sol-crm/) and any
    // custom domain root (crm.cesolutionplus.com/). Safe because we use
    // HashRouter — no server-side path routing needed.
    base: './',
    test: {
      globals: true,
      environment: 'happy-dom',
      setupFiles: [],
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  }
})
