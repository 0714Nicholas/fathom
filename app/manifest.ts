import { MetadataRoute } from 'next'
import { SITE_DESCRIPTION } from '@/lib/site'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Fathom — 深海の集中・瞑想・睡眠タイマー',
    short_name: 'FATHOM',
    description: SITE_DESCRIPTION,
    lang: 'ja',
    start_url: '/',
    scope: '/',
    display: 'standalone', // 🚨 これがブラウザのURLバーを消し去る魔法の呪文です
    background_color: '#02050a',
    theme_color: '#02050a',
    categories: ['health', 'lifestyle', 'productivity'],
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
