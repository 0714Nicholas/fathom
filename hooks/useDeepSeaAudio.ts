'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { pauseBackgroundPlayback, restoreBackgroundPlayback, startBackgroundPlayback } from '@/lib/audio/backgroundPlayback'
import { weatherToSound } from '@/lib/weather/seaCondition'
import { createSpacePanner, glide, placeAt, surfaceHeight } from '@/lib/audio/space'

export const DEFAULT_MASTER_VOLUME = 0.8

const LIMITER_TRIM = 0.82

const NOISE_LOOP_SEC = 23
// 立体音では、長さの違うもう 1 本のループを重ねる（23 秒と 31 秒で、同じ重なりに戻るのは約 12 分後）
const NOISE_LOOP_B_SEC = 31

// 水面の音を置くパンナー。潜るほど上へ遠ざかる
type SurfacePanner = { panner: PannerNode, x: number, z: number }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

type SoundKnobs = ReturnType<typeof weatherToSound>

// 雨粒・氷の粒に使う、短く減衰するノイズ
function createDropBuffer(ctx: AudioContext, durationSec: number = 0.03) {
  const length = Math.floor(ctx.sampleRate * durationSec)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4)
  }
  return buffer
}

function hashCode(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

function createAbyssalReverb(ctx: AudioContext, duration: number = 5.0, decay: number = 3.0) {
  const length = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  return buffer
}

function createPinkNoiseBuffer(ctx: AudioContext, duration: number = 5.0) {
  const bufferSize = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const output = buffer.getChannelData(0)
  
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.96900 * b2 + white * 0.1538520
    b3 = 0.86650 * b3 + white * 0.3104856
    b4 = 0.55000 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.0168980
    output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
    output[i] *= 0.11
    b6 = white * 0.115926
  }
  return buffer
}

// 水面を抜ける・水に入るときの「ざっ」という水の音。左右で中身の違うノイズにして、顔のまわりに広がるようにする
function waterSwash(ctx: AudioContext, dest: AudioNode, at: number, opts: { from: number, to: number, peak: number, rise: number, length: number }) {
  const length = Math.floor(ctx.sampleRate * opts.length)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  }
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.7
  filter.frequency.setValueAtTime(opts.from, at)
  filter.frequency.exponentialRampToValueAtTime(opts.to, at + opts.length * 0.6)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(opts.peak, at + opts.rise)
  gain.gain.setTargetAtTime(0, at + opts.rise, (opts.length - opts.rise) / 4)
  src.connect(filter).connect(gain).connect(dest)
  src.start(at)
  src.stop(at + opts.length)
  src.onended = () => gain.disconnect()
}

// 鉢を鳴らしたような、澄んで長く残る音。倍音は鉢に近い整数でない比にし、
// それぞれに少しだけ高さのずれた音を重ねて、ゆっくりうなるようにする。
// partials は [基音に対する比, 大きさ, 消えるまでの秒数]。最後の音が止まる時刻を返す
function ringBowl(ctx: AudioContext, dest: AudioNode, at: number, f0: number, partials: [number, number, number][]): number {
  let lastStop = at
  for (const [ratio, peak, decay] of partials) {
    const freq = f0 * ratio
    for (const [detune, weight] of [[0, 0.7], [0.8 * Math.sqrt(ratio), 0.3]] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq + detune
      const gain = ctx.createGain()
      // 柔らかいばちで叩いたように、ごく短く立ち上げる（いきなり立ち上げるとプチッと鳴る）
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(peak * weight, at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay)
      osc.connect(gain).connect(dest)
      osc.start(at)
      osc.stop(at + decay + 0.1)
      osc.onended = () => gain.disconnect()
    }
    lastStop = Math.max(lastStop, at + decay + 0.1)
  }
  return lastStop
}

export function useDeepSeaAudio(opts: {
  enabled: boolean,
  progress: number,
  windSpeed: number,
  rainAmount: number,
  snowAmount?: number,
  clouds?: number,
  temp?: number,
  descent: number,
  isCharging?: boolean,
  turbidity?: number,
  /** 集中ミックス（定時潜航）。急に注意を引く音を減らし、低音や揺れを控えめにする */
  focusMix?: boolean,
  /** 定時潜航中の進み具合 0..1（潜航中以外は null）。音の流れ（導入・静けさ・浮上）に使う */
  diveFraction?: number | null
  /** 立体音（イヤホン向け）で始めるか。途中で切り替えるときは applySpatial を使う */
  spatial?: boolean
}) {
  const focusMix = Boolean(opts.focusMix)
  const diveFraction = opts.diveFraction ?? null
  // 25 分の流れ：最初の 2 分は海面の天気がはっきり、最後の 1 分でゆっくり浮かび上がる
  const arcIntro = focusMix && diveFraction != null ? 1 - clamp01(diveFraction / 0.08) : 0
  const arcOutro = focusMix && diveFraction != null ? clamp01((diveFraction - 0.96) / 0.04) : 0
  const progressRef = useRef(opts.progress)
  progressRef.current = opts.progress
  const focusRef = useRef({ focusMix, diveFraction })
  focusRef.current = { focusMix, diveFraction }

  const knobs = useMemo(() => weatherToSound({
    windSpeed: opts.windSpeed,
    rainAmount: opts.rainAmount,
    snowAmount: opts.snowAmount ?? 0,
    clouds: opts.clouds ?? 40,
    temp: opts.temp ?? 15,
  }), [opts.windSpeed, opts.rainAmount, opts.snowAmount, opts.clouds, opts.temp])
  const knobsRef = useRef<SoundKnobs>(knobs)
  knobsRef.current = knobs

  const ctxRef = useRef<AudioContext | null>(null)
  const [running, setRunning] = useState(false)
  // 音の部品を作り直すたびに増える。タイマーや設定を新しい部品に付け替えるために使う
  const [graphId, setGraphId] = useState(0)
  // 次に音を作るときに立体音にするか／いま鳴っている音が立体音か
  const spatialRef = useRef(opts.spatial ?? true)
  const spatialActiveRef = useRef(false)
  const surfacePannersRef = useRef<SurfacePanner[]>([])
  const dropPoolRef = useRef<PannerNode[]>([])
  // ユーザーが再生を望んでいるか（画面に戻ったときに再開してよいかの判断に使う）
  const wantsPlaybackRef = useRef(false)
  // ロック画面のボタンから、最新の resume / suspend を呼ぶために持っておく
  const playbackControlsRef = useRef({
    resume: async () => {},
    suspend: async () => {},
  })

  const masterGainRef = useRef<GainNode | null>(null)
  const volumeRef = useRef(DEFAULT_MASTER_VOLUME)
  const reverbRef = useRef<ConvolverNode | null>(null)
  
  const pinkNoiseGainRef = useRef<GainNode | null>(null)
  const pinkNoiseFilterRef = useRef<BiquadFilterNode | null>(null)
  
  const descentGainRef = useRef<GainNode | null>(null)
  const descentFilterRef = useRef<BiquadFilterNode | null>(null)

  const subDroneGainRef = useRef<GainNode | null>(null)
  const breathGainRef = useRef<GainNode | null>(null)
  const toneGainRef = useRef<GainNode | null>(null)
  const surfaceCueArmedRef = useRef(true)

  // 海面の天気レイヤー（深く潜るほど遠く、こもっていく）
  const weatherBusRef = useRef<GainNode | null>(null)
  const weatherFilterRef = useRef<BiquadFilterNode | null>(null)
  const weatherDepthGainRef = useRef<GainNode | null>(null)
  const windGainRef = useRef<GainNode | null>(null)
  const windFilterRef = useRef<BiquadFilterNode | null>(null)
  const rainHissGainRef = useRef<GainNode | null>(null)
  const toneOscsRef = useRef<OscillatorNode[]>([])
  const toneShimmerGainRef = useRef<GainNode | null>(null)
  const dropBufferRef = useRef<AudioBuffer | null>(null)

  const initAudio = useCallback(() => {
    if (ctxRef.current) return
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    
    const ctx = new AudioContextClass()
    ctxRef.current = ctx
    const spatial = spatialRef.current
    spatialActiveRef.current = spatial

    // 🚨 スピーカー直前のリミッター。解放の瞬間に音が重なっても 1.0 を超えて割れないようにする
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -3
    limiter.knee.value = 3
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.2
    // コンプレッサーの自動メイクアップゲイン分を戻して、普段の音量感を変えない
    const limiterTrim = ctx.createGain()
    limiterTrim.gain.value = LIMITER_TRIM
    limiter.connect(limiterTrim)
    limiterTrim.connect(ctx.destination)

    const master = ctx.createGain()
    master.gain.value = volumeRef.current
    if (spatial) {
      // 25 分聞いても耳が疲れないよう、刺さりやすい高音を少しだけ下げる
      const soften = ctx.createBiquadFilter()
      soften.type = 'highshelf'
      soften.frequency.value = 5000
      soften.gain.value = -4
      // 高音を下げた分と、頭の外に広がった分で今までより約 1.5 dB 小さく聞こえる。聞き比べで不利にならないよう戻す
      const levelMatch = ctx.createGain()
      levelMatch.gain.value = 1.19
      master.connect(soften).connect(levelMatch).connect(limiter)
    } else {
      master.connect(limiter)
    }
    masterGainRef.current = master

    const reverb = ctx.createConvolver()
    reverb.buffer = createAbyssalReverb(ctx, 6.0, 3.5)
    reverb.connect(master)
    reverbRef.current = reverb

    // --- Ambient Pink Noise ---
    // 5 秒ループだと 25 分で約 300 回繰り返され、集中していると「同じ波」に気づいてしまう。
    // 長めのループにし、各レイヤーは再生位置を大きくずらして使う
    const noiseBuffer = createPinkNoiseBuffer(ctx, NOISE_LOOP_SEC)
    const noiseBufferB = spatial ? createPinkNoiseBuffer(ctx, NOISE_LOOP_B_SEC) : noiseBuffer
    const loopSource = (buffer: AudioBuffer, offset: number) => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      src.start(0, offset)
      return src
    }
    // 立体音：左右で中身の違うノイズにして、頭の中ではなく、まわり一面から聞こえるようにする
    const wideNoise = (offsets: [number, number, number, number]) => {
      const merger = ctx.createChannelMerger(2)
      loopSource(noiseBuffer, offsets[0]).connect(merger, 0, 0)
      loopSource(noiseBufferB, offsets[1]).connect(merger, 0, 0)
      loopSource(noiseBuffer, offsets[2]).connect(merger, 0, 1)
      loopSource(noiseBufferB, offsets[3]).connect(merger, 0, 1)
      const trim = ctx.createGain()
      trim.gain.value = Math.SQRT1_2 // 2 本を足した分の音量を戻す
      merger.connect(trim)
      return trim
    }
    // 2 つの位置に置いた音を足すときに、音量が上がりすぎないようにする
    const pairTrim = (dest: AudioNode) => {
      const trim = ctx.createGain()
      trim.gain.value = Math.SQRT1_2
      trim.connect(dest)
      return trim
    }
    const noiseSrc: AudioNode = spatial ? wideNoise([0, 5.2, 11.5, 19.7]) : loopSource(noiseBuffer, 0)

    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.value = 1000 
    pinkNoiseFilterRef.current = noiseFilter
    
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.35 // ベース音量
    pinkNoiseGainRef.current = noiseGain
    
    // 呼吸のLFO
    const breathLFO = ctx.createOscillator()
    breathLFO.type = 'sine'
    breathLFO.frequency.value = 0.14 
    const breathGain = ctx.createGain()
    breathGain.gain.value = 0.15
    breathGainRef.current = breathGain
    breathLFO.connect(breathGain)
    breathGain.connect(noiseGain.gain) 
    breathLFO.start()

    noiseSrc.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(master)

    // --- Descent Rush ---
    const descentSrc: AudioNode = spatial ? wideNoise([11.4, 26.3, 3.3, 13.1]) : loopSource(noiseBuffer, 11.4)

    const descentFilter = ctx.createBiquadFilter()
    descentFilter.type = 'bandpass'
    descentFilter.frequency.value = 400
    descentFilter.Q.value = 0.8
    descentFilterRef.current = descentFilter

    const descentGain = ctx.createGain()
    descentGain.gain.value = 0.0 
    descentGainRef.current = descentGain

    descentSrc.connect(descentFilter)
    descentFilter.connect(descentGain)
    descentGain.connect(master)
    descentGain.connect(reverb)

    // --- Sub-bass Drone ---
    const subOsc = ctx.createOscillator()
    subOsc.type = 'sine'
    subOsc.frequency.value = 45 
    const subGain = ctx.createGain()
    subGain.gain.value = 0.0
    subDroneGainRef.current = subGain
    
    subOsc.connect(subGain)
    subGain.connect(master)
    subOsc.start()

    // --- Surface Weather ---
    // 天気の音はすべて weatherBus に集め、雲の量と深度でこもらせてから master へ
    const weatherBus = ctx.createGain()
    weatherBus.gain.value = 1.0
    const weatherFilter = ctx.createBiquadFilter()
    weatherFilter.type = 'lowpass'
    weatherFilter.frequency.value = 4000
    weatherFilter.Q.value = 0.5
    const weatherDepthGain = ctx.createGain()
    weatherDepthGain.gain.value = 1.0
    const weatherReverbSend = ctx.createGain()
    weatherReverbSend.gain.value = 0.25
    weatherBus.connect(weatherFilter)
    weatherFilter.connect(weatherDepthGain)
    weatherDepthGain.connect(master)
    weatherDepthGain.connect(weatherReverbSend)
    weatherReverbSend.connect(reverb)
    weatherBusRef.current = weatherBus
    weatherFilterRef.current = weatherFilter
    weatherDepthGainRef.current = weatherDepthGain

    // 立体音：天気の音は頭の上（水面）に置く。左右と前後に散らして、上の空間に広がりを出す
    const surfaceY = surfaceHeight(progressRef.current)
    const surfacePanners: SurfacePanner[] = []
    const atSurface = (x: number, z: number) => {
      const panner = createSpacePanner(ctx, { x, y: surfaceY, z })
      surfacePanners.push({ panner, x, z })
      return panner
    }

    // 風：帯域を絞ったノイズ。強さで音量と帯域が上がり、突風で揺れる
    // 海鳴りと同じバッファなので、再生位置をずらして重なりを避ける
    const windFilter = ctx.createBiquadFilter()
    windFilter.type = 'bandpass'
    windFilter.frequency.value = 400
    windFilter.Q.value = 0.6
    if (spatial) {
      const into = pairTrim(windFilter)
      loopSource(noiseBuffer, 7.9).connect(atSurface(-4, -2)).connect(into)
      loopSource(noiseBufferB, 23.4).connect(atSurface(4, 1.5)).connect(into)
    } else {
      loopSource(noiseBuffer, 7.9).connect(windFilter)
    }
    const windGain = ctx.createGain()
    windGain.gain.value = 0.0
    windFilter.connect(windGain)
    windGain.connect(weatherBus)
    windGainRef.current = windGain
    windFilterRef.current = windFilter

    // 雨：粒は別ループで鳴らし、ここでは本降りのサーッという音だけ
    const hissFilter = ctx.createBiquadFilter()
    hissFilter.type = 'highpass'
    hissFilter.frequency.value = 1800
    if (spatial) {
      const into = pairTrim(hissFilter)
      loopSource(noiseBuffer, 15.3).connect(atSurface(-2.5, 2)).connect(into)
      loopSource(noiseBufferB, 9.6).connect(atSurface(2.5, -2.5)).connect(into)
    } else {
      loopSource(noiseBuffer, 15.3).connect(hissFilter)
    }
    const hissGain = ctx.createGain()
    hissGain.gain.value = 0.0
    hissFilter.connect(hissGain)
    hissGain.connect(weatherBus)
    rainHissGainRef.current = hissGain

    // 雨粒・氷の粒の行き先。粒ごとにパンナーを作ると重いので、水面の 6 か所に置いたものを使い回す
    dropPoolRef.current = spatial
      ? Array.from({ length: 6 }, (_, i) => {
          const angle = (i / 6) * Math.PI * 2 + 0.3
          const panner = atSurface(Math.cos(angle) * 3.5, Math.sin(angle) * 3.5)
          panner.connect(weatherBus)
          return panner
        })
      : []
    surfacePannersRef.current = surfacePanners

    // 気温：ごく小さな和音。寒いほど高く澄み、暖かいほど低く柔らかい
    const toneGain = ctx.createGain()
    toneGain.gain.value = 0.03
    toneGainRef.current = toneGain
    const toneLFO = ctx.createOscillator()
    toneLFO.frequency.value = 0.05
    const toneLFODepth = ctx.createGain()
    toneLFODepth.gain.value = 0.012
    toneLFO.connect(toneLFODepth)
    toneLFODepth.connect(toneGain.gain)
    toneLFO.start()
    const toneOscs = [1, 1.5].map((ratio) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 130 * ratio
      osc.connect(toneGain)
      osc.start()
      return osc
    })
    const shimmer = ctx.createOscillator()
    shimmer.type = 'sine'
    shimmer.frequency.value = 130 * 4
    const shimmerGain = ctx.createGain()
    shimmerGain.gain.value = 0.0
    shimmer.connect(shimmerGain)
    shimmerGain.connect(toneGain)
    shimmer.start()
    toneGain.connect(weatherBus)
    toneOscsRef.current = [...toneOscs, shimmer]
    toneShimmerGainRef.current = shimmerGain

    dropBufferRef.current = createDropBuffer(ctx)

    setRunning(true)
    setGraphId((id) => id + 1)
  }, [])

  // 立体音と今までの音を切り替える。iPhone で音を止めないよう、タップの処理の中から同期的に呼ぶ
  const applySpatial = useCallback((on: boolean) => {
    spatialRef.current = on
    const old = ctxRef.current
    if (!old || spatialActiveRef.current === on) return
    ctxRef.current = null
    old.close().catch(() => { /* すでに閉じていてもよい */ })
    initAudio()
    const ctx = ctxRef.current as AudioContext | null
    if (!ctx) return
    if (wantsPlaybackRef.current) {
      if (ctx.state !== 'running') ctx.resume().catch(() => { /* 次の操作で再開できる */ })
    } else {
      setRunning(false)
      ctx.suspend().catch(() => {})
    }
  }, [initAudio])

  const resume = useCallback(async () => {
    wantsPlaybackRef.current = true
    startBackgroundPlayback({
      onPlay: () => { void playbackControlsRef.current.resume() },
      onPause: () => { void playbackControlsRef.current.suspend() },
    })
    if (!ctxRef.current) initAudio()
    // ロック画面からの再開では resume() が返ってこないことがあるので、状態を先に更新する
    setRunning(true)
    const ctx = ctxRef.current
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') await ctx.resume()
  }, [initAudio])

  const suspend = useCallback(async () => {
    wantsPlaybackRef.current = false
    pauseBackgroundPlayback()
    setRunning(false)
    if (ctxRef.current?.state === 'running') await ctxRef.current.suspend()
  }, [])

  playbackControlsRef.current = { resume, suspend }

  const start = resume

  // iPhone では画面オフや電話で音が中断され、状態が interrupted になることがある。
  // 非表示のまま resume() を呼ぶと返ってこないので、画面に戻ったときに再開する
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !wantsPlaybackRef.current) return
      restoreBackgroundPlayback()
      const ctx = ctxRef.current
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
        ctx.resume().catch(() => { /* 次の操作で再開できる */ })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // 0..1。AudioContext 生成前に呼ばれても次の initAudio で反映される
  const setVolume = useCallback((value: number) => {
    const v = Math.max(0, Math.min(1, value))
    volumeRef.current = v
    const ctx = ctxRef.current
    if (ctx && masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(v, ctx.currentTime, 0.05)
    }
  }, [])

  // --- Depth, Charging, and Turbidity ---
  useEffect(() => {
    if (!ctxRef.current || !pinkNoiseFilterRef.current || !subDroneGainRef.current) return
    const ctx = ctxRef.current
    const now = ctx.currentTime
    
    // 濁度（Turbidity）が高い時、フィルターが開いて耳障りな高音ノイズが混ざる
    // 海面が荒れている（風が強い）ほど、浅いところの海鳴りも明るく大きくなる
    const currentTurbidity = opts.turbidity || 0
    const surfaceRough = knobs.wind * (1 - opts.progress)
    // 浮上の 1 分前から、海鳴りが少しずつ明るくなる（光の方へ戻っていく）
    const targetFreq = currentTurbidity > 0
      ? 3000 + (currentTurbidity * 5000)
      : 100 + (1 - opts.progress) * 800 + surfaceRough * 500 + arcOutro * 700
    pinkNoiseFilterRef.current.frequency.setTargetAtTime(targetFreq, now, arcOutro > 0 ? 4.0 : 1.0)

    // 濁っている時は、海鳴りの音量自体も少し暴れさせる
    if (pinkNoiseGainRef.current) {
      const baseGain = 0.35 + (currentTurbidity * 0.3) + surfaceRough * 0.2
      pinkNoiseGainRef.current.gain.setTargetAtTime(baseGain, now, 1.0)
    }

    // 集中ミックスでは「呼吸」の揺れを小さくして、変化の少ない音にする
    breathGainRef.current?.gain.setTargetAtTime(focusMix ? 0.05 : 0.15, now, 2.0)

    // チャージ中はサブベース（ドローン）が強烈にうなりを上げる
    // 集中ミックスでは深くなっても低音は控えめ（ヘッドホンで 25 分聴いても疲れないように）
    const baseSub = focusMix ? Math.min(0.12, opts.progress * 0.15) : opts.progress * 0.4
    const chargeSub = opts.isCharging ? 0.8 : 0.0
    // 手を離したらドローンは素早く引く（解放音と重なって音割れしないように）
    subDroneGainRef.current.gain.setTargetAtTime(baseSub + chargeSub, now, opts.isCharging ? 0.5 : 0.12)
  }, [opts.progress, opts.isCharging, opts.turbidity, knobs.wind, focusMix, arcOutro, graphId])

  // --- Descent ---
  useEffect(() => {
    if (!ctxRef.current || !descentGainRef.current || !descentFilterRef.current) return
    const ctx = ctxRef.current
    const now = ctx.currentTime
    
    if (opts.descent > 0 && opts.descent < 1) {
      descentGainRef.current.gain.setTargetAtTime(0.5, now, 0.5)
      descentFilterRef.current.frequency.setTargetAtTime(800 - opts.progress * 400, now, 0.5)
    } else {
      descentGainRef.current.gain.setTargetAtTime(0.0, now, 1.0)
    }
  }, [opts.descent, opts.progress, graphId])

  // --- Surface Weather: 定常的なつまみ（天気と深度が変わったときだけ動かす） ---
  useEffect(() => {
    const ctx = ctxRef.current
    if (!running || !ctx || !weatherFilterRef.current || !weatherDepthGainRef.current) return
    const now = ctx.currentTime
    const { wind, rain, snow, overcast, cold } = knobs
    const depth = clamp01(opts.progress)

    // 快晴は開けて明るく、曇天・雪はこもる。深く潜るほどさらにこもる
    const surfaceCutoff = (9000 - overcast * 6000) * (1 - snow * 0.5)
    // 浮上の 1 分前からは、こもっていた海面の音がゆっくり開いていく
    const cutoff = Math.max(220, surfaceCutoff * Math.pow(1 - depth * 0.92, 2)) * (1 + arcOutro * 2.5)
    weatherFilterRef.current.frequency.setTargetAtTime(cutoff, now, arcOutro > 0 ? 4.0 : 1.5)
    // 集中ミックス：導入（最初の 2 分）は海面の天気をはっきり、潜航中は少し引いて静けさを優先する
    const depthGain = (1 - depth * 0.55) * (focusMix ? 0.85 + arcIntro * 0.4 : 1) + arcOutro * 0.25
    weatherDepthGainRef.current.gain.setTargetAtTime(depthGain, now, 1.5)
    toneGainRef.current?.gain.setTargetAtTime(focusMix ? 0.018 : 0.03, now, 3.0)

    windFilterRef.current?.frequency.setTargetAtTime(260 + wind * 760, now, 2.0)
    rainHissGainRef.current?.gain.setTargetAtTime(Math.pow(rain, 1.5) * 0.12, now, 2.0)

    // 寒いほど高い音域へ（暖かい 98Hz ≒ G2 ／ 寒い 196Hz ≒ G3）。寒さで高い倍音もうっすら足す
    const root = 98 * Math.pow(2, cold)
    const [rootOsc, fifthOsc, shimmerOsc] = toneOscsRef.current
    rootOsc?.frequency.setTargetAtTime(root, now, 3.0)
    fifthOsc?.frequency.setTargetAtTime(root * 1.5, now, 3.0)
    shimmerOsc?.frequency.setTargetAtTime(root * 4, now, 3.0)
    toneShimmerGainRef.current?.gain.setTargetAtTime(cold * 0.35, now, 3.0)

    // 立体音：潜るほど水面が上へ遠ざかる（浮上の 1 分前からは、少しずつ近づいてくる）
    const surfaceY = surfaceHeight(depth * (1 - arcOutro * 0.7))
    for (const { panner, x, z } of surfacePannersRef.current) {
      placeAt(panner, { x, y: surfaceY, z }, now, arcOutro > 0 ? 4.0 : 2.0)
    }
  }, [running, knobs, opts.progress, focusMix, arcIntro, arcOutro, graphId])

  // --- 浮上の合図：潜航の最後の 1 分、和音がゆっくり 1 オクターブ上へ昇っていく ---
  useEffect(() => {
    if (!focusMix || diveFraction == null) return
    if (diveFraction < 0.5) {
      surfaceCueArmedRef.current = true
      return
    }
    const ctx = ctxRef.current
    if (!running || !ctx || !masterGainRef.current || !reverbRef.current) return
    if (diveFraction < 0.96 || !surfaceCueArmedRef.current) return
    surfaceCueArmedRef.current = false

    const now = ctx.currentTime
    // 潜航の残り時間いっぱいを使って昇る（途中参加で残りが短くても最低 10 秒）
    const duration = Math.max(10, (1 - diveFraction) * 25 * 60)
    const root = toneOscsRef.current[0]?.frequency.value ?? 130
    const out = ctx.createGain()
    out.gain.setValueAtTime(0, now)
    out.gain.linearRampToValueAtTime(0.03, now + Math.min(20, duration * 0.4))
    out.gain.setValueAtTime(0.03, now + duration * 0.85)
    out.gain.linearRampToValueAtTime(0, now + duration + 2)
    // 立体音：和音は水面の高さから、頭のすぐ上まで降りてくる（光の方へ戻っていく）
    if (spatialActiveRef.current) {
      const panner = createSpacePanner(ctx, { x: 0, y: surfaceHeight(progressRef.current), z: -2 })
      glide(panner, { x: 0, y: surfaceHeight(progressRef.current), z: -2 }, { x: 0, y: 2, z: -1.5 }, now, duration)
      out.connect(panner).connect(masterGainRef.current)
    } else {
      out.connect(masterGainRef.current)
    }
    const send = ctx.createGain()
    send.gain.value = 0.6
    out.connect(send).connect(reverbRef.current)

    const oscs = [1, 1.5].map((ratio) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(root * 2 * ratio, now)
      osc.frequency.exponentialRampToValueAtTime(root * 4 * ratio, now + duration)
      osc.connect(out)
      osc.start(now)
      osc.stop(now + duration + 2.5)
      return osc
    })
    oscs[oscs.length - 1].onended = () => { out.disconnect(); send.disconnect() }
  }, [focusMix, diveFraction, running])

  // --- Surface Weather: 突風（強い風ほど頻繁に、大きく揺れる） ---
  useEffect(() => {
    if (!running || !ctxRef.current || !windGainRef.current) return
    const ctx = ctxRef.current
    const windGain = windGainRef.current
    let timeoutId: number

    const gust = () => {
      const { wind } = knobsRef.current
      const base = 0.04 + wind * 0.5
      // 強い風ほど揺れ幅も大きくする（凪はほぼ一定、嵐は大きくうねる）
      const swing = 0.3 + wind * 0.9
      const target = base * (1 - swing / 2 + Math.random() * swing)
      windGain.gain.setTargetAtTime(target, ctx.currentTime, 0.6 + Math.random() * 1.6)
      timeoutId = window.setTimeout(gust, (4500 - wind * 3000) * (0.6 + Math.random() * 0.8))
    }
    gust()

    return () => clearTimeout(timeoutId)
  }, [running, graphId])

  // --- Surface Weather: 雨粒と氷の粒 ---
  useEffect(() => {
    if (!running || !ctxRef.current || !weatherBusRef.current || !dropBufferRef.current) return
    const ctx = ctxRef.current
    const bus = weatherBusRef.current
    const dropBuffer = dropBufferRef.current
    const pool = dropPoolRef.current
    const TICK_MS = 60

    const spawn = (opts: { freqMin: number, freqMax: number, gain: number, rate: [number, number] }) => {
      const src = ctx.createBufferSource()
      src.buffer = dropBuffer
      src.playbackRate.value = opts.rate[0] + Math.random() * (opts.rate[1] - opts.rate[0])
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = opts.freqMin + Math.random() * (opts.freqMax - opts.freqMin)
      filter.Q.value = 1.2
      const gain = ctx.createGain()
      gain.gain.value = opts.gain * (0.4 + Math.random() * 0.6)
      src.connect(filter).connect(gain)
      if (pool.length > 0) {
        // 立体音：頭の上の水面のどこかに落ちる
        gain.connect(pool[Math.floor(Math.random() * pool.length)])
      } else {
        const panner = ctx.createStereoPanner()
        panner.pan.value = Math.random() * 2 - 1
        gain.connect(panner).connect(bus)
      }
      src.start()
      src.onended = () => gain.disconnect()
    }

    // 立体音では、刺さりやすい高い粒を少し低くする（25 分聞いても疲れないように）
    const highCap = pool.length > 0 ? 0.8 : 1

    // 1 tick あたりの期待個数からポアソン的に粒の数を決める
    const countFor = (perSecond: number) => {
      const expected = perSecond * (TICK_MS / 1000)
      return Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0)
    }

    const interval = window.setInterval(() => {
      const { rain, snow } = knobsRef.current
      const drops = countFor(rain * 40)
      for (let i = 0; i < drops; i++) {
        spawn({ freqMin: 1500, freqMax: 5200 * highCap, gain: 0.03 + rain * 0.03, rate: [0.7, 1.6] })
      }
      // 雪の夜は静か。ときどき高く小さな氷の粒が鳴るだけ
      const flakes = countFor(snow * 0.8)
      for (let i = 0; i < flakes; i++) {
        spawn({ freqMin: 5000 * highCap, freqMax: 8000 * highCap, gain: 0.025, rate: [1.8, 2.6] })
      }
    }, TICK_MS)

    return () => clearInterval(interval)
  }, [running, graphId])

  // --- Ecosystem (Whales and Bubbles) ---
  // 以前は深度（毎秒更新）を依存にしていたため、1 秒ごとにタイマーが作り直されて
  // 「3〜10 秒に 1 回」のはずの音がほぼ毎秒鳴っていた。深度は ref で読み、タイマーは running の間だけ回す
  useEffect(() => {
    if (!running || !ctxRef.current || !masterGainRef.current || !reverbRef.current) return
    const ctx = ctxRef.current

    let timeoutId: number

    // 集中ミックスでは 30〜90 秒に 1 回、小さく遠くで鳴らす
    const nextDelay = () => focusRef.current.focusMix ? 30000 + Math.random() * 60000 : 3000 + Math.random() * 7000

    // 立体音：鯨は下の遠いところで鳴く。近くの音ではないので、直接の音は小さく、響きを多めにする
    const whaleFarBelow = (level: number) => {
      const now = ctx.currentTime
      const angle = Math.random() * Math.PI * 2
      const panner = createSpacePanner(ctx, { x: Math.cos(angle) * 18, y: -6 - Math.random() * 8, z: Math.sin(angle) * 18 })
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      const startFreq = 120 + Math.random() * 100
      osc.frequency.setValueAtTime(startFreq, now)
      osc.frequency.exponentialRampToValueAtTime(startFreq * 0.5, now + 3.0)
      // ゆっくり立ち上げて、急に鳴り出さないようにする
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime((0.1 + Math.random() * 0.1) * level, now + 1.4)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 4.0)
      const direct = ctx.createGain()
      direct.gain.value = 0.7
      osc.connect(gain).connect(panner)
      panner.connect(direct).connect(masterGainRef.current!)
      panner.connect(reverbRef.current!)
      osc.start(now)
      osc.stop(now + 4.5)
      osc.onended = () => { gain.disconnect(); panner.disconnect(); direct.disconnect() }
    }

    // 立体音：小さな泡が、足元から耳の横を通って上へ昇っていく
    const bubblesRising = (count: number, level: number) => {
      const now = ctx.currentTime
      const step = 0.12 + Math.random() * 0.08
      const side = Math.random() < 0.5 ? -1 : 1
      const from = { x: side * (0.6 + Math.random() * 0.8), y: -1.5, z: -0.5 + Math.random() }
      const to = { x: from.x * 0.8, y: 2.5, z: from.z }
      const panner = createSpacePanner(ctx, from)
      glide(panner, from, to, now, step * count + 0.2)
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = focusRef.current.focusMix ? 500 : 800
      panner.connect(filter).connect(masterGainRef.current!)
      const reverbSend = ctx.createGain()
      reverbSend.gain.value = 0.3
      filter.connect(reverbSend).connect(reverbRef.current!)

      let last: OscillatorNode | null = null
      for (let i = 0; i < count; i++) {
        const t = now + i * step + Math.random() * 0.04
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        // 昇るほど泡は小さく、音は少し高くなる
        const startFreq = (250 + Math.random() * 150) * (1 + i * 0.08)
        osc.frequency.setValueAtTime(startFreq, t)
        osc.frequency.exponentialRampToValueAtTime(startFreq * 1.5, t + 0.04)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.12 * level * (1 - i * 0.1), t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
        osc.connect(gain).connect(panner)
        osc.start(t)
        osc.stop(t + 0.1)
        last = osc
      }
      if (last) last.onended = () => { panner.disconnect(); filter.disconnect(); reverbSend.disconnect() }
    }

    const scheduleEcosystem = () => {
      const { focusMix: isFocus, diveFraction: fraction } = focusRef.current
      const isDeep = progressRef.current > 0.4
      // 導入の最初と、浮上前の最後は生き物の音を鳴らさない
      const quiet = isFocus && fraction != null && (fraction < 0.04 || fraction > 0.94)
      const level = isFocus ? 0.45 : 1
      const chance = isFocus ? 1 : (isDeep ? 0.4 : 0.7)

      if (quiet || Math.random() >= chance) {
        timeoutId = window.setTimeout(scheduleEcosystem, nextDelay())
        return
      }

      if (spatialActiveRef.current) {
        if (isDeep) whaleFarBelow(level)
        else bubblesRising(isFocus ? 2 : 3 + Math.floor(Math.random() * 3), level)
      } else if (isDeep) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const panner = ctx.createStereoPanner()

        osc.type = 'sine'
        const startFreq = 120 + Math.random() * 100
        osc.frequency.setValueAtTime(startFreq, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(startFreq * 0.5, ctx.currentTime + 3.0) 
        
        panner.pan.value = Math.random() * 2 - 1 
        
        gain.gain.setValueAtTime(0, ctx.currentTime)
        gain.gain.linearRampToValueAtTime((0.1 + Math.random() * 0.1) * level, ctx.currentTime + 1.0)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4.0)

        osc.connect(gain).connect(panner).connect(reverbRef.current!)
        panner.connect(masterGainRef.current!)

        osc.start()
        osc.stop(ctx.currentTime + 4.5)
      } else {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const panner = ctx.createStereoPanner()
        const filter = ctx.createBiquadFilter()
        
        osc.type = 'sine'
        const startFreq = 250 + Math.random() * 150
        osc.frequency.setValueAtTime(startFreq, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(startFreq * 1.5, ctx.currentTime + 0.04) 
        
        filter.type = 'lowpass'
        filter.frequency.value = isFocus ? 500 : 800

        panner.pan.value = Math.random() * 2 - 1

        gain.gain.setValueAtTime(0, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0.15 * level, ctx.currentTime + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
        
        osc.connect(gain).connect(filter).connect(panner).connect(masterGainRef.current!)
        const reverbSend = ctx.createGain()
        reverbSend.gain.value = 0.3
        panner.connect(reverbSend).connect(reverbRef.current!)

        osc.start()
        osc.stop(ctx.currentTime + 0.1)
      }
      
      timeoutId = window.setTimeout(scheduleEcosystem, nextDelay())
    }

    timeoutId = window.setTimeout(scheduleEcosystem, nextDelay())

    return () => clearTimeout(timeoutId)
  }, [running, graphId])

  // --- Interactions ---

  // 浮上の音：こもった水の音がざっと明るく開き、顔のまわりから水がしたたって、澄んだ鉢の音が長く残る
  const triggerSurfacing = useCallback(() => {
    const ctx = ctxRef.current
    const master = masterGainRef.current
    const reverb = reverbRef.current
    if (!ctx || !master || !reverb) return
    const now = ctx.currentTime
    // 気温で決まる和音の根音に合わせる（ずっと鳴っている和音と濁らないように）
    const root = toneOscsRef.current[0]?.frequency.value ?? 130

    waterSwash(ctx, master, now, { from: 300, to: 3200, peak: 0.09, rise: 0.35, length: 1.8 })

    const dropBuffer = dropBufferRef.current
    if (dropBuffer) {
      for (let i = 0; i < 7; i++) {
        const t = now + 0.3 + Math.random() * 1.6
        const src = ctx.createBufferSource()
        src.buffer = dropBuffer
        src.playbackRate.value = 0.8 + Math.random() * 0.6
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 1200 + Math.random() * 2000
        filter.Q.value = 2
        const gain = ctx.createGain()
        gain.gain.value = 0.025 + Math.random() * 0.02
        const panner: AudioNode = spatialActiveRef.current
          ? createSpacePanner(ctx, { x: (Math.random() * 2 - 1) * 0.8, y: 0.3 + Math.random() * 0.7, z: (Math.random() * 2 - 1) * 0.6 })
          : (() => { const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; return p })()
        src.connect(filter).connect(gain).connect(panner).connect(master)
        src.start(t)
        src.onended = () => { gain.disconnect(); panner.disconnect() }
      }
    }

    // 少し遅れて、前の少し上（水面の上の空）で鉢が鳴る
    const bowlOut = ctx.createGain()
    if (spatialActiveRef.current) bowlOut.connect(createSpacePanner(ctx, { x: 0, y: 1.5, z: -2.5 })).connect(master)
    else bowlOut.connect(master)
    const send = ctx.createGain()
    send.gain.value = 0.45
    bowlOut.connect(send).connect(reverb)
    const end = ringBowl(ctx, bowlOut, now + 0.6, root * 3, [
      [1, 0.06, 7.0],
      [2.76, 0.022, 4.0],
      [5.4, 0.009, 2.2],
      [8.93, 0.004, 1.2],
    ])
    window.setTimeout(() => { bowlOut.disconnect(); send.disconnect() }, (end - now + 1) * 1000)
  }, [])

  // 潜る合図：水に入る「とぷん」。明るい水の音が頭の上で閉じ、こもった低い鉢の音が下へ沈んでいく
  const triggerSubmerge = useCallback(() => {
    const ctx = ctxRef.current
    const master = masterGainRef.current
    const reverb = reverbRef.current
    if (!ctx || !master || !reverb) return
    const now = ctx.currentTime
    const root = toneOscsRef.current[0]?.frequency.value ?? 130

    waterSwash(ctx, master, now, { from: 2200, to: 220, peak: 0.08, rise: 0.06, length: 1.4 })

    // 水の中で聞く音なので、高いところを落としてこもらせる
    const bowlOut = ctx.createGain()
    const muffle = ctx.createBiquadFilter()
    muffle.type = 'lowpass'
    muffle.frequency.value = 900
    bowlOut.connect(muffle)
    if (spatialActiveRef.current) {
      const from = { x: 0, y: -0.5, z: -2 }
      const panner = createSpacePanner(ctx, from)
      glide(panner, from, { x: 0, y: -6, z: -3 }, now, 3.0)
      muffle.connect(panner).connect(master)
    } else {
      muffle.connect(master)
    }
    const send = ctx.createGain()
    send.gain.value = 0.6
    muffle.connect(send).connect(reverb)
    const end = ringBowl(ctx, bowlOut, now + 0.15, root * 1.5, [
      [1, 0.06, 4.5],
      [2.76, 0.018, 2.2],
      [5.4, 0.006, 1.2],
    ])
    window.setTimeout(() => { bowlOut.disconnect(); muffle.disconnect(); send.disconnect() }, (end - now + 1) * 1000)
  }, [])

  const triggerSpatialResonance = useCallback((peerSeed: string, peerDepth: number, energy: number) => {
    if (!ctxRef.current || !masterGainRef.current || !reverbRef.current) return 0
    const ctx = ctxRef.current
    const hash = hashCode(peerSeed)
    
    const baseFreq = 120 + (Math.abs(hash) % 250)
    const panValue = ((Math.abs(hash * 31) % 100) / 50) - 1.0
    const depthDiff = peerDepth - opts.progress
    let panner: AudioNode
    if (spatialActiveRef.current) {
      // 立体音：ほかの人は遠くにいる。左右は今までと同じ（画面の波紋と合わせる）、自分より深い人は下、浅い人は上から聞こえる
      const x = panValue * 10
      const z = -Math.sqrt(Math.max(0, 100 - x * x)) - 2
      panner = createSpacePanner(ctx, { x, y: -depthDiff * 14, z })
    } else {
      const stereo = ctx.createStereoPanner()
      stereo.pan.value = panValue
      panner = stereo
    }

    let cutoff = 3000
    if (depthDiff > 0) {
      cutoff = Math.max(150, 3000 - (depthDiff * 5000)) 
    } else if (depthDiff < 0) {
      cutoff = Math.min(5000, 3000 + (Math.abs(depthDiff) * 3000))
    }
    
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    filter.Q.value = 2.0 

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.type = 'sine'
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, ctx.currentTime + 1.2)
    
    const maxVol = Math.max(0.1, Math.min(0.8, energy))
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(maxVol, ctx.currentTime + 0.1)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5)
    
    osc.connect(gain).connect(filter).connect(panner)
    panner.connect(masterGainRef.current)
    
    const sendToReverb = ctx.createGain()
    sendToReverb.gain.value = 0.9 
    panner.connect(sendToReverb).connect(reverbRef.current)

    osc.start()
    osc.stop(ctx.currentTime + 3.0)

    return panValue
  }, [opts.progress])

  // 🚨 新規追加: 長押し解放時の巨大ソナー音
  const triggerOverloadSonar = useCallback(() => {
    if (!ctxRef.current || !masterGainRef.current || !reverbRef.current) return
    const ctx = ctxRef.current
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 2.0)
    
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05) // 強烈なアタック（破氷音と重なるので控えめに）
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4.0) // 長い余韻

    osc.connect(gain).connect(masterGainRef.current)
    gain.connect(reverbRef.current)

    osc.start()
    osc.stop(ctx.currentTime + 4.5)
  }, [])

  // 「沈める」の音。かすかに「ぽつ」と鳴って、深いところへ消えていく
  const triggerSink = useCallback(() => {
    if (!ctxRef.current || !masterGainRef.current || !reverbRef.current) return
    const ctx = ctxRef.current
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(420, now)
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.35)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.05, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
    if (spatialActiveRef.current) {
      // 立体音：目の前から、足元の深いところへ落ちていく
      const from = { x: 0, y: -0.3, z: -1.2 }
      const panner = createSpacePanner(ctx, from)
      glide(panner, from, { x: 0, y: -9, z: -2.5 }, now, 0.6)
      osc.connect(gain).connect(panner).connect(masterGainRef.current)
    } else {
      osc.connect(gain).connect(masterGainRef.current)
    }
    const send = ctx.createGain()
    send.gain.value = 0.6
    gain.connect(send).connect(reverbRef.current)
    osc.start(now)
    osc.stop(now + 0.7)
    osc.onended = () => { gain.disconnect(); send.disconnect() }
  }, [])

  // 🚨 絶対零度の「破氷音」と、クリアな残響
  // 以前は別の AudioContext で鳴らしていたため、音量スライダーもリミッターも効かずに音割れしていた
  const triggerIceBreak = useCallback(() => {
    if (!ctxRef.current || !masterGainRef.current) return
    const ctx = ctxRef.current
    const now = ctx.currentTime

    const out = ctx.createGain()
    out.gain.setValueAtTime(1.0, now)
    out.gain.setTargetAtTime(0.0001, now + 8.0, 2.0)
    out.connect(masterGainRef.current)

    // 1. 氷が割れる瞬間の鋭い高周波（ピキィィン！）
    const oscHigh = ctx.createOscillator()
    const oscHighGain = ctx.createGain()
    oscHigh.type = 'triangle'
    oscHigh.frequency.setValueAtTime(3000, now)
    oscHigh.frequency.exponentialRampToValueAtTime(800, now + 0.5)
    oscHighGain.gain.setValueAtTime(0, now)
    oscHighGain.gain.linearRampToValueAtTime(0.18, now + 0.004) // いきなり立ち上げるとプチッと鳴る
    oscHighGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
    oscHigh.connect(oscHighGain).connect(out)
    oscHigh.start(now)
    oscHigh.stop(now + 1.0)

    // 2. 空間に広がる深いサブベース（重圧の解放）
    const oscLow = ctx.createOscillator()
    const oscLowGain = ctx.createGain()
    oscLow.type = 'sine'
    oscLow.frequency.setValueAtTime(100, now)
    oscLow.frequency.exponentialRampToValueAtTime(20, now + 2.0)
    oscLowGain.gain.setValueAtTime(0, now)
    oscLowGain.gain.linearRampToValueAtTime(0.35, now + 0.01)
    oscLowGain.gain.setTargetAtTime(0.0001, now + 1.0, 0.5)
    oscLow.connect(oscLowGain).connect(out)
    oscLow.start(now)
    oscLow.stop(now + 3.0)

    // 3. 霜が晴れ、クリアな視界が広がる環境音（静かなホワイトノイズの波）
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2.0, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1
    }
    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.setValueAtTime(2000, now)
    noiseFilter.frequency.linearRampToValueAtTime(500, now + 3.0)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0, now)
    noiseGain.gain.linearRampToValueAtTime(0.2, now + 0.01)
    noiseGain.gain.setTargetAtTime(0.0001, now + 3.0, 0.8)

    // 透明感のある、氷窟のようなロングリバーブ
    const delay = ctx.createDelay()
    delay.delayTime.value = 0.3 // 早めの反射で氷の硬さを表現
    const feedback = ctx.createGain()
    feedback.gain.value = 0.8 // 約7〜8秒の残響
    const dampFilter = ctx.createBiquadFilter()
    dampFilter.type = 'highpass' // 高音を残してクリアな響きに
    dampFilter.frequency.value = 800
    delay.connect(feedback)
    feedback.connect(dampFilter)
    dampFilter.connect(delay)

    const echoGain = ctx.createGain()
    echoGain.gain.value = 0.35
    delay.connect(echoGain).connect(out)

    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(out)
    noiseGain.connect(delay)
    noise.start(now)

    // フィードバックの輪は自然には外れないので、余韻が消えたら切り離す
    window.setTimeout(() => {
      delay.disconnect()
      feedback.disconnect()
      dampFilter.disconnect()
      echoGain.disconnect()
      out.disconnect()
    }, 20000)
  }, [])

  return {
    running,
    start,
    resume,
    suspend,
    setVolume,
    applySpatial,
    triggerSurfacing,
    triggerSubmerge,
    triggerSpatialResonance,
    triggerOverloadSonar, // 追加
    triggerIceBreak,
    triggerSink
  }
}