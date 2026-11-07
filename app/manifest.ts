import type { MetadataRoute } from 'next';

import { APP_NAME } from '@/lib/copy';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: 'Gym management for owners and staff',
    start_url: '/today',
    display: 'standalone',
    background_color: '#fbfbfa',
    theme_color: '#fbfbfa',
    icons: [
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
  };
}
