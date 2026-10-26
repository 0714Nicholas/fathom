'use client'

import { useCallback, useEffect, useState } from 'react'

const PREF_KEY = 'fathom:notify'

function readPref(): string | null {
  try { return window.localStorage.getItem(PREF_KEY) } catch { return null }
}

function writePref(value: string) {
  try { window.localStorage.setItem(PREF_KEY, value) } catch { /* noop */ }
}

export type NotificationState = 'unsupported' | 'blocked' | 'off' | 'on'

// タブが裏にあるときに「潜航開始」などを知らせる。許可はボタンを押したときだけ求める
export function useDiveNotifications() {
  const [state, setState] = useState<NotificationState>('unsupported')

  useEffect(() => {
    if (!('Notification' in window)) return
    if (Notification.permission === 'denied') setState('blocked')
    else if (Notification.permission === 'granted' && readPref() === 'on') setState('on')
    else setState('off')
  }, [])

  const enable = useCallback(async () => {
    if (!('Notification' in window)) return
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (result === 'granted') {
      writePref('on')
      setState('on')
    } else if (result === 'denied') {
      setState('blocked')
    }
  }, [])

  const disable = useCallback(() => {
    writePref('off')
    setState('off')
  }, [])

  const notify = useCallback(async (title: string, body: string) => {
    if (state !== 'on' || Notification.permission !== 'granted') return
    if (document.visibilityState === 'visible') return // 画面を見ている人には出さない
    const options: NotificationOptions = { body, tag: 'fathom-dive', icon: '/icon-192x192.png' }
    // Android の Chrome は new Notification() を禁止しているので、Service Worker 経由を優先する
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg) {
        await reg.showNotification(title, options)
        return
      }
    } catch { /* fall through */ }
    try { new Notification(title, options) } catch { /* noop */ }
  }, [state])

  return { state, enable, disable, notify }
}
