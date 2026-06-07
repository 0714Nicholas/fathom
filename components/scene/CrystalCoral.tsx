'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float, Environment } from '@react-three/drei'
import * as THREE from 'three'

interface CrystalCoralProps {
  progress?: number
  windSpeed?: number
  resonancePulse?: number
  resonanceEnergy?: number
  identity?: any
  descent?: number
}

export function CrystalCoral({ 
  progress = 0, 
  windSpeed = 0,
  resonancePulse = 0,
  descent = 1
}: CrystalCoralProps) {
  const outerMatRef = useRef<any>(null)
  const innerMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const groupRef = useRef<THREE.Group>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  useFrame((state, delta) => {
    // 共鳴の検知
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 2.0)

    const time = state.clock.elapsedTime

    // 1. 内なるコア：蒼炎の明滅
    if (innerMatRef.current) {
      const baseGlow = 0.4 + Math.sin(time * 0.8) * 0.1
      const flashGlow = flashEnergy.current * 4.0
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
    }

    // 2. 外殻：内部の屈折と色の変化
    if (outerMatRef.current) {
      const baseColor = new THREE.Color('#0a1322')
      const flashColor = new THREE.Color('#8fd8ff')
      outerMatRef.current.color.lerpColors(baseColor, flashColor, flashEnergy.current * 0.7)

      const baseDistortion = 0.5 + (windSpeed * 0.04)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(
        outerMatRef.current.distortion,
        baseDistortion + flashEnergy.current * 1.5,
        delta * 3
      )
      outerMatRef.current.temporalDistortion = 0.3 + flashEnergy.current * 1.5
    }

    // 3. 🚨 シルエット自体の「1/f 流体うねり」と共鳴振動
    if (groupRef.current) {
      // 球体をゆっくり回転させ、環境光の反射を踊らせる
      groupRef.current.rotation.y += delta * 0.15
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      // 常にX, Y, Z軸を別々のリズムで伸縮させ、生きている水滴のようなうねりを作る
      const wobbleX = 1 + Math.sin(time * 0.7) * 0.025 + Math.sin(time * 1.3) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.025 + Math.cos(time * 1.4) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.025 + Math.cos(time * 1.5) * 0.015

      const baseScale = 0.85
      
      // 共鳴時：一気に膨張し、激しく振動する
      const flashExpand = flashEnergy.current * 0.12
      const flashVibrateX = Math.sin(time * 20) * flashEnergy.current * 0.03
      const flashVibrateY = Math.cos(time * 23) * flashEnergy.current * 0.03

      const targetX = baseScale * wobbleX + flashExpand + flashVibrateX
      const targetY = baseScale * wobbleY + flashExpand + flashVibrateY
      const targetZ = baseScale * wobbleZ + flashExpand

      groupRef.current.scale.lerp(new THREE.Vector3(targetX, targetY, targetZ), delta * 5)
    }
  })

  return (
    <group ref={groupRef} scale={0.85} position={[0, -0.2, 0]}>
      {/* 光と反射環境 */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 2]} intensity={1.5} color="#8fd8ff" />
      <Environment preset="night" />

      {/* 内なるコア */}
      <Float speed={2} rotationIntensity={1} floatIntensity={0.5}>
        <Sphere args={[0.25, 32, 32]}>
          <meshStandardMaterial
            ref={innerMatRef}
            color="#ffffff"
            emissive="#4ab9ff"
            emissiveIntensity={1.0}
            toneMapped={false}
          />
        </Sphere>
      </Float>

      {/* 外殻：黒曜の液体レンズ */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={3.0}
          roughness={0.05}
          transmission={1}
          ior={1.45}
          chromaticAberration={0.06}
          distortion={0.5}
          temporalDistortion={0.3}
          color="#0a1322"
          envMapIntensity={2.0}
        />
      </Sphere>
    </group>
  )
}