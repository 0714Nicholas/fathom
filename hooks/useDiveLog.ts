'use client'

import { useEffect, useRef } from 'react'

type DiveLogContext = {
  seed: string | null
  mode: string
  port: string | null
  slotStart: number | null
}

type OpenDive = DiveLogContext & { id: string, startedAt: number }

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // randomUUID が無い古いブラウザ向けの簡易 UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function send(dive: OpenDive, completed: boolean) {
  const durationMs = Date.now() - dive.startedAt
  if (durationMs < 10_000) return // 誤操作レベルの短い潜航は記録しない
  const body = JSON.stringify({
    id: dive.id,
    seed: dive.seed,
    mode: dive.mode,
    port: dive.port,
    slotStart: dive.slotStart,
    startedAt: dive.startedAt,
    durationMs,
    completed,
  })
  // ページを閉じる瞬間でも届くように sendBeacon を優先する（同一オリジンなので text/plain で送る）
  if (typeof navigator !== 'undefined' && navigator.sendBeacon?.('/api/dive-log', body)) return
  void fetch('/api/dive-log', { method: 'POST', body, keepalive: true }).catch(() => {})
}

/**
 * 潜航 1 回ごとに記録を 1 件送る。
 * - active が true になったら潜航開始、false に戻ったら最後まで潜った（completed）として送る
 * - 潜航中にページを閉じたら、そこまでの時間を completed: false で送る
 */
export function useDiveLog(active: boolean, context: DiveLogContext) {
  const openRef = useRef<OpenDive | null>(null)
  const contextRef = useRef(context)
  contextRef.current = context

  useEffect(() => {
    if (active) {
      if (!openRef.current && contextRef.current.seed) {
        openRef.current = { ...contextRef.current, id: newId(), startedAt: Date.now() }
      }
      return
    }
    if (openRef.current) {
      send(openRef.current, true)
      openRef.current = null
    }
  }, [active])

  useEffect(() => {
    const onPageHide = () => {
      if (!openRef.current) return
      send(openRef.current, false)
      openRef.current = null
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])
}
