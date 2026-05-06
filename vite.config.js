import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  /**
   * Nur Express (npm run server), niemals PocketBase (8090): In Shells ist oft PORT=8090 gesetzt —
   * das dürfte den Vite-/api-Proxy nicht steuern, sonst liefert PB /api/health (200), Magazin-Routen aber 404.
   */
  const apiPort =
    String(env.VITE_EXPRESS_PORT || env.EXPRESS_PORT || '3000').replace(/[^\d]/g, '') || '3000'
  const apiTarget = `http://127.0.0.1:${apiPort}`
  const apiProxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
    },
  }

  return {
    define: {
      'import.meta.env.VITE_API_PORT_HINT': JSON.stringify(apiPort),
    },
    /* Zwei HTML-Einträge ohne SPA-Fallback */
    appType: 'mpa',
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          backend: resolve(__dirname, 'backend.html'),
          serverPanel: resolve(__dirname, 'server.html'),
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      // `localhost` nutzt oft IPv6 (::1); nur 127.0.0.1 → Connection refused im Browser.
      // `true` = alle Interfaces (127.0.0.1 + LAN); bei Problemen mit Node/os.networkInterfaces: `npm run dev -- --host 127.0.0.1`
      host: true,
      // Suffix mit führendem Punkt: alle *.ngrok-free.dev (Vite matched hostname.endsWith)
      allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app'],
      /* PocketBase schreibt ständig nach pb_data → sonst Vite-Watcher → Full-Reload aller Tabs (auch /backend.html) */
      watch: {
        ignored: ['**/pb_data/**', '**/pocketbase-bin/pb_data/**'],
      },
      proxy: apiProxy,
    },
    /* `vite preview` nutzt `server.proxy` nicht immer — explizit setzen, sonst 404 auf /api (z. B. Rechnungs-PDF). */
    preview: {
      proxy: apiProxy,
    },
  }
})
