import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Loudness DD',
  description: 'LUFS-based tab volume balancer for Chrome',
  version: process.env.npm_package_version ?? '0.0.0',
  default_locale: 'en',
  icons: {
    '16': 'logo.png',
    '32': 'logo.png',
    '48': 'logo.png',
    '128': 'logo.png',
  },
  action: {
    default_popup: 'index.html',
    default_icon: {
      '16': 'logo.png',
      '32': 'logo.png',
    },
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  permissions: ['tabCapture', 'tabs', 'activeTab', 'offscreen', 'storage'],
})
