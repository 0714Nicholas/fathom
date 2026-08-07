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
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }}
        dpr={[1, 2]}
        // 🚨 alpha: true に戻すことで、マリンスノーの「四角形のフチ」が透け、美しい球体に戻ります
        gl={{ antialias: true, alpha: true, stencil: false, depth: true }}
      >
        {/* 🚨 のっぺり感の原因だったベタ塗りの背景色を削除し、絶妙な奥行きを出す薄い霧だけを残します */}
        <fog attach="fog" args={['#02050a', 4, 12]} />

        <Suspense fallback={null}>
          <CrystalCoral {...props} />
          
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
    </div>
  )
}