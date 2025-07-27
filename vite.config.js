import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

console.log('Vite config file loaded')

export default defineConfig({
  plugins: [react()],
})