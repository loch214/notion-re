import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { workspaceApi } from './server/vite-plugin.ts'

export default defineConfig({
  plugins: [react(), workspaceApi()],
  server: { watch: { ignored: ['**/data/**'] } },
})
