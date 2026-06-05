'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

export type HeatmapPulse = {
  authorId: string
  azimuthDeg: number
  hueDeg: number
  energy: number
  at: number
}

export type ResonanceHeatmapProps = {
  latestPulse: HeatmapPulse | null
  progress: number
  /** 0..1, supplied by useFathomDescent. */
  descent: number
  baseRadius?: number
  sectorCount?: number
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function azimuthToSectorIndex(azimuthDeg: number, sectorCount: number) {
  const a = ((azimuthDeg % 360) + 360) % 360
  const idx = Math.floor((a / 360) * sectorCount)
  return clamp(idx, 0, sectorCount - 1)
}

type SectorState = {
  intensity: number
  hueDeg: number
  lastTouchedAt: number
}

export function ResonanceHeatmap({
  latestPulse,
  progress,
  descent,
  baseRadius = 1.45,
  sectorCount = 32,
}: ResonanceHeatmapProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)

  const { geometry, sectors } = useMemo(() => {
    const innerR = 1.0
    const outerR = 1.18

    const vertices = new Float32Array(sectorCount * 4 * 3)
    const colors = new Float32Array(sectorCount * 4 * 3)
    const indices = new Uint16Array(sectorCount * 6)
    const sectorStates: SectorState[] = []

    for (let i = 0; i < sectorCount; i++) {
      const a0 = (i / sectorCount) * Math.PI * 2
      const a1 = ((i + 1) / sectorCount) * Math.PI * 2
      const cos0 = Math.cos(a0)
      const sin0 = Math.sin(a0)
      const cos1 = Math.cos(a1)
      const sin1 = Math.sin(a1)

      const v = i * 4 * 3
      vertices[v + 0] = innerR * cos0
      vertices[v + 1] = innerR * sin0
      vertices[v + 2] = 0
      vertices[v + 3] = outerR * cos0
      vertices[v + 4] = outerR * sin0
      vertices[v + 5] = 0
      vertices[v + 6] = outerR * cos1
      vertices[v + 7] = outerR * sin1
      vertices[v + 8] = 0
      vertices[v + 9] = innerR * cos1
      vertices[v + 10] = innerR * sin1
      vertices[v + 11] = 0

      for (let k = 0; k < 4; k++) {
        colors[v + k * 3 + 0] = 0.4
        colors[v + k * 3 + 1] = 0.7
        colors[v + k * 3 + 2] = 0.95
      }

      const idxBase = i * 4
      const ii = i * 6
      indices[ii + 0] = idxBase + 0
      indices[ii + 1] = idxBase + 1
      indices[ii + 2] = idxBase + 2
      indices[ii + 3] = idxBase + 0
      indices[ii + 4] = idxBase + 2
      indices[ii + 5] = idxBase + 3

      sectorStates.push({ intensity: 0, hueDeg: 210, lastTouchedAt: 0 })
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    geo.computeBoundingSphere()

    return { geometry: geo, sectors: sectorStates }
  }, [sectorCount])

  useEffect(() => {
    return () => {
      geometry.dispose()
      materialRef.current?.dispose()
    }
  }, [geometry])

  const lastConsumedAtRef = useRef<number>(0)

  useEffect(() => {
    if (!latestPulse) return
    if (latestPulse.at <= lastConsumedAtRef.current) return
    lastConsumedAtRef.current = latestPulse.at

    const idx = azimuthToSectorIndex(latestPulse.azimuthDeg, sectorCount)
    const sector = sectors[idx]
    if (!sector) return

    sector.intensity = clamp(sector.intensity + latestPulse.energy * 1.2, 0, 1.4)
    sector.hueDeg = latestPulse.hueDeg

    const leftIdx = (idx - 1 + sectorCount) % sectorCount
    const rightIdx = (idx + 1) % sectorCount
    sectors[leftIdx].intensity = clamp(
      sectors[leftIdx].intensity + latestPulse.energy * 0.42,
      0,
      1.2
    )
    sectors[leftIdx].hueDeg = THREE.MathUtils.lerp(
      sectors[leftIdx].hueDeg,
      latestPulse.hueDeg,
      0.4
    )
    sectors[rightIdx].intensity = clamp(
      sectors[rightIdx].intensity + latestPulse.energy * 0.42,
      0,
      1.2
    )
    sectors[rightIdx].hueDeg = THREE.MathUtils.lerp(
      sectors[rightIdx].hueDeg,
      latestPulse.hueDeg,
      0.4
    )
  }, [latestPulse, sectorCount, sectors])

  const colorScratch = useMemo(() => new THREE.Color(), [])

  useFrame((state, delta) => {
    const mesh = meshRef.current
    const material = materialRef.current
    if (!mesh || !material) return

    const targetRadius = baseRadius - clamp(progress, 0, 1) * 0.12
    mesh.scale.setScalar(targetRadius)
    mesh.rotation.z += delta * 0.04

    const colorAttr = mesh.geometry.attributes.color as THREE.BufferAttribute
    const colors = colorAttr.array as Float32Array

    let maxIntensity = 0
    for (let i = 0; i < sectorCount; i++) {
      const s = sectors[i]
      s.intensity = THREE.MathUtils.damp(s.intensity, 0, 1.4, delta)
      const intensity = s.intensity
      if (intensity > maxIntensity) maxIntensity = intensity

      const sat = THREE.MathUtils.lerp(0.18, 0.62, clamp(intensity, 0, 1))
      const lit = THREE.MathUtils.lerp(0.32, 0.72, clamp(intensity, 0, 1))
      colorScratch.setHSL((s.hueDeg % 360) / 360, sat, lit)

      const v = i * 4 * 3
      for (let k = 0; k < 4; k++) {
        colors[v + k * 3 + 0] = colorScratch.r
        colors[v + k * 3 + 1] = colorScratch.g
        colors[v + k * 3 + 2] = colorScratch.b
      }
    }

    colorAttr.needsUpdate = true

    // Heatmap is suppressed during descent: 0 opacity until ~95% settled.
    const d = clamp(descent, 0, 1)
    const descentGate = d < 0.92 ? 0 : (d - 0.92) / 0.08
    const targetOpacity =
      clamp(0.04 + maxIntensity * 0.42, 0.04, 0.52) * descentGate

    material.opacity = THREE.MathUtils.lerp(
      material.opacity,
      targetOpacity,
      delta * 4
    )
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.05, 0]}
    >
      <meshBasicMaterial
        ref={materialRef}
        vertexColors
        transparent
        opacity={0.04}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
