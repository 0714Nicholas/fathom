'use client'

import { useCallback, useEffect, useState } from 'react'
import { PUSH_PUBLIC_KEY } from '@/lib/push/shared'

export type ReminderSettings = {
  remindMinute: number
  weekdaysOnly: boolean
}

// needs-install: iPhone の Safari で開いている（ホーム画面に追加しないと通知を受け取れない）
export type ReminderState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'

const SETTINGS_KEY = 'fathom:push-reminder'
const FROM_PUSH_KEY = 'fathom:from-push'

// localStorage はプライベートモード等で例外を投げることがあるので必ず try で包む
function readSettings(): ReminderSettings | null {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    return raw ? (JSON.parse(raw) as ReminderSettings) : null
  } catch {
    return null
  }
}

function writeSettings(settings: ReminderSettings | null) {
  try {
    if (settings) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    else window.localStorage.removeItem(SETTINGS_KEY)
  } catch { /* noop */ }
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

// Service Worker は本番ビルドでしか登録されないので、待ちすぎないようにする
function serviceWorkerReady(timeoutMs = 8000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('service worker not ready')), timeoutMs)),
  ])
}

// 毎日決まった時刻に「5 分後に潜航」を知らせるプッシュ通知の設定
export function usePushReminder({ seed, onEnabled, onDisabled }: {
  seed: string | null
  onEnabled?: () => void | Promise<void>
  onDisabled?: () => void
}) {
  const [state, setState] = useState<ReminderState>('unsupported')
  const [settings, setSettings] = useState<ReminderSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!PUSH_PUBLIC_KEY) return
    if (isIos() && !isStandalone()) {
      setState('needs-install')
      return
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    if (Notification.permission === 'denied') {
      setState('blocked')
      return
    }
    setState('off')

    // 端末に購読が残っているときだけ「オン」と表示する
    const saved = readSettings()
    if (!saved || Notification.permission !== 'granted') return
    let cancelled = false
    serviceWorkerReady()
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (cancelled || !subscription) return
        setSettings(saved)
        setState('on')
      })
      .catch(() => { /* 確かめられなければ「オフ」のまま */ })
    return () => { cancelled = true }
  }, [])

  const save = useCallback(async (next: ReminderSettings) => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      // iPhone では、ボタンを押した処理の中で最初に許可を求める必要がある（await より前）
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      const registration = await serviceWorkerReady()
      const subscription = (await registration.pushManager.getSubscription())
        ?? (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUSH_PUBLIC_KEY),
        }))
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          seed,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...next,
        }),
      })
      if (!res.ok) throw new Error(`subscribe failed: ${res.status}`)
      writeSettings(next)
      setSettings(next)
      setState('on')
      await onEnabled?.()
    } catch (err) {
      console.warn('[Minasoko] reminder setup failed:', err)
      setMessage('通知を設定できませんでした。時間をおいて、もう一度試してください。')
    } finally {
      setBusy(false)
    }
  }, [busy, seed, onEnabled])

  const disable = useCallback(async () => {
    setBusy(true)
    setMessage(null)
    try {
      const registration = await serviceWorkerReady()
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => undefined)
        await subscription.unsubscribe().catch(() => false)
      }
    } catch { /* 端末側に購読が無くても、止めたことにする */ }
    writeSettings(null)
    setSettings(null)
    setState('off')
    onDisabled?.()
    setBusy(false)
  }, [onDisabled])

  const sendTest = useCallback(async () => {
    setBusy(true)
    setMessage(null)
    try {
      const registration = await serviceWorkerReady()
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) throw new Error('not subscribed')
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
      setMessage(res.ok
        ? 'テスト通知を送りました。届かなければ、端末の通知設定を確かめてください。'
        : '送れませんでした。もう一度「知らせる」を押してから試してください。')
    } catch {
      setMessage('送れませんでした。もう一度「知らせる」を押してから試してください。')
    } finally {
      setBusy(false)
    }
  }, [])

  return { state, settings, busy, message, save, disable, sendTest }
}

// 通知から開いたか（効果の測定用）。URL からは消して、このタブのあいだだけ覚えておく
export function useOpenedFromPush(): boolean {
  const [fromPush, setFromPush] = useState(false)
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('from') === 'push') {
        window.sessionStorage.setItem(FROM_PUSH_KEY, '1')
        url.searchParams.delete('from')
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
      }
      setFromPush(window.sessionStorage.getItem(FROM_PUSH_KEY) === '1')
    } catch { /* noop */ }
  }, [])
  return fromPush
}
