'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

type MarineSnowProps = {
  variant: 'far' | 'near'
  windSpeed: number
  rainAmount: number
  clouds: number
  progress: number
  /** 0..1, supplied by useFathomDescent. */
  descent: number
}

type FieldData = {
  positions: Float32Array
  colors: Float32Array
  drift: Float32Array
  fall: Float32Array
  count: number
  bounds: { x: number; y: number; z: number }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function createField(
  count: number,
  bounds: { x: number; y: number; z: number },
  variant: 'far' | 'near'
): FieldData {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const drift = new Float32Array(count)
  const fall = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const x = randomBetween(-bounds.x, bounds.x)
    const y = randomBetween(-bounds.y, bounds.y)
    const z = randomBetween(-bounds.z, bounds.z)

    positions[i * 3 + 0] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    const depthFactor = (z + bounds.z) / (bounds.z * 2)
    const baseR = THREE.MathUtils.lerp(0.72, 0.9, depthFactor)
    const baseG = THREE.MathUtils.lerp(0.84, 0.96, depthFactor)
    const baseB = THREE.MathUtils.lerp(0.92, 1.0, depthFactor)

    const fade =
      variant === 'far'
        ? THREE.MathUtils.lerp(0.45, 0.82, depthFactor)
        : THREE.MathUtils.lerp(0.66, 1.0, depthFactor)

    colors[i * 3 + 0] = baseR * fade
    colors[i * 3 + 1] = baseG * fade
    colors[i * 3 + 2] = baseB * fade

    drift[i] = variant === 'far' ? randomBetween(0.01, 0.055) : randomBetween(0.03, 0.12)
    fall[i] = variant === 'far' ? randomBetween(0.03, 0.11) : randomBetween(0.08, 0.2)
  }

  return { positions, colors, drift, fall, count, bounds }
}

export function MarineSnow({
  variant,
  windSpeed,
  rainAmount,
  clouds,
  progress,
  descent,
}: MarineSnowProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.PointsMaterial>(null)

  const field = useMemo(() => {
    const count = variant === 'far' ? 1400 : 720
    const bounds =
      variant === 'far' ? { x: 10, y: 10, z: 8 } : { x: 8, y: 8, z: 5 }
    return createField(count, bounds, variant)
  }, [variant])

  const liveRef = useRef({ windSpeed, rainAmount, clouds, progress, descent })

  useEffect(() => {
    liveRef.current = { windSpeed, rainAmount, clouds, progress, descent }
  }, [clouds, descent, progress, rainAmount, windSpeed])

  useEffect(() => {
    return () => {
      pointsRef.current?.geometry.dispose()
      materialRef.current?.dispose()
    }
  }, [])

  useFrame((state, delta) => {
    const points = pointsRef.current
    const material = materialRef.current
    if (!points || !material) return

    const posAttr = points.geometry.attributes.position
    const pos = posAttr.array as Float32Array
    const t = state.clock.elapsedTime

    const {
      windSpeed: lw,
      rainAmount: lr,
      clouds: lc,
      progress: lp,
      descent: ld,
    } = liveRef.current

    const windDrift = clamp(lw / 20, 0, 1) * (variant === 'far' ? 0.12 : 0.22)
    const rainSink = clamp(lr / 10, 0, 1) * (variant === 'far' ? 0.07 : 0.12)
    const depthSlow = THREE.MathUtils.lerp(1.0, 0.72, clamp(lp, 0, 1))

    const bounds = field.bounds
    const count = field.count

    for (let i = 0; i < count; i++) {
      const ix = i * 3
      const localWave =
        Math.sin(t * 0.22 + i * 0.013) * (variant === 'far' ? 0.015 : 0.03)

      pos[ix + 0] += (field.drift[i] + windDrift + localWave) * delta * depthSlow
      pos[ix + 1] -= (field.fall[i] + rainSink) * delta * depthSlow

      if (pos[ix + 1] < -bounds.y) {
        pos[ix + 1] = bounds.y
        pos[ix + 0] = randomBetween(-bounds.x, bounds.x)
        pos[ix + 2] = randomBetween(-bounds.z, bounds.z)
      }

      if (pos[ix + 0] > bounds.x) pos[ix + 0] = -bounds.x
      if (pos[ix + 0] < -bounds.x) pos[ix + 0] = bounds.x
    }

    posAttr.needsUpdate = true
    points.rotation.z = Math.sin(t * 0.05) * 0.08 + windDrift * 0.32

    const rainFactor = clamp(lr / 10, 0, 1)
    const cloudFactor = clamp(lc / 100, 0, 1)

    const baseOpacity =
      variant === 'far'
        ? 0.12 + cloudFactor * 0.1 + rainFactor * 0.12
        : 0.18 + rainFactor * 0.16

    // Descent shapes the snow's presence:
    //   at descent=0, particles are barely visible (~10% of base)
    //   at descent=1, particles are at their full computed opacity
    const descentMul = THREE.MathUtils.lerp(0.1, 1.0, clamp(ld, 0, 1))
    const targetOpacity = baseOpacity * descentMul

    material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, delta * 2.2)
    material.size = THREE.MathUtils.lerp(
      material.size,
      variant === 'far'
        ? 0.034 + clamp(lp, 0, 1) * 0.01
        : 0.058 + clamp(lp, 0, 1) * 0.015,
      delta * 2.2
    )
  })

  return (
    <points
      ref={pointsRef}
      position={variant === 'far' ? [0, 0, -2.6] : [0, 0, -0.8]}
    >
      <bufferGeometry key={field.count}>
        {/* --- 修正ポイント：args を用いた配列渡し --- */}
        <bufferAttribute
          attach="attributes-position"
          args={[field.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[field.colors, 3]}
        />
      </bufferGeometry>

      <pointsMaterial
        ref={materialRef}
        size={variant === 'far' ? 0.038 : 0.062}
        vertexColors
        transparent
        opacity={variant === 'far' ? 0.18 : 0.24}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}