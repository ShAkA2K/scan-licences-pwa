// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '',               // assets relatifs
  plugins: [react()],
  build: { outDir: 'dist', assetsDir: 'assets' },
})
