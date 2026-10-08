import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/local-ai': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/local-ai/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'icons': ['lucide-react'],
          'qr': ['qrcode.react'],
        },
        entryFileNames: `assets/[name]-v${Date.now()}-[hash].js`,
        chunkFileNames: `assets/[name]-v${Date.now()}-[hash].js`,
        assetFileNames: `assets/[name]-v${Date.now()}-[hash].[ext]`
      }
    }
  }
});
