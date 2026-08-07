'use client'

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { CrystalCoral } from './CrystalCoral'
import { MarineSnow } from './MarineSnow'
import { ResonanceHeatmap } from './ResonanceHeatmap'

export interface DeepSeaCanvasProps {
  progress?: number
  windSpeed?: number
  clouds?: number
  rainAmount?: number
  temp?: number
  diveTimeMs?: number
  releaseCount?: number
  sessionPhase?: string
  descent?: number
  isSuspended?: boolean
  identity?: any
  resonancePulse?: number
  resonanceEnergy?: number
  heatmapPulse?: any
  isCharging?: boolean
  turbidity?: number
  onChargeStart?: () => void
  onChargeStop?: () => void
}

export function DeepSeaCanvas(props: DeepSeaCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.5], fov: 45 }}
      dpr={[1, 2]}
      // 🚨 背景を透明(alpha: true)にし、元の美しいHTML背景を透過させます
      gl={{ antialias: true, alpha: true, stencil: false, depth: false }}
    >
      <Suspense fallback={null}>
        <CrystalCoral {...props} />
        
        {/* 🚨 fogを取り除いたことで、奥と手前のマリンスノーが鮮明に見えるようになります */}
        <MarineSnow 
          variant="near" 
          progress={props.progress || 0} 
          descent={props.descent || 0} 
          windSpeed={props.windSpeed || 0} 
          rainAmount={props.rainAmount || 0}
          clouds={props.clouds || 0} 
        />
        <MarineSnow 
          variant="far" 
          progress={props.progress || 0} 
          descent={props.descent || 0} 
          windSpeed={props.windSpeed || 0} 
          rainAmount={props.rainAmount || 0}
          clouds={props.clouds || 0} 
        />
        
        <ResonanceHeatmap 
          latestPulse={props.heatmapPulse} 
          progress={props.progress || 0} 
          descent={props.descent || 0} 
        />
      </Suspense>
    </Canvas>
  )
}