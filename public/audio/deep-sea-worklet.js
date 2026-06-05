class DeepSeaNoiseProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        { name: 'pinkLevel',   defaultValue: 0.58, minValue: 0,   maxValue: 1,   automationRate: 'k-rate' },
        { name: 'brownLevel',  defaultValue: 0.72, minValue: 0,   maxValue: 1.5, automationRate: 'k-rate' },
        { name: 'baseGain',    defaultValue: 0.18, minValue: 0,   maxValue: 1,   automationRate: 'k-rate' },
        { name: 'lfoRate',     defaultValue: 0.16, minValue: 0.1, maxValue: 0.3, automationRate: 'k-rate' },
        { name: 'lfoDepth',    defaultValue: 0.22, minValue: 0,   maxValue: 1,   automationRate: 'k-rate' },
        { name: 'stereoWidth', defaultValue: 0.14, minValue: 0,   maxValue: 1,   automationRate: 'k-rate' },
        { name: 'drift',       defaultValue: 0.06, minValue: 0,   maxValue: 0.4, automationRate: 'k-rate' },
      ]
    }
  
    constructor() {
      super()
      this._twoPi = Math.PI * 2
      this._lfoPhase = Math.random() * this._twoPi
      this._frameCount = 0
  
      this._pinkState = [
        { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 },
        { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 },
      ]
  
      this._brownState = [0, 0]
  
      this._frictionEnv = 0
      this._frictionDecay = 0.9995
      this._frictionColor = 0.78
      this._frictionPrevIn = [0, 0]
      this._frictionPrevOut = [0, 0]
  
      this._meterSmoothing = 0
      this._sendMeterEvery = 12
  
      this.port.onmessage = (event) => {
        const msg = event.data
        if (!msg || typeof msg !== 'object') return
        if (msg.type === 'friction') {
          this._triggerFriction(
            msg.intensity ?? 0.45,
            msg.durationMs ?? 180,
            msg.color ?? 0.78
          )
        }
      }
    }
  
    _clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }
  
    _paramAt(parameters, name, i) {
      const arr = parameters[name]
      if (!arr || arr.length === 0) return 0
      return arr.length === 1 ? arr[0] : arr[i]
    }
  
    _nextPink(channel, white) {
      const s = this._pinkState[channel]
      s.b0 = 0.99886 * s.b0 + white * 0.0555179
      s.b1 = 0.99332 * s.b1 + white * 0.0750759
      s.b2 = 0.96900 * s.b2 + white * 0.1538520
      s.b3 = 0.86650 * s.b3 + white * 0.3104856
      s.b4 = 0.55000 * s.b4 + white * 0.5329522
      s.b5 = -0.7616 * s.b5 - white * 0.0168980
      const out = s.b0 + s.b1 + s.b2 + s.b3 + s.b4 + s.b5 + s.b6 + white * 0.5362
      s.b6 = white * 0.115926
      return out * 0.11
    }
  
    _nextBrown(channel, white) {
      this._brownState[channel] = (this._brownState[channel] + 0.02 * white) / 1.02
      return this._brownState[channel] * 3.5
    }
  
    _highpassFriction(channel, input, alpha) {
      const y = alpha * (this._frictionPrevOut[channel] + input - this._frictionPrevIn[channel])
      this._frictionPrevIn[channel] = input
      this._frictionPrevOut[channel] = y
      return y
    }
  
    _triggerFriction(intensity, durationMs, color) {
      const safeIntensity = this._clamp(intensity, 0, 1.2)
      const safeDurationSec = Math.max(0.016, durationMs / 1000)
      this._frictionEnv = Math.max(this._frictionEnv, safeIntensity)
      this._frictionColor = this._clamp(color, 0.55, 0.95)
      this._frictionDecay = Math.exp(Math.log(0.0001) / (sampleRate * safeDurationSec))
    }
  
    process(inputs, outputs, parameters) {
      const output = outputs[0]
      if (!output || output.length === 0) return true
      const left = output[0]
      const right = output[1] || output[0]
      let frameAbs = 0
  
      for (let i = 0; i < left.length; i++) {
        const pinkLevel   = this._clamp(this._paramAt(parameters, 'pinkLevel', i),   0, 1)
        const brownLevel  = this._clamp(this._paramAt(parameters, 'brownLevel', i),  0, 1.5)
        const baseGain    = this._clamp(this._paramAt(parameters, 'baseGain', i),    0, 1)
        const lfoRate     = this._clamp(this._paramAt(parameters, 'lfoRate', i),     0.1, 0.3)
        const lfoDepth    = this._clamp(this._paramAt(parameters, 'lfoDepth', i),    0, 1)
        const stereoWidth = this._clamp(this._paramAt(parameters, 'stereoWidth', i), 0, 1)
        const drift       = this._clamp(this._paramAt(parameters, 'drift', i),       0, 0.4)
  
        this._lfoPhase += (this._twoPi * lfoRate) / sampleRate
        if (this._lfoPhase > this._twoPi) this._lfoPhase -= this._twoPi
  
        const lfoBase = (Math.sin(this._lfoPhase) + 1) * 0.5
        const lfo = 1 - lfoDepth * 0.5 + lfoBase * lfoDepth
  
        const phaseOffset = 0.37 + drift * 0.8
        const lfoRBase = (Math.sin(this._lfoPhase + phaseOffset) + 1) * 0.5
        const lfoR = 1 - lfoDepth * 0.5 + lfoRBase * lfoDepth
  
        const whiteL = Math.random() * 2 - 1
        const whiteR = Math.random() * 2 - 1
  
        const pinkL = this._nextPink(0, whiteL)
        const pinkR = this._nextPink(1, whiteR)
        const brownL = this._nextBrown(0, whiteL)
        const brownR = this._nextBrown(1, whiteR)
  
        const seaL = (pinkL * pinkLevel + brownL * brownLevel) * baseGain * lfo
        const seaR = (pinkR * pinkLevel + brownR * brownLevel) * baseGain * lfoR
  
        const cross = stereoWidth * 0.08
        const mixedL = seaL * (1 - cross) + seaR * cross
        const mixedR = seaR * (1 - cross) + seaL * cross
  
        let frictionL = 0
        let frictionR = 0
  
        if (this._frictionEnv > 0.00015) {
          const fricWhiteL = Math.random() * 2 - 1
          const fricWhiteR = Math.random() * 2 - 1
          const hpAlpha = this._frictionColor
          const hpL = this._highpassFriction(0, fricWhiteL, hpAlpha)
          const hpR = this._highpassFriction(1, fricWhiteR, hpAlpha)
          frictionL = hpL * this._frictionEnv * 0.12
          frictionR = hpR * this._frictionEnv * 0.12
          this._frictionEnv *= this._frictionDecay
        }
  
        const outL = mixedL + frictionL
        const outR = mixedR + frictionR
        left[i] = outL
        right[i] = outR
        frameAbs += Math.abs(outL) + Math.abs(outR)
      }
  
      this._frameCount++
      if (this._frameCount % this._sendMeterEvery === 0) {
        const avg = frameAbs / (left.length * 2)
        this._meterSmoothing = this._meterSmoothing * 0.85 + avg * 0.15
        this.port.postMessage({ type: 'meter', value: this._meterSmoothing })
      }
  
      return true
    }
  }
  
  registerProcessor('deep-sea-noise-processor', DeepSeaNoiseProcessor)
  