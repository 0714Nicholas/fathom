'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

function hashCode(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

function createAbyssalReverb(ctx: AudioContext, duration: number = 4.0, decay: number = 3.0) {
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

export function useDeepSeaAudio(opts: { enabled: boolean, progress: number, windSpeed: number, rainAmount: number, descent: number }) {
  const ctxRef = useRef<AudioContext | null>(null)
  const [running, setRunning] = useState(false)
  
  const masterGainRef = useRef<GainNode | null>(null)
  const reverbNodeRef = useRef<ConvolverNode | null>(null)
  const reverbGainRef = useRef<GainNode | null>(null)
  
  const bgmFilterRef = useRef<BiquadFilterNode | null>(null)
  const descentGainRef = useRef<GainNode | null>(null)

  const initAudio = useCallback(() => {
    if (ctxRef.current) return
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    
    const ctx = new AudioContextClass()
    ctxRef.current = ctx

    const master = ctx.createGain()
    master.gain.value = 0.8
    master.connect(ctx.destination)
    masterGainRef.current = master

    const reverb = ctx.createConvolver()
    reverb.buffer = createAbyssalReverb(ctx, 6.0, 4.0)
    reverbNodeRef.current = reverb

    const reverbGain = ctx.createGain()
    reverbGain.gain.value = 0.5
    reverb.connect(reverbGain)
    reverbGain.connect(master)
    reverbGainRef.current = reverbGain

    // --- 1. 海鳴り（ホワイトノイズ基礎環境音） ---
    const bufferSize = ctx.sampleRate * 2
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = noiseBuffer
    noiseSrc.loop = true

    const bgmFilter = ctx.createBiquadFilter()
    bgmFilter.type = 'lowpass'
    bgmFilter.frequency.value = 800
    bgmFilter.connect(master)
    bgmFilterRef.current = bgmFilter

    noiseSrc.connect(bgmFilter)
    noiseSrc.start()

    // --- 2. 潜行時の「しゅごぉぉぉ〜」専用ノイズチャンネル ---
    const descentNoise = ctx.createBufferSource()
    descentNoise.buffer = noiseBuffer
    descentNoise.loop = true

    const descentFilter = ctx.createBiquadFilter()
    descentFilter.type = 'bandpass'
    descentFilter.frequency.value = 400
    descentFilter.Q.value = 3.0

    const descentGain = ctx.createGain()
    descentGain.gain.value = 0 // 初期は無音
    descentGainRef.current = descentGain

    descentNoise.connect(descentFilter)
    descentFilter.connect(descentGain)
    descentGain.connect(master)
    descentNoise.start()

    setRunning(true)
  }, [])

  const resume = useCallback(async () => {
    if (!ctxRef.current) initAudio()
    if (ctxRef.current?.state === 'suspended') {
      await ctxRef.current.resume()
    }
    setRunning(true)
  }, [initAudio])

  const suspend = useCallback(async () => {
    if (ctxRef.current?.state === 'running') {
      await ctxRef.current.suspend()
    }
    setRunning(false)
  }, [])

  const start = resume

  // --- 潜行度（descent）に応じた「しゅごぉぉぉ〜」音のダイナミック制御 ---
  useEffect(() => {
    if (!ctxRef.current || !descentGainRef.current) return
    const ctx = ctxRef.current
    // descent（0〜1）が動いている最中に激しい水圧音を上げる
    const targetGain = opts.descent > 0 && opts.descent < 1 ? 0.6 : 0.0
    descentGainRef.current.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.2)
  }, [opts.descent])

  // --- 深度（progress）に応じた環境音の変化 ---
  useEffect(() => {
    if (!ctxRef.current || !bgmFilterRef.current || !reverbGainRef.current) return
    const ctx = ctxRef.current
    
    const targetFreq = 100 + (1 - opts.progress) * 700 
    bgmFilterRef.current.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 1.0)
    
    const targetReverb = 0.2 + (opts.progress * 0.9)
    reverbGainRef.current.gain.setTargetAtTime(targetReverb, ctx.currentTime, 1.0)
  }, [opts.progress])

  // --- クライアントUIの摩擦音（泡やインタラクション音のニュアンスを含む） ---
  const triggerFrictionImpulse = useCallback((payload: { intensity: number, durationMs: number, color: number }) => {
    if (!ctxRef.current || !masterGainRef.current || !reverbNodeRef.current) return
    const ctx = ctxRef.current
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.type = 'sine'
    // 色や強度に応じて少し高めのピッチ（泡やクリックの質感）を混ぜる
    const startFreq = 200 + payload.color * 400
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + payload.durationMs / 1000)
    
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(payload.intensity * 0.4, ctx.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + payload.durationMs / 1000)
    
    osc.connect(gain)
    gain.connect(masterGainRef.current)
    gain.connect(reverbNodeRef.current) 
    
    osc.start()
    osc.stop(ctx.currentTime + payload.durationMs / 1000 + 0.1)
  }, [])

  // --- 空間オーディオ ＋ クジラの鳴き声のような深海の立体ソナー ---
  const triggerSpatialResonance = useCallback((peerSeed: string, peerDepth: number, energy: number) => {
    if (!ctxRef.current || !masterGainRef.current || !reverbNodeRef.current) return 0
    const ctx = ctxRef.current

    const hash = hashCode(peerSeed)
    
    // クジラの鳴き声を彷彿とさせる、少し低めで神秘的な周波数帯
    const baseFreq = 80 + (Math.abs(hash) % 200)

    const panValue = ((Math.abs(hash * 31) % 100) / 50) - 1.0
    const panner = ctx.createStereoPanner()
    panner.pan.value = panValue

    const depthDiff = peerDepth - opts.progress 
    let cutoff = 3000
    if (depthDiff > 0) {
      cutoff = Math.max(120, 3000 - (depthDiff * 5000)) 
    } else if (depthDiff < 0) {
      cutoff = Math.min(5000, 3000 + (Math.abs(depthDiff) * 3000))
    }
    
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    filter.Q.value = 3.0 

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    // サイン波に加えて、少し有機的な揺らぎを持つ低音響
    osc.type = 'sine'
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime)
    // 遠くで鳴くクジラのように、ゆっくりとピッチがうねりながら下降する
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, ctx.currentTime + 1.8)
    
    const maxVol = Math.max(0.15, Math.min(0.85, energy))
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(maxVol, ctx.currentTime + 0.2)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.2)
    
    osc.connect(gain)
    gain.connect(filter)
    filter.connect(panner)
    panner.connect(masterGainRef.current)
    
    const sendToReverb = ctx.createGain()
    sendToReverb.gain.value = 0.95 
    panner.connect(sendToReverb)
    sendToReverb.connect(reverbNodeRef.current)

    osc.start()
    osc.stop(ctx.currentTime + 3.5)

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