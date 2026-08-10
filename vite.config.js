import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // A fixed port, and a refusal to move off it. Vite's default is to hop to the
  // next free port when 5173 is taken, which silently hands the tests whichever
  // other project happens to be running there.
  server: { port: 5174, strictPort: true },
})
