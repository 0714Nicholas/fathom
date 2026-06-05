'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type FrictionImpulseOptions = {
  intensity?: number
  durationMs?: number
  color?: number
}

export type UseDeepSeaAudioOptions = {
  enabled: boolean
  progress: number
  windSpeed: number
  rainAmount: number
  /**
   * 0..1, supplied by useFathomDescent.
   * While descending (descent < 1), gain and presence are dampened.
   * Default 1 (no effect) for backward compatibility.
   */
  descent?: number
  workletUrl?: string
  shallowCutoff?: number
  deepCutoff?: number
}

export type DeepSeaAudioController = {
  ready: boolean
  running: boolean
  meter: number
  start: () => Promise<void>
  resume: () => Promise<void>
  suspend: () => Promise<void>
  stop: () => Promise<void>
  triggerFrictionImpulse: (options?: FrictionImpulseOptions) => void
}

type AudioGraphRefs = {
  ctx: AudioContext | null
  node: AudioWorkletNode | null
  lowpass: BiquadFilterNode | null
  compressor: DynamicsCompressorNode | null
  master: GainNode | null
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function expInterpolate(from: number, to: number, t: number) {
  const safeFrom = Math.max(1, from)
  const safeTo = Math.max(1, to)
  return Math.exp(Math.log(safeFrom) + (Math.log(safeTo) - Math.log(safeFrom)) * t)
}

/**
 * Cutoff combines progress (deep dive) and descent (intro animation).
 * During descent, cutoff starts very high (surface) and drops as descent → 1.
 */
function mapToCutoff(
  progress: number,
  descent: number,
  shallowCutoff: number,
  deepCutoff: number
) {
  // surface cutoff is *even higher* than shallowCutoff, to feel airy at the start
  const surface = Math.max(shallowCutoff * 2.4, 5400)
  // blend surface → shallowCutoff via descent
  const startCutoff = expInterpolate(surface, shallowCutoff, clamp(descent, 0, 1))
  // then apply progress on top of that
  return expInterpolate(startCutoff, deepCutoff, clamp(progress, 0, 1))
}

function mapWindToLfoRate(windSpeed: number) {
  return lerp(0.1, 0.3, clamp(windSpeed / 18, 0, 1))
}

function mapRainToPinkLevel(rainAmount: number) {
  return lerp(0.42, 0.74, clamp(rainAmount / 10, 0, 1))
}

function mapProgressToBrownLevel(progress: number) {
  return lerp(0.62, 1.02, clamp(progress, 0, 1))
}

function mapWeatherToBaseGain(windSpeed: number, rainAmount: number, descent: number) {
  const wind = clamp(windSpeed / 20, 0, 1)
  const rain = clamp(rainAmount / 10, 0, 1)
  const base = 0.12 + wind * 0.03 + rain * 0.03
  // During descent, raw gain stays at ~50% and rises to 100% as we settle.
  const descentScale = lerp(0.5, 1.0, clamp(descent, 0, 1))
  return base * descentScale
}

function mapWeatherToLfoDepth(windSpeed: number, rainAmount: number, descent: number) {
  const wind = clamp(windSpeed / 18, 0, 1)
  const rain = clamp(rainAmount / 10, 0, 1)
  const base = clamp(0.14 + wind * 0.08 + rain * 0.08, 0.12, 0.34)
  // shallower modulation during descent
  return base * lerp(0.6, 1.0, clamp(descent, 0, 1))
}

function setKRateParam(
  node: AudioWorkletNode | null,
  name: string,
  value: number,
  now: number,
  timeConstant = 0.25
) {
  const param = node?.parameters.get(name)
  if (!param) return
  param.cancelScheduledValues(now)
  param.setTargetAtTime(value, now, timeConstant)
}

export function useDeepSeaAudio({
  enabled,
  progress,
  windSpeed,
  rainAmount,
  descent = 1,
  workletUrl = '/audio/deep-sea-worklet.js',
  shallowCutoff = 2200,
  deepCutoff = 85,
}: UseDeepSeaAudioOptions): DeepSeaAudioController {
  const graphRef = useRef<AudioGraphRefs>({
    ctx: null,
    node: null,
    lowpass: null,
    compressor: null,
    master: null,
  })

  const cutoffRef = useRef<number>(shallowCutoff)
  const [ready, setReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [meter, setMeter] = useState(0)

  const desiredCutoff = useMemo(
    () => mapToCutoff(progress, descent, shallowCutoff, deepCutoff),
    [deepCutoff, descent, progress, shallowCutoff]
  )

  const createGraph = useCallback(async () => {
    if (graphRef.current.ctx) return graphRef.current

    const ctx = new AudioContext({ latencyHint: 'interactive' })

    if (!('audioWorklet' in ctx)) {
      throw new Error('AudioWorklet is not supported in this browser.')
    }

    await ctx.audioWorklet.addModule(workletUrl)

    const node = new AudioWorkletNode(ctx, 'deep-sea-noise-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    })

    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = Math.max(shallowCutoff * 2.4, 5400)
    lowpass.Q.value = 0.72

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -28
    compressor.knee.value = 16
    compressor.ratio.value = 2.5
    compressor.attack.value = 0.02
    compressor.release.value = 0.18

    const master = ctx.createGain()
    master.gain.value = 0.0001

    node.connect(lowpass)
    lowpass.connect(compressor)
    compressor.connect(master)
    master.connect(ctx.destination)

    node.port.onmessage = (event) => {
      const msg = event.data
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'meter') {
        setMeter(typeof msg.value === 'number' ? msg.value : 0)
      }
    }

    graphRef.current = { ctx, node, lowpass, compressor, master }
    cutoffRef.current = lowpass.frequency.value
    setReady(true)
    return graphRef.current
  }, [shallowCutoff, workletUrl])

  const applyDynamicParams = useCallback(() => {
    const { ctx, node } = graphRef.current
    if (!ctx || !node) return

    const now = ctx.currentTime

    const pinkLevel = mapRainToPinkLevel(rainAmount)
    const brownLevel = mapProgressToBrownLevel(progress)
    const baseGain = mapWeatherToBaseGain(windSpeed, rainAmount, descent)
    const lfoRate = mapWindToLfoRate(windSpeed)
    const lfoDepth = mapWeatherToLfoDepth(windSpeed, rainAmount, descent)
    const stereoWidth = clamp(0.08 + windSpeed / 40, 0.08, 0.32)
    const drift = clamp(0.03 + rainAmount / 40, 0.03, 0.18)

    setKRateParam(node, 'pinkLevel', pinkLevel, now, 0.25)
    setKRateParam(node, 'brownLevel', brownLevel, now, 0.25)
    setKRateParam(node, 'baseGain', baseGain, now, 0.35)
    setKRateParam(node, 'lfoRate', lfoRate, now, 0.45)
    setKRateParam(node, 'lfoDepth', lfoDepth, now, 0.45)
    setKRateParam(node, 'stereoWidth', stereoWidth, now, 0.6)
    setKRateParam(node, 'drift', drift, now, 0.6)
  }, [descent, progress, rainAmount, windSpeed])

  const applyCutoff = useCallback(() => {
    const { ctx, lowpass } = graphRef.current
    if (!ctx || !lowpass) return

    const now = ctx.currentTime
    const target = clamp(desiredCutoff, 40, 24000)
    const current = clamp(cutoffRef.current, 40, 24000)

    lowpass.frequency.cancelScheduledValues(now)
    lowpass.frequency.setValueAtTime(current, now)
    lowpass.frequency.exponentialRampToValueAtTime(target, now + 0.85)

    const qTarget = lerp(0.6, 1.15, clamp(progress, 0, 1))
    lowpass.Q.cancelScheduledValues(now)
    lowpass.Q.setTargetAtTime(qTarget, now, 0.45)

    cutoffRef.current = target
  }, [desiredCutoff, progress])

  const start = useCallback(async () => {
    const graph = await createGraph()
    const { ctx, master } = graph
    if (!ctx || !master) return

    if (ctx.state !== 'running') await ctx.resume()

    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value || 0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.95, now + 1.2)

    applyDynamicParams()
    applyCutoff()
    setRunning(true)
  }, [applyCutoff, applyDynamicParams, createGraph])

  const resume = useCallback(async () => {
    const graph = await createGraph()
    if (!graph.ctx || !graph.master) return

    if (graph.ctx.state !== 'running') await graph.ctx.resume()

    const now = graph.ctx.currentTime
    graph.master.gain.cancelScheduledValues(now)
    graph.master.gain.setValueAtTime(Math.max(graph.master.gain.value, 0.0001), now)
    graph.master.gain.exponentialRampToValueAtTime(0.95, now + 0.8)

    applyDynamicParams()
    applyCutoff()
    setRunning(true)
  }, [applyCutoff, applyDynamicParams, createGraph])

  const suspend = useCallback(async () => {
    const { ctx, master } = graphRef.current
    if (!ctx || !master) return
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)

    window.setTimeout(async () => {
      if (ctx.state === 'running') await ctx.suspend()
      setRunning(false)
    }, 500)
  }, [])

  const stop = useCallback(async () => {
    const { ctx, node, lowpass, compressor, master } = graphRef.current
    if (!ctx) return

    const now = ctx.currentTime
    if (master) {
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now)
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    }

    await new Promise((r) => setTimeout(r, 400))

    try {
      node?.disconnect()
      lowpass?.disconnect()
      compressor?.disconnect()
      master?.disconnect()
      await ctx.close()
    } finally {
      graphRef.current = {
        ctx: null,
        node: null,
        lowpass: null,
        compressor: null,
        master: null,
      }
      cutoffRef.current = shallowCutoff
      setReady(false)
      setRunning(false)
      setMeter(0)
    }
  }, [shallowCutoff])

  const triggerFrictionImpulse = useCallback((options?: FrictionImpulseOptions) => {
    const { node } = graphRef.current
    if (!node) return
    node.port.postMessage({
      type: 'friction',
      intensity: options?.intensity ?? 0.42,
      durationMs: options?.durationMs ?? 140,
      color: options?.color ?? 0.82,
    })
  }, [])

  useEffect(() => {
    if (!ready) return
    applyDynamicParams()
  }, [applyDynamicParams, ready])

  useEffect(() => {
    if (!ready) return
    applyCutoff()
  }, [applyCutoff, ready])

  useEffect(() => {
    if (!enabled) return
  }, [enabled])

  useEffect(() => {
    return () => {
      void stop()
    }
  }, [stop])

  return {
    ready,
    running,
    meter,
    start,
    resume,
    suspend,
    stop,
    triggerFrictionImpulse,
  }
}
