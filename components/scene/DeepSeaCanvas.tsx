'use client'

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { CrystalCoral } from './CrystalCoral'
import { MarineSnow } from './MarineSnow'
import { ResonanceHeatmap } from './ResonanceHeatmap'
import { CompanionLights } from './CompanionLights'
import { SurfaceLight } from './SurfaceLight'
import { SinkingThoughts } from './SinkingThoughts'

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
  onChargeCancel?: () => void
  tuningValue?: number
  isTuning?: boolean
  /** 一緒に潜っている（または水面で待っている）自分以外の人数 */
  companionCount?: number
  /** 浮上直前の 0..1（最後の 1 分で 0 → 1） */
  surfaceOutro?: number
  /** 「沈める」たびに増える数 */
  sinkPulse?: number
}

export function DeepSeaCanvas(props: DeepSeaCanvasProps) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, stencil: false, depth: true }}
      >
        <fog attach="fog" args={['#02050a', 4, 12]} />

        <Suspense fallback={null}>
          <SurfaceLight
            progress={props.progress || 0}
            clouds={props.clouds || 0}
            outro={props.surfaceOutro || 0}
          />

          <CrystalCoral {...props} />

          <MarineSnow
            variant="near"
            progress={props.progress || 0}
            descent={props.descent || 0}
            windSpeed={props.windSpeed || 0}
            rainAmount={props.rainAmount || 0}
            clouds={props.clouds || 0}
            isSuspended={props.isSuspended}
            resonancePulse={props.resonancePulse} // 🚨 追加：衝撃波を雪に伝える
          />
          <MarineSnow
            variant="far"
            progress={props.progress || 0}
            descent={props.descent || 0}
            windSpeed={props.windSpeed || 0}
            rainAmount={props.rainAmount || 0}
            clouds={props.clouds || 0}
            isSuspended={props.isSuspended}
            resonancePulse={props.resonancePulse} // 🚨 追加：衝撃波を雪に伝える
          />

          <CompanionLights count={props.companionCount || 0} />
          <SinkingThoughts pulse={props.sinkPulse || 0} />

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
