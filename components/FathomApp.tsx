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

const hudStyles = `
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

  /* デスクトップ基準の配置 */
  .fathom-logo { 
    position: fixed; top: 32px; left: 0; width: 100%; text-align: center; 
    pointer-events: none; z-index: 100; transition: opacity 2s linear; 
    letter-spacing: 0.6em; font-size: 13px; font-weight: 300; 
    color: rgba(255,255,255,0.7); font-family: monospace; 
  }
  .hud-top-left { position: absolute; top: 40px; left: 32px; text-align: left; font-family: monospace; font-size: 10px; letter-spacing: 0.08em; color: rgba(255,255,255,0.5); pointer-events: auto; }
  .hud-bottom-left { position: absolute; bottom: 40px; left: 32px; text-align: left; font-family: monospace; font-size: 10px; letter-spacing: 0.08em; color: rgba(255,255,255,0.5); pointer-events: auto; }
  .hud-top-right { position: absolute; top: 40px; right: 32px; pointer-events: auto; max-width: 300px; }
  .hud-bottom-center { position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); width: 100%; max-width: 460px; display: flex; flex-direction: column; align-items: center; pointer-events: auto; }
  
  .hud-textarea { flex: 1; background: transparent; border: none; color: rgba(255,255,255,0.7); font-family: sans-serif; font-size: 11px; padding: 8px 0; outline: none; resize: none; height: 32px; line-height: 16px; letter-spacing: 0.05em; }

  /* スマホ用（画面幅768px以下）のレイアウト調整 */
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

function EntranceStage({ onDescend, onReturn, isLeaving, targetCity, resolvedCity, isLoading, onSearch }: any) {
  const [inputVal, setInputVal] = useState('')
  const [coordVal, setCoordVal] = useState('')
  const [mode, setMode] = useState<FathomMode>('meditate')
  const [viewState, setViewState] = useState<'new' | 'return'>('new')
  const [coordError, setCoordError] = useState(false)

  if (viewState === 'return') {
    return (
      <div className="descend-stage" aria-hidden={isLeaving}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, pointerEvents: 'auto' }}>
          <div className="descend-caption" style={{ fontSize: 14, letterSpacing: '0.1em' }}>
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
          <div className="helper" style={{ letterSpacing: '0.1em', color: coordError ? '#ff8f8f' : 'inherit' }}>
            {coordError ? '座標の記述が正しくありません。' : 'Enter を押して過去の記憶へ帰還します'}
          </div>
          <button type="button" className="helper" onClick={() => setViewState('new')} style={{ marginTop: 32, opacity: 0.6, cursor: 'pointer', background: 'none', border: 'none', letterSpacing: '0.1em' }}>
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
          <div className="helper" style={{ letterSpacing: '0.1em' }}>
            都市を入力し Enter で気象を受信します
          </div>
          <button type="button" className="helper" onClick={() => setViewState('return')} style={{ marginTop: 32, opacity: 0.6, cursor: 'pointer', background: 'none', border: 'none', letterSpacing: '0.1em' }}>
            return to your past fathom (過去の座標へ帰還)
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
        <div className="descend-caption" style={{ marginBottom: 24, opacity: 0.8, letterSpacing: '0.1em', fontSize: 14 }}>
          {resolvedCity} の気象を受信しました。潜行の目的を選択してください。
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
  const [fathomMode, setFathomMode] = useState<FathomMode>('meditate')
  
  const [composeKey, setComposeKey] = useState(0)
  const [resonancePulse, setResonancePulse] = useState(0)
  const [resonanceEnergy, setResonanceEnergy] = useState(0.14)
  const [composedText, setComposedText] = useState<string | null>(null)

  const [hasDescended, setHasDescended] = useState(false)
  const [beaconLeaving, setBeaconLeaving] = useState(false)
  const [beaconMounted, setBeaconMounted] = useState(true)

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
  
  const driftElapsedRef = useRef(0)

  useEffect(() => {
    if (!settled) { 
      const INITIAL_DEPTH = fathomMode === 'sleep' ? 0.25 : 0.18
      setProgress(descent * INITIAL_DEPTH)
      driftElapsedRef.current = 0
      return 
    }

    if (!audio.running) return

    let lastTick = Date.now()
    const INITIAL_DEPTH = fathomMode === 'sleep' ? 0.25 : 0.18
    const TARGET_DEPTH = fathomMode === 'focus' ? 0.55 : 1.0
    const TIME_CONSTANT = fathomMode === 'sleep' ? 45 * 60 * 1000 : fathomMode === 'focus' ? 60 * 60 * 1000 : 2 * 60 * 60 * 1000

    const timer = window.setInterval(() => {
      const now = Date.now()
      const delta = now - lastTick
      lastTick = now
      driftElapsedRef.current += delta

      const currentDepth = INITIAL_DEPTH + (TARGET_DEPTH - INITIAL_DEPTH) * (1 - Math.exp(-driftElapsedRef.current / TIME_CONSTANT))
      setProgress(currentDepth)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [audio.running, descent, settled, fathomMode])

  const triggerResonance = useCallback((energy: number) => {
    setResonanceEnergy(energy)
    setResonancePulse((p) => p + 1)
  }, [])

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
    enableFirstSurfacing: true, firstSurfacingGraceMs: 1600,
  })

  const lastActiveLetterRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeLetter) return
    if (lastActiveLetterRef.current === activeLetter.id) return
    lastActiveLetterRef.current = activeLetter.id
    audio.triggerFrictionImpulse({ intensity: activeLetter.source === 'archive' ? 0.26 : 0.4, durationMs: activeLetter.source === 'archive' ? 240 : 180, color: 0.7 })
    triggerResonance(activeLetter.source === 'archive' ? 0.22 : 0.32)
  }, [activeLetter, audio, triggerResonance])

  const canSend = useMemo(() => draft.trim().length > 0, [draft])

  const handleSendLetter = useCallback(async () => {
    if (!canSend) return
    const trimmed = draft.trim()
    setComposedText(trimmed)
    setDraft('')
    setComposeKey((n) => n + 1)
    triggerResonance(0.26)
    await sendLetter(trimmed)
  }, [canSend, draft, sendLetter, triggerResonance])

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

      {/* 🚨 修正：地上の気温、および一時停止（Suspend）状態を Canvas へ完全に連動させる */}
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
            <p style={{ fontSize: '14px', letterSpacing: '0.15em', lineHeight: '2.4', color: 'rgba(255,255,255,0.8)', fontFamily: 'sans-serif' }}>
              都市のノイズを抜け、至高の孤独へ。<br/>残るのは思考のゆらぎと、遠き共鳴だけ。
            </p>
            <div style={{ marginTop: 24, opacity: 0.5, letterSpacing: '0.1em', fontSize: 11, fontFamily: 'monospace' }}>descending — {Math.round(descent * 100)}%</div>
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
              <div style={{ opacity: 0.4, marginBottom: 8, fontSize: '0.9em' }}>[ ABYSS ]</div>
              <div style={{ marginBottom: 4, color: '#8fd8ff' }}>Current Depth: {Math.round(progress * 100)}%</div>
              <div style={{ marginBottom: 12 }}>Pressure: {currentPressure} atm</div>
              <div style={{ opacity: 0.4, marginBottom: 4, fontSize: '0.9em' }}>[ COORDINATE ]</div>
              <div style={{ marginBottom: 12 }}>{selfId.replace(/-/g, ' ')}</div>
              <button className="hud-btn" onClick={() => downloadCrystalMemory(selfId, progress)} style={{ padding: 0, textTransform: 'lowercase' }}>save as memory</button>
            </div>

            <div className={`hud-top-right ${visibilityClass(settled, 3)}`}>
              <LetterInbox
                status={status} liveLetters={liveLetters} archive={archive} archiveLoading={archiveLoading} activeLetter={activeLetter} presenceCount={presenceCount} selfId={selfId}
                onSelectLetter={(letter: LetterPayload) => { manualPlay(letter); triggerResonance(letter.source === 'archive' ? 0.18 : 0.24) }}
                onDismiss={dismissActive}
                onActiveStrokeImpulse={(intensity, durationMs) => { audio.triggerFrictionImpulse({ intensity, durationMs, color: 0.8 }); triggerResonance(Math.max(0.12, intensity * 0.9)) }}
                onActiveComplete={() => { audio.triggerFrictionImpulse({ intensity: 0.14, durationMs: 90, color: 0.74 }); triggerResonance(0.16) }}
                onBury={(id) => void handleBury(id)}
              />
            </div>

            <div className={`hud-bottom-center ${visibilityClass(settled, 4)}`}>
              <div style={{ width: '100%', height: 48, position: 'relative', marginBottom: 24 }}>
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

              <div style={{ display: 'flex', width: '100%', gap: 16, alignItems: 'center', padding: '0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="write a quiet letter..."
                  className="hud-textarea"
                />
                <button className="hud-btn" onClick={() => void handleSendLetter()} disabled={!canSend || status !== 'subscribed'}>
                  [ send ]
                </button>
              </div>

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