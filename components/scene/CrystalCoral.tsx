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

    // 内なるコア：蒼い静炎の明滅
    if (innerMatRef.current) {
      const baseGlow = 0.5 + Math.sin(time * 0.8) * 0.2
      const flashGlow = flashEnergy.current * 4.0
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
    }

    // 外殻：黒曜の液体レンズの「常時ゆらめき」
    if (outerMatRef.current) {
      const baseColor = new THREE.Color('#0a1526')
      const flashColor = new THREE.Color('#8fd8ff')
      outerMatRef.current.color.lerpColors(baseColor, flashColor, flashEnergy.current * 0.7)

      // 🚨 修正：常に表面がトロトロと波打つように、基本のdistortion（歪み）と速度を上げる
      const baseDistortion = 0.6 + (windSpeed * 0.03)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(
        outerMatRef.current.distortion,
        baseDistortion + flashEnergy.current * 1.5, // 共鳴時に激しく波打つ
        delta * 3
      )
      // うねりの速度も共鳴時に上がる
      outerMatRef.current.temporalDistortion = 0.4 + flashEnergy.current * 1.5
    }

    // 🚨 修正：球体全体が「呼吸」するように、ゆっくりと微細にスケールを伸縮させる
    if (groupRef.current) {
      const breathe = Math.sin(time * 1.2) * 0.015
      const targetScale = 0.85 + breathe + flashEnergy.current * 0.06
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 5)
    }
  })

  return (
    <group ref={groupRef} scale={0.85} position={[0, -0.2, 0]}>
      {/* 光と反射環境（ガラスの質感を出すため必須） */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 2]} intensity={1.5} color="#8fd8ff" />
      <Environment preset="night" />

      {/* 内なるコア */}
      <Float speed={2.5} rotationIntensity={1.5} floatIntensity={0.6}>
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

      {/* 外殻 */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={2.5}
          roughness={0.05}
          transmission={1}
          ior={1.45}
          chromaticAberration={0.08}
          distortion={0.6}           // 初期値も高く設定
          temporalDistortion={0.4}   // うねりの初期速度
          color="#0a1526"
          envMapIntensity={2.0}
        />
      </Sphere>
    </group>
  )
}