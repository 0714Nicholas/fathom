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
import { useFathomMemory } from '@/hooks/useFathomMemory'

const ROOM_ID = process.env.NEXT_PUBLIC_FATHOM_ROOM ?? 'global'

export type FathomMode = 'pomodoro' | 'meditate' | 'focus' | 'sleep'

const hudStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500&display=swap');

  .font-mincho {
    font-family: 'Shippori Mincho', "Noto Serif JP", "Yu Mincho", "MS Mincho", serif;
    font-weight: 400;
    letter-spacing: 0.1em;
  }

  .hud-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.4);
    font-family: monospace;
    font-size: 10px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    cursor: pointer;
    padding: 4px 8px;
    transition: all 0.3s ease;
  }
  .hud-btn:hover {
    color: rgba(143, 216, 255, 1);
    text-shadow: 0 0 8px rgba(143, 216, 255, 0.5);
  }
  .hud-btn:disabled {
    color: rgba(255, 255, 255, 0.1);
    cursor: default;
    text-shadow: none;
  }

  .fathom-logo { 
    position: fixed; top: 32px; left: 0; width: 100%; text-align: center; 
    pointer-events: none; z-index: 100; transition: opacity 2s linear; 
    letter-spacing: 0.6em; font-size: 13px; font-weight: 300; 
    color: rgba(255,255,255,0.7); font-family: monospace; 
  }
  .hud-top-left { position: absolute; top: 40px; left: 32px; text-align: left; font-family: monospace; font-size: 10px; letter-spacing: 0.08em; color: rgba(255,255,255,0.5); pointer-events: auto; }
  .hud-bottom-left { position: absolute; bottom: 40px; left: 32px; text-align: left; font-family: monospace; font-size: 10px; letter-spacing: 0.08em; color: rgba(255,255,255,0.5); pointer-events: auto; }
  .hud-top-right { position: absolute; top: 40px; right: 32px; pointer-events: auto; max-width: 300px; display: flex; flex-direction: column; align-items: flex-end; }
  .hud-bottom-center { position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); width: 100%; max-width: 460px; display: flex; flex-direction: column; align-items: center; pointer-events: auto; }
  
  .hud-textarea { 
    flex: 1; 
    background: transparent; 
    border: none; 
    color: rgba(255,255,255,0.8); 
    font-family: 'Shippori Mincho', "Noto Serif JP", "Yu Mincho", "MS Mincho", serif;
    font-size: 13px; 
    padding: 8px 0; 
    outline: none; 
    resize: none; 
    height: 32px; 
    line-height: 16px; 
    letter-spacing: 0.1em; 
  }
  .hud-textarea::placeholder {
    color: rgba(255,255,255,0.3);
  }

  @media (max-width: 768px) {
    .fathom-logo { font-size: 14px; top: 16px; }
    .hud-top-left { top: 60px; left: 16px; font-size: 8px; max-width: 45vw; }
    .hud-top-right { top: 60px; right: 16px; font-size: 8px; max-width: 45vw; }
    .hud-bottom-left { bottom: 130px; left: 16px; font-size: 8px; max-width: 45vw; }
    .hud-bottom-center { bottom: 16px; padding: 0 16px; max-width: 100vw; width: 100%; }
    .hud-textarea { font-size: 16px; height: 40px; }
    .hud-btn { padding: 4px; font-size: 9px; letter-spacing: 0.1em; }
    .descend-stage { padding-top: 15vh; }
    .descend-stage input { width: 85vw !important; max-width: 320px; }
  }

  .fade-out-thought {
    animation: dissolve 4s ease-in-out forwards;
  }
  @keyframes dissolve {
    0% { opacity: 1; filter: blur(0px); }
    100% { opacity: 0; filter: blur(4px); }
  }
`

function useSelfId(): string {
  const [selfId] = useState(() => {
    if (typeof window === 'undefined') return 'server'
    const stored = window.localStorage.getItem('fathom:self-id')
    if (stored && isValidFathomCoordinate(stored)) {
      return stored
    }
    const nextCoordinate = generateFathomCoordinate()
    window.localStorage.setItem('fathom:self-id', nextCoordinate)
    return nextCoordinate
  })
  return selfId
}

function downloadCrystalMemory(coordinate: string, depth: number) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = 1080
  const height = 1920
  canvas.width = width
  canvas.height = height

  const r1 = Math.floor(10 + (25 - 10) * (1 - depth))
  const g1 = Math.floor(25 + (50 - 25) * (1 - depth))
  const b1 = Math.floor(40 + (80 - 40) * (1 - depth))
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, `rgb(${r1}, ${g1}, ${b1})`)
  gradient.addColorStop(1, '#02050a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  const cx = width / 2
  const cy = height / 2 - 100
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 500)
  glow.addColorStop(0, 'rgba(143, 216, 255, 0.15)')
  glow.addColorStop(1, 'rgba(143, 216, 255, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  
  const words = coordinate.split('-')
  
  ctx.font = '300 72px monospace'
  words.forEach((word, index) => {
    ctx.fillText(word, cx, cy - 80 + index * 120)
  })

  ctx.font = '400 36px monospace'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.fillText('F A T H O M', cx, 200)

  ctx.font = '300 28px monospace'
  ctx.fillText(`Recorded at ${Math.round(depth * 100)}% depth`, cx, height - 250)
  
  ctx.font = '300 22px monospace'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
  ctx.fillText('Keep this memory to return to your sea.', cx, height - 180)

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

function ModeSelector({ current, onSelect }: { current: FathomMode, onSelect: (m: FathomMode) => void }) {
  const modes: { value: FathomMode; label: string }[] = [
    { value: 'pomodoro', label: 'Pomodoro (25m+5m)' },
    { value: 'meditate', label: 'Meditate (25m+5m)' },
    { value: 'focus', label: 'Focus (90m)' },
    { value: 'sleep', label: 'Sleep (120m)' },
  ]
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
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

function EntranceStage({ onDescend, onReturn, isLeaving, targetCity, resolvedCity, isLoading, onSearch }: any) {
  const [inputVal, setInputVal] = useState('')
  const [coordVal, setCoordVal] = useState('')
  const [mode, setMode] = useState<FathomMode>('focus')
  const [viewState, setViewState] = useState<'new' | 'return'>('new')
  const [coordError, setCoordError] = useState(false)

  if (viewState === 'return') {
    return (
      <div className="descend-stage" aria-hidden={isLeaving}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, pointerEvents: 'auto' }}>
          <div className="descend-caption font-mincho" style={{ fontSize: 14 }}>
            あなたの水底の座標（3つの単語）を入力してください。
          </div>
          <input
            type="text"
            value={coordVal}
            onChange={(e) => { setCoordVal(e.target.value); setCoordError(false) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && coordVal.trim()) {
                const systemCoord = formatCoordinateForSystem(coordVal)
                if (isValidFathomCoordinate(systemCoord)) onReturn(systemCoord)
                else setCoordError(true)
              }
            }}
            className="input"
            style={{
              textAlign: 'center', width: '320px', fontSize: '16px', padding: '16px',
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${coordError ? 'rgba(255,100,100,0.4)' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: '4px', color: '#fff', outline: 'none', letterSpacing: '0.05em'
            }}
            placeholder="e.g. silent pale snow"
          />
          <div className="helper font-mincho" style={{ color: coordError ? '#ff8f8f' : 'inherit' }}>
            {coordError ? '座標の記述が正しくありません。' : 'Enter を押して過去の記憶へ帰還します'}
          </div>
          <button type="button" className="helper font-mincho" onClick={() => setViewState('new')} style={{ marginTop: 32, opacity: 0.6, cursor: 'pointer', background: 'none', border: 'none' }}>
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
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && inputVal.trim()) onSearch(inputVal.trim()) }}
            className="input"
            style={{
              textAlign: 'center', width: '300px', fontSize: '16px', padding: '16px',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '4px', color: '#fff', outline: 'none',
            }}
            placeholder="e.g. Tokyo, London, New York"
          />
          <div className="helper font-mincho">
            都市を入力し Enter で気象を受信します
          </div>
          <button type="button" className="helper" onClick={() => setViewState('return')} style={{ marginTop: 32, opacity: 0.6, cursor: 'pointer', background: 'none', border: 'none' }}>
            <span style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}>return to your past fathom</span> <span className="font-mincho">(過去の座標へ帰還)</span>
          </button>
        </div>
      </div>
    )
  }

  if (isLoading || !resolvedCity) {
    return (
      <div className="descend-stage" aria-hidden={isLeaving}>
        <div className="descend-caption" style={{ letterSpacing: '0.15em', pointerEvents: 'auto' }}>resolving atmospheric data for {targetCity}...</div>
      </div>
    )
  }

  return (
    <div className="descend-stage" aria-hidden={isLeaving}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'auto' }}>
        <div className="descend-caption font-mincho" style={{ marginBottom: 24, opacity: 0.8, fontSize: 14 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 16 }}>{resolvedCity}</span> の気象を受信しました。潜行の目的を選択してください。
        </div>
        <ModeSelector current={mode} onSelect={setMode} />
        <button type="button" className={`descend-beacon ${isLeaving ? 'is-leaving' : ''}`} onClick={() => onDescend(mode)} disabled={isLeaving}>
          <span className="descend-word">descend</span>
        </button>
        <div className="descend-caption" style={{ marginTop: 24, letterSpacing: '0.15em' }}>press to enter the deep</div>
      </div>
    </div>
  )
}

export function FathomApp() {
  const [city, setCity] = useState('')
  const [draft, setDraft] = useState('')
  const [progress, setProgress] = useState(0)
  const [fathomMode, setFathomMode] = useState<FathomMode>('focus')
  
  // 🚨 新規状態：ダイブのフェーズ管理
  const [sessionPhase, setSessionPhase] = useState<'diving' | 'interval' | 'completed'>('diving')
  const sessionPhaseRef = useRef<'diving' | 'interval' | 'completed'>('diving')
  
  const [composeKey, setComposeKey] = useState(0)
  const [resonancePulse, setResonancePulse] = useState(0)
  const [resonanceEnergy, setResonanceEnergy] = useState(0.14)
  
  const [composedText, setComposedText] = useState<string | null>(null)
  const [isDissolving, setIsDissolving] = useState(false)

  const [hasDescended, setHasDescended] = useState(false)
  const [beaconLeaving, setBeaconLeaving] = useState(false)
  const [beaconMounted, setBeaconMounted] = useState(true)

  const [channelMode, setChannelMode] = useState<'global' | 'resonance'>('global')
  const [linkedPeers, setLinkedPeers] = useState<Set<string>>(new Set())
  const [linkInputError, setLinkInputError] = useState(false)

  const selfId = useSelfId()
  const identity = useMemo(() => makeCrystalIdentity(selfId), [selfId])

  const descentCtl = useFathomDescent({ durationMs: 8000 })
  const { descent, phase, begin: beginDescent } = descentCtl
  const settled = descent >= 1

  const { data, loading } = useWeather(city)

  const windSpeed = data?.windSpeed ?? 4.2
  const rainAmount = (data?.rain1h ?? 0) + (data?.rain3h ?? 0)
  const clouds = data?.clouds ?? 42
  const weatherSnapshot = useMemo(() => {
    if (!data) return null
    return { city: data.city, windSpeed, rainAmount, clouds, temp: data.temp, description: data.description } as Record<string, unknown>
  }, [clouds, data, rainAmount, windSpeed])

  const audio = useDeepSeaAudio({ enabled: true, progress, windSpeed, rainAmount, descent })
  
  const { diveTimeMs, releaseCount, incrementRelease } = useFathomMemory(audio.running && settled)

  const driftElapsedRef = useRef(0)

  // 🚨 タイマーロジックの大改修（25分+5分の浮上システムの統合）
  useEffect(() => {
    if (!settled || !audio.running) return

    let lastTick = Date.now()
    const INITIAL_DEPTH = fathomMode === 'sleep' ? 0.25 : 0.18
    
    const WORK_MS = 25 * 60 * 1000 // 25分
    const BREAK_MS = 5 * 60 * 1000 // 5分
    const FOCUS_MS = 90 * 60 * 1000 // 90分
    const SLEEP_MS = 120 * 60 * 1000 // 120分

    const timer = window.setInterval(() => {
      const now = Date.now()
      const delta = now - lastTick
      lastTick = now
      driftElapsedRef.current += delta

      let newPhase: 'diving' | 'interval' | 'completed' = 'diving'
      let currentDepth = INITIAL_DEPTH

      // ポモドーロと瞑想：25分潜行 ＋ 5分浮上
      if (fathomMode === 'pomodoro' || fathomMode === 'meditate') {
        if (driftElapsedRef.current < WORK_MS) {
          newPhase = 'diving'
          currentDepth = INITIAL_DEPTH + (1.0 - INITIAL_DEPTH) * (driftElapsedRef.current / WORK_MS)
        } else if (driftElapsedRef.current < WORK_MS + BREAK_MS) {
          newPhase = 'interval'
          const breakRatio = (driftElapsedRef.current - WORK_MS) / BREAK_MS
          currentDepth = 1.0 - (1.0 - INITIAL_DEPTH) * breakRatio // 1.0 -> 0.18 へ浮上
        } else {
          newPhase = 'completed'
          currentDepth = INITIAL_DEPTH
        }
      } else {
        // フォーカスと睡眠：直線で底へ
        const DURATION = fathomMode === 'focus' ? FOCUS_MS : SLEEP_MS
        if (driftElapsedRef.current < DURATION) {
          newPhase = 'diving'
          currentDepth = INITIAL_DEPTH + (1.0 - INITIAL_DEPTH) * (driftElapsedRef.current / DURATION)
        } else {
          newPhase = 'completed'
          currentDepth = 1.0
        }
      }

      setProgress(currentDepth)
      
      // フェーズの切り替わりを検知
      if (sessionPhaseRef.current !== newPhase) {
        sessionPhaseRef.current = newPhase
        setSessionPhase(newPhase)
      }
    }, 1000)

    return () => window.clearInterval(timer)
  }, [audio.running, descent, settled, fathomMode])

  const triggerResonance = useCallback((energy: number) => {
    setResonanceEnergy(energy)
    setResonancePulse((p) => p + 1)
  }, [])

  // 🚨 フェーズ切り替え時の音響演出（澄んだソナー音）
  useEffect(() => {
    if (sessionPhase === 'interval') {
      audio.triggerFrictionImpulse({ intensity: 0.6, durationMs: 300, color: 0.1 })
      triggerResonance(0.8)
    } else if (sessionPhase === 'completed' && (fathomMode === 'pomodoro' || fathomMode === 'meditate')) {
      audio.triggerFrictionImpulse({ intensity: 0.4, durationMs: 500, color: 0.5 })
      triggerResonance(0.4)
    }
  }, [sessionPhase, audio, triggerResonance, fathomMode])

  // 🚨 次のサイクルへ潜る関数
  const handleDiveAgain = useCallback(() => {
    driftElapsedRef.current = 0
    sessionPhaseRef.current = 'diving'
    setSessionPhase('diving')
    setProgress(0.18)
    audio.triggerFrictionImpulse({ intensity: 0.4, durationMs: 150, color: 0.8 })
    triggerResonance(0.3)
  }, [audio, triggerResonance])


  const handleRemoteResonance = useCallback((payload: ResonancePulsePayload) => {
    const volumeDamp = fathomMode === 'meditate' ? 1.0 : 0.5
    const damped = Math.max(0.06, Math.min(0.22, payload.energy * 0.42))
    audio.triggerFrictionImpulse({ intensity: damped * 0.5 * volumeDamp, durationMs: 80, color: 0.72 })
    triggerResonance(damped)
  }, [audio, triggerResonance, fathomMode])

  const {
    status, liveLetters, archive, activeLetter, presenceCount, archiveLoading, latestHeatmapPulse,
    sendLetter, sendResonance, dismissActive, manualPlay, buryOwnLetter,
  } = useRealtimeLetters({
    roomId: ROOM_ID, selfId, selfName: 'visitor', city: data?.city, depth: progress, descent,
    currentWeatherSnapshot: weatherSnapshot, preferredLang: null, onRemoteResonance: handleRemoteResonance,
    enableFirstSurfacing: false, 
    firstSurfacingGraceMs: 1600,
  })

  const displayLetters = useMemo(() => {
    return liveLetters.filter(letter => {
      const senderId = (letter as any).authorId || (letter as any).senderId || (letter as any).coordinate || letter.id
      return linkedPeers.has(senderId)
    })
  }, [liveLetters, linkedPeers])

  const prevLettersCount = useRef(0)
  useEffect(() => {
    if (liveLetters.length > prevLettersCount.current) {
      audio.triggerFrictionImpulse({ intensity: 0.4, durationMs: 240, color: 0.7 })
      triggerResonance(0.32)
    }
    prevLettersCount.current = liveLetters.length
  }, [liveLetters.length, audio, triggerResonance])

  const lastActiveLetterRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeLetter) return
    if (lastActiveLetterRef.current === activeLetter.id) return
    lastActiveLetterRef.current = activeLetter.id
    audio.triggerFrictionImpulse({ intensity: activeLetter.source === 'archive' ? 0.26 : 0.4, durationMs: activeLetter.source === 'archive' ? 240 : 180, color: 0.7 })
    triggerResonance(activeLetter.source === 'archive' ? 0.22 : 0.32)
  }, [activeLetter, audio, triggerResonance])

  const canSend = useMemo(() => draft.trim().length > 0, [draft])

  const handleReleaseThought = useCallback(async () => {
    if (!canSend || sessionPhase !== 'diving') return
    const trimmed = draft.trim()
    setComposedText(trimmed)
    setDraft('')
    setComposeKey((n) => n + 1)
    setIsDissolving(false)
    triggerResonance(0.26)
    
    await sendLetter(trimmed)
    incrementRelease()

    setTimeout(() => {
      setIsDissolving(true)
      setTimeout(() => setComposedText(null), 4000)
    }, 12000)

  }, [canSend, draft, sessionPhase, sendLetter, triggerResonance, incrementRelease])

  const handleBury = useCallback(async (letterId: string) => {
    if (await buryOwnLetter(letterId)) {
      dismissActive()
      audio.triggerFrictionImpulse({ intensity: 0.18, durationMs: 220, color: 0.66 })
      triggerResonance(0.12)
    }
  }, [audio, buryOwnLetter, dismissActive, triggerResonance])

  const handleDescend = useCallback((selectedMode: FathomMode) => {
    if (hasDescended) return
    setFathomMode(selectedMode)
    setHasDescended(true)
    setBeaconLeaving(true)
    beginDescent()
    void audio.start()
    triggerResonance(0.22)
    window.setTimeout(() => setBeaconMounted(false), 650)
  }, [audio, beginDescent, hasDescended, triggerResonance])

  const handleReturn = useCallback((coordinate: string) => {
    window.localStorage.setItem('fathom:self-id', coordinate)
    window.location.reload()
  }, [])

  const uiOpacity = useMemo(() => {
    if (fathomMode !== 'sleep' || !settled) return 1.0
    return Math.max(0.08, 1.0 - (Math.max(0, (progress - 0.25) / 0.75)) * 1.5)
  }, [fathomMode, settled, progress])

  const currentPressure = (1 + progress * 10).toFixed(2)

  return (
    <main className="scene-root" style={{ background: '#02050a' }}>
      <style>{hudStyles}</style>

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
        temp={data?.temp ?? undefined}
        isSuspended={!audio.running}
        diveTimeMs={diveTimeMs}     
        releaseCount={releaseCount} 
      />

      <div className="scene-vignette" />

      <div className="fathom-logo" style={{ opacity: beaconMounted ? 1 : Math.max(0.3, uiOpacity) }}>
        F A T H O M
      </div>

      {beaconMounted ? (
        <EntranceStage onDescend={handleDescend} onReturn={handleReturn} isLeaving={beaconLeaving} targetCity={city} resolvedCity={data?.city ?? null} isLoading={loading} onSearch={(c: string) => setCity(c)} />
      ) : null}

      <div className="hud-overlay" style={{ position: 'absolute', inset: 0, zIndex: 50, opacity: uiOpacity, transition: 'opacity 2s linear', pointerEvents: 'none' }}>
        
        {hasDescended && !settled ? (
          <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', width: '100%', opacity: phase === 'descending' ? 0.8 : 0, transition: 'opacity 3s ease' }}>
            <p className="font-mincho" style={{ fontSize: '15px', lineHeight: '2.6', color: 'rgba(255,255,255,0.85)' }}>
              都市のノイズを抜け、至高の孤独へ。<br/>残るのは思考のゆらぎと、遠き共鳴だけ。
            </p>
            <div style={{ marginTop: 24, opacity: 0.5, letterSpacing: '0.1em', fontSize: 11, fontFamily: 'monospace' }}>descending — {Math.round(descent * 100)}%</div>
          </div>
        ) : null}

        {/* 🚨 追加：減圧中（浮上中）の専用メッセージ */}
        {hasDescended && settled && sessionPhase === 'interval' ? (
          <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', width: '100%', opacity: 1, transition: 'opacity 3s ease' }}>
            <p className="font-mincho" style={{ fontSize: '15px', lineHeight: '2.6', color: 'rgba(143,216,255,0.85)' }}>
              深く潜りすぎた思考を、一度水面へ。<br/>ゆっくりと光の中へ浮上します。
            </p>
            <div style={{ marginTop: 24, opacity: 0.5, letterSpacing: '0.1em', fontSize: 11, fontFamily: 'monospace' }}>decompressing — {Math.round(progress * 100)}%</div>
          </div>
        ) : null}

        {/* 🚨 追加：水面到達時（サイクル完了）の専用メッセージとボタン */}
        {hasDescended && settled && sessionPhase === 'completed' && (fathomMode === 'pomodoro' || fathomMode === 'meditate') ? (
          <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', width: '100%', pointerEvents: 'auto' }}>
            <p className="font-mincho" style={{ fontSize: '15px', lineHeight: '2.6', color: 'rgba(255,255,255,0.85)', marginBottom: 32 }}>
              水面に到達しました。<br/>息を整え、次の深淵へ。
            </p>
            <button className="hud-btn" onClick={handleDiveAgain} style={{ fontSize: 12, padding: '8px 24px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 24 }}>
              [ descend again ]
            </button>
          </div>
        ) : null}

        {hasDescended && settled ? (
          <>
            <div className={`hud-top-left ${visibilityClass(settled, 1)}`}>
              <div style={{ opacity: 0.4, marginBottom: 8, fontSize: '0.9em' }}>[ SURFACE ]</div>
              <div style={{ marginBottom: 4 }}>Origin: {data?.city ?? 'Unknown'}</div>
              <div style={{ marginBottom: 4 }}>Surface Noise: {windSpeed.toFixed(1)} m/s</div>
              <div>Surface Temp: {data?.temp != null ? `${data.temp.toFixed(1)}°C` : '—'}</div>
            </div>

            <div className={`hud-bottom-left ${visibilityClass(settled, 2)}`}>
              {/* 🚨 修正：フェーズによって表記を変更 */}
              <div style={{ opacity: 0.4, marginBottom: 8, fontSize: '0.9em' }}>
                {sessionPhase === 'interval' ? '[ DECOMPRESSION ]' : '[ ABYSS ]'}
              </div>
              <div style={{ marginBottom: 4, color: '#8fd8ff' }}>Current Depth: {Math.round(progress * 100)}%</div>
              <div style={{ marginBottom: 12 }}>Pressure: {currentPressure} atm</div>
              <div style={{ opacity: 0.4, marginBottom: 4, fontSize: '0.9em' }}>[ COORDINATE ]</div>
              <div style={{ marginBottom: 8 }}>{selfId.replace(/-/g, ' ')}</div>
              <button className="hud-btn" onClick={() => downloadCrystalMemory(selfId, progress)} style={{ padding: 0, textTransform: 'lowercase', display: 'block', marginBottom: 16 }}>save as memory</button>
              
              <div style={{ opacity: 0.4, marginBottom: 4, fontSize: '0.9em' }}>[ MEMORY ]</div>
              <div style={{ marginBottom: 4 }}>Age: {Math.floor(diveTimeMs / 60000)} fth</div>
              <div style={{ marginBottom: 4 }}>Releases: {releaseCount}</div>
            </div>

            <div className={`hud-top-right ${visibilityClass(settled, 3)}`}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8, width: '100%', justifyContent: 'flex-end' }}>
                <button
                  className="hud-btn"
                  style={{ opacity: channelMode === 'global' ? 1 : 0.3, padding: 0 }}
                  onClick={() => setChannelMode('global')}
                >
                  [ GLOBAL ]
                </button>
                <button
                  className="hud-btn"
                  style={{ opacity: channelMode === 'resonance' ? 1 : 0.3, padding: 0, color: channelMode === 'resonance' ? '#8fd8ff' : 'inherit' }}
                  onClick={() => setChannelMode('resonance')}
                >
                  [ RESONANCE: {linkedPeers.size} ]
                </button>
              </div>

              {channelMode === 'global' ? (
                <div style={{ textAlign: 'right', marginTop: 16 }}>
                  <div style={{ opacity: 0.5, fontSize: '10px', letterSpacing: '0.1em', fontFamily: 'monospace', marginBottom: 4 }}>
                    listening to the anonymous tide...
                  </div>
                  <div className="font-mincho" style={{ fontSize: '11px', opacity: 0.4 }}>
                    ( 名もなき思考の波紋 )
                  </div>
                </div>
              ) : (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <input
                    type="text"
                    placeholder="enter 3-word coordinate"
                    style={{ 
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.8)',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      letterSpacing: '0.05em',
                      width: '180px', 
                      border: 'none',
                      borderBottom: `1px solid ${linkInputError ? 'rgba(255,100,100,0.5)' : 'rgba(255,255,255,0.2)'}`, 
                      height: 24, 
                      padding: '0 4px',
                      marginBottom: 16,
                      textAlign: 'right',
                      outline: 'none'
                    }}
                    onChange={() => setLinkInputError(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value;
                        const formatted = formatCoordinateForSystem(val);
                        if (isValidFathomCoordinate(formatted)) {
                          setLinkedPeers(prev => new Set(prev).add(formatted));
                          e.currentTarget.value = '';
                          setLinkInputError(false);
                        } else {
                          setLinkInputError(true);
                        }
                      }
                    }}
                  />
                  <LetterInbox
                    status={status} 
                    liveLetters={displayLetters} 
                    archive={archive} 
                    archiveLoading={archiveLoading} 
                    activeLetter={activeLetter} 
                    presenceCount={presenceCount} 
                    selfId={selfId}
                    onSelectLetter={(letter: LetterPayload) => { manualPlay(letter); triggerResonance(letter.source === 'archive' ? 0.18 : 0.24) }}
                    onDismiss={dismissActive}
                    onActiveStrokeImpulse={(intensity, durationMs) => { audio.triggerFrictionImpulse({ intensity, durationMs, color: 0.8 }); triggerResonance(Math.max(0.12, intensity * 0.9)) }}
                    onActiveComplete={() => { audio.triggerFrictionImpulse({ intensity: 0.14, durationMs: 90, color: 0.74 }); triggerResonance(0.16) }}
                    onBury={(id) => void handleBury(id)}
                  />
                </div>
              )}
            </div>

            <div className={`hud-bottom-center ${visibilityClass(settled, 4)}`}>
              <div className={isDissolving ? 'fade-out-thought' : ''} style={{ width: '100%', height: 48, position: 'relative', marginBottom: 24 }}>
                {composedText ? (
                  <HandwrittenLetter
                    animateKey={composeKey} text={composedText} fontUrl="/fonts/ShipporiMincho-Regular.ttf"
                    fontSize={12} lineHeight={20} letterSpacing={1.2} className="handwritten-svg"
                    strokeColor="rgba(236,246,255,0.7)" glowColor="rgba(143,216,255,0.1)" strokeWidth={1.0}
                    onStrokeImpulse={(payload) => { audio.triggerFrictionImpulse({ intensity: payload.intensity, durationMs: payload.durationMs, color: 0.84 }); triggerResonance(Math.max(0.16, payload.intensity)); sendResonance(payload.intensity * 0.85) }}
                    onComplete={() => { audio.triggerFrictionImpulse({ intensity: 0.16, durationMs: 90, color: 0.78 }); triggerResonance(0.14) }}
                  />
                ) : null}
              </div>

              {/* 🚨 修正：インターバル（減圧）中や完了時は入力を制限する */}
              {sessionPhase === 'diving' ? (
                <div style={{ display: 'flex', width: '100%', gap: 16, alignItems: 'center', padding: '0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="思考を深海へ沈める..."
                    className="hud-textarea"
                  />
                  <button className="hud-btn" onClick={() => void handleReleaseThought()} disabled={!canSend || status !== 'subscribed'}>
                    [ release ]
                  </button>
                </div>
              ) : sessionPhase === 'interval' ? (
                <div style={{ opacity: 0.5, fontSize: 11, letterSpacing: '0.1em' }} className="font-mincho">
                  （ 減圧中：水面で息を整えてください ）
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
                {!audio.running ? (
                  <button className="hud-btn" onClick={() => { beginDescent(); void audio.resume(); triggerResonance(0.18) }}>[ resume ]</button>
                ) : (
                  <button className="hud-btn" onClick={() => void audio.suspend()}>[ suspend ]</button>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </main>
  )
}