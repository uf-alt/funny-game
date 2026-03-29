import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        signup: resolve(__dirname, 'signup.html'),
        leaderboard: resolve(__dirname, 'leaderboard.html'),
      },
    },
  },
})
