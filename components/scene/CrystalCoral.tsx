'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  resonanceHueShift,
  type CrystalIdentity,
} from '@/lib/identity/crystalSeed'

type CrystalCoralProps = {
  progress: number
  windSpeed: number
  resonancePulse: number
  resonanceEnergy: number
  identity: CrystalIdentity
  /** 0..1, supplied by useFathomDescent. */
  descent: number
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function hslColor(hueDeg: number, sat: number, light: number) {
  const c = new THREE.Color()
  c.setHSL((hueDeg % 360) / 360, sat, light)
  return c
}

export function CrystalCoral({
  progress,
  windSpeed,
  resonancePulse,
  resonanceEnergy,
  identity,
  descent,
}: CrystalCoralProps) {
  const groupRef = useRef<THREE.Group>(null)
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null)
  const edgeMaterialRef = useRef<THREE.LineBasicMaterial>(null)
  const pointsMaterialRef = useRef<THREE.PointsMaterial>(null)
  const resonanceRef = useRef(0)

  const {
    baseColor,
    emissiveColor,
    edgeColor,
    pointColor,
    resonanceColor,
    geometry,
    edgesGeometry,
  } = useMemo(() => {
    const baseColor = hslColor(identity.hueDeg, identity.saturation, identity.lightness)
    const emissiveColor = hslColor(
      resonanceHueShift(identity),
      Math.min(0.78, identity.saturation + 0.15),
      Math.min(0.78, identity.lightness + 0.06)
    )
    const edgeColor = hslColor(
      identity.hueDeg,
      Math.min(0.4, identity.saturation - 0.1),
      Math.min(0.92, identity.lightness + 0.22)
    )
    const pointColor = hslColor(
      identity.hueDeg,
      Math.min(0.5, identity.saturation - 0.05),
      Math.min(0.94, identity.lightness + 0.24)
    )
    const resonanceColor = hslColor(
      resonanceHueShift(identity),
      Math.min(0.85, identity.saturation + 0.2),
      Math.min(0.86, identity.lightness + 0.16)
    )

    const detail = clamp(identity.detail, 1, 5)
    const geo = new THREE.IcosahedronGeometry(1.08, detail)
    const edgeGeo = new THREE.EdgesGeometry(geo, 24)

    return {
      baseColor,
      emissiveColor,
      edgeColor,
      pointColor,
      resonanceColor,
      geometry: geo,
      edgesGeometry: edgeGeo,
    }
  }, [identity])

  useEffect(() => {
    return () => {
      geometry.dispose()
      edgesGeometry.dispose()
    }
  }, [edgesGeometry, geometry])

  useEffect(() => {
    resonanceRef.current = Math.min(
      1.6,
      resonanceRef.current + 0.18 + resonanceEnergy * 1.2
    )
  }, [resonanceEnergy, resonancePulse])

  useFrame((state, delta) => {
    const group = groupRef.current
    const material = materialRef.current
    const edgeMaterial = edgeMaterialRef.current
    const pointsMaterial = pointsMaterialRef.current
    if (!group || !material || !edgeMaterial || !pointsMaterial) return

    const t = state.clock.elapsedTime
    resonanceRef.current = THREE.MathUtils.damp(resonanceRef.current, 0, 2.4, delta)

    const windLean = clamp(windSpeed / 22, 0, 0.3)
    const pressure = clamp(progress, 0, 1)
    const resonance = resonanceRef.current
    const d = clamp(descent, 0, 1)

    group.rotation.y += delta * (identity.rotationDriftY + pressure * 0.05)
    group.rotation.x =
      Math.sin(t * (0.28 + identity.rotationDriftX + windLean * 0.18)) * 0.05
    group.rotation.z = Math.sin(t * 0.18) * 0.035

    const baseScale = identity.scale * (1 + pressure * 0.26)
    const ambientPulse = 1 + Math.sin(t * identity.pulseSpeed) * identity.pulseAmp
    const resonancePulseScale = 1 + resonance * 0.08
    // During descent, the crystal is slightly smaller and grows into place.
    const descentScale = THREE.MathUtils.lerp(0.72, 1.0, d)

    group.scale.setScalar(baseScale * ambientPulse * resonancePulseScale * descentScale)

    material.roughness = THREE.MathUtils.lerp(
      material.roughness,
      identity.roughness - pressure * 0.06,
      delta * 2
    )
    material.transmission = THREE.MathUtils.lerp(
      material.transmission,
      identity.transmission + pressure * 0.08,
      delta * 2
    )
    material.thickness = THREE.MathUtils.lerp(
      material.thickness,
      identity.thickness + pressure * 0.9,
      delta * 2
    )
    material.ior = THREE.MathUtils.lerp(
      material.ior,
      identity.ior + pressure * 0.05,
      delta * 2
    )

    const resonanceMix = clamp(resonance * 0.85, 0, 0.85)
    const targetBase = baseColor.clone().lerp(resonanceColor, resonanceMix * 0.55)
    material.color.lerp(targetBase, delta * 2.6)

    const targetEmissive = emissiveColor.clone().lerp(resonanceColor, resonanceMix)
    material.emissive.lerp(targetEmissive, delta * 2.6)

    material.emissiveIntensity = THREE.MathUtils.lerp(
      material.emissiveIntensity,
      (identity.emissiveBoost + pressure * 0.22 + resonance * 0.3) *
        THREE.MathUtils.lerp(0.15, 1.0, d),
      delta * 2.4
    )

    // Material/edges/points opacity ramp up with descent.
    const matOpacityTarget = THREE.MathUtils.lerp(0.35, 0.92, d)
    material.opacity = THREE.MathUtils.lerp(material.opacity, matOpacityTarget, delta * 2.4)

    edgeMaterial.color.lerp(
      edgeColor.clone().lerp(resonanceColor, resonanceMix * 0.6),
      delta * 2.6
    )
    edgeMaterial.opacity = THREE.MathUtils.lerp(
      edgeMaterial.opacity,
      (0.18 + pressure * 0.15 + resonance * 0.18) * THREE.MathUtils.lerp(0.2, 1.0, d),
      delta * 2.4
    )

    pointsMaterial.color.lerp(
      pointColor.clone().lerp(resonanceColor, resonanceMix * 0.5),
      delta * 2.6
    )
    pointsMaterial.opacity = THREE.MathUtils.lerp(
      pointsMaterial.opacity,
      (0.08 + pressure * 0.1 + resonance * 0.16) * THREE.MathUtils.lerp(0.2, 1.0, d),
      delta * 2.4
    )
  })

  return (
    <group ref={groupRef} position={[0, 0.05, 0]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          ref={materialRef}
          color={baseColor}
          emissive={emissiveColor}
          emissiveIntensity={identity.emissiveBoost}
          roughness={identity.roughness}
          metalness={0.04}
          transmission={identity.transmission}
          thickness={identity.thickness}
          transparent
          opacity={0.92}
          ior={identity.ior}
        />
      </mesh>

      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial
          ref={edgeMaterialRef}
          color={edgeColor}
          transparent
          opacity={0.2}
        />
      </lineSegments>

      <points geometry={geometry} scale={1.01}>
        <pointsMaterial
          ref={pointsMaterialRef}
          size={0.026}
          color={pointColor}
          transparent
          opacity={0.1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}
