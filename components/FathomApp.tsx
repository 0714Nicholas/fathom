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
import { generateFathomCoordinate, isValidFathomCoordinate, formatCoordinateForSystem } from '@/lib/identity/coordinates'

const ROOM_ID = process.env.NEXT_PUBLIC_FATHOM_ROOM ?? 'global'

export type FathomMode = 'focus' | 'meditate' | 'sleep'

function useSelfId(): string {
  const [selfId] = useState(() => {
    if (typeof window === 'undefined') return 'server'
    const stored = window.localStorage.getItem('fathom:self-id')
    if (stored) return stored
    
    const nextCoordinate = generateFathomCoordinate()
    window.localStorage.setItem('fathom:self-id', nextCoordinate)
    return nextCoordinate
  })
  return selfId
}

// 🔽 新しく追加：深海の欠片（お守り画像）を生成してダウンロードする関数
function downloadCrystalMemory(coordinate: string, depth: number) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // スマホの壁紙サイズ（縦長）
  const width = 1080
  const height = 1920
  canvas.width = width
  canvas.height = height

  // 深度に応じた背景のグラデーション計算
  const r1 = Math.floor(10 + (25 - 10) * (1 - depth))
  const g1 = Math.floor(25 + (50 - 25) * (1 - depth))
  const b1 = Math.floor(40 + (80 - 40) * (1 - depth))
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, `rgb(${r1}, ${g1}, ${b1})`)
  gradient.addColorStop(1, '#02050a') // 深海層
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // 中央に光る結晶のオーラを描画
  const cx = width / 2
  const cy = height / 2 - 100
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 500)
  glow.addColorStop(0, 'rgba(143, 216, 255, 0.15)')
  glow.addColorStop(1, 'rgba(143, 216, 255, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  // 座標テキストの描画
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  
  const words = coordinate.split('-')
  
  // ブラウザによってサポートが分かれるため標準的な描画
  ctx.font = '300 72px monospace'
  words.forEach((word, index) => {
    ctx.fillText(word, cx, cy - 80 + index * 120)
  })

  // ヘッダー（ロゴ）
  ctx.font = '400 36px monospace'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.fillText('F A T H O M', cx, 200)

  // フッター（深度とメッセージ）
  ctx.font = '300 28px monospace'
  ctx.fillText(`Recorded at ${Math.round(depth * 100)}% depth`, cx, height - 250)
  
  ctx.font = '300 22px monospace'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
  ctx.fillText('Keep this memory to return to your sea.', cx, height - 180)

  // 画像をPNG化して自動ダウンロード
  const dataUrl = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `fathom-memory-${coordinate}.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
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

function ModeSelector({ 
  current, 
  onSelect 
}: { 
  current: FathomMode
  onSelect: (m: FathomMode) => void 
}) {
  const modes: { value: FathomMode; label: string }[] = [
    { value: 'focus', label: 'Focus' },
    { value: 'meditate', label: 'Meditate' },
    { value: 'sleep', label: 'Sleep' },
  ]

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
      {modes.map((m) => {
        const isActive = current === m.value
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onSelect(m.value)}
            style={{
              padding: '6px 18px',
              borderRadius: '24px',
              border: `1px solid ${isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)'}`,
              background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.3s ease',
              letterSpacing: '0.1em',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

function EntranceStage({
  onDescend,
  onReturn,
  isLeaving,
  targetCity,
  resolvedCity,
  isLoading,
  onSearch,
}: {
  onDescend: (mode: FathomMode) => void
  onReturn: (coordinate: string) => void
  isLeaving: boolean
  targetCity: string
  resolvedCity: string | null
  isLoading: boolean
  onSearch: (city: string) => void
}) {
  const [inputVal, setInputVal] = useState('')
  const [coordVal, setCoordVal] = useState('')
  const [mode, setMode] = useState<FathomMode>('meditate')
  const [viewState, setViewState] = useState<'new' | 'return'>('new')
  const [coordError, setCoordError] = useState(false)

  if (viewState === 'return') {
    return (
      <div className="descend-stage" aria-hidden={isLeaving}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, pointerEvents: 'auto' }}>
          <div className="descend-caption" style={{ fontSize: 16, letterSpacing: '0.1em' }}>
            あなたの水底の座標（3つの単語）を入力してください。
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={coordVal}
              onChange={(e) => {
                setCoordVal(e.target.value)
                setCoordError(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && coordVal.trim()) {
                  const systemCoord = formatCoordinateForSystem(coordVal)
                  if (isValidFathomCoordinate(systemCoord)) {
                    onReturn(systemCoord)
                  } else {
                    setCoordError(true)
                  }
                }
              }}
              className="input"
              style={{
                textAlign: 'center',
                width: '320px',
                fontSize: '18px',
                padding: '16px',
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${coordError ? 'rgba(255,100,100,0.4)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: '4px',
                color: '#fff',
                outline: 'none',
                letterSpacing: '0.05em'
              }}
              placeholder="e.g. silent pale snow"
            />
          </div>
          <div className="helper" style={{ letterSpacing: '0.1em', color: coordError ? '#ff8f8f' : 'inherit' }}>
            {coordError ? '座標の記述が正しくありません。' : 'Enter を押して過去の記憶へ帰還します'}
          </div>

          <button 
            type="button"
            className="helper" 
            onClick={() => setViewState('new')}
            style={{ marginTop: 32, opacity: 0.6, cursor: 'pointer', background: 'none', border: 'none', letterSpacing: '0.1em' }}
          >
            ← 新しい都市から潜る
          </button>
        </div>
      </div>
    )
  }

  if (!targetCity) {
    return (
      <div className="descend-stage" aria-hidden={isLeaving}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, pointerEvents: 'auto' }}>
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

          <button 
            type="button"
            className="helper" 
            onClick={() => setViewState('return')}
            style={{ marginTop: 32, opacity: 0.6, cursor: 'pointer', background: 'none', border: 'none', letterSpacing: '0.1em' }}
          >
            return to your past fathom (過去の座標へ帰還)
          </button>
        </div>
      </div>
    )
  }

  if (isLoading || !resolvedCity) {
    return (
      <div className="descend-stage" aria-hidden={isLeaving}>
        <div className="descend-caption" style={{ letterSpacing: '0.15em', pointerEvents: 'auto' }}>
          resolving atmospheric data for {targetCity}...
        </div>
      </div>
    )
  }

  return (
    <div className="descend-stage" aria-hidden={isLeaving}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'auto' }}>
        <div className="descend-caption" style={{ marginBottom: 24, opacity: 0.8, letterSpacing: '0.1em' }}>
          {resolvedCity} の気象を受信しました。潜行の目的を選択してください。
        </div>

        <ModeSelector current={mode} onSelect={setMode} />

        <button
          type="button"
          className={`descend-beacon ${isLeaving ? 'is-leaving' : ''}`}
          onClick={() => onDescend(mode)}
          disabled={isLeaving}
        >
          <span className="descend-word">descend</span>
        </button>

        <div className="descend-caption" style={{ marginTop: 24, letterSpacing: '0.15em' }}>
          press to enter the deep
        </div>
      </div>
    </div>
  )
}

export function FathomApp() {
  const [city, setCity] = useState('')
  const [draft, setDraft] = useState(
    'the sea keeps our names for a while.\nlisten closely, and it writes back.'
  )
  const [progress, setProgress] = useState(0)
  const [fathomMode, setFathomMode] = useState<FathomMode>('meditate')
  
  const [composeKey, setComposeKey] = useState(0)
  const [resonancePulse, setResonancePulse] = useState(0)
  const [resonanceEnergy, setResonanceEnergy] = useState(0.14)
  const [composedText, setComposedText] = useState<string | null>(null)
  const [remoteResonanceLog, setRemoteResonanceLog] = useState<
    ResonancePulsePayload[]
  >([])

  const [hasDescended, setHasDescended] = useState(false)
  const [beaconLeaving, setBeaconLeaving] = useState(false)
  const [beaconMounted, setBeaconMounted] = useState(true)

  const selfId = useSelfId()
  const identity = useMemo(() => makeCrystalIdentity(selfId), [selfId])

  const descentCtl = useFathomDescent({ durationMs: 8000 })
  const { descent, phase, begin: beginDescent, skip: skipDescent } = descentCtl

  const settled = descent >= 1
  const heroPhaseClass = settled ? 'is-settled' : 'is-descending'

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

  const driftStartTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (!audio.running) {
      driftStartTimeRef.current = null
      setProgress(0)
      return
    }

    const INITIAL_DEPTH = fathomMode === 'sleep' ? 0.25 : 0.18
    const TARGET_DEPTH = fathomMode === 'focus' ? 0.55 : 1.0
    const TIME_CONSTANT = 
      fathomMode === 'sleep' ? 45 * 60 * 1000 :
      fathomMode === 'focus' ? 60 * 60 * 1000 :
      2 * 60 * 60 * 1000

    if (!settled) {
      setProgress(descent * INITIAL_DEPTH)
    } else {
      if (!driftStartTimeRef.current) {
        driftStartTimeRef.current = Date.now()
      }

      const timer = window.setInterval(() => {
        const elapsed = Date.now() - driftStartTimeRef.current!
        const currentDepth =
          INITIAL_DEPTH + (TARGET_DEPTH - INITIAL_DEPTH) * (1 - Math.exp(-elapsed / TIME_CONSTANT))
        setProgress(currentDepth)
      }, 1000)

      return () => window.clearInterval(timer)
    }
  }, [audio.running, descent, settled, fathomMode])

  const triggerResonance = useCallback((energy: number) => {
    setResonanceEnergy(energy)
    setResonancePulse((p) => p + 1)
  }, [])

  const handleRemoteResonance = useCallback(
    (payload: ResonancePulsePayload) => {
      const volumeDamp = fathomMode === 'meditate' ? 1.0 : 0.5
      const damped = Math.max(0.06, Math.min(0.22, payload.energy * 0.42))
      audio.triggerFrictionImpulse({
        intensity: damped * 0.5 * volumeDamp,
        durationMs: 80,
        color: 0.72,
      })
      triggerResonance(damped)
      setRemoteResonanceLog((prev) => [...prev, payload].slice(-12))
    },
    [audio, triggerResonance, fathomMode]
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

  const handleDescend = useCallback((selectedMode: FathomMode) => {
    if (hasDescended) return
    setFathomMode(selectedMode)
    setHasDescended(true)
    setBeaconLeaving(true)
    beginDescent()
    void audio.start()
    triggerResonance(0.22)

    window.setTimeout(() => {
      setBeaconMounted(false)
    }, 650)
  }, [audio, beginDescent, hasDescended, triggerResonance])

  const handleReturn = useCallback((coordinate: string) => {
    window.localStorage.setItem('fathom:self-id', coordinate)
    window.location.reload()
  }, [])

  const handleResumeAudio = useCallback(() => {
    beginDescent()
    void audio.resume()
    triggerResonance(0.18)
  }, [audio, beginDescent, triggerResonance])

  const archiveAmbientTier = useMemo(() => {
    if (archive.length === 0) return 0
    let oldest = archive[0]
    for (const l of archive) {
      if (l.createdAt < oldest.createdAt) oldest = l
    }
    return ageTier(oldest.createdAt) as 0 | 1 | 2 | 3 | 4 | 5
  }, [archive])

  const activeTier = useMemo(() => {
    if (!activeLetter) return 0
    if (activeLetter.source === 'live') return 0
    return ageTier(activeLetter.createdAt)
  }, [activeLetter])

  const uiOpacity = useMemo(() => {
    if (fathomMode !== 'sleep' || !settled) return 1.0
    const ratio = Math.max(0, (progress - 0.25) / 0.75)
    return Math.max(0.08, 1.0 - ratio * 1.5)
  }, [fathomMode, settled, progress])

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
          onReturn={handleReturn}
          isLeaving={beaconLeaving}
          targetCity={city}
          resolvedCity={data?.city ?? null}
          isLoading={loading}
          onSearch={(c) => setCity(c)}
        />
      ) : null}

      <div 
        className="scene-overlay" 
        style={{ 
          opacity: uiOpacity, 
          transition: 'opacity 2s linear' 
        }}
      >
        <div className="container">
          <header className={`hero hero-floating ${heroPhaseClass}`}>
            <div className="hero-chip">Fathom</div>
            <h1>沿岸都市の喧騒から、深海の静寂へ。</h1>
            <p>
              Fathom
              は、都市の現在気象を深海音と粒子運動へ変換し、書かれた手紙を他者の水底にも筆跡として届け、過去の手紙が深さに応じて静かに浮かび上がる、共鳴のためのプロジェクトです。
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

          {hasDescended ? (
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
                      <span>mode</span>
                      <span style={{ textTransform: 'capitalize', color: '#8fd8ff' }}>{fathomMode}</span>
                    </div>
                    <div className="meta-item">
                      <span>wind</span>
                      <span>{windSpeed.toFixed(1)} m/s</span>
                    </div>
                    <div className="meta-item">
                      <span>temperature</span>
                      <span>
                        {data?.temp != null ? `${data.temp.toFixed(1)}°C` : '—'}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <div className="label">Fathom Depth</div>
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
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <div className="label">Audio Control</div>
                    <div
                      className={`row ${visibilityClass(settled, 3)}`}
                      style={{ marginTop: 10 }}
                    >
                      <button className="btn" onClick={handleResumeAudio}>resume</button>
                      <button className="btn" onClick={() => void audio.suspend()}>suspend</button>
                      <button className="btn" onClick={() => void audio.stop()}>stop</button>
                    </div>
                  </div>

                  {/* 🔽 追加：座標とお守り保存ボタン */}
                  <div style={{ marginTop: 28 }} className={visibilityClass(settled, 4)}>
                    <div className="label">Your Coordinates</div>
                    <div style={{ marginTop: 8, padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '15px', letterSpacing: '0.05em', color: '#8fd8ff', textAlign: 'center' }}>
                        {selfId.replace(/-/g, ' ')}
                      </div>
                      
                      {/* お守りダウンロードボタン */}
                      <button 
                        className="btn btn-accent" 
                        style={{ width: '100%', marginTop: 16, padding: '8px 0', fontSize: '12px' }}
                        onClick={() => downloadCrystalMemory(selfId, progress)}
                      >
                        save as memory (画像を保存)
                      </button>

                      <div className="helper" style={{ marginTop: 12, textAlign: 'center', opacity: 0.6 }}>
                        この座標を記録しておくことで、<br/>いつでもこの結晶と記憶に帰還できます。
                      </div>
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

                  <div
                    className={`letter-stage ${visibilityClass(settled, 4)}`}
                    style={{ marginTop: 18 }}
                  >
                    {composedText ? (
                      <HandwrittenLetter
                        animateKey={composeKey}
                        text={composedText}
                        fontUrl="/fonts/Zen-Kurenaido-Regular.ttf"
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
          ) : null}
        </div>
      </div>
    </main>
  )
}