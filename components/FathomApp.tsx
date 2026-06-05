'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HandwrittenLetter } from '@/components/letters/HandwrittenLetter'
import { LetterInbox } from '@/components/letters/LetterInbox'
import { DeepSeaCanvas } from '@/components/scene/DeepSeaCanvas'
import { useDeepSeaAudio } from '@/hooks/useDeepSeaAudio'
import {
  useRealtimeLetters,
  type LetterPayload,
  type ResonancePulsePayload,
} from '@/hooks/useRealtimeLetters'
import { useWeather } from '@/hooks/useWeather'
import { makeCrystalIdentity } from '@/lib/identity/crystalSeed'
import { useFathomDescent } from '@/hooks/useFathomDescent'

const ROOM_ID = process.env.NEXT_PUBLIC_FATHOM_ROOM ?? 'global'

function safeUUID() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function useSelfId(): string {
  const [selfId] = useState(() => {
    if (typeof window === 'undefined') return 'server'
    const stored = window.localStorage.getItem('fathom:self-id')
    if (stored) return stored
    const next = safeUUID()
    window.localStorage.setItem('fathom:self-id', next)
    return next
  })
  return selfId
}

function visibilityClass(
  settled: boolean,
  stagger?: 1 | 2 | 3 | 4 | 5 | 6
): string {
  const base = settled ? 'ui-revealed' : 'ui-veiled'
  const staggerCls = stagger ? `ui-stagger-${stagger}` : ''
  return [base, staggerCls].filter(Boolean).join(' ')
}

function ageTier(createdAtMs: number, now: number = Date.now()): 0 | 1 | 2 | 3 | 4 | 5 {
  const elapsedMs = Math.max(0, now - createdAtMs)
  const hour = 60 * 60 * 1000
  const day = 24 * hour

  if (elapsedMs < 1 * hour) return 0
  if (elapsedMs < 6 * hour) return 1
  if (elapsedMs < 1 * day) return 2
  if (elapsedMs < 3 * day) return 3
  if (elapsedMs < 14 * day) return 4
  return 5
}

function ageTierClass(tier: ReturnType<typeof ageTier>): string {
  return `age-tier-${tier}`
}

/**
 * EntranceStage
 * Fathomへ入場するための新しい儀礼コンポーネント。
 * 1. 都市を入力させる
 * 2. 気象を受信する
 * 3. 準備が整ったら descend ボタンを浮かび上がらせる
 */
function EntranceStage({
  onDescend,
  isLeaving,
  targetCity,
  resolvedCity,
  isLoading,
  onSearch,
}: {
  onDescend: () => void
  isLeaving: boolean
  targetCity: string
  resolvedCity: string | null
  isLoading: boolean
  onSearch: (city: string) => void
}) {
  const [inputVal, setInputVal] = useState('')

  // 1. まだ都市が入力されていない状態（初期画面）
  if (!targetCity) {
    return (
      <div className="descend-stage" aria-hidden={isLeaving}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <div className="descend-caption" style={{ fontSize: 16, letterSpacing: '0.1em' }}>
            沿岸都市の喧騒から、深海の静寂へ。
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputVal.trim()) {
                  onSearch(inputVal.trim())
                }
              }}
              className="input"
              style={{
                textAlign: 'center',
                width: '300px',
                fontSize: '18px',
                padding: '16px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '4px',
                color: '#fff',
                outline: 'none',
              }}
              placeholder="e.g. Tokyo, London, New York"
            />
          </div>
          <div className="helper" style={{ letterSpacing: '0.1em' }}>
            都市を入力し Enter で気象を受信します
          </div>
        </div>
      </div>
    )
  }

  // 2. 気象データを解決中
  if (isLoading || !resolvedCity) {
    return (
      <div className="descend-stage" aria-hidden={isLeaving}>
        <div className="descend-caption" style={{ letterSpacing: '0.15em' }}>
          resolving atmospheric data for {targetCity}...
        </div>
      </div>
    )
  }

  // 3. 準備完了（descendが押せる状態）
  return (
    <div className="descend-stage" aria-hidden={isLeaving}>
      <div className="descend-caption" style={{ marginBottom: 32, opacity: 0.8, letterSpacing: '0.1em' }}>
        {resolvedCity} の現在の気象を受信しました。
      </div>

      <button
        type="button"
        className={`descend-beacon ${isLeaving ? 'is-leaving' : ''}`}
        onClick={onDescend}
        disabled={isLeaving}
      >
        <span className="descend-word">descend</span>
      </button>

      <div className="descend-caption" style={{ marginTop: 24, letterSpacing: '0.15em' }}>
        press to enter the deep
      </div>
    </div>
  )
}

function AgedLayer({
  createdAtMs,
  asStage,
  children,
}: {
  createdAtMs: number
  asStage?: boolean
  children: React.ReactNode
}) {
  const tier = ageTier(createdAtMs)
  const cls = [
    'with-age',
    ageTierClass(tier),
    asStage ? 'letter-stage-aged-wrap' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={cls}>{children}</div>
}

export function FathomApp() {
  // 初期は空文字（＝まだ都市が入力されていない状態）
  const [city, setCity] = useState('')
  const [draft, setDraft] = useState(
    'the sea keeps our names for a while.\nlisten closely, and it writes back.'
  )
  // 初期水深は0%からスタート
  const [progress, setProgress] = useState(0)
  const [composeKey, setComposeKey] = useState(0)
  const [resonancePulse, setResonancePulse] = useState(0)
  const [resonanceEnergy, setResonanceEnergy] = useState(0.14)
  const [composedText, setComposedText] = useState<string | null>(null)
  const [remoteResonanceLog, setRemoteResonanceLog] = useState<
    ResonancePulsePayload[]
  >([])

  // Beacon lifecycle
  const [hasDescended, setHasDescended] = useState(false)
  const [beaconLeaving, setBeaconLeaving] = useState(false)
  const [beaconMounted, setBeaconMounted] = useState(true)

  const selfId = useSelfId()
  const identity = useMemo(() => makeCrystalIdentity(selfId), [selfId])

  const descentCtl = useFathomDescent({ durationMs: 8000 })
  const { descent, phase, begin: beginDescent, skip: skipDescent } = descentCtl

  const settled = descent >= 1
  const heroPhaseClass = settled ? 'is-settled' : 'is-descending'

  // 空文字の時は fetch しないか、適切にエラーハンドリングされる想定
  const { data, loading, error } = useWeather(city)

  const windSpeed = data?.windSpeed ?? 4.2
  const rainAmount = (data?.rain1h ?? 0) + (data?.rain3h ?? 0)
  const clouds = data?.clouds ?? 42

  const weatherSnapshot = useMemo(() => {
    if (!data) return null
    return {
      city: data.city,
      windSpeed,
      rainAmount,
      clouds,
      temp: data.temp,
      description: data.description,
    } as Record<string, unknown>
  }, [clouds, data, rainAmount, windSpeed])

  const audio = useDeepSeaAudio({
    enabled: true,
    progress,
    windSpeed,
    rainAmount,
    descent,
  })

  // -----------------------------------------------------------------
  // 自動潜行（入水 ＋ 無限の漂流）ロジック
  // -----------------------------------------------------------------
  const driftStartTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (!audio.running) {
      driftStartTimeRef.current = null
      setProgress(0)
      return
    }

    // 最初の8秒で「海面下」まで一気に沈み、都市の騒音を消す
    const INITIAL_DEPTH = 0.18

    if (!settled) {
      // descent (0..1) に連動して 0% から 18% へ
      setProgress(descent * INITIAL_DEPTH)
    } else {
      if (!driftStartTimeRef.current) {
        driftStartTimeRef.current = Date.now()
      }

      const timer = window.setInterval(() => {
        const elapsed = Date.now() - driftStartTimeRef.current!
        const TIME_CONSTANT = 2 * 60 * 60 * 1000 // 時定数：2時間

        // 18% から 100% に向けて、指数関数的に永遠に沈み続ける
        const currentDepth =
          INITIAL_DEPTH + (1 - INITIAL_DEPTH) * (1 - Math.exp(-elapsed / TIME_CONSTANT))
        setProgress(currentDepth)
      }, 1000)

      return () => window.clearInterval(timer)
    }
  }, [audio.running, descent, settled])

  const triggerResonance = useCallback((energy: number) => {
    setResonanceEnergy(energy)
    setResonancePulse((p) => p + 1)
  }, [])

  const handleRemoteResonance = useCallback(
    (payload: ResonancePulsePayload) => {
      const damped = Math.max(0.06, Math.min(0.22, payload.energy * 0.42))
      audio.triggerFrictionImpulse({
        intensity: damped * 0.5,
        durationMs: 80,
        color: 0.72,
      })
      triggerResonance(damped)
      setRemoteResonanceLog((prev) => [...prev, payload].slice(-12))
    },
    [audio, triggerResonance]
  )

  const {
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
  } = useRealtimeLetters({
    roomId: ROOM_ID,
    selfId,
    selfName: 'visitor',
    city: data?.city,
    depth: progress,
    descent,
    currentWeatherSnapshot: weatherSnapshot,
    preferredLang: null,
    onRemoteResonance: handleRemoteResonance,
    enableFirstSurfacing: true,
    firstSurfacingGraceMs: 1600,
  })

  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick((n) => (n + 1) % 1_000_000)
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const lastActiveLetterRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeLetter) return
    if (lastActiveLetterRef.current === activeLetter.id) return
    lastActiveLetterRef.current = activeLetter.id

    if (activeLetter.source === 'archive') {
      audio.triggerFrictionImpulse({
        intensity: 0.26,
        durationMs: 240,
        color: 0.7,
      })
      triggerResonance(0.22)
    } else {
      audio.triggerFrictionImpulse({
        intensity: 0.4,
        durationMs: 180,
        color: 0.78,
      })
      triggerResonance(0.32)
    }
  }, [activeLetter, audio, triggerResonance])

  const canSend = useMemo(() => draft.trim().length > 0, [draft])

  const handleReplayLocal = useCallback(() => {
    if (!composedText && !canSend) return
    if (composedText) {
      setComposeKey((n) => n + 1)
    } else {
      setComposedText(draft.trim())
      setComposeKey((n) => n + 1)
    }
    triggerResonance(0.2)
  }, [canSend, composedText, draft, triggerResonance])

  const handleSendLetter = useCallback(async () => {
    if (!canSend) return
    const trimmed = draft.trim()
    setComposedText(trimmed)
    setComposeKey((n) => n + 1)
    triggerResonance(0.26)
    await sendLetter(trimmed)
  }, [canSend, draft, sendLetter, triggerResonance])

  const handleBury = useCallback(
    async (letterId: string) => {
      const ok = await buryOwnLetter(letterId)
      if (ok) {
        dismissActive()
        audio.triggerFrictionImpulse({
          intensity: 0.18,
          durationMs: 220,
          color: 0.66,
        })
        triggerResonance(0.12)
      }
    },
    [audio, buryOwnLetter, dismissActive, triggerResonance]
  )

  const handleDescend = useCallback(() => {
    if (hasDescended) return
    setHasDescended(true)
    setBeaconLeaving(true)
    beginDescent()
    void audio.start()
    triggerResonance(0.22)

    window.setTimeout(() => {
      setBeaconMounted(false)
    }, 650)
  }, [audio, beginDescent, hasDescended, triggerResonance])

  const handleResumeAudio = useCallback(() => {
    beginDescent()
    void audio.resume()
    triggerResonance(0.18)
  }, [audio, beginDescent, triggerResonance])

  const archiveAmbientTier: 0 | 1 | 2 | 3 | 4 | 5 = useMemo(() => {
    if (archive.length === 0) return 0
    let oldest = archive[0]
    for (const l of archive) {
      if (l.createdAt < oldest.createdAt) oldest = l
    }
    return ageTier(oldest.createdAt)
  }, [archive])

  const activeTier = useMemo(() => {
    if (!activeLetter) return 0
    if (activeLetter.source === 'live') return 0
    return ageTier(activeLetter.createdAt)
  }, [activeLetter])

  return (
    <main className="scene-root">
      <DeepSeaCanvas
        progress={progress}
        windSpeed={windSpeed}
        rainAmount={rainAmount}
        clouds={clouds}
        resonancePulse={resonancePulse}
        resonanceEnergy={resonanceEnergy}
        identity={identity}
        heatmapPulse={latestHeatmapPulse}
        descent={descent}
      />

      <div className="scene-vignette" />

      {beaconMounted ? (
        <EntranceStage
          onDescend={handleDescend}
          isLeaving={beaconLeaving}
          targetCity={city}
          resolvedCity={data?.city ?? null}
          isLoading={loading}
          onSearch={(c) => setCity(c)}
        />
      ) : null}

      <div className="scene-overlay">
        <div className="container">
          <header className={`hero hero-floating ${heroPhaseClass}`}>
            <div className="hero-chip">Fathom</div>
            <h1>沿岸都市の喧騒から、深海の静寂へ。</h1>
            <p>
              Fathom
              は、都市の現在気象を深海音と粒子運動へ変換し、書かれた手紙を他者の水底にも筆跡として届け、過去の手紙が深さに応じて静かに浮かび上がる、共鳴のためのプロジェクトです。
              あなたが筆を入れた瞬間、遠くの誰かの結晶もわずかに震えます。
            </p>

            {phase === 'descending' ? (
              <div
                className="small"
                style={{
                  marginTop: 10,
                  opacity: 0.6,
                  letterSpacing: '0.12em',
                  textTransform: 'lowercase',
                }}
              >
                descending — {Math.round(descent * 100)}%
                <button
                  type="button"
                  className="btn"
                  style={{
                    marginLeft: 12,
                    padding: '4px 10px',
                    fontSize: 12,
                  }}
                  onClick={() => skipDescent()}
                >
                  skip
                </button>
              </div>
            ) : null}
          </header>

          <div className="panel-stack three">
            <section className="panel glass-shell">
              <div className="panel-inner">
                <div className="label">Surface Conditions</div>

                <div className={`meta-list ${visibilityClass(settled, 1)}`} style={{ marginTop: 14 }}>
                  <div className="meta-item">
                    <span>resolved city</span>
                    <span>{data?.city ?? (loading ? 'loading...' : '—')}</span>
                  </div>
                  <div className="meta-item">
                    <span>wind</span>
                    <span>{windSpeed.toFixed(1)} m/s</span>
                  </div>
                  <div className="meta-item">
                    <span>rain</span>
                    <span>{rainAmount.toFixed(1)} mm</span>
                  </div>
                  <div className="meta-item">
                    <span>clouds</span>
                    <span>{clouds}%</span>
                  </div>
                  <div className="meta-item">
                    <span>temperature</span>
                    <span>
                      {data?.temp != null ? `${data.temp.toFixed(1)}°C` : '—'}
                    </span>
                  </div>
                  <div className="meta-item">
                    <span>description</span>
                    <span>{data?.description ?? '—'}</span>
                  </div>
                </div>

                {error ? (
                  <div className={`helper ${visibilityClass(settled, 1)}`}>
                    weather error: {error}
                  </div>
                ) : null}

                <div style={{ marginTop: 20 }}>
                  <div className="label">Fathom Depth</div>
                  
                  {/* 新しい「観測専用」の水深プログレスバー */}
                  <div className={`meter-panel ${visibilityClass(settled, 2)}`} style={{ pointerEvents: 'none', marginTop: 10 }}>
                    <div className="row-between">
                      <span className="small">WATER DEPTH</span>
                      <span className="small">{Math.round(progress * 100)}%</span>
                    </div>
                    
                    <div 
                      className="depth-gauge-bg" 
                      style={{
                        width: '100%',
                        height: '4px',
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '2px',
                        marginTop: '8px',
                        overflow: 'hidden'
                      }}
                    >
                      <div 
                        className="depth-gauge-fill"
                        style={{
                          width: `${progress * 100}%`,
                          height: '100%',
                          backgroundColor: 'rgba(143, 216, 255, 0.8)',
                          transition: 'width 1s linear'
                        }}
                      />
                    </div>
                  </div>

                  <div className={`helper ${visibilityClass(settled, 2)}`} style={{ marginTop: 12 }}>
                    水底に留まるほど、ローパスのカットオフが指数的に下降し、音はより深く、静かになっていきます。
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <div className="label">Audio Control</div>
                  <div
                    className={`row ${visibilityClass(settled, 3)}`}
                    style={{ marginTop: 10 }}
                  >
                    <button className="btn" onClick={handleResumeAudio}>
                      resume
                    </button>
                    <button
                      className="btn"
                      onClick={() => void audio.suspend()}
                    >
                      suspend
                    </button>
                    <button className="btn" onClick={() => void audio.stop()}>
                      stop
                    </button>
                  </div>

                  <div
                    className={`row-between ${visibilityClass(settled, 4)}`}
                    style={{ marginTop: 14 }}
                  >
                    <div className="status">
                      <span className="dot" />
                      <span>
                        {audio.running
                          ? 'audio running'
                          : audio.ready
                          ? 'audio ready'
                          : 'audio idle'}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <span
                        className="label"
                        style={{ letterSpacing: '0.16em' }}
                      >
                        meter
                      </span>
                      <div className="meter">
                        <div
                          className="meter-fill"
                          style={{
                            width: `${Math.min(audio.meter * 620, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={visibilityClass(settled, 5)}
                  style={{ marginTop: 20 }}
                >
                  <div className="label">Distant Resonance</div>
                  <div className="helper" style={{ marginTop: 6 }}>
                    最近、遠くで誰かが筆を入れた気配:
                  </div>
                  <div
                    className="inbox-meta"
                    style={{
                      marginTop: 6,
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 4,
                    }}
                  >
                    {remoteResonanceLog.length === 0 ? (
                      <span style={{ opacity: 0.55 }}>— 静か —</span>
                    ) : (
                      remoteResonanceLog
                        .slice(-5)
                        .reverse()
                        .map((p) => (
                          <span key={p.at}>
                            {p.authorName ?? 'anonymous'} ·{' '}
                            {(p.energy * 100).toFixed(0)}%
                            {p.city ? ` · ${p.city}` : ''}
                          </span>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="panel glass-shell">
              <div className="panel-inner">
                <div className="row-between">
                  <div className="label">Compose · Your Letter</div>
                  <div className={`row ${visibilityClass(settled, 2)}`}>
                    <button
                      className="btn"
                      onClick={handleReplayLocal}
                      disabled={!canSend && !composedText}
                    >
                      replay
                    </button>
                    <button
                      className="btn btn-accent"
                      onClick={() => void handleSendLetter()}
                      disabled={!canSend || status !== 'subscribed'}
                    >
                      send across the deep
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="textarea"
                    placeholder="Write a quiet letter to send into the Fathom..."
                  />
                </div>

                <div className={`helper ${visibilityClass(settled, 3)}`}>
                  送信した手紙は同じ Fathom
                  に潜る他者へ届き、その後、静かに水底へ沈み、いつか誰かの潜行で再び浮かび上がります。
                </div>

                <div
                  className={`letter-stage ${visibilityClass(settled, 4)}`}
                  style={{ marginTop: 18 }}
                >
                  {composedText ? (
                    <HandwrittenLetter
                      animateKey={composeKey}
                      text={composedText}
                      fontUrl="/fonts/ZenKurenaido.ttf"
                      fontSize={72}
                      lineHeight={104}
                      letterSpacing={1.2}
                      className="handwritten-svg"
                      strokeColor="rgba(236,246,255,0.96)"
                      glowColor="rgba(143,216,255,0.22)"
                      strokeWidth={2.1}
                      onStrokeImpulse={(payload) => {
                        audio.triggerFrictionImpulse({
                          intensity: payload.intensity,
                          durationMs: payload.durationMs,
                          color: 0.84,
                        })
                        triggerResonance(Math.max(0.16, payload.intensity))
                        sendResonance(payload.intensity * 0.85)
                      }}
                      onComplete={() => {
                        audio.triggerFrictionImpulse({
                          intensity: 0.16,
                          durationMs: 90,
                          color: 0.78,
                        })
                        triggerResonance(0.14)
                      }}
                    />
                  ) : (
                    <div className="inbox-empty">
                      まだ筆を入れていません。
                      <br />
                      左で気象を選び、右で受信を待ち、ここに記す。
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className={visibilityClass(settled, 6)}>
              <div
                className={`with-age ${ageTierClass(activeLetter && activeLetter.source === 'archive' ? activeTier : archiveAmbientTier)}`}
              >
                <LetterInbox
                  status={status}
                  liveLetters={liveLetters}
                  archive={archive}
                  archiveLoading={archiveLoading}
                  activeLetter={activeLetter}
                  presenceCount={presenceCount}
                  selfId={selfId}
                  onSelectLetter={(letter: LetterPayload) => {
                    manualPlay(letter)
                    triggerResonance(letter.source === 'archive' ? 0.18 : 0.24)
                  }}
                  onDismiss={dismissActive}
                  onActiveStrokeImpulse={(intensity, durationMs) => {
                    audio.triggerFrictionImpulse({
                      intensity,
                      durationMs,
                      color: 0.8,
                    })
                    triggerResonance(Math.max(0.12, intensity * 0.9))
                  }}
                  onActiveComplete={() => {
                    audio.triggerFrictionImpulse({
                      intensity: 0.14,
                      durationMs: 90,
                      color: 0.74,
                    })
                    triggerResonance(0.16)
                  }}
                  onBury={(id) => void handleBury(id)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
