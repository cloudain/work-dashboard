import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/work-dashboard/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Work Dashboard — Lịch & Thu nhập',
        short_name: 'WorkDash',
        description: 'Quản lý lịch làm việc hàng tuần và tổng kết tài chính hàng tháng',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
});
