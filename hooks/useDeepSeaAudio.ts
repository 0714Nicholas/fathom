'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// --- Utility: Seed to Hash ---
function hashCode(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

// --- Synth 1: 洞窟の残響（Abyssal Reverb Impulse） ---
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

// --- Synth 2: ピンクノイズ生成（自然界の1/fゆらぎ） ---
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
    output[i] *= 0.11 // ゲイン調整
    b6 = white * 0.115926
  }
  return buffer
}

export function useDeepSeaAudio(opts: { enabled: boolean, progress: number, windSpeed: number, rainAmount: number, descent: number }) {
  const ctxRef = useRef<AudioContext | null>(null)
  const [running, setRunning] = useState(false)
  
  // Audio Nodes
  const masterGainRef = useRef<GainNode | null>(null)
  const reverbRef = useRef<ConvolverNode | null>(null)
  
  const pinkNoiseGainRef = useRef<GainNode | null>(null)
  const pinkNoiseFilterRef = useRef<BiquadFilterNode | null>(null)
  
  const descentGainRef = useRef<GainNode | null>(null)
  const descentFilterRef = useRef<BiquadFilterNode | null>(null)

  const subDroneGainRef = useRef<GainNode | null>(null)

  // 1. イニシャライズ（オーディオエンジンの構築）
  const initAudio = useCallback(() => {
    if (ctxRef.current) return
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    
    const ctx = new AudioContextClass()
    ctxRef.current = ctx

    // --- Master ---
    const master = ctx.createGain()
    master.gain.value = 0.8
    master.connect(ctx.destination)
    masterGainRef.current = master

    // --- Reverb ---
    const reverb = ctx.createConvolver()
    reverb.buffer = createAbyssalReverb(ctx, 6.0, 3.5)
    reverb.connect(master)
    reverbRef.current = reverb

    // --- Ambient Pink Noise (海流・水圧) ---
    const noiseBuffer = createPinkNoiseBuffer(ctx)
    const noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = noiseBuffer
    noiseSrc.loop = true
    
    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.value = 1000 // 水面付近の音
    pinkNoiseFilterRef.current = noiseFilter
    
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.3
    pinkNoiseGainRef.current = noiseGain
    
    noiseSrc.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(master)
    noiseSrc.start()

    // --- Descent Rush (しゅごぉぉぉ〜専用チャンネル) ---
    const descentSrc = ctx.createBufferSource()
    descentSrc.buffer = noiseBuffer // ピンクノイズを再利用
    descentSrc.loop = true

    const descentFilter = ctx.createBiquadFilter()
    descentFilter.type = 'bandpass'
    descentFilter.frequency.value = 400
    descentFilter.Q.value = 0.8
    descentFilterRef.current = descentFilter

    const descentGain = ctx.createGain()
    descentGain.gain.value = 0.0 // 初期は無音
    descentGainRef.current = descentGain

    descentSrc.connect(descentFilter)
    descentFilter.connect(descentGain)
    descentGain.connect(master)
    descentGain.connect(reverb) // 潜行音も少し残響に流す
    descentSrc.start()

    // --- Sub-bass Drone (深海の地鳴り・水圧圧迫感) ---
    const subOsc = ctx.createOscillator()
    subOsc.type = 'sine'
    subOsc.frequency.value = 45 // 超低音
    const subGain = ctx.createGain()
    subGain.gain.value = 0.0
    subDroneGainRef.current = subGain
    
    subOsc.connect(subGain)
    subGain.connect(master)
    subOsc.start()

    setRunning(true)
  }, [])

  const resume = useCallback(async () => {
    if (!ctxRef.current) initAudio()
    if (ctxRef.current?.state === 'suspended') await ctxRef.current.resume()
    setRunning(true)
  }, [initAudio])

  const suspend = useCallback(async () => {
    if (ctxRef.current?.state === 'running') await ctxRef.current.suspend()
    setRunning(false)
  }, [])

  const start = resume

  // 2. 深度 (progress) に応じた環境音の動的変化
  useEffect(() => {
    if (!ctxRef.current || !pinkNoiseFilterRef.current || !subDroneGainRef.current) return
    const ctx = ctxRef.current
    const now = ctx.currentTime
    
    // 深くなるほど、高音が削れて「こもった重い海鳴り」になる
    const targetFreq = 100 + (1 - opts.progress) * 800
    pinkNoiseFilterRef.current.frequency.setTargetAtTime(targetFreq, now, 2.0)
    
    // 深くなるほど、サブベース（水圧の圧迫感）が強くなる
    const targetSub = opts.progress * 0.4
    subDroneGainRef.current.gain.setTargetAtTime(targetSub, now, 2.0)
  }, [opts.progress])

  // 3. 潜行 (descent) に応じた「しゅごぉぉぉ〜」の制御
  useEffect(() => {
    if (!ctxRef.current || !descentGainRef.current || !descentFilterRef.current) return
    const ctx = ctxRef.current
    const now = ctx.currentTime
    
    // descentが 0 < x < 1 の時にだけ音量を上げる
    if (opts.descent > 0 && opts.descent < 1) {
      // 潜るスピード感（しゅごぉぉぉ）
      descentGainRef.current.gain.setTargetAtTime(0.5, now, 0.5)
      // フィルターを動かして「水流がすれ違う」質感を出す
      descentFilterRef.current.frequency.setTargetAtTime(800 - opts.progress * 400, now, 0.5)
    } else {
      // 到達したらフッと消える
      descentGainRef.current.gain.setTargetAtTime(0.0, now, 1.0)
    }
  }, [opts.descent, opts.progress])

  // 4. 生態系の自律生成（泡とクジラ）
  useEffect(() => {
    if (!running || !ctxRef.current || !masterGainRef.current || !reverbRef.current) return
    const ctx = ctxRef.current

    let timeoutId: number

    const scheduleEcosystem = () => {
      // 深海（progress > 0.4）ではクジラ、浅瀬（progress <= 0.4）では泡が鳴りやすい
      const isDeep = opts.progress > 0.4
      
      if (isDeep) {
        // --- クジラ / 巨大生物のソナー ---
        if (Math.random() > 0.6) { // 約40%の確率で鳴く
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          const panner = ctx.createStereoPanner()
          
          osc.type = 'sine'
          const startFreq = 120 + Math.random() * 100
          osc.frequency.setValueAtTime(startFreq, ctx.currentTime)
          osc.frequency.exponentialRampToValueAtTime(startFreq * 0.5, ctx.currentTime + 3.0) // 悲しげに下がる
          
          panner.pan.value = Math.random() * 2 - 1 // 遠くのランダムな位置
          
          gain.gain.setValueAtTime(0, ctx.currentTime)
          gain.gain.linearRampToValueAtTime(0.1 + Math.random() * 0.1, ctx.currentTime + 1.0)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4.0)
          
          osc.connect(gain).connect(panner).connect(reverbRef.current!) // 100%残響へ
          panner.connect(masterGainRef.current!)
          
          osc.start()
          osc.stop(ctx.currentTime + 4.5)
        }
      } else {
        // --- 気泡の弾ける音（バブル） ---
        if (Math.random() > 0.3) {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          const panner = ctx.createStereoPanner()
          
          osc.type = 'sine'
          const startFreq = 600 + Math.random() * 600
          osc.frequency.setValueAtTime(startFreq, ctx.currentTime)
          osc.frequency.exponentialRampToValueAtTime(startFreq * 0.2, ctx.currentTime + 0.1) // 瞬時に下がる
          
          panner.pan.value = Math.random() * 2 - 1
          
          gain.gain.setValueAtTime(0, ctx.currentTime)
          gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.01)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
          
          osc.connect(gain).connect(panner).connect(masterGainRef.current!)
          
          osc.start()
          osc.stop(ctx.currentTime + 0.2)
        }
      }
      
      // 次のイベントを 3秒 〜 10秒 の間でランダムにスケジュール
      timeoutId = window.setTimeout(scheduleEcosystem, 3000 + Math.random() * 7000)
    }
    
    scheduleEcosystem()
    
    return () => clearTimeout(timeoutId)
  }, [running, opts.progress])

  // 5. 自己アクション（文字入力などの摩擦音）
  const triggerFrictionImpulse = useCallback((payload: { intensity: number, durationMs: number, color: number }) => {
    if (!ctxRef.current || !masterGainRef.current || !reverbRef.current) return
    const ctx = ctxRef.current
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.type = 'triangle' // 少し硬質なクリスタルの音
    osc.frequency.setValueAtTime(300 + payload.color * 400, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + payload.durationMs / 1000)
    
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(payload.intensity * 0.3, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + payload.durationMs / 1000)
    
    osc.connect(gain)
    gain.connect(masterGainRef.current)
    gain.connect(reverbRef.current) 
    
    osc.start()
    osc.stop(ctx.currentTime + payload.durationMs / 1000 + 0.1)
  }, [])

  // 6. 🚨新機能🚨 立体空間オーディオ（他者のソナー）
  const triggerSpatialResonance = useCallback((peerSeed: string, peerDepth: number, energy: number) => {
    if (!ctxRef.current || !masterGainRef.current || !reverbRef.current) return 0
    const ctx = ctxRef.current
    const hash = hashCode(peerSeed)
    
    // 【Voice】 Seed固有の周波数
    const baseFreq = 120 + (Math.abs(hash) % 250)
    
    // 【Position】 Seed固有の定位
    const panValue = ((Math.abs(hash * 31) % 100) / 50) - 1.0
    const panner = ctx.createStereoPanner()
    panner.pan.value = panValue

    // 【Water Pressure】 深度差による水圧フィルター
    const depthDiff = peerDepth - opts.progress 
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

  return {
    running,
    start,
    resume,
    suspend,
    triggerFrictionImpulse,
    triggerSpatialResonance,
  }
}