'use client'

import { useEffect } from 'react'

// PWA 用の Service Worker を本番ビルドでのみ登録する（開発中はキャッシュで混乱しないように）
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[Fathom] service worker registration failed', err)
      })
    }

    if (document.readyState === 'complete') {
      register()
      return
    }
    window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
