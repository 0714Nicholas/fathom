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

export function useDeepSeaAudio(opts: { 
  enabled: boolean, 
  progress: number, 
  windSpeed: number, 
  rainAmount: number, 
  descent: number,
  isCharging?: boolean,
  turbidity?: number 
}) {
  const ctxRef = useRef<AudioContext | null>(null)
  const [running, setRunning] = useState(false)
  
  const masterGainRef = useRef<GainNode | null>(null)
  const reverbRef = useRef<ConvolverNode | null>(null)
  
  const pinkNoiseGainRef = useRef<GainNode | null>(null)
  const pinkNoiseFilterRef = useRef<BiquadFilterNode | null>(null)
  
  const descentGainRef = useRef<GainNode | null>(null)
  const descentFilterRef = useRef<BiquadFilterNode | null>(null)

  const subDroneGainRef = useRef<GainNode | null>(null)

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
    reverb.buffer = createAbyssalReverb(ctx, 6.0, 3.5)
    reverb.connect(master)
    reverbRef.current = reverb

    // --- Ambient Pink Noise ---
    const noiseBuffer = createPinkNoiseBuffer(ctx)
    const noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = noiseBuffer
    noiseSrc.loop = true
    
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
    breathLFO.connect(breathGain)
    breathGain.connect(noiseGain.gain) 
    breathLFO.start()

    noiseSrc.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(master)
    noiseSrc.start()

    // --- Descent Rush ---
    const descentSrc = ctx.createBufferSource()
    descentSrc.buffer = noiseBuffer
    descentSrc.loop = true

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
    descentSrc.start()

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

  // --- Depth, Charging, and Turbidity ---
  useEffect(() => {
    if (!ctxRef.current || !pinkNoiseFilterRef.current || !subDroneGainRef.current) return
    const ctx = ctxRef.current
    const now = ctx.currentTime
    
    // 濁度（Turbidity）が高い時、フィルターが開いて耳障りな高音ノイズが混ざる
    const currentTurbidity = opts.turbidity || 0
    const targetFreq = currentTurbidity > 0 ? 3000 + (currentTurbidity * 5000) : 100 + (1 - opts.progress) * 800
    pinkNoiseFilterRef.current.frequency.setTargetAtTime(targetFreq, now, 1.0)
    
    // 濁っている時は、海鳴りの音量自体も少し暴れさせる
    if (pinkNoiseGainRef.current) {
      const baseGain = 0.35 + (currentTurbidity * 0.3)
      pinkNoiseGainRef.current.gain.setTargetAtTime(baseGain, now, 1.0)
    }

    // チャージ中はサブベース（ドローン）が強烈にうなりを上げる
    const baseSub = opts.progress * 0.4
    const chargeSub = opts.isCharging ? 0.8 : 0.0
    subDroneGainRef.current.gain.setTargetAtTime(baseSub + chargeSub, now, 0.5)
  }, [opts.progress, opts.isCharging, opts.turbidity])

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
  }, [opts.descent, opts.progress])

  // --- Ecosystem (Whales and Bubbles) ---
  useEffect(() => {
    if (!running || !ctxRef.current || !masterGainRef.current || !reverbRef.current) return
    const ctx = ctxRef.current

    let timeoutId: number

    const scheduleEcosystem = () => {
      const isDeep = opts.progress > 0.4
      
      if (isDeep) {
        if (Math.random() > 0.6) {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          const panner = ctx.createStereoPanner()
          
          osc.type = 'sine'
          const startFreq = 120 + Math.random() * 100
          osc.frequency.setValueAtTime(startFreq, ctx.currentTime)
          osc.frequency.exponentialRampToValueAtTime(startFreq * 0.5, ctx.currentTime + 3.0) 
          
          panner.pan.value = Math.random() * 2 - 1 
          
          gain.gain.setValueAtTime(0, ctx.currentTime)
          gain.gain.linearRampToValueAtTime(0.1 + Math.random() * 0.1, ctx.currentTime + 1.0)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4.0)
          
          osc.connect(gain).connect(panner).connect(reverbRef.current!) 
          panner.connect(masterGainRef.current!)
          
          osc.start()
          osc.stop(ctx.currentTime + 4.5)
        }
      } else {
        if (Math.random() > 0.3) {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          const panner = ctx.createStereoPanner()
          const filter = ctx.createBiquadFilter()
          
          osc.type = 'sine'
          const startFreq = 250 + Math.random() * 150
          osc.frequency.setValueAtTime(startFreq, ctx.currentTime)
          osc.frequency.exponentialRampToValueAtTime(startFreq * 1.5, ctx.currentTime + 0.04) 
          
          filter.type = 'lowpass'
          filter.frequency.value = 800
          
          panner.pan.value = Math.random() * 2 - 1
          
          gain.gain.setValueAtTime(0, ctx.currentTime)
          gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
          
          osc.connect(gain).connect(filter).connect(panner).connect(masterGainRef.current!)
          const reverbSend = ctx.createGain()
          reverbSend.gain.value = 0.3
          panner.connect(reverbSend).connect(reverbRef.current!)

          osc.start()
          osc.stop(ctx.currentTime + 0.1)
        }
      }
      
      timeoutId = window.setTimeout(scheduleEcosystem, 3000 + Math.random() * 7000)
    }
    
    scheduleEcosystem()
    
    return () => clearTimeout(timeoutId)
  }, [running, opts.progress])

  // --- Interactions ---
  const triggerFrictionImpulse = useCallback((payload: { intensity: number, durationMs: number, color: number }) => {
    if (!ctxRef.current || !masterGainRef.current || !reverbRef.current) return
    const ctx = ctxRef.current
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.type = 'triangle' 
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

  const triggerSpatialResonance = useCallback((peerSeed: string, peerDepth: number, energy: number) => {
    if (!ctxRef.current || !masterGainRef.current || !reverbRef.current) return 0
    const ctx = ctxRef.current
    const hash = hashCode(peerSeed)
    
    const baseFreq = 120 + (Math.abs(hash) % 250)
    const panValue = ((Math.abs(hash * 31) % 100) / 50) - 1.0
    const panner = ctx.createStereoPanner()
    panner.pan.value = panValue

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
    gain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.05) // 強烈なアタック
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4.0) // 長い余韻
    
    osc.connect(gain).connect(masterGainRef.current)
    gain.connect(reverbRef.current)
    
    osc.start()
    osc.stop(ctx.currentTime + 4.5)
  }, [])

  return {
    running,
    start,
    resume,
    suspend,
    triggerFrictionImpulse,
    triggerSpatialResonance,
    triggerOverloadSonar // 追加
  }
}