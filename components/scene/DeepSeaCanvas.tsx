'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MarineSnow } from '@/components/scene/MarineSnow'
import { CrystalCoral } from '@/components/scene/CrystalCoral'
import {
  ResonanceHeatmap,
  type HeatmapPulse,
} from '@/components/scene/ResonanceHeatmap'
import type { CrystalIdentity } from '@/lib/identity/crystalSeed'

type DeepSeaCanvasProps = {
  progress: number
  windSpeed: number
  rainAmount: number
  clouds: number
  resonancePulse: number
  resonanceEnergy: number
  identity: CrystalIdentity
  heatmapPulse: HeatmapPulse | null
  descent: number
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/**
 * Inside the Canvas: smoothly move the camera toward its target z based on descent.
 * - descent=0: camera is pulled back (z ≈ 7.6), like floating above the surface
 * - descent=1: camera is settled at z ≈ 6.0
 */
function CameraDescent({ descent }: { descent: number }) {
  const targetZ = useRef(0)

  useFrame((state, delta) => {
    const d = clamp(descent, 0, 1)
    targetZ.current = THREE.MathUtils.lerp(7.6, 6.0, d)
    state.camera.position.z = THREE.MathUtils.lerp(
      state.camera.position.z,
      targetZ.current,
      delta * 1.6
    )
    // very gentle look at center
    state.camera.lookAt(0, 0, 0)
  })

  return null
}

export function DeepSeaCanvas({
  progress,
  windSpeed,
  rainAmount,
  clouds,
  resonancePulse,
  resonanceEnergy,
  identity,
  heatmapPulse,
  descent,
}: DeepSeaCanvasProps) {
  const bgColor = useMemo(() => {
    const h = THREE.MathUtils.lerp(0.56, 0.58, clamp(progress, 0, 1))
    const s = THREE.MathUtils.lerp(0.42, 0.5, clamp(clouds / 100, 0, 1))
    const l = THREE.MathUtils.lerp(0.09, 0.05, clamp(progress, 0, 1))
    return new THREE.Color().setHSL(h, s, l)
  }, [clouds, progress])

  const d = clamp(descent, 0, 1)

  // During descent: fog reaches further (airy), tightens as we settle.
  const fogNear = 4.8 + progress * 0.8 + (1 - d) * 1.4
  const fogFar = 13.5 - progress * 2.0 + (1 - d) * 4.0

  const pointIntensity = (0.75 + resonanceEnergy * 1.25) * THREE.MathUtils.lerp(0.4, 1.0, d)
  const backLightIntensity = (0.35 + progress * 0.22) * THREE.MathUtils.lerp(0.5, 1.0, d)
  const ambientIntensity = 0.36 * THREE.MathUtils.lerp(0.55, 1.0, d)

  return (
    <div className="scene-canvas">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 7.6], fov: 48 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        fallback={<div className="scene-canvas-fallback" />}
      >
        <CameraDescent descent={d} />

        <color attach="background" args={[bgColor]} />
        <fog attach="fog" args={[bgColor, fogNear, fogFar]} />

        <ambientLight intensity={ambientIntensity} color="#9ddcff" />
        <pointLight
          position={[2.8, 2.5, 3.6]}
          intensity={pointIntensity}
          color="#90ddff"
        />
        <pointLight
          position={[-3.2, -1.2, -2.5]}
          intensity={backLightIntensity}
          color="#3b88b4"
        />

        <MarineSnow
          variant="far"
          windSpeed={windSpeed}
          rainAmount={rainAmount}
          clouds={clouds}
          progress={progress}
          descent={d}
        />

        <MarineSnow
          variant="near"
          windSpeed={windSpeed}
          rainAmount={rainAmount}
          clouds={clouds}
          progress={progress}
          descent={d}
        />

        <ResonanceHeatmap
          latestPulse={heatmapPulse}
          progress={progress}
          descent={d}
        />

        <CrystalCoral
          progress={progress}
          windSpeed={windSpeed}
          resonancePulse={resonancePulse}
          resonanceEnergy={resonanceEnergy}
          identity={identity}
          descent={d}
        />
      </Canvas>
    </div>
  )
}
