'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type FathomDescentPhase = 'idle' | 'descending' | 'settled'

export type UseFathomDescentOptions = {
  /**
   * Total descent duration in milliseconds.
   * Default 8000ms — long enough to feel like sinking, short enough not to bore.
   */
  durationMs?: number
  /**
   * If true, the descent starts on mount.
   * Default false — audio policies require a user gesture, so we usually wait for one.
   */
  autoStart?: boolean
}

export type FathomDescentController = {
  /** 0..1, eased. The single number all systems read. */
  descent: number
  /** Phase, for logic that needs to gate (e.g. archive surfacing). */
  phase: FathomDescentPhase
  /** Call to begin descent. Idempotent. */
  begin: () => void
  /** Force-complete the descent (e.g. for reduced-motion users). */
  skip: () => void
  /** Reset to idle. Rarely needed; mostly for tests / dev. */
  reset: () => void
}

function easeInOutCubic(t: number): number {
  if (t < 0.5) return 4 * t * t * t
  const f = 2 * t - 2
  return 0.5 * f * f * f + 1
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export function useFathomDescent({
  durationMs = 8000,
  autoStart = false,
}: UseFathomDescentOptions = {}): FathomDescentController {
  const [descent, setDescent] = useState(0)
  const [phase, setPhase] = useState<FathomDescentPhase>('idle')

  const startedAtRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const durationRef = useRef(durationMs)
  const cancelledRef = useRef(false)

  useEffect(() => {
    durationRef.current = durationMs
  }, [durationMs])

  const tick = useCallback(() => {
    if (cancelledRef.current) return
    const startedAt = startedAtRef.current
    if (startedAt == null) return

    const now = performance.now()
    const elapsed = now - startedAt
    const linear = clamp01(elapsed / Math.max(1, durationRef.current))
    const eased = easeInOutCubic(linear)

    setDescent(eased)

    if (linear >= 1) {
      setPhase('settled')
      rafRef.current = null
      return
    }

    rafRef.current = window.requestAnimationFrame(tick)
  }, [])

  const begin = useCallback(() => {
    if (startedAtRef.current != null) return
    startedAtRef.current = performance.now()
    cancelledRef.current = false
    setPhase('descending')
    rafRef.current = window.requestAnimationFrame(tick)
  }, [tick])

  const skip = useCallback(() => {
    cancelledRef.current = true
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    startedAtRef.current = performance.now() - durationRef.current
    setDescent(1)
    setPhase('settled')
  }, [])

  const reset = useCallback(() => {
    cancelledRef.current = true
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    startedAtRef.current = null
    setDescent(0)
    setPhase('idle')
  }, [])

  useEffect(() => {
    if (autoStart) begin()
  }, [autoStart, begin])

  // Respect users who explicitly request reduced motion: skip the descent.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mql.matches) {
      skip()
    }
  }, [skip])

  useEffect(() => {
    return () => {
      cancelledRef.current = true
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  return { descent, phase, begin, skip, reset }
}
