import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }),
    tsconfigPaths(),
  ],
  server: {
    port: 50003,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:30003',
        changeOrigin: true,
        secure: false,
      },
      // WebSocket signaling is reached directly at ws://localhost:30003/signal
      // (kept off the proxy so the demo mirrors a real split front/back deployment)
    }
  }
})
