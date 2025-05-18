import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/network-topology-viz/',
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.tsx'),
      name: 'nettopology',
      fileName: () => `nettopology.js`,
      formats: ['iife']
    },
    sourcemap: true,
    minify: true,
    rollupOptions: {
      output: {
        globals: {}
      }
    }
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  }
})
