'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  RealtimeChannel,
  RealtimePresenceState,
} from '@supabase/supabase-js'
import {
  buryLetter,
  fetchArchivedLetters,
  getSupabaseClient,
  insertLetterArchive,
  recordLetterEcho,
  type ArchivedLetter,
} from '@/lib/supabase/client'
import {
  djb2,
  makeCrystalIdentity,
  type CrystalIdentity,
} from '@/lib/identity/crystalSeed'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LetterSource = 'live' | 'archive'

export type LetterPayload = {
  id: string
  text: string
  authorId: string
  authorName?: string
  city?: string
  createdAt: number
  source: LetterSource
  fathomDepth?: number | null
  weatherSnapshot?: Record<string, unknown> | null
  lang?: string | null
}

export type ResonancePulsePayload = {
  authorId: string
  authorName?: string
  city?: string
  energy: number
  at: number
}

export type HeatmapPulse = {
  authorId: string
  azimuthDeg: number
  hueDeg: number
  energy: number
  at: number
}

export type RealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'subscribed'
  | 'error'
  | 'disabled'

export type UseRealtimeLettersOptions = {
  roomId: string
  selfId: string
  selfName?: string
  city?: string
  depth: number
  descent?: number
  currentWeatherSnapshot?: Record<string, unknown> | null
  preferredLang?: string | null
  onRemoteResonance?: (payload: ResonancePulsePayload) => void

  /**
   * Depth (0..1) above which normal archive surfacing is paused.
   * Below: surfacing slowly resumes. Default 0.34.
   */
  archiveSurfacingThreshold?: number

  /**
   * Minimum interval (ms) between two normal archive surfacings. Default 14000.
   */
  archiveSurfacingMinIntervalMs?: number

  /**
   * Enable the special "first letter from the deep" ceremony, which fires
   * once per session, soon after the descent settles. Default true.
   */
  enableFirstSurfacing?: boolean

  /**
   * Grace period (ms) after descent fully settles before the first surfacing
   * is allowed to fire. Default 1600.
   */
  firstSurfacingGraceMs?: number
}

export type UseRealtimeLettersReturn = {
  status: RealtimeStatus
  liveLetters: LetterPayload[]
  archive: LetterPayload[]
  activeLetter: LetterPayload | null
  presenceCount: number
  archiveLoading: boolean
  latestHeatmapPulse: HeatmapPulse | null
  sendLetter: (text: string) => Promise<LetterPayload | null>
  sendResonance: (energy: number) => void
  dismissActive: () => void
  manualPlay: (letter: LetterPayload) => void
  buryOwnLetter: (letterId: string) => Promise<boolean>
}

function safeUUID() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function archivedToLetterPayload(a: ArchivedLetter): LetterPayload {
  return {
    id: a.id,
    text: a.text,
    authorId: '',
    authorName: a.author_name ?? undefined,
    city: a.city ?? undefined,
    createdAt: new Date(a.created_at).getTime(),
    source: 'archive',
    fathomDepth: a.fathom_depth,
    weatherSnapshot: a.weather_snapshot,
    lang: a.lang,
  }
}

function azimuthFor(id: string): number {
  const h = djb2(`fathom:azimuth:${id}`)
  return (h % 36000) / 100
}

function identityOrFallback(
  authorId: string | undefined,
  fallbackKey: string
): CrystalIdentity {
  return makeCrystalIdentity(
    authorId && authorId.length > 0 ? authorId : fallbackKey
  )
}

/**
 * For the ceremonial "first letter from the deep", we don't want a random
 * candidate; we want something that *feels* old and intentional.
 *
 * Strategy:
 *   - If any archive letter is older than 24h, pick the oldest one.
 *   - Otherwise, pick the oldest of whatever we have.
 *   - Skip letters authored by self (the deep should not speak in your voice).
 */
function pickFirstSurfacingCandidate(
  archive: LetterPayload[],
  selfId: string,
  excludeIds: Set<string>
): LetterPayload | null {
  const now = Date.now()
  const eligible = archive.filter(
    (l) => l.authorId !== selfId && !excludeIds.has(l.id)
  )
  if (eligible.length === 0) return null

  const old = eligible.filter((l) => now - l.createdAt > 24 * 60 * 60 * 1000)
  const pool = old.length > 0 ? old : eligible

  // archive list is already sorted ascending by created_at,
  // but be defensive in case the source order ever changes.
  let oldest = pool[0]
  for (const candidate of pool) {
    if (candidate.createdAt < oldest.createdAt) oldest = candidate
  }
  return oldest
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRealtimeLetters({
  roomId,
  selfId,
  selfName,
  city,
  depth,
  descent = 1,
  currentWeatherSnapshot,
  preferredLang,
  onRemoteResonance,
  archiveSurfacingThreshold = 0.34,
  archiveSurfacingMinIntervalMs = 14000,
  enableFirstSurfacing = true,
  firstSurfacingGraceMs = 1600,
}: UseRealtimeLettersOptions): UseRealtimeLettersReturn {
  const [status, setStatus] = useState<RealtimeStatus>('idle')
  const [liveLetters, setLiveLetters] = useState<LetterPayload[]>([])
  const [archive, setArchive] = useState<LetterPayload[]>([])
  const [activeLetter, setActiveLetter] = useState<LetterPayload | null>(null)
  const [presenceCount, setPresenceCount] = useState(1)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [latestHeatmapPulse, setLatestHeatmapPulse] =
    useState<HeatmapPulse | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const liveQueueRef = useRef<LetterPayload[]>([])
  const archiveQueueRef = useRef<LetterPayload[]>([])
  const playingRef = useRef(false)
  const onRemoteResonanceRef = useRef(onRemoteResonance)
  const lastResonanceSentRef = useRef(0)
  const lastArchiveSurfacedAtRef = useRef(0)
  const seenLetterIdsRef = useRef<Set<string>>(new Set())
  const surfacedArchiveIdsRef = useRef<Set<string>>(new Set())
  const depthRef = useRef(depth)
  const descentRef = useRef(descent)
  const weatherRef = useRef(currentWeatherSnapshot ?? null)
  const cityRef = useRef(city)
  const langRef = useRef(preferredLang ?? null)

  // First-surfacing ceremony bookkeeping
  const firstSurfacingPlannedRef = useRef(false)
  const firstSurfacingFiredRef = useRef(false)
  const settledAtRef = useRef<number | null>(null)
  const everPlayedLiveLetterRef = useRef(false)

  const RESONANCE_MIN_INTERVAL_MS = 110

  // ---------- Mirror refs ---------------------------------------------------
  useEffect(() => {
    onRemoteResonanceRef.current = onRemoteResonance
  }, [onRemoteResonance])
  useEffect(() => {
    depthRef.current = depth
  }, [depth])
  useEffect(() => {
    descentRef.current = descent
  }, [descent])
  useEffect(() => {
    weatherRef.current = currentWeatherSnapshot ?? null
  }, [currentWeatherSnapshot])
  useEffect(() => {
    cityRef.current = city
  }, [city])
  useEffect(() => {
    langRef.current = preferredLang ?? null
  }, [preferredLang])

  // Record the moment descent first reaches 1.
  useEffect(() => {
    if (descent >= 1 && settledAtRef.current == null) {
      settledAtRef.current = Date.now()
    }
  }, [descent])

  // ---------- Heatmap emitter -----------------------------------------------
  const emitHeatmapPulse = useCallback(
    (opts: {
      authorId: string
      azimuthSource?: string
      energy: number
      hueOverrideDeg?: number
    }) => {
      const azKey = opts.azimuthSource ?? opts.authorId
      const ident = identityOrFallback(opts.authorId, azKey)

      const pulse: HeatmapPulse = {
        authorId: opts.authorId,
        azimuthDeg: azimuthFor(azKey),
        hueDeg: opts.hueOverrideDeg ?? ident.hueDeg,
        energy: Math.max(0, Math.min(1, opts.energy)),
        at: performance.now(),
      }

      setLatestHeatmapPulse(pulse)
    },
    []
  )

  // ---------- Queue playback -------------------------------------------------
  const playNext = useCallback(() => {
    if (playingRef.current) return
    const next =
      liveQueueRef.current.shift() ?? archiveQueueRef.current.shift() ?? null
    if (!next) return
    playingRef.current = true
    setActiveLetter(next)

    if (next.source === 'live') {
      everPlayedLiveLetterRef.current = true
    }

    if (next.source === 'archive') {
      void recordLetterEcho(next.id, selfId, depthRef.current)
    }
  }, [selfId])

  const enqueueLive = useCallback(
    (letter: LetterPayload) => {
      liveQueueRef.current.push(letter)
      playNext()
    },
    [playNext]
  )

  const enqueueArchive = useCallback(
    (letter: LetterPayload) => {
      archiveQueueRef.current.push(letter)
      playNext()
    },
    [playNext]
  )

  const dismissActive = useCallback(() => {
    setActiveLetter(null)
    playingRef.current = false
    window.setTimeout(() => {
      playNext()
    }, 250)
  }, [playNext])

  const manualPlay = useCallback(
    (letter: LetterPayload) => {
      liveQueueRef.current = []
      archiveQueueRef.current = []
      playingRef.current = true
      setActiveLetter(letter)

      if (letter.source === 'live') {
        everPlayedLiveLetterRef.current = true
      }
      if (letter.source === 'archive') {
        void recordLetterEcho(letter.id, selfId, depthRef.current)
      }

      if (letter.source === 'archive') {
        emitHeatmapPulse({
          authorId: letter.authorId || letter.id,
          azimuthSource: letter.id,
          energy: 0.22,
        })
      } else if (letter.authorId) {
        emitHeatmapPulse({
          authorId: letter.authorId,
          energy: 0.32,
        })
      }
    },
    [emitHeatmapPulse, selfId]
  )

  // ---------- Realtime channel ----------------------------------------------
  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) {
      setStatus('disabled')
      return
    }

    setStatus('connecting')

    const channel = client.channel(`fathom:${roomId}`, {
      config: {
        broadcast: { self: false, ack: true },
        presence: { key: selfId },
      },
    })

    channel
      .on('broadcast', { event: 'letter' }, (payload) => {
        const data = payload?.payload as
          | (Omit<LetterPayload, 'source'> & { source?: LetterSource })
          | undefined
        if (!data || data.authorId === selfId) return

        if (seenLetterIdsRef.current.has(data.id)) return
        seenLetterIdsRef.current.add(data.id)

        const live: LetterPayload = { ...data, source: 'live' }

        setLiveLetters((prev) => {
          if (prev.some((l) => l.id === live.id)) return prev
          return [...prev, live].slice(-40)
        })

        enqueueLive(live)

        emitHeatmapPulse({
          authorId: live.authorId,
          energy: 0.85,
        })
      })
      .on('broadcast', { event: 'resonance' }, (payload) => {
        const data = payload?.payload as ResonancePulsePayload | undefined
        if (!data || data.authorId === selfId) return

        onRemoteResonanceRef.current?.(data)

        emitHeatmapPulse({
          authorId: data.authorId,
          energy: Math.min(0.42, data.energy * 0.55),
        })
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as RealtimePresenceState
        const count = Object.keys(state).length
        setPresenceCount(Math.max(1, count))
      })
      .subscribe(async (subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          setStatus('subscribed')
          await channel.track({
            id: selfId,
            name: selfName ?? 'anonymous',
            city: city ?? null,
            joinedAt: Date.now(),
          })
        } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
          setStatus('error')
        }
      })

    channelRef.current = channel

    return () => {
      try {
        void channel.untrack()
      } catch {
        /* noop */
      }
      void client.removeChannel(channel)
      channelRef.current = null
      setPresenceCount(1)
    }
  }, [city, emitHeatmapPulse, enqueueLive, roomId, selfId, selfName])

  // ---------- Initial archive fetch -----------------------------------------
  useEffect(() => {
    let cancelled = false

    async function loadArchive() {
      setArchiveLoading(true)
      const rows = await fetchArchivedLetters(roomId, 24)
      if (cancelled) return

      const payloads = rows.map(archivedToLetterPayload)
      const fresh = payloads.filter((p) => !seenLetterIdsRef.current.has(p.id))
      fresh.forEach((p) => seenLetterIdsRef.current.add(p.id))

      setArchive(fresh)
      setArchiveLoading(false)
    }

    void loadArchive()

    return () => {
      cancelled = true
    }
  }, [roomId])

  // ---------- "First letter from the deep" ceremony -------------------------
  //
  // Runs at most once per session.
  // Fires shortly after descent has fully settled, regardless of depth,
  // as long as we haven't already played a live letter in the meantime.
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!enableFirstSurfacing) return
    if (firstSurfacingFiredRef.current) return
    if (firstSurfacingPlannedRef.current) return

    // Need archive to actually have something to surface.
    if (archive.length === 0) return

    // Wait until descent has fully settled.
    if (descent < 1) return
    if (settledAtRef.current == null) return

    // Make sure we have an eligible candidate (not self, not already surfaced).
    const candidate = pickFirstSurfacingCandidate(
      archive,
      selfId,
      surfacedArchiveIdsRef.current
    )
    if (!candidate) return

    firstSurfacingPlannedRef.current = true

    const elapsedSinceSettled = Date.now() - (settledAtRef.current ?? Date.now())
    const wait = Math.max(0, firstSurfacingGraceMs - elapsedSinceSettled)

    const timer = window.setTimeout(() => {
      // Final guards before actually firing:
      //   - never override a live letter the user is already reading
      //   - never repeat
      if (firstSurfacingFiredRef.current) return
      if (everPlayedLiveLetterRef.current) {
        // The present already spoke; the deep stays silent this once.
        firstSurfacingFiredRef.current = true
        return
      }

      // Re-pick in case archive changed during the wait
      const finalCandidate = pickFirstSurfacingCandidate(
        archive,
        selfId,
        surfacedArchiveIdsRef.current
      )
      if (!finalCandidate) {
        firstSurfacingFiredRef.current = true
        return
      }

      surfacedArchiveIdsRef.current.add(finalCandidate.id)
      lastArchiveSurfacedAtRef.current = Date.now()
      firstSurfacingFiredRef.current = true

      enqueueArchive(finalCandidate)

      emitHeatmapPulse({
        authorId: finalCandidate.authorId || finalCandidate.id,
        azimuthSource: finalCandidate.id,
        // Slightly stronger than a regular surfacing — this one is intentional.
        energy: 0.7,
      })
    }, wait)

    return () => {
      // If the effect re-runs (e.g. archive updates) before firing,
      // cancel the planned timer and allow re-planning.
      window.clearTimeout(timer)
      if (!firstSurfacingFiredRef.current) {
        firstSurfacingPlannedRef.current = false
      }
    }
  }, [
    archive,
    descent,
    emitHeatmapPulse,
    enableFirstSurfacing,
    enqueueArchive,
    firstSurfacingGraceMs,
    selfId,
  ])

  // ---------- Depth-driven archive surfacing scheduler ----------------------
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now()
      if (playingRef.current) return

      // Wait for descent.
      if (descentRef.current < 1) return

      // Defer the regular cadence until the first ceremony has completed
      // (or has been explicitly skipped because a live letter beat it).
      if (enableFirstSurfacing && !firstSurfacingFiredRef.current) return

      if (depthRef.current < archiveSurfacingThreshold) return
      if (
        now - lastArchiveSurfacedAtRef.current <
        archiveSurfacingMinIntervalMs
      )
        return

      const candidate = archive.find(
        (l) => !surfacedArchiveIdsRef.current.has(l.id)
      )
      if (!candidate) return

      surfacedArchiveIdsRef.current.add(candidate.id)
      lastArchiveSurfacedAtRef.current = now

      enqueueArchive(candidate)

      emitHeatmapPulse({
        authorId: candidate.authorId || candidate.id,
        azimuthSource: candidate.id,
        energy: 0.5,
      })
    }, 1200)

    return () => {
      window.clearInterval(interval)
    }
  }, [
    archive,
    archiveSurfacingMinIntervalMs,
    archiveSurfacingThreshold,
    emitHeatmapPulse,
    enableFirstSurfacing,
    enqueueArchive,
  ])

  // ---------- sendLetter -----------------------------------------------------
  const sendLetter = useCallback(
    async (text: string): Promise<LetterPayload | null> => {
      const trimmed = text.trim()
      if (!trimmed) return null

      const id = safeUUID()
      const now = Date.now()

      const letter: LetterPayload = {
        id,
        text: trimmed,
        authorId: selfId,
        authorName: selfName ?? 'anonymous',
        city: cityRef.current,
        createdAt: now,
        source: 'live',
        fathomDepth: Math.max(0, Math.min(1, depthRef.current)),
        weatherSnapshot: weatherRef.current,
        lang: langRef.current,
      }

      seenLetterIdsRef.current.add(letter.id)

      const channel = channelRef.current
      if (channel) {
        try {
          await channel.send({
            type: 'broadcast',
            event: 'letter',
            payload: letter,
          })
        } catch (err) {
          console.warn('[Fathom] failed to broadcast letter', err)
        }
      }

      void insertLetterArchive({
        id: letter.id,
        roomId,
        authorId: selfId,
        authorName: selfName,
        city: cityRef.current,
        text: letter.text,
        lang: langRef.current,
        weatherSnapshot: weatherRef.current,
        fathomDepth: letter.fathomDepth ?? null,
        clientCreatedAt: now,
      })

      return letter
    },
    [roomId, selfId, selfName]
  )

  // ---------- sendResonance --------------------------------------------------
  const sendResonance = useCallback(
    (energy: number) => {
      const channel = channelRef.current
      if (!channel) return

      const now = Date.now()
      if (now - lastResonanceSentRef.current < RESONANCE_MIN_INTERVAL_MS) return
      lastResonanceSentRef.current = now

      const payload: ResonancePulsePayload = {
        authorId: selfId,
        authorName: selfName,
        city: cityRef.current,
        energy: Math.max(0, Math.min(1, energy)),
        at: now,
      }

      try {
        void channel.send({
          type: 'broadcast',
          event: 'resonance',
          payload,
        })
      } catch (err) {
        console.warn('[Fathom] failed to broadcast resonance', err)
      }
    },
    [selfId, selfName]
  )

  // ---------- bury own letter -----------------------------------------------
  const buryOwnLetter = useCallback(
    async (letterId: string) => {
      const ok = await buryLetter(letterId, selfId)
      if (ok) {
        setArchive((prev) => prev.filter((l) => l.id !== letterId))
        setLiveLetters((prev) => prev.filter((l) => l.id !== letterId))
        surfacedArchiveIdsRef.current.delete(letterId)
      }
      return ok
    },
    [selfId]
  )

  return useMemo(
    () => ({
      status,
      liveLetters,
      archive,
      activeLetter,
      presenceCount,
      archiveLoading,
      latestHeatmapPulse,
      sendLetter,
      sendResonance,
      dismissActive,
      manualPlay,
      buryOwnLetter,
    }),
    [
      activeLetter,
      archive,
      archiveLoading,
      buryOwnLetter,
      dismissActive,
      latestHeatmapPulse,
      liveLetters,
      manualPlay,
      presenceCount,
      sendLetter,
      sendResonance,
      status,
    ]
  )
}
