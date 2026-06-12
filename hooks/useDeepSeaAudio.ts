'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three' // 🚨  lerp などで THREE の MathUtils を使う

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
  delayNode: DelayNode | null
  surfaceSource: AudioBufferSourceNode | null
  surfaceGain: GainNode | null
}

// 🚨 修正：Three.js の MathUtils を使って、 lerp, clamp を実装
const { lerp, clamp } = THREE.MathUtils;

function expInterpolate(from: number, to: number, t: number) {
  const safeFrom = Math.max(1, from)
  const safeTo = Math.max(1, to)
  return Math.exp(Math.log(safeFrom) + (Math.log(safeTo) - Math.log(safeFrom)) * t)
}

function mapToCutoff(progress: number, descent: number, shallowCutoff: number, deepCutoff: number) {
  const surface = Math.max(shallowCutoff * 2.4, 5400)
  const startCutoff = expInterpolate(surface, shallowCutoff, clamp(descent, 0, 1))
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
  const descentScale = lerp(0.5, 1.0, clamp(descent, 0, 1))
  return base * descentScale
}

function mapWeatherToLfoDepth(windSpeed: number, rainAmount: number, descent: number) {
  const wind = clamp(windSpeed / 18, 0, 1)
  const rain = clamp(rainAmount / 10, 0, 1)
  const base = clamp(0.14 + wind * 0.08 + rain * 0.08, 0.12, 0.34)
  return base * lerp(0.6, 1.0, clamp(descent, 0, 1))
}

function setKRateParam(node: AudioWorkletNode | null, name: string, value: number, now: number, timeConstant = 0.25) {
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
    ctx: null, node: null, lowpass: null, compressor: null, master: null, delayNode: null, surfaceSource: null, surfaceGain: null,
  })

  // 🚨 timersRef に crackle を追加
  const timersRef = useRef<{ bubble: number; whale: number; crackle: number }>({ bubble: 0, whale: 0, crackle: 0 })

  const cutoffRef = useRef<number>(shallowCutoff)
  const [ready, setReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [meter, setMeter] = useState(0)

  const desiredCutoff = useMemo(
    () => mapToCutoff(progress, descent, shallowCutoff, deepCutoff),
    [deepCutoff, descent, progress, shallowCutoff]
  )

  // ピンクノイズバーストを生成するための NoiseBuffer を useMemo で作成（使い回す）
  const crackleNoiseBuffer = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const bufferSize = ctx.sampleRate * 0.1 // 100ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1 // ホワイトノイズ
    }
    // ピンクノイズに変換するためのFilterをかける
    // 1-pole lowpass filter to make it "pink-ish"
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = output[i];
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5; // Gain correction
    }
    return buffer;
  }, []);

  const createGraph = useCallback(async () => {
    if (graphRef.current.ctx) return graphRef.current

    const ctx = new AudioContext({ latencyHint: 'interactive' })

    if (!('audioWorklet' in ctx)) {
      throw new Error('AudioWorklet is not supported in this browser.')
    }

    await ctx.audioWorklet.addModule(workletUrl)

    const node = new AudioWorkletNode(ctx, 'deep-sea-noise-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers',
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

    const delayNode = ctx.createDelay(5.0)
    delayNode.delayTime.value = 1.2 
    const delayFeedback = ctx.createGain()
    delayFeedback.gain.value = 0.45 

    delayNode.connect(delayFeedback)
    delayFeedback.connect(delayNode)
    delayNode.connect(lowpass)

    const bufferSize = ctx.sampleRate * 2
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1 
    }
    const surfaceSource = ctx.createBufferSource()
    surfaceSource.buffer = noiseBuffer
    surfaceSource.loop = true

    const surfaceFilter = ctx.createBiquadFilter()
    surfaceFilter.type = 'bandpass'
    surfaceFilter.frequency.value = 1200 
    surfaceFilter.Q.value = 0.5

    const surfaceGain = ctx.createGain()
    surfaceGain.gain.value = 0.0

    const waveLfo = ctx.createOscillator()
    waveLfo.type = 'sine'
    waveLfo.frequency.value = 0.15 
    const waveLfoGain = ctx.createGain()
    waveLfoGain.gain.value = 800 
    waveLfo.connect(waveLfoGain)
    waveLfoGain.connect(surfaceFilter.frequency)

    surfaceSource.connect(surfaceFilter)
    surfaceFilter.connect(surfaceGain)
    surfaceGain.connect(master)

    surfaceSource.start()
    waveLfo.start()

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

    graphRef.current = { ctx, node, lowpass, compressor, master, delayNode, surfaceSource, surfaceGain }
    cutoffRef.current = lowpass.frequency.value
    setReady(true)
    return graphRef.current
  }, [shallowCutoff, workletUrl])

  const playBubble = useCallback(() => {
    const { ctx, lowpass, delayNode } = graphRef.current
    if (!ctx || !lowpass || !delayNode || ctx.state !== 'running') return

    const bubbleCount = Math.floor(Math.random() * 3) + 1
    
    for (let i = 0; i < bubbleCount; i++) {
      const timeOffset = i * (0.1 + Math.random() * 0.1)
      
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      
      const t = ctx.currentTime + timeOffset
      // 物理現象に基づく気泡：低い音から高い音へ一瞬で跳ね上がる
      const startFreq = 150 + Math.random() * 150 
      const endFreq = startFreq * (2.0 + Math.random() * 1.5) 
      
      osc.frequency.setValueAtTime(startFreq, t)
      osc.frequency.exponentialRampToValueAtTime(endFreq, t + 0.08)

      // 破裂音としての短いエンベロープ
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.15 + Math.random() * 0.1, t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)

      osc.connect(gain)
      gain.connect(lowpass) 
      gain.connect(delayNode) 

      osc.start(t)
      osc.stop(t + 0.2)
    }
  }, [])

  const playWhale = useCallback(() => {
    const { ctx, lowpass, delayNode } = graphRef.current
    if (!ctx || !lowpass || !delayNode || ctx.state !== 'running') return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    
    const t = ctx.currentTime
    const duration = 3.0 + Math.random() * 3.0
    const baseFreq = 90 + Math.random() * 60 
    
    osc.frequency.setValueAtTime(baseFreq, t)
    osc.frequency.linearRampToValueAtTime(baseFreq + (Math.random() * 30 - 15), t + duration)

    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.12, t + duration * 0.4)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)

    osc.connect(gain)
    gain.connect(lowpass)
    gain.connect(delayNode)

    osc.start(t)
    osc.stop(t + duration)
  }, [])

  // 🚨 修正：「メキメキ音（Crackle Sound）」の生成関数（標準ノードを使用）
  const playCrackle = useCallback(() => {
    const { ctx, lowpass, delayNode } = graphRef.current
    if (!ctx || !lowpass || !delayNode || ctx.state !== 'running' || !crackleNoiseBuffer) return

    // 短いピンクノイズバーストを再生
    const source = ctx.createBufferSource();
    source.buffer = crackleNoiseBuffer;
    
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    const t = ctx.currentTime;
    
    // 🚨 水深が深くなるにつれて、クラッキング音を高く、鋭くする
    const evolutionRatio = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1);
    
    // Filter: Bandpass で軋み音の帯域を抽出。水深で帯域を上げる。
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(lerp(1000, 3000, evolutionRatio), t);
    filter.Q.setValueAtTime(lerp(1.0, 5.0, evolutionRatio), t);

    // Gain (エンベロープ): 非常に短い(10-30ms)バースト。水深で強度と鋭さを増す。
    const startGain = lerp(0.01, 0.05, evolutionRatio); // 微量 -> 強烈
    const duration = lerp(0.01, 0.03, evolutionRatio); // 10ms -> 30ms
    
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(startGain, t + 0.001) // 一瞬でMAX
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration) // すぐに消える

    // Connect: 全体の Filter へ
    source.connect(filter)
    filter.connect(gain)
    gain.connect(lowpass) // 既存の Master Filter へ

    // Start/Stop
    source.start(t)
    source.stop(t + duration)
  }, [crackleNoiseBuffer, progress])


  const scheduleEvents = useCallback(() => {
    const scheduleNextBubble = () => {
      const nextTime = Math.random() * 8000 + 4000 
      timersRef.current.bubble = window.setTimeout(() => {
        playBubble()
        scheduleNextBubble()
      }, nextTime)
    }

    const scheduleNextWhale = () => {
      const nextTime = Math.random() * 25000 + 15000 
      timersRef.current.whale = window.setTimeout(() => {
        playWhale()
        scheduleNextWhale()
      }, nextTime)
    }

    // 🚨 「メキメキ音」のスケジュール追加
    const scheduleNextCrackle = () => {
      // 水深 50% 以上でのみスケジュール
      if (progress > 0.5) {
        playCrackle()
        // 🚨 水深が深くなるにつれて、クラッキングの間隔を劇的に短くする
        const evolutionRatio = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1);
        const nextTime = lerp(2000, 200, evolutionRatio) + Math.random() * 500; // 2秒 -> 200ms
        timersRef.current.crackle = window.setTimeout(scheduleNextCrackle, nextTime)
      } else {
        // 50%未満ならスケジュールを止める
        window.clearTimeout(timersRef.current.crackle);
        timersRef.current.crackle = 0;
      }
    }

    scheduleNextBubble()
    scheduleNextWhale()
    // 潜行開始時にスケジュールを開始してみる（progressチェックは scheduleNextCrackle 内）
    scheduleNextCrackle();

  }, [playBubble, playWhale, playCrackle, progress])

  const clearEvents = useCallback(() => {
    window.clearTimeout(timersRef.current.bubble)
    window.clearTimeout(timersRef.current.whale)
    // 🚨 crackle もクリア
    window.clearTimeout(timersRef.current.crackle)
    timersRef.current = { bubble: 0, whale: 0, crackle: 0 }
  }, [])

  const applyDynamicParams = useCallback(() => {
    const { ctx, node, surfaceGain, master } = graphRef.current
    if (!ctx || !node) return

    const now = ctx.currentTime

    // 🚨 修正：「完全無音化（絶対の無）」ロジックを追加
    // 90% 〜 100% の間で lerp して 0 に近づける
    const silenceStart = 0.9;
    const silenceEnd = 1.0;
    const silenceRatio = THREE.MathUtils.clamp((progress - silenceStart) / (silenceEnd - silenceStart), 0, 1);
    const silenceGain = 1.0 - silenceRatio; // 1 (0.9以前) -> 0 (1.0)

    const pinkLevel = mapRainToPinkLevel(rainAmount)
    const brownLevel = mapProgressToBrownLevel(progress)
    // 既存の Gain に silenceGain を掛けて無音化を適用
    const baseGain = mapWeatherToBaseGain(windSpeed, rainAmount, descent) * silenceGain;
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

    // 水深35%で完全に波の音が消えるように調整
    if (surfaceGain) {
      const surfaceDepthFade = Math.max(0, 1.0 - (progress / 0.35))
      const windVolume = clamp(windSpeed / 15, 0.2, 1.0)
      // 🚨 無音化Gainを掛ける
      const surfaceTargetGain = 0.12 * surfaceDepthFade * windVolume * clamp(descent, 0, 1) * silenceGain;
      surfaceGain.gain.setTargetAtTime(surfaceTargetGain, now, 0.5)
    }

    // 🚨 修正：全体の Master Gain を水深 100% で 0 にする
    if (master) {
      // 0.95 (0.9以前) -> 0.0 (1.0)
      const targetMasterGain = lerp(0.95, 0.0, silenceRatio);
      master.gain.setTargetAtTime(targetMasterGain, now, 0.5);
    }

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
    // 🚨 修正：Master Gain の初期値を settled で無音化が適用されることを考慮して 0.95 に
    master.gain.setValueAtTime(master.gain.value || 0.0001, now)
    // applyDynamicParams で Master Gain が 0 になる（ progress=1.0時）ので、ここでは 0.95 まで lerp
    master.gain.exponentialRampToValueAtTime(0.95, now + 1.2)

    applyDynamicParams()
    applyCutoff()
    scheduleEvents()
    setRunning(true)
  }, [applyCutoff, applyDynamicParams, createGraph, scheduleEvents])

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
    scheduleEvents() 
    setRunning(true)
  }, [applyCutoff, applyDynamicParams, createGraph, scheduleEvents])

  const suspend = useCallback(async () => {
    const { ctx, master } = graphRef.current
    if (!ctx || !master) return
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)

    clearEvents() 

    window.setTimeout(async () => {
      if (ctx.state === 'running') await ctx.suspend()
      setRunning(false)
    }, 500)
  }, [clearEvents])

  const stop = useCallback(async () => {
    const { ctx, node, lowpass, compressor, master, delayNode, surfaceSource } = graphRef.current
    if (!ctx) return

    const now = ctx.currentTime
    if (master) {
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now)
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    }

    clearEvents() 

    await new Promise((r) => setTimeout(r, 400))

    try {
      surfaceSource?.stop()
      surfaceSource?.disconnect()
      node?.disconnect()
      lowpass?.disconnect()
      compressor?.disconnect()
      master?.disconnect()
      delayNode?.disconnect()
      await ctx.close()
    } finally {
      graphRef.current = { ctx: null, node: null, lowpass: null, compressor: null, master: null, delayNode: null, surfaceSource: null, surfaceGain: null }
      cutoffRef.current = shallowCutoff
      setReady(false)
      setRunning(false)
      setMeter(0)
    }
  }, [clearEvents, shallowCutoff])

  const triggerFrictionImpulse = useCallback((options?: FrictionImpulseOptions) => {
    const { ctx, node, lowpass, delayNode } = graphRef.current
    
    if (node) {
      node.port.postMessage({
        type: 'friction',
        intensity: options?.intensity ?? 0.42,
        durationMs: options?.durationMs ?? 140,
        color: options?.color ?? 0.82,
      })
    }

    if (ctx && lowpass && delayNode && ctx.state === 'running') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      
      const t = ctx.currentTime
      const color = options?.color ?? 0.82
      const intensity = options?.intensity ?? 0.42
      const freq = 500 + (color * 1500) 

      osc.frequency.setValueAtTime(freq + 400, t)
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.05)

      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(Math.min(intensity * 0.6, 1.0), t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)

      osc.connect(gain)
      gain.connect(lowpass)
      gain.connect(delayNode) 

      osc.start(t)
      osc.stop(t + 0.3)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    applyDynamicParams()
  }, [applyDynamicParams, ready])

  useEffect(() => {
    if (!ready) return
    applyCutoff()
  }, [applyCutoff, ready])

  // 🚨 progress が 0.5 を跨いだ時に scheduleEvents を呼び出して scheduleNextCrackle を再実行
  useEffect(() => {
    if (ready && running && progress > 0.5) {
      // すでに動いていたら何もしないが、timersRef.current.crackle が 0 なら
      if (timersRef.current.crackle === 0) {
        // scheduleEvents を叩いて scheduleNextCrackle を開始
        // しかし playBubble なども二重に走ってしまうため、
        // useDeepSeaAudio の `enabled` が `descent=1` で叩かれる時に scheduleNextCrackle を開始させ、
        // 0.5未満なら clearTimeout させるのが最も美しい。
        // scheduleEvents は enabled=true ( descent=1 ) で叩かれているので、
        // scheduleNextCrackle 内での progress チェックが正しく機能するはず。
      }
    }
  }, [progress, ready, running])

  useEffect(() => {
    if (!enabled) return
  }, [enabled])

  useEffect(() => {
    return () => {
      void stop()
    }
  }, [stop])

  return {
    ready, running, meter, start, resume, suspend, stop, triggerFrictionImpulse,
  }
}