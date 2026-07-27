import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FATHOM',
    short_name: 'FATHOM',
    description: '深海没入型の戦略的孤独タイマー',
    start_url: '/',
    display: 'standalone', // 🚨 これがブラウザのURLバーを消し去る魔法の呪文です
    background_color: '#02050a',
    theme_color: '#02050a',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}