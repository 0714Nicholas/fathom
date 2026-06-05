'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  buildHandwrittenLayout,
  loadOpenTypeFont,
  type HandwrittenLayout,
  type RawStroke,
} from '@/lib/handwriting/opentypeLayout'

type StrokeImpulsePayload = {
  char: string
  glyphIndex: number
  strokeIndex: number
  intensity: number
  durationMs: number
  progressInStroke: number
}

type StrokePlan = {
  id: string
  stroke: RawStroke
  length: number
  delay: number
  duration: number
  strokeWidth: number
  opacity: number
  ease: [number, number, number, number]
}

export type HandwrittenLetterProps = {
  text: string
  fontUrl: string
  fontSize?: number
  lineHeight?: number
  letterSpacing?: number
  className?: string
  strokeColor?: string
  glowColor?: string
  strokeWidth?: number
  paddingX?: number
  paddingY?: number
  animateKey?: string | number
  onStrokeImpulse?: (payload: StrokeImpulsePayload) => void
  onComplete?: () => void
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function seededUnit(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123
  return x - Math.floor(x)
}

function glyphSeed(stroke: RawStroke) {
  const code = stroke.char?.charCodeAt(0) ?? 0
  return (stroke.glyphIndex + 1) * 97 + (stroke.strokeIndex + 1) * 31 + code * 0.17
}

function punctuationPause(char: string) {
  if (!char) return 0
  if (/[,.、。]/.test(char)) return 0.16
  if (/[;:;:]/.test(char)) return 0.13
  if (/[!?!?]/.test(char)) return 0.22
  return 0
}

function whitespacePause(advance: number, fontSize: number) {
  const normalized = advance / Math.max(fontSize, 1)
  return clamp(0.04 + normalized * 0.03, 0.045, 0.16)
}

function estimateLengthFromComplexity(stroke: RawStroke, fontSize: number) {
  const base = stroke.complexity * fontSize * 0.28
  return clamp(base, 18, 260)
}

function buildStrokePlans(
  layout: HandwrittenLayout,
  pathLengths: Record<string, number>,
  baseStrokeWidth: number,
  fontSize: number
): StrokePlan[] {
  const plans: StrokePlan[] = []
  let cursor = 0
  
  // ★ ここがスピードアップの鍵。1.0でリアルタイム、0.35で約3倍速のサクサク描画になる
  const SPEED_SCALE = 0.35 

  for (const stroke of layout.strokes) {
    if (stroke.isWhitespace) {
      cursor += whitespacePause(stroke.advance, fontSize) * SPEED_SCALE
      continue
    }

    const seed = glyphSeed(stroke)
    const n1 = seededUnit(seed)
    const n2 = seededUnit(seed + 1.113)
    const n3 = seededUnit(seed + 2.271)

    const length =
      pathLengths[stroke.id] ?? estimateLengthFromComplexity(stroke, fontSize)

    const baseDuration = clamp(length / 190, 0.14, 0.95)
    const humanVariance = 0.86 + n1 * 0.34
    const curvePenalty = clamp((stroke.complexity - 2) * 0.018, 0, 0.12)
    
    // スピードスケールを適用
    const duration = clamp(baseDuration * humanVariance + curvePenalty, 0.12, 1.08) * SPEED_SCALE

    const intraStrokeDelay =
      (stroke.strokeIndex === 0 ? 0 : 0.018 + n2 * 0.045) * SPEED_SCALE

    const delay = cursor + intraStrokeDelay
    const widthVariance = 0.92 + n3 * 0.2
    const strokeWidth = clamp(baseStrokeWidth * widthVariance, 0.8, baseStrokeWidth * 1.35)
    const opacity = 0.78 + seededUnit(seed + 4.217) * 0.2

    plans.push({
      id: stroke.id,
      stroke,
      length,
      delay,
      duration,
      strokeWidth,
      opacity,
      ease: [0.33, 1, 0.68, 1],
    })

    cursor = Math.max(cursor, delay + duration * 0.72)

    if (stroke.isLastStrokeInGlyph) {
      cursor += (0.012 + seededUnit(seed + 5.19) * 0.035) * SPEED_SCALE
      cursor += punctuationPause(stroke.char) * SPEED_SCALE
    }

    if (stroke.endOfLine && stroke.isLastStrokeInGlyph) {
      cursor += (0.25 + seededUnit(seed + 6.02) * 0.08) * SPEED_SCALE
    }
  }

  return plans
}

export function HandwrittenLetter({
  text,
  fontUrl,
  fontSize = 72,
  lineHeight,
  letterSpacing = 0,
  className,
  strokeColor = 'rgba(232,245,252,0.92)',
  glowColor = 'rgba(143,216,255,0.28)',
  strokeWidth = 2.15,
  paddingX = 18,
  paddingY = 18,
  animateKey,
  onStrokeImpulse,
  onComplete,
}: HandwrittenLetterProps) {
  const [layout, setLayout] = useState<HandwrittenLayout | null>(null)
  const [fontError, setFontError] = useState<string | null>(null)
  const [pathLengths, setPathLengths] = useState<Record<string, number>>({})
  const pathRefs = useRef<Map<string, SVGPathElement>>(new Map())

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        setFontError(null)
        const font = await loadOpenTypeFont(fontUrl)
        if (cancelled) return

        const nextLayout = buildHandwrittenLayout({
          text,
          font,
          fontSize,
          lineHeight,
          letterSpacing,
          paddingX,
          paddingY,
        })

        setLayout(nextLayout)
      } catch (err) {
        if (cancelled) return
        setFontError(err instanceof Error ? err.message : 'Failed to load font')
        setLayout(null)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [fontSize, fontUrl, letterSpacing, lineHeight, paddingX, paddingY, text])

  useEffect(() => {
    if (!layout) return
    pathRefs.current.clear()
    setPathLengths({})
  }, [layout, animateKey])

  useEffect(() => {
    if (!layout) return

    const raf = window.requestAnimationFrame(() => {
      const next: Record<string, number> = {}

      for (const stroke of layout.strokes) {
        if (stroke.isWhitespace || !stroke.d) continue
        const el = pathRefs.current.get(stroke.id)
        if (!el) continue

        try {
          const len = el.getTotalLength()
          next[stroke.id] = Number.isFinite(len)
            ? len
            : estimateLengthFromComplexity(stroke, fontSize)
        } catch {
          next[stroke.id] = estimateLengthFromComplexity(stroke, fontSize)
        }
      }

      setPathLengths(next)
    })

    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [layout, fontSize, animateKey])

  const plans = useMemo(() => {
    if (!layout) return []
    return buildStrokePlans(layout, pathLengths, strokeWidth, fontSize)
  }, [fontSize, layout, pathLengths, strokeWidth])

  useEffect(() => {
    if (!plans.length || !onStrokeImpulse) return

    const timers: number[] = []

    for (const plan of plans) {
      const count = clamp(Math.round(plan.length / 90), 1, 5)

      for (let i = 0; i < count; i++) {
        const t = (i + 1) / (count + 1)
        const seed = glyphSeed(plan.stroke) + i * 0.37
        const jitter = 0.96 + seededUnit(seed) * 0.16
        const whenMs = (plan.delay + plan.duration * t * jitter) * 1000

        timers.push(
          window.setTimeout(() => {
            const punctuationBoost = /[!?!?]/.test(plan.stroke.char) ? 0.07 : 0
            const intensity = clamp(
              0.18 + (plan.length / 260) * 0.22 + punctuationBoost,
              0.12,
              0.58
            )

            // 音響側の摩擦音の長さも少しスッキリさせるために短縮調整
            const durationMs = Math.round(clamp(40 + plan.length * 0.3, 40, 120))

            onStrokeImpulse({
              char: plan.stroke.char,
              glyphIndex: plan.stroke.glyphIndex,
              strokeIndex: plan.stroke.strokeIndex,
              intensity,
              durationMs,
              progressInStroke: t,
            })
          }, whenMs)
        )
      }
    }

    const endAt =
      plans.reduce((max, p) => Math.max(max, p.delay + p.duration), 0) * 1000 + 80

    if (onComplete) {
      timers.push(window.setTimeout(() => onComplete(), endAt))
    }

    return () => {
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [onComplete, onStrokeImpulse, plans])

  const instanceKey = `${animateKey ?? 'default'}::${text}`

  if (fontError) {
    return (
      <div className={className}>
        <div className="panel panel-inner small">font load error: {fontError}</div>
      </div>
    )
  }

  if (!layout) {
    return (
      <div className={className}>
        <div className="small">loading handwritten glyphs...</div>
      </div>
    )
  }

  return (
    <svg
      key={instanceKey}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className={className}
      width="100%"
      height="100%"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Handwritten animated letter"
      role="img"
    >
      <defs>
        <filter id="handwritten-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              1 0 0 0 0
              0 1 0 0 0
              0 0 1 0 0
              0 0 0 10 -2
            "
            result="glow"
          />
          <feBlend in="SourceGraphic" in2="glow" mode="screen" />
        </filter>
      </defs>

      {plans.map((plan) => {
        const key = `${instanceKey}-${plan.id}`
        const dash = Math.max(1, plan.length)

        return (
          <g key={key}>
            <motion.path
              d={plan.stroke.d}
              ref={(node) => {
                if (node) pathRefs.current.set(plan.id, node)
              }}
              initial={{ opacity: 0, strokeDasharray: dash, strokeDashoffset: dash }}
              animate={{ opacity: plan.opacity * 0.42, strokeDashoffset: 0 }}
              transition={{ delay: plan.delay, duration: plan.duration, ease: plan.ease }}
              stroke={glowColor}
              strokeWidth={plan.strokeWidth * 1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              filter="url(#handwritten-glow)"
            />

            <motion.path
              d={plan.stroke.d}
              ref={(node) => {
                if (node) pathRefs.current.set(plan.id, node)
              }}
              initial={{ opacity: 0, strokeDasharray: dash, strokeDashoffset: dash }}
              animate={{ opacity: plan.opacity, strokeDashoffset: 0 }}
              transition={{ delay: plan.delay, duration: plan.duration, ease: plan.ease }}
              stroke={strokeColor}
              strokeWidth={plan.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </svg>
  )
}