'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DeepSeaCanvas } from '@/components/scene/DeepSeaCanvas'
import { DEFAULT_MASTER_VOLUME, useDeepSeaAudio } from '@/hooks/useDeepSeaAudio'
import {
  useRealtimeLetters,
  type ResonancePulsePayload,
} from '@/hooks/useRealtimeLetters'
import { useWeather } from '@/hooks/useWeather'
import { makeCrystalIdentity } from '@/lib/identity/crystalSeed'
import { useFathomDescent } from '@/hooks/useFathomDescent'
import { isValidFathomCoordinate, formatCoordinateForSystem } from '@/lib/identity/coordinates'
import { useFathomMemory } from '@/hooks/useFathomMemory'
import { useAbyssalOverload } from '@/hooks/useAbyssalOverload'

import { PORTS } from '@/lib/scene/ports'
import { SITE_TAGLINE } from '@/lib/site'
import {
  SCHEDULED_BREAK_MS,
  SCHEDULED_DIVE_MS,
  formatClockTime,
  getScheduleState,
  type ScheduleState,
} from '@/lib/schedule/diveSchedule'
import { useDiveSchedule } from '@/hooks/useDiveSchedule'
import { useDiveLog } from '@/hooks/useDiveLog'
import { useDiveStats } from '@/hooks/useDiveStats'
import { useDiveNotifications, type NotificationState } from '@/hooks/useDiveNotifications'
import { shareDiveCard, xShareUrl, type DiveCardInfo } from '@/lib/share/diveCard'
import { TIP_ENABLED, TIP_URL } from '@/lib/legal'
import { releaseThoughts, saveThought, type SunkThought } from '@/lib/thoughts'
import { useSelfSeed } from '@/hooks/useSelfSeed'
import { RestoreMemoryModal } from '@/components/auth/RestoreMemoryModal'

const ROOM_ID = process.env.NEXT_PUBLIC_FATHOM_ROOM ?? 'global'

// scheduled = 定時潜航（メイン）、それ以外はソロ潜航
export type FathomMode = 'scheduled' | 'meditate' | 'focus' | 'sleep'

const WORK_MS = 25 * 60 * 1000
const BREAK_MS = 5 * 60 * 1000
const FOCUS_MS = 90 * 60 * 1000
const SLEEP_MS = 60 * 60 * 1000

const CLOCK_PREF_KEY = 'fathom:show-clock'
const VOLUME_PREF_KEY = 'fathom:volume'

function remainingSessionMs(mode: FathomMode, elapsedMs: number): number {
  if (mode === 'scheduled') return getScheduleState().remainingInPhase
  if (mode === 'meditate') {
    if (elapsedMs < WORK_MS) return WORK_MS - elapsedMs
    return Math.max(0, WORK_MS + BREAK_MS - elapsedMs)
  }
  const total = mode === 'focus' ? FOCUS_MS : SLEEP_MS
  return Math.max(0, total - elapsedMs)
}

function formatClock(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// localStorage はプライベートモード等で例外を投げることがあるので必ず try で包む
function readPref(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}

function writePref(key: string, value: string) {
  try { window.localStorage.setItem(key, value) } catch { /* noop */ }
}

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
    white-space: nowrap;
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
  .hud-bottom-right { position: absolute; bottom: 40px; right: 32px; display: flex; flex-direction: column; align-items: flex-end; pointer-events: auto; }

  .beacon-slider {
    -webkit-appearance: none;
    width: 100%;
    height: 1px;
    background: rgba(255, 255, 255, 0.15);
    outline: none;
    margin: 32px 0;
  }
  .beacon-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 2px;
    height: 20px;
    background: #fff;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.5);
    transition: background 0.3s, box-shadow 0.3s;
  }
  .beacon-slider.locked::-webkit-slider-thumb {
    background: #8fd8ff;
    box-shadow: 0 0 12px rgba(143, 216, 255, 0.8);
  }
  .signal-text {
    font-family: monospace;
    font-size: 11px;
    letter-spacing: 0.15em;
    color: rgba(255, 255, 255, 0.5);
    transition: color 0.4s ease, text-shadow 0.4s ease;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .signal-text.locked {
    color: #8fd8ff;
    text-shadow: 0 0 8px rgba(143, 216, 255, 0.4);
  }

  .glitch-text {
    animation: glitch-skew 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both infinite;
    color: rgba(255, 100, 100, 0.8);
  }
  @keyframes glitch-skew {
    0% { transform: skew(0deg); }
    20% { transform: skew(-20deg); opacity: 0.5; }
    40% { transform: skew(20deg); opacity: 1; }
    60% { transform: skew(0deg); opacity: 0.3; }
    80% { transform: skew(10deg); opacity: 0.8; }
    100% { transform: skew(0deg); }
  }

  .landing-intro {
    position: absolute; top: 72px; left: 0; right: 0;
    padding: 0 24px; text-align: center; pointer-events: none;
    color: rgba(255, 255, 255, 0.8); font-size: 14px; line-height: 2;
  }
  .landing-intro p { margin: 0; }
  .landing-intro .phrase { display: inline-block; }
  .landing-intro .landing-intro-sub { font-size: 11px; opacity: 0.6; letter-spacing: 0.08em; }

  .scheduled-status {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    margin: 28px 0 20px;
  }
  .scheduled-clock {
    font-family: monospace; font-size: 15px; letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.9);
  }
  .scheduled-count { font-size: 12px; letter-spacing: 0.1em; color: rgba(143, 216, 255, 0.8); }
  /* 定時潜航の入口では、ボタンを下にずらさず文章の流れの中に置く */
  .descend-beacon.in-flow { transform: none; }
  .descend-beacon.in-flow:hover { transform: translateY(-1px); }
  .descend-beacon.in-flow.is-leaving { transform: translateY(8px); }

  .sink-input {
    width: min(420px, 80vw);
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(235, 245, 252, 0.85);
    font-size: 13px;
    text-align: center;
    padding: 6px 4px;
    outline: none;
    opacity: 0.45;
    transition: opacity 0.4s ease, border-color 0.4s ease;
  }
  .sink-input:hover, .sink-input:focus { opacity: 1; border-bottom-color: rgba(143, 216, 255, 0.5); }
  .sink-input::placeholder { color: rgba(255, 255, 255, 0.35); }
  .sink-hint { font-size: 10px; letter-spacing: 0.08em; opacity: 0.35; margin: 8px 0 4px; text-align: center; }

  .breath-catcher { position: absolute; inset: 0; z-index: 45; touch-action: none; user-select: none; -webkit-user-select: none; }
  .breath-guide {
    position: absolute; top: 15%; left: 0; right: 0; text-align: center;
    font-size: 16px; letter-spacing: 0.3em; color: rgba(143, 216, 255, 0.9);
    pointer-events: none; transition: opacity 0.6s ease;
  }

  .hud-clock {
    display: block; padding: 0; margin-bottom: 8px;
    font-size: 13px; letter-spacing: 0.12em; text-transform: none;
    color: rgba(255, 255, 255, 0.85);
  }

  .volume-control {
    display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
    font-family: monospace; font-size: 10px; letter-spacing: 0.2em;
    color: rgba(255, 255, 255, 0.4);
  }
  .volume-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 96px;
    height: 1px;
    background: rgba(255, 255, 255, 0.2);
    outline: none;
    cursor: pointer;
  }
  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 2px;
    height: 14px;
    background: #8fd8ff;
    box-shadow: 0 0 8px rgba(143, 216, 255, 0.6);
  }
  .volume-slider::-moz-range-thumb {
    width: 2px;
    height: 14px;
    border: none;
    border-radius: 0;
    background: #8fd8ff;
  }

  @media (max-width: 768px) {
    .fathom-logo { font-size: 14px; top: 16px; }
    .landing-intro { top: 48px; font-size: 13px; }
    .hud-top-left { top: 60px; left: 16px; font-size: 8px; max-width: 45vw; }
    .hud-top-right { top: 60px; right: 16px; font-size: 8px; max-width: 45vw; }
    .hud-bottom-left { bottom: 130px; left: 16px; font-size: 8px; max-width: 45vw; }
    .hud-bottom-center { bottom: 16px; padding: 0 16px; max-width: 100vw; width: 100%; }
    .hud-bottom-right { bottom: 130px; right: 16px; font-size: 8px; max-width: 45vw; }
    .hud-btn { padding: 4px; font-size: 9px; letter-spacing: 0.1em; }
    .hud-btn.hud-clock { padding: 0; font-size: 12px; }
    .volume-slider { width: 72px; }
  }
`

function EdgeResonanceOverlay({ ripples }: { ripples: { id: number, pan: number }[] }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, overflow: 'hidden' }}>
      {ripples.map(r => {
        const leftPos = 50 + (r.pan * 60)
        return (
          <div
            key={r.id}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${leftPos}%`,
              width: '40vw',
              height: '80vh',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(ellipse at center, rgba(143,216,255,0.15) 0%, rgba(143,216,255,0) 60%)',
              mixBlendMode: 'screen',
              animation: 'edge-glow 3s cubic-bezier(0.1, 0.8, 0.2, 1) forwards'
            }}
          />
        )
      })}
      <style>{`
        @keyframes edge-glow {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          15% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); filter: brightness(1.2); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.3); }
        }
      `}</style>
    </div>
  )
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

function visibilityClass(settled: boolean, stagger?: 1 | 2 | 3 | 4 | 5 | 6): string {
  const base = settled ? 'ui-revealed' : 'ui-veiled'
  const staggerCls = stagger ? `ui-stagger-${stagger}` : ''
  return [base, staggerCls].filter(Boolean).join(' ')
}

function ModeSelector({ current, onSelect }: { current: FathomMode, onSelect: (m: FathomMode) => void }) {
  const modes: { value: FathomMode; label: string }[] = [
    { value: 'meditate', label: 'Meditate (25m+5m)' },
    { value: 'focus', label: 'Focus (90m)' },
    { value: 'sleep', label: 'Sleep (60m)' },
  ]
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: '400px' }}>
      {modes.map((m) => {
        const isActive = current === m.value
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onSelect(m.value)}
            style={{
              padding: '8px 20px',
              borderRadius: '24px',
              border: `1px solid ${isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)'}`,
              background: isActive ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.3)',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.3s ease',
              letterSpacing: '0.1em',
              fontSize: '13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

// 初めて来た人に「何をする場所か」を一行で伝える
function LandingIntro({ sub }: { sub: string[] }) {
  return (
    <div className="landing-intro font-mincho">
      <p>
        {SITE_TAGLINE.split('、').map((phrase, i, all) => (
          <span key={i} className="phrase">{phrase}{i < all.length - 1 ? '、' : ''}</span>
        ))}
      </p>
      <p className="landing-intro-sub">
        {sub.map((phrase) => <span key={phrase} className="phrase">{phrase}</span>)}
      </p>
    </div>
  )
}

const landingStageStyle = (isLeaving: boolean): React.CSSProperties => ({
  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  zIndex: 50, display: 'flex', flexDirection: 'column',
  justifyContent: 'flex-end', alignItems: 'center',
  paddingBottom: '18vh',
  pointerEvents: 'none',
  opacity: isLeaving ? 0 : 1, transition: 'opacity 1s ease'
})

const landingInnerStyle: React.CSSProperties = {
  pointerEvents: 'auto', display: 'flex', flexDirection: 'column',
  alignItems: 'center', width: '100%', padding: '0 32px', maxWidth: '460px'
}

function diveCountLabel(phase: ScheduleState['phase'], others: number): string {
  if (phase === 'diving') return others > 0 ? `いま ${others}人が潜航中` : 'いまは貸し切りの海'
  return others > 0 ? `水面で ${others}人が待機中` : 'まだ誰もいない水面。最初のひとりに。'
}

// 定時潜航の入口（ランディングの既定画面）
function ScheduledDiveStage({ schedule, weather, othersDiving, othersWaiting, weeklyDivers, notifyToggle, onJoin, onSolo, onOpenRestore, isLeaving }: {
  schedule: ScheduleState
  weather: { windSpeed: number, temp: number } | null
  othersDiving: number
  othersWaiting: number
  weeklyDivers: number | null
  notifyToggle: React.ReactNode
  onJoin: () => void
  onSolo: () => void
  onOpenRestore: () => void
  isLeaving: boolean
}) {
  const isDiving = schedule.phase === 'diving'
  return (
    <div aria-hidden={isLeaving} style={landingStageStyle(isLeaving)}>
      <LandingIntro sub={['毎時 :00 と :30 に、', 'みんなで25分潜る集中タイマー。']} />

      <div style={landingInnerStyle}>
        <div className="signal-text locked" style={{ marginBottom: 8 }}>
          [ {formatClockTime(schedule.diveStartsAt)} の定時潜航 ]
        </div>
        <div className="font-mincho" style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
          {schedule.port.label}
        </div>
        <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.12em', opacity: 0.5, height: 14 }}>
          {weather ? `wind ${weather.windSpeed.toFixed(1)} m/s · ${weather.temp.toFixed(1)}°C` : 'listening to the surface...'}
        </div>

        <div className="scheduled-status">
          <div className="scheduled-clock">
            {isDiving ? `潜航中 ・ 残り ${formatClock(schedule.remainingInPhase)}` : `まもなく潜航 ・ あと ${formatClock(schedule.remainingInPhase)}`}
          </div>
          <div className="font-mincho scheduled-count">
            {diveCountLabel(schedule.phase, isDiving ? othersDiving : othersWaiting)}
          </div>
          {weeklyDivers ? (
            <div className="font-mincho" style={{ fontSize: 11, letterSpacing: '0.1em', opacity: 0.5 }}>
              今週 {weeklyDivers}人が潜りました
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={`descend-beacon in-flow ${isLeaving ? 'is-leaving' : ''}`}
          onClick={onJoin}
          disabled={isLeaving}
          style={{ position: 'relative', margin: '8px 0' }}
        >
          <span className="descend-word">{isDiving ? 'join' : 'descend'}</span>
        </button>

        <div className="font-mincho" style={{ marginTop: 24, letterSpacing: '0.12em', fontSize: '11px', opacity: 0.5, textAlign: 'center' }}>
          {isDiving ? '途中から合流して、残りの時間を一緒に潜る' : '水面で待って、時間になったら一緒に潜る'}
        </div>

        <div style={{ marginTop: 16 }}>{notifyToggle}</div>

        <button
          type="button"
          className="hud-btn"
          onClick={onSolo}
          disabled={isLeaving}
          style={{ marginTop: 32, opacity: 0.7, fontSize: 11, letterSpacing: '0.12em', textTransform: 'none' }}
        >
          <span className="font-mincho">ひとりで潜る（瞑想・睡眠・90分集中）</span>
        </button>

        <button
          type="button"
          className="hud-btn"
          onClick={onOpenRestore}
          disabled={isLeaving}
          style={{ marginTop: 12, opacity: 0.5, fontSize: 10, letterSpacing: '0.15em', textTransform: 'none' }}
        >
          I have been here before <span className="font-mincho" style={{ opacity: 0.7 }}>（かつての記憶へ帰還）</span>
        </button>
      </div>
    </div>
  )
}

function BeaconTuningStage({ onDescend, onOpenRestore, onBack, isLeaving, targetCity, isLoading, onSearch, onTuningChange, onCitySnap }: any) {
  const [mode, setMode] = useState<FathomMode>('focus')
  const [dialValue, setDialValue] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [freqStr, setFreqStr] = useState('00.0')
  
  const dragTimeout = useRef<number | null>(null)
  const lastIndex = useRef<number>(-1)
  const lastTuningUpdate = useRef(0)

  // 定時潜航の画面から来たときは、その海にダイヤルを合わせておく
  useEffect(() => {
    const index = PORTS.findIndex((p) => p.query === targetCity)
    if (index >= 0) setDialValue((index / (PORTS.length - 1)) * 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!targetCity) {
      const initialIndex = Math.floor(Math.random() * PORTS.length)
      setDialValue((initialIndex / (PORTS.length - 1)) * 100)
      onSearch(PORTS[initialIndex].query)
    }
  }, [targetCity, onSearch])

  useEffect(() => {
    if (!isDragging) return
    const interval = setInterval(() => {
      setFreqStr((Math.random() * 100 + 10).toFixed(1))
    }, 50)
    return () => clearInterval(interval)
  }, [isDragging])

  const handleDialChange = (val: number) => {
    setDialValue(val) 
    setIsDragging(true)
    
    const now = Date.now()
    if (now - lastTuningUpdate.current > 150) {
      onTuningChange(val, true)
      lastTuningUpdate.current = now
    }

    const index = Math.round((val / 100) * (PORTS.length - 1))
    
    if (index !== lastIndex.current) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10)
      }
      onCitySnap()
      lastIndex.current = index
    }

    if (dragTimeout.current) window.clearTimeout(dragTimeout.current)
    
    dragTimeout.current = window.setTimeout(() => {
      setIsDragging(false)
      onTuningChange(val, false) 
      
      const port = PORTS[index]
      if (targetCity !== port.query) {
        onSearch(port.query)
      }
    }, 600)
  }

  const isTuning = isDragging || isLoading
  const currentPort = PORTS[Math.round((dialValue / 100) * (PORTS.length - 1))]

  return (
    <div aria-hidden={isLeaving} style={landingStageStyle(isLeaving)}>
      <LandingIntro sub={['ひとりで潜る ──', '海を選んで、自分のペースで。']} />

      <div style={landingInnerStyle}>

        <div className={`signal-text ${!isTuning ? 'locked' : ''}`} style={{ marginBottom: 8 }}>
          {isTuning ? `[ SEEKING... ${freqStr} MHz ]` : `[ SIGNAL ACQUIRED: ${currentPort.name} ]`}
        </div>
        
        <div className="font-mincho" style={{ fontSize: 11, opacity: isTuning ? 0 : 0.6, transition: 'opacity 0.4s ease', height: 16 }}>
          {isTuning ? '' : currentPort.label}
        </div>

        <input
          type="range"
          min="0" max="100" step="0.1"
          value={dialValue}
          onChange={(e) => handleDialChange(parseFloat(e.target.value))}
          onTouchStart={() => setIsDragging(true)}
          className={`beacon-slider ${!isTuning ? 'locked' : ''}`}
          aria-label="潜る海を選ぶダイヤル"
          aria-valuetext={currentPort.label}
        />

        <ModeSelector current={mode} onSelect={setMode} />

        <button 
          type="button" 
          className={`descend-beacon ${isLeaving ? 'is-leaving' : ''}`} 
          onClick={() => onDescend(mode)} 
          disabled={isLeaving || isTuning}
          style={{ position: 'relative', margin: '8px 0', opacity: isTuning ? 0.3 : 1, transition: 'opacity 0.3s' }} 
        >
          <span className="descend-word">descend</span>
        </button>
        
        <div style={{ marginTop: 24, letterSpacing: '0.15em', fontSize: '10px', opacity: 0.4, fontFamily: 'monospace', textAlign: 'center' }}>
          press to enter the deep
        </div>

        <button
          type="button"
          className="hud-btn"
          onClick={onBack}
          disabled={isLeaving}
          style={{ marginTop: 32, opacity: 0.7, fontSize: 11, letterSpacing: '0.12em', textTransform: 'none' }}
        >
          <span className="font-mincho">← みんなで潜る（定時潜航）に戻る</span>
        </button>

        <button
          type="button"
          className="hud-btn"
          onClick={onOpenRestore}
          disabled={isLeaving}
          style={{ marginTop: 12, opacity: 0.6, fontSize: 10, letterSpacing: '0.15em', textTransform: 'none' }}
        >
          I have been here before <span className="font-mincho" style={{ opacity: 0.7 }}>（かつての記憶へ帰還）</span>
        </button>
      </div>
    </div>
  )
}

const MODE_LABELS: Record<FathomMode, string> = {
  scheduled: '定時潜航',
  meditate: '瞑想',
  focus: '集中',
  sleep: '睡眠',
}

// 浮上画面の「記録を残す・シェアする・応援する」
function DiveShareActions({ info }: { info: DiveCardInfo }) {
  const [status, setStatus] = useState<string | null>(null)
  const linkStyle: React.CSSProperties = { textTransform: 'none', letterSpacing: '0.1em', fontSize: 11, padding: '4px 0' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 24 }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          className="hud-btn"
          style={linkStyle}
          onClick={async () => {
            const result = await shareDiveCard(info)
            setStatus(result === 'downloaded' ? '潜航カードを保存しました' : result === 'shared' ? '共有しました' : null)
          }}
        >
          <span className="font-mincho">[ 潜航カードを保存 ]</span>
        </button>
        <a className="hud-btn" style={linkStyle} href={xShareUrl(info)} target="_blank" rel="noopener noreferrer">
          <span className="font-mincho">[ X でシェア ]</span>
        </a>
      </div>
      {status ? <div className="font-mincho" style={{ fontSize: 10, opacity: 0.5 }}>{status}</div> : null}
      {TIP_ENABLED && TIP_URL ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <a className="hud-btn" style={{ ...linkStyle, color: 'rgba(143, 216, 255, 0.85)' }} href={TIP_URL} target="_blank" rel="noopener noreferrer">
            <span className="font-mincho">この海の灯りを保つ（¥100〜）</span>
          </a>
          <a href="/legal" target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, opacity: 0.35, letterSpacing: '0.05em' }}>
            特定商取引法に基づく表記
          </a>
        </div>
      ) : null}
    </div>
  )
}

// 潜航中の「沈める」入力欄。普段は目立たず、触れたときだけ浮かび上がる
function SinkInput({ onSink }: { onSink: (text: string | null) => void }) {
  const [value, setValue] = useState('')
  return (
    <input
      type="text"
      className="sink-input font-mincho"
      value={value}
      maxLength={120}
      placeholder="気になったことを一行だけ書いて、沈める"
      aria-label="沈めたいことを書いて Enter"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return // 日本語の変換確定の Enter では沈めない
        if (e.key === 'Enter') {
          onSink(value.trim() || null)
          setValue('')
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setValue('')
          e.currentTarget.blur()
        }
      }}
    />
  )
}

// 浮上画面の「今回沈めたもの」。中身は端末の中だけにあり、ここで手放せる
function SunkSummary({ count, thoughts, onRelease }: { count: number, thoughts: SunkThought[], onRelease: () => void }) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null
  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div className="font-mincho" style={{ fontSize: 12, letterSpacing: '0.1em', opacity: 0.7 }}>
        今回、{count}つのもやもやを深海に置いてきた
      </div>
      {thoughts.length > 0 ? (
        <>
          <button type="button" className="hud-btn" style={{ textTransform: 'none', letterSpacing: '0.1em' }} onClick={() => setOpen((v) => !v)}>
            <span className="font-mincho">{open ? '[ 閉じる ]' : `[ 書いたものを見る（${thoughts.length}） ]`}</span>
          </button>
          {open ? (
            <div style={{ maxWidth: 360, padding: '0 16px', textAlign: 'left' }}>
              {thoughts.map((t) => (
                <div key={t.at} className="font-mincho" style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.9 }}>・{t.text}</div>
              ))}
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <button type="button" className="hud-btn" style={{ textTransform: 'none', letterSpacing: '0.1em' }} onClick={onRelease}>
                  <span className="font-mincho">[ すべて手放す ]</span>
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function NotifyToggle({ state, onEnable, onDisable }: {
  state: NotificationState
  onEnable: () => void
  onDisable: () => void
}) {
  if (state === 'unsupported') return null
  if (state === 'blocked') {
    return (
      <div className="font-mincho" style={{ fontSize: 10, opacity: 0.4, letterSpacing: '0.08em' }}>
        通知はブラウザの設定でオフになっています
      </div>
    )
  }
  return (
    <button
      type="button"
      className="hud-btn"
      onClick={state === 'on' ? onDisable : onEnable}
      aria-pressed={state === 'on'}
      style={{ textTransform: 'none', letterSpacing: '0.1em', fontSize: 11, opacity: state === 'on' ? 0.9 : 0.6 }}
    >
      <span className="font-mincho">
        {state === 'on' ? '[ 潜航の通知：オン ]' : '[ 潜航の開始を通知する ]'}
      </span>
    </button>
  )
}

function VolumeControl({ volume, muted, onChange, onToggleMute }: {
  volume: number
  muted: boolean
  onChange: (value: number) => void
  onToggleMute: () => void
}) {
  return (
    <div className="volume-control">
      <span aria-hidden="true">vol</span>
      <input
        type="range"
        min="0" max="1" step="0.01"
        value={muted ? 0 : volume}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="volume-slider"
        aria-label="音量"
      />
      <button
        type="button"
        className="hud-btn"
        style={{ padding: 0 }}
        onClick={onToggleMute}
        aria-pressed={muted}
      >
        {muted ? '[ unmute ]' : '[ mute ]'}
      </button>
    </div>
  )
}

export function FathomApp() {
  const [city, setCity] = useState('')
  const [progress, setProgress] = useState(0)
  const [fathomMode, setFathomMode] = useState<FathomMode>('focus')
  
  const [sessionPhase, setSessionPhase] = useState<'diving' | 'interval' | 'completed'>('diving')
  const sessionPhaseRef = useRef<'diving' | 'interval' | 'completed'>('diving')
  
  const [resonancePulse, setResonancePulse] = useState(0)
  const [resonanceEnergy, setResonanceEnergy] = useState(0.14)

  const [tuningValue, setTuningValue] = useState(50)
  const [isTuning, setIsTuning] = useState(false)

  const [hasDescended, setHasDescended] = useState(false)
  const [beaconLeaving, setBeaconLeaving] = useState(false)
  const [beaconMounted, setBeaconMounted] = useState(true)

  const [channelMode, setChannelMode] = useState<'global' | 'resonance'>('global')
  const [linkedPeers, setLinkedPeers] = useState<Set<string>>(new Set())
  const [linkInputError, setLinkInputError] = useState(false)

  const [ripples, setRipples] = useState<{id: number, pan: number}[]>([])

  const [elapsedMs, setElapsedMs] = useState(0)
  const [showClock, setShowClock] = useState(true)
  const [volume, setVolumeState] = useState(DEFAULT_MASTER_VOLUME)
  const [muted, setMuted] = useState(false)

  // 定時潜航
  const [landingView, setLandingView] = useState<'scheduled' | 'solo'>('scheduled')
  const [scheduledWaiting, setScheduledWaiting] = useState(false)
  const [lastDiveCount, setLastDiveCount] = useState(1)
  const maxDiversRef = useRef(1)

  const { seed: selfId, isLoading: isSeedLoading, restoreSeed } = useSelfSeed()
  const [showRestoreModal, setShowRestoreModal] = useState(false)

  const identity = useMemo(() => {
    if (!selfId) return makeCrystalIdentity('fathom-loading-seed')
    return makeCrystalIdentity(selfId)
  }, [selfId])

  const descentCtl = useFathomDescent({ durationMs: 8000 })
  const { descent, phase, begin: beginDescent } = descentCtl
  const settled = descent >= 1

  // 定時潜航では、その時間の海（全員共通）の天気を聴く
  const scheduleActive = fathomMode === 'scheduled' || (beaconMounted && landingView === 'scheduled')
  const schedule = useDiveSchedule(scheduleActive)
  useEffect(() => {
    if (scheduleActive) setCity(schedule.port.query)
  }, [scheduleActive, schedule.port.query])

  const { data, loading } = useWeather(city)

  const windSpeed = data?.windSpeed ?? 4.2
  const rainAmount = (data?.rain1h ?? 0) + (data?.rain3h ?? 0)
  const snowAmount = data?.snow1h ?? 0
  const clouds = data?.clouds ?? 42
  
  const surfaceTemp = data?.temp ?? 15.0
  const waterTemp = useMemo(() => {
    return surfaceTemp - ((surfaceTemp - 2.0) * progress)
  }, [surfaceTemp, progress])

  const weatherSnapshot = useMemo(() => {
    if (!data) return null
    return { city: data.city, windSpeed, rainAmount, clouds, temp: data.temp, description: data.description } as Record<string, unknown>
  }, [clouds, data, rainAmount, windSpeed])

  // 定時潜航中の進み具合 0..1（音の流れと、頭上の海面の光に使う）
  const scheduledDiveFraction = fathomMode === 'scheduled' && hasDescended && sessionPhase === 'diving' && schedule.phase === 'diving'
    ? schedule.elapsedInPhase / SCHEDULED_DIVE_MS
    : null
  const surfaceOutro = scheduledDiveFraction != null ? Math.max(0, Math.min(1, (scheduledDiveFraction - 0.96) / 0.04)) : 0

  // 長押しは休憩中の深呼吸（4 秒吸って、離して吐く）
  const { isCharging, chargeProgress, turbidity, startCharge, stopCharge } = useAbyssalOverload({
    chargeTimeRequired: 4000,
    onReleaseSuccess: () => {
      setProgress(prev => Math.max(0, prev - 0.08))

      audio.triggerOverloadSonar()
      setResonancePulse(Date.now())
      if (sendResonance) sendResonance(1.0)

      audio.triggerIceBreak()
    }
  })

  const audio = useDeepSeaAudio({ 
    enabled: true, 
    progress, 
    windSpeed,
    rainAmount,
    snowAmount,
    clouds,
    temp: surfaceTemp,
    descent,
    isCharging,
    turbidity,
    focusMix: fathomMode === 'scheduled',
    diveFraction: scheduledDiveFraction,
  })
  
  const { diveTimeMs } = useFathomMemory(audio.running && settled, selfId)

  const driftElapsedRef = useRef(0)

  // 表示設定（時計・音量）を復元
  useEffect(() => {
    if (readPref(CLOCK_PREF_KEY) === 'hidden') setShowClock(false)
    const storedVolume = parseFloat(readPref(VOLUME_PREF_KEY) ?? '')
    if (Number.isFinite(storedVolume)) setVolumeState(Math.max(0, Math.min(1, storedVolume)))
  }, [])

  const { setVolume } = audio
  useEffect(() => {
    setVolume(muted ? 0 : volume)
  }, [muted, setVolume, volume])

  const handleVolumeChange = useCallback((value: number) => {
    setVolumeState(value)
    setMuted(false)
    writePref(VOLUME_PREF_KEY, String(value))
  }, [])

  const toggleClock = useCallback(() => {
    setShowClock(prev => {
      writePref(CLOCK_PREF_KEY, prev ? 'hidden' : 'shown')
      return !prev
    })
  }, [])

  useEffect(() => {
    const nav = navigator as any
    let wakeLock: any = null
    const requestWakeLock = async () => {
      if ('wakeLock' in nav && audio.running) {
        try { wakeLock = await nav.wakeLock.request('screen') } catch (err: any) {}
      }
    }
    const releaseWakeLock = async () => {
      if (wakeLock !== null) {
        try { await wakeLock.release(); wakeLock = null } catch (err: any) {}
      }
    }
    if (audio.running) { requestWakeLock() } else { releaseWakeLock() }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && audio.running) requestWakeLock()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      releaseWakeLock()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [audio.running])

  useEffect(() => {
    if (!settled || !audio.running) return
    let lastTick = Date.now()
    const INITIAL_DEPTH = fathomMode === 'sleep' ? 0.25 : 0.18

    const timer = window.setInterval(() => {
      const now = Date.now()
      const delta = now - lastTick
      lastTick = now
      driftElapsedRef.current += delta

      let newPhase: 'diving' | 'interval' | 'completed' = 'diving'
      let currentDepth = INITIAL_DEPTH

      if (fathomMode === 'scheduled') {
        // 定時潜航は自分の経過時間ではなく、全員共通の時計で深さが決まる
        const s = getScheduleState(now)
        if (s.phase === 'diving') {
          newPhase = 'diving'
          currentDepth = INITIAL_DEPTH + (1.0 - INITIAL_DEPTH) * (s.elapsedInPhase / SCHEDULED_DIVE_MS)
        } else {
          newPhase = 'interval'
          currentDepth = 1.0 - (1.0 - INITIAL_DEPTH) * (s.elapsedInPhase / SCHEDULED_BREAK_MS)
        }
      } else if (fathomMode === 'meditate') {
        if (driftElapsedRef.current < WORK_MS) {
          newPhase = 'diving'
          currentDepth = INITIAL_DEPTH + (1.0 - INITIAL_DEPTH) * (driftElapsedRef.current / WORK_MS)
        } else if (driftElapsedRef.current < WORK_MS + BREAK_MS) {
          newPhase = 'interval'
          const breakRatio = (driftElapsedRef.current - WORK_MS) / BREAK_MS
          currentDepth = 1.0 - (1.0 - INITIAL_DEPTH) * breakRatio 
        } else {
          newPhase = 'completed'
          currentDepth = INITIAL_DEPTH
        }
      } else {
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
      setElapsedMs(driftElapsedRef.current)
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

  // audio は毎レンダー新しいオブジェクトになるため、フェーズが変わった瞬間だけ鳴らす
  const announcedPhaseRef = useRef(sessionPhase)
  useEffect(() => {
    if (announcedPhaseRef.current === sessionPhase) return
    announcedPhaseRef.current = sessionPhase
    if (sessionPhase === 'interval') {
      audio.triggerFrictionImpulse({ intensity: 0.6, durationMs: 300, color: 0.1 })
      triggerResonance(0.8)
      if (fathomMode === 'scheduled') setLastDiveCount(maxDiversRef.current)
    } else if (sessionPhase === 'diving' && fathomMode === 'scheduled') {
      // 次の定時潜航が始まった合図（全員同時に鳴る）
      maxDiversRef.current = 1
      audio.triggerFrictionImpulse({ intensity: 0.5, durationMs: 400, color: 0.3 })
      triggerResonance(0.5)
    } else if (sessionPhase === 'completed' && fathomMode !== 'sleep') {
      audio.triggerFrictionImpulse({ intensity: 0.4, durationMs: 500, color: 0.5 })
      triggerResonance(0.4)
    }
  }, [sessionPhase, audio, triggerResonance, fathomMode])

  const handleDiveAgain = useCallback(() => {
    driftElapsedRef.current = 0
    sessionPhaseRef.current = 'diving'
    setSessionPhase('diving')
    setElapsedMs(0)
    setProgress(0.18)
    audio.triggerFrictionImpulse({ intensity: 0.4, durationMs: 150, color: 0.8 })
    triggerResonance(0.3)
  }, [audio, triggerResonance])

  const handleRemoteResonance = useCallback((payload: ResonancePulsePayload) => {
    const peerSeed = (payload as any).senderId || (payload as any).letterId || 'anonymous-tide-seed'
    const peerDepth = (payload as any).depth ?? progress 
    // 定時潜航（集中）では、他の人の共鳴は遠くでかすかに届く程度にする
    const volumeDamp = fathomMode === 'meditate' ? 1.0 : fathomMode === 'scheduled' ? 0.3 : 0.5
    const damped = Math.max(0.1, Math.min(0.4, payload.energy * 0.6)) * volumeDamp
    const panValue = audio.triggerSpatialResonance(peerSeed, peerDepth, damped)
    triggerResonance(damped)
    const rippleId = Date.now() + Math.random()
    setRipples(prev => [...prev, { id: rippleId, pan: panValue }])
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== rippleId))
    }, 3500)
  }, [audio, triggerResonance, fathomMode, progress])

  // Presence に載せる自分の状態。待機中・潜航中の人数を数えるのに使う
  const presenceStatus = fathomMode === 'scheduled'
    ? (hasDescended && sessionPhase !== 'interval' ? 'diving' : 'waiting')
    : (hasDescended ? 'solo' : 'landing')

  const { latestHeatmapPulse, sendResonance, presenceCount, presenceByStatus } = useRealtimeLetters({
    roomId: ROOM_ID, selfId: selfId || 'loading', selfName: 'visitor', city: data?.city, depth: progress, descent,
    currentWeatherSnapshot: weatherSnapshot, preferredLang: null, onRemoteResonance: handleRemoteResonance,
    enableFirstSurfacing: false,
    firstSurfacingGraceMs: 1600,
    presenceStatus,
  })

  // 自分を含む人数。Realtime が繋がらないときも自分 1 人として扱う
  const diversNow = Math.max(1, presenceByStatus.diving ?? 0)
  const waitersNow = Math.max(1, presenceByStatus.waiting ?? 0)
  const isScheduledDiving = fathomMode === 'scheduled' && hasDescended && sessionPhase === 'diving'
  useEffect(() => {
    if (isScheduledDiving) maxDiversRef.current = Math.max(maxDiversRef.current, diversNow)
  }, [isScheduledDiving, diversNow])

  // 潜航 1 回ごとの記録（検証用の数字と「今週 N人」の元データ）
  const currentPortName = fathomMode === 'scheduled'
    ? schedule.port.name
    : (PORTS.find((p) => p.query === city)?.name ?? null)
  useDiveLog(hasDescended && settled && sessionPhase === 'diving', {
    seed: selfId,
    mode: fathomMode,
    port: currentPortName,
    slotStart: fathomMode === 'scheduled' ? schedule.diveStartsAt : null,
  })
  const diveStats = useDiveStats(beaconMounted && landingView === 'scheduled')

  // 潜航カード用に、潜り始めた時点の情報を覚えておき、浮上した時点で確定させる
  const isDivingNow = hasDescended && settled && sessionPhase === 'diving'
  const diveStartRef = useRef<{ at: number, cardAt: number, portLabel: string, portName: string } | null>(null)
  const [lastDive, setLastDive] = useState<DiveCardInfo | null>(null)
  useEffect(() => {
    if (isDivingNow) {
      sunkCountRef.current = 0
      setSunkCount(0)
      setDiveThoughts([])
      const port = fathomMode === 'scheduled' ? schedule.port : PORTS.find((p) => p.query === city)
      diveStartRef.current = {
        at: Date.now(),
        cardAt: fathomMode === 'scheduled' ? schedule.diveStartsAt : Date.now(),
        portLabel: port?.label ?? data?.city ?? '',
        portName: port?.name ?? data?.city ?? 'sea',
      }
      return
    }
    const start = diveStartRef.current
    if (!start) return
    diveStartRef.current = null
    setLastDive({
      startedAt: start.cardAt,
      minutes: Math.max(1, Math.round((Date.now() - start.at) / 60000)),
      modeLabel: MODE_LABELS[fathomMode],
      portLabel: start.portLabel,
      portName: start.portName,
      weather: data && data.temp != null ? { windSpeed: data.windSpeed, temp: data.temp } : null,
      companions: fathomMode === 'scheduled' ? maxDiversRef.current : 1,
      sunk: sunkCountRef.current,
    })
    // 潜航の開始・終了の瞬間だけ反応させる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDivingNow])

  // 潜航中に湧いたもやもやを「沈める」。タップ（または Space）だけでも、一行書いて Enter でもよい
  const [sinkPulse, setSinkPulse] = useState(0)
  const [sunkCount, setSunkCount] = useState(0)
  const sunkCountRef = useRef(0)
  const [diveThoughts, setDiveThoughts] = useState<SunkThought[]>([])
  const canSink = isDivingNow && fathomMode !== 'sleep'
  const canBreathe = hasDescended && settled && (sessionPhase === 'interval' || fathomMode === 'meditate' || fathomMode === 'sleep')

  const sinkThought = useCallback((text: string | null) => {
    setSinkPulse((p) => p + 1)
    sunkCountRef.current += 1
    setSunkCount(sunkCountRef.current)
    audio.triggerSink()
    if (text) {
      const thought = saveThought(text)
      setDiveThoughts((prev) => [...prev, thought])
    }
  }, [audio])

  const handleReleaseThoughts = useCallback(() => {
    releaseThoughts(diveThoughts.map((t) => t.at))
    setDiveThoughts([])
  }, [diveThoughts])

  // 灯りの操作：短く触れたら「沈める」、休憩中に長押ししたら深呼吸
  const pressStartRef = useRef<number | null>(null)
  const handleCrystalDown = useCallback(() => {
    pressStartRef.current = performance.now()
    if (canBreathe) startCharge()
  }, [canBreathe, startCharge])
  const handleCrystalUp = useCallback(() => {
    const startedAt = pressStartRef.current
    pressStartRef.current = null
    if (startedAt == null) return
    if (canBreathe) stopCharge()
    if (performance.now() - startedAt < 300 && canSink) sinkThought(null)
  }, [canBreathe, canSink, sinkThought, stopCharge])
  const handleCrystalCancel = useCallback(() => {
    pressStartRef.current = null
    if (isCharging) stopCharge()
  }, [isCharging, stopCharge])

  // 入力欄の外で Space を押したら、書かずにそのまま沈める
  useEffect(() => {
    if (!canSink) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.isComposing) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.isContentEditable)) return
      e.preventDefault()
      sinkThought(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canSink, sinkThought])

  // Stripe の支払い完了後に ?thanks=1 で戻ってきたら、ひとことお礼を出す
  const [showThanks, setShowThanks] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('thanks')) return
    setShowThanks(true)
    window.history.replaceState(null, '', window.location.pathname)
    const id = window.setTimeout(() => setShowThanks(false), 8000)
    return () => window.clearTimeout(id)
  }, [])

  // タブが裏にあるとき用の通知。定時潜航に参加している人にだけ、時刻の節目で出す
  const notifications = useDiveNotifications()
  const { notify } = notifications
  const notifyToggle = (
    <NotifyToggle state={notifications.state} onEnable={() => void notifications.enable()} onDisable={notifications.disable} />
  )
  const joinedScheduled = fathomMode === 'scheduled' && (hasDescended || scheduledWaiting)
  const prevScheduleRef = useRef(schedule)
  useEffect(() => {
    const prev = prevScheduleRef.current
    prevScheduleRef.current = schedule
    if (!joinedScheduled) return
    const where = schedule.port.label
    if (schedule.phase === 'surfacing' && prev.phase === 'surfacing' && prev.remainingInPhase > 60_000 && schedule.remainingInPhase <= 60_000) {
      void notify('まもなく潜航（1分前）', `${formatClockTime(schedule.diveStartsAt)} ・ ${where}`)
    } else if (prev.phase === 'surfacing' && schedule.phase === 'diving') {
      void notify('潜航開始', `${where} ・ 25分`)
    } else if (prev.phase === 'diving' && schedule.phase === 'surfacing') {
      void notify('浮上しました', `5分休憩。次の潜航 ${formatClockTime(schedule.diveStartsAt)}`)
    }
  }, [joinedScheduled, notify, schedule])

  // ソロ潜航の区切りも、裏のタブにいる人に知らせる
  const prevSessionPhaseRef = useRef(sessionPhase)
  useEffect(() => {
    const prev = prevSessionPhaseRef.current
    prevSessionPhaseRef.current = sessionPhase
    if (fathomMode === 'scheduled' || prev === sessionPhase) return
    if (sessionPhase === 'completed') void notify('潜航を終えました', '水面に戻って、ひと息ついて。')
    else if (sessionPhase === 'interval') void notify('浮上しました', '5分休憩。息を整えて。')
  }, [fathomMode, notify, sessionPhase])

  // タブの名前に残り時間を出す（裏のタブからでも次の潜航が分かるように）
  const defaultTitleRef = useRef<string | null>(null)
  useEffect(() => {
    if (defaultTitleRef.current == null) defaultTitleRef.current = document.title
    let prefix: string | null = null
    if (joinedScheduled) {
      const waiting = scheduledWaiting || sessionPhase === 'interval'
      prefix = `(${formatClock(schedule.remainingInPhase)}) ${waiting ? '次の潜航' : '潜航中'}`
    } else if (hasDescended && settled && sessionPhase !== 'completed') {
      prefix = `(${formatClock(remainingSessionMs(fathomMode, elapsedMs))})`
    }
    document.title = prefix ? `${prefix} · Fathom` : defaultTitleRef.current
  })

  const leaveLanding = useCallback(() => {
    setBeaconLeaving(true)
    void audio.resume()
    triggerResonance(0.22)
    window.setTimeout(() => setBeaconMounted(false), 650)
  }, [audio, triggerResonance])

  // 定時潜航に参加。潜航中なら途中から合流し、浮上中なら水面で次の潜航を待つ
  const handleJoinScheduled = useCallback(() => {
    if (hasDescended || scheduledWaiting) return
    setFathomMode('scheduled')
    leaveLanding()
    if (getScheduleState().phase === 'diving') {
      setHasDescended(true)
      beginDescent()
    } else {
      setScheduledWaiting(true)
    }
  }, [beginDescent, hasDescended, leaveLanding, scheduledWaiting])

  // 水面で待っている人は、潜航の時刻になったら全員一斉に沈み始める
  useEffect(() => {
    if (!scheduledWaiting || schedule.phase !== 'diving') return
    setScheduledWaiting(false)
    setHasDescended(true)
    beginDescent()
    audio.triggerFrictionImpulse({ intensity: 0.5, durationMs: 400, color: 0.3 })
    triggerResonance(0.5)
  }, [audio, beginDescent, schedule.phase, scheduledWaiting, triggerResonance])

  const handleDescend = useCallback((selectedMode: FathomMode) => {
    if (hasDescended) return
    setFathomMode(selectedMode)
    setHasDescended(true)
    setBeaconLeaving(true)
    beginDescent()
    void audio.resume()
    triggerResonance(0.22)
    window.setTimeout(() => setBeaconMounted(false), 650)
  }, [audio, beginDescent, hasDescended, triggerResonance])

  const uiOpacity = useMemo(() => {
    if (fathomMode !== 'sleep' || !settled) return 1.0
    return Math.max(0.08, 1.0 - (Math.max(0, (progress - 0.25) / 0.75)) * 1.5)
  }, [fathomMode, settled, progress])

  const currentPressure = (1 + progress * 10).toFixed(2)

  if (isSeedLoading || !selfId) {
    return (
       <main className="scene-root" style={{ background: '#02050a' }}>
         <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.2em' }}>
           synchronizing deep sea seed...
         </div>
       </main>
    )
  }

  return (
    <main className="scene-root" style={{ background: '#02050a' }}>
      <style>{hudStyles}</style>

      {showRestoreModal && (
        <RestoreMemoryModal 
          onClose={() => setShowRestoreModal(false)} 
          onRestore={restoreSeed} 
        />
      )}

      <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }}>
        <DeepSeaCanvas
          progress={progress}
          windSpeed={windSpeed}
          rainAmount={rainAmount}
          clouds={clouds}
          resonancePulse={resonancePulse}
          resonanceEnergy={resonanceEnergy}
          identity={identity}
          heatmapPulse={latestHeatmapPulse as any} 
          descent={descent}
          temp={surfaceTemp} 
          isSuspended={!audio.running}
          diveTimeMs={diveTimeMs}     
          releaseCount={0} // UIから消したので使用しない
          sessionPhase={sessionPhase} 
          isCharging={isCharging}       
          turbidity={turbidity}         
          onChargeStart={handleCrystalDown}
          onChargeStop={handleCrystalUp}
          onChargeCancel={handleCrystalCancel}
          tuningValue={tuningValue}
          isTuning={isTuning}
          companionCount={joinedScheduled ? (sessionPhase === 'interval' || scheduledWaiting ? waitersNow : diversNow) - 1 : 0}
          surfaceOutro={surfaceOutro}
          sinkPulse={sinkPulse}
        />
      </div>

      <div className="scene-vignette" />

      <EdgeResonanceOverlay ripples={ripples} />

      {/* 休憩中は、灯りの上に浮上画面の文字が重なるので、ボタン以外ならどこを長押ししても深呼吸できるようにする */}
      {hasDescended && settled && sessionPhase === 'interval' ? (
        <div
          className="breath-catcher"
          onPointerDown={handleCrystalDown}
          onPointerUp={handleCrystalUp}
          onPointerLeave={handleCrystalCancel}
          onPointerCancel={handleCrystalCancel}
        />
      ) : null}

      <div className="fathom-logo" style={{ opacity: beaconMounted ? 1 : Math.max(0.3, uiOpacity) }}>
        F A T H O M
      </div>

      {beaconMounted && landingView === 'scheduled' ? (
        <ScheduledDiveStage
          schedule={schedule}
          weather={data && data.temp != null ? { windSpeed: data.windSpeed, temp: data.temp } : null}
          othersDiving={presenceByStatus.diving ?? 0}
          othersWaiting={presenceByStatus.waiting ?? 0}
          weeklyDivers={diveStats.divers7d}
          notifyToggle={notifyToggle}
          onJoin={handleJoinScheduled}
          onSolo={() => setLandingView('solo')}
          onOpenRestore={() => setShowRestoreModal(true)}
          isLeaving={beaconLeaving}
        />
      ) : null}

      {beaconMounted && landingView === 'solo' ? (
        <BeaconTuningStage
          onDescend={handleDescend}
          onOpenRestore={() => setShowRestoreModal(true)}
          onBack={() => setLandingView('scheduled')}
          isLeaving={beaconLeaving}
          targetCity={city} 
          resolvedCity={data?.city ?? null} 
          isLoading={loading} 
          onSearch={(c: string) => setCity(c)}
          onTuningChange={(val: number, tuning: boolean) => {
            setTuningValue(val)
            setIsTuning(tuning)
          }}
          onCitySnap={() => triggerResonance(0.4)}
        />
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

        {scheduledWaiting ? (
          <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', width: '100%', pointerEvents: 'auto' }}>
            <p className="font-mincho" style={{ fontSize: '15px', lineHeight: '2.6', color: 'rgba(255,255,255,0.85)' }}>
              水面で、次の潜航を待っています。<br/>{schedule.port.label}
            </p>
            <div className="scheduled-clock" style={{ marginTop: 20 }}>
              {formatClockTime(schedule.diveStartsAt)} 潜航開始 ・ あと {formatClock(schedule.remainingInPhase)}
            </div>
            <div className="font-mincho scheduled-count" style={{ marginTop: 10 }}>
              {waitersNow > 1 ? `ほかに ${waitersNow - 1}人が水面で待っています` : 'まだ誰もいない水面。最初のひとりです。'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
              <VolumeControl volume={volume} muted={muted} onChange={handleVolumeChange} onToggleMute={() => setMuted(prev => !prev)} />
            </div>
            <div style={{ marginTop: 8 }}>{notifyToggle}</div>
          </div>
        ) : null}

        {hasDescended && settled && sessionPhase === 'interval' && fathomMode === 'scheduled' ? (
          <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', width: '100%', opacity: 1, transition: 'opacity 3s ease' }}>
            <p className="font-mincho" style={{ fontSize: '15px', lineHeight: '2.6', color: 'rgba(143,216,255,0.85)' }}>
              {lastDiveCount > 1 ? `今回は ${lastDiveCount}人と潜りました。` : '今回は、貸し切りの海でした。'}<br/>水面で息を整えて。
            </p>
            <div className="scheduled-clock" style={{ marginTop: 20 }}>
              次の潜航 {formatClockTime(schedule.diveStartsAt)} ・ あと {formatClock(schedule.remainingInPhase)}
            </div>
            <div className="font-mincho" style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
              {schedule.port.label}
            </div>
            {/* 文字の部分は灯りへの長押し（深呼吸）を邪魔しないよう素通しにし、ボタンだけ押せるようにする */}
            <div style={{ pointerEvents: 'auto', display: 'inline-block' }}>
              <SunkSummary count={lastDive?.sunk ?? 0} thoughts={diveThoughts} onRelease={handleReleaseThoughts} />
              {lastDive ? <DiveShareActions info={lastDive} /> : null}
              <div style={{ marginTop: 12 }}>{notifyToggle}</div>
            </div>
          </div>
        ) : null}

        {isCharging ? (
          <div className="breath-guide font-mincho">
            {chargeProgress < 1 ? '吸って……' : '離して、ゆっくり吐く'}
          </div>
        ) : null}

        {hasDescended && settled && sessionPhase === 'interval' && fathomMode !== 'scheduled' ? (
          <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', width: '100%', opacity: 1, transition: 'opacity 3s ease' }}>
            <p className="font-mincho" style={{ fontSize: '15px', lineHeight: '2.6', color: 'rgba(143,216,255,0.85)' }}>
              深く潜りすぎた思考を、一度水面へ。<br/>ゆっくりと光の中へ浮上します。
            </p>
            <div style={{ marginTop: 24, opacity: 0.5, letterSpacing: '0.1em', fontSize: 11, fontFamily: 'monospace' }}>decompressing — {Math.round(progress * 100)}%</div>
          </div>
        ) : null}

        {hasDescended && settled && sessionPhase === 'completed' && fathomMode !== 'sleep' ? (
          <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', width: '100%' }}>
            <p className="font-mincho" style={{ fontSize: '15px', lineHeight: '2.6', color: 'rgba(255,255,255,0.85)', marginBottom: 32 }}>
              {fathomMode === 'meditate' ? (
                <>水面に到達しました。<br/>息を整え、次の深淵へ。</>
              ) : (
                <>90分の潜航を終えました。<br/>深海で得た思考を、そっと持ち帰って。</>
              )}
            </p>
            <div style={{ pointerEvents: 'auto', display: 'inline-block' }}>
              <button className="hud-btn" onClick={handleDiveAgain} style={{ fontSize: 12, padding: '8px 24px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 24 }}>
                [ descend again ]
              </button>
              <SunkSummary count={lastDive?.sunk ?? 0} thoughts={diveThoughts} onRelease={handleReleaseThoughts} />
              {lastDive ? <DiveShareActions info={lastDive} /> : null}
            </div>
          </div>
        ) : null}

        {showThanks ? (
          <div className="font-mincho" style={{ position: 'absolute', top: 72, left: 0, right: 0, textAlign: 'center', fontSize: 13, letterSpacing: '0.1em', color: 'rgba(143, 216, 255, 0.9)' }}>
            灯りをありがとう。深海が、少しだけ明るくなりました。
          </div>
        ) : null}

        {hasDescended && settled ? (
          <>
            <div className={`hud-top-left ${visibilityClass(settled, 1)}`}>
              <div style={{ opacity: 0.4, marginBottom: 8, fontSize: '0.9em' }}>[ SURFACE ]</div>
              {progress > 0.7 ? (
                <div className="glitch-text" style={{ fontSize: '11px', marginTop: 12, letterSpacing: '0.2em' }}>
                  [ SURFACE SIGNAL LOST ]
                </div>
              ) : (
                <div style={{ opacity: 1.0 - (progress * 1.5) }}>
                  <div style={{ marginBottom: 4 }}>Origin: {data?.city ?? 'Unknown'}</div>
                  <div style={{ marginBottom: 4 }}>Surface Noise: {windSpeed.toFixed(1)} m/s</div>
                  <div>Surface Temp: {surfaceTemp.toFixed(1)}°C</div>
                </div>
              )}
            </div>

            <div className={`hud-bottom-left ${visibilityClass(settled, 2)}`}>
              <div style={{ opacity: 0.4, marginBottom: 8, fontSize: '0.9em' }}>
                {sessionPhase === 'interval' ? '[ DECOMPRESSION ]' : '[ ABYSS ]'}
              </div>
              <button
                type="button"
                className="hud-btn hud-clock"
                onClick={toggleClock}
                aria-pressed={showClock}
              >
                {showClock
                  ? `${sessionPhase === 'interval' ? (fathomMode === 'scheduled' ? 'Next Dive' : 'Break') : 'Time Left'}: ${formatClock(remainingSessionMs(fathomMode, elapsedMs))}`
                  : '[ show time ]'}
              </button>
              <div style={{ marginBottom: 4, color: '#8fd8ff' }}>Current Depth: {Math.round(progress * 100)}%</div>
              {/* 定時潜航では集中の邪魔にならないよう、計器と座標は出さない */}
              {fathomMode !== 'scheduled' ? (
                <>
                  <div style={{ marginBottom: 4 }}>Pressure: {currentPressure} atm</div>
                  <div style={{ marginBottom: 12, color: progress > 0.8 ? '#aaddff' : 'inherit' }}>
                    Water Temp: {waterTemp.toFixed(1)}°C
                  </div>

                  <div style={{ opacity: 0.4, marginBottom: 4, fontSize: '0.9em' }}>[ COORDINATE ]</div>
                  <div style={{ marginBottom: 8 }}>{selfId.replace(/-/g, ' ')}</div>
                  <button className="hud-btn" onClick={() => downloadCrystalMemory(selfId, progress)} style={{ padding: 0, textTransform: 'lowercase', display: 'block', marginBottom: 16 }}>save as memory</button>
                </>
              ) : null}
            </div>

            {fathomMode === 'scheduled' ? (
              <div className={`hud-top-right ${visibilityClass(settled, 3)}`} style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.15em', opacity: 0.5, marginBottom: 6 }}>
                  {sessionPhase === 'interval'
                    ? `[ 次の潜航 ${formatClockTime(schedule.diveStartsAt)} ]`
                    : `[ ${formatClockTime(schedule.diveStartsAt)} の定時潜航 ]`}
                </div>
                <div className="font-mincho" style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                  {schedule.port.label}
                </div>
                <div className="font-mincho" style={{ fontSize: 12, color: '#8fd8ff', opacity: 0.85 }}>
                  {sessionPhase === 'interval'
                    ? (waitersNow > 1 ? `水面に ${waitersNow}人` : '水面にあなたひとり')
                    : (diversNow > 1 ? `一緒に潜航中 : ${diversNow}人` : 'いまは貸し切りの海')}
                </div>
                {turbidity > 0.8 && (
                  <div style={{ color: 'rgba(255,100,100,0.8)', fontSize: '10px', marginTop: 8 }} className="animate-pulse">
                    Turbulence blocking signals...
                  </div>
                )}
              </div>
            ) : (
            <div className={`hud-top-right ${visibilityClass(settled, 3)}`}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8, width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
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
                  [ SYNC: {linkedPeers.size} ]
                </button>
              </div>

              {channelMode === 'global' ? (
                <div style={{ textAlign: 'right', marginTop: 16 }}>
                  <div style={{ opacity: 0.5, fontSize: '10px', letterSpacing: '0.1em', fontFamily: 'monospace', marginBottom: 4 }}>
                    listening to anonymous tide...
                  </div>
                  <div className="font-mincho" style={{ fontSize: '11px', opacity: 0.4, marginTop: 12 }}>
                    Active Divers : {presenceCount ?? 1}
                  </div>
                  {turbidity > 0.8 && (
                    <div style={{ color: 'rgba(255,100,100,0.8)', fontSize: '10px', marginTop: 8 }} className="animate-pulse">
                      Turbulence blocking signals...
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <input
                    type="text"
                    placeholder="enter your coordinate"
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
                      marginBottom: 8,
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
                  <div style={{ opacity: 0.4, fontSize: '10px', marginTop: 4, textAlign: 'right', fontFamily: 'monospace' }}>
                    Sonar will only reach synced coordinates.
                  </div>
                </div>
              )}
            </div>
            )}

            {sessionPhase === 'interval' ? (
              <div className={`hud-bottom-center ${visibilityClass(settled, 4)}`}>
                <div style={{ opacity: 0.5, fontSize: 11, letterSpacing: '0.1em', marginBottom: 24 }} className="font-mincho">
                  （ 減圧中：画面を長押しして、深呼吸を ）
                </div>
              </div>
            ) : null}

            {canSink ? (
              <div className={`hud-bottom-center ${visibilityClass(settled, 4)}`}>
                <SinkInput onSink={sinkThought} />
                <div className="font-mincho sink-hint">
                  浮かんだもやもやは、灯りに触れる（Space）か、書いて Enter で深海に沈める
                </div>
              </div>
            ) : null}

            <div className={`hud-bottom-right ${visibilityClass(settled, 4)}`}>
              {canBreathe ? (
                <div className="font-mincho" style={{ opacity: 0.4, fontSize: '10px', letterSpacing: '0.12em', marginBottom: 12 }}>
                  {sessionPhase === 'interval' ? '長押し：深呼吸' : '灯りを長押し：深呼吸'}
                </div>
              ) : null}
              <VolumeControl volume={volume} muted={muted} onChange={handleVolumeChange} onToggleMute={() => setMuted(prev => !prev)} />
              <div style={{ display: 'flex', gap: 24 }}>
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