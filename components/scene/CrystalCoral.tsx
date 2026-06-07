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
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 2.5)

    const time = state.clock.elapsedTime

    if (innerMatRef.current) {
      const baseGlow = 0.5 + Math.sin(time * 0.8) * 0.2
      const flashGlow = flashEnergy.current * 4.0
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
    }

    if (outerMatRef.current) {
      const baseColor = new THREE.Color('#0a1526')
      const flashColor = new THREE.Color('#8fd8ff')
      outerMatRef.current.color.lerpColors(baseColor, flashColor, flashEnergy.current * 0.8)

      const baseDistortion = 0.2 + (windSpeed * 0.02)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(
        outerMatRef.current.distortion,
        baseDistortion + flashEnergy.current * 0.6,
        delta * 2
      )
    }

    if (groupRef.current) {
      const targetScale = 0.85 + flashEnergy.current * 0.05
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 5)
    }
  })

  return (
    <group ref={groupRef} scale={0.85} position={[0, -0.2, 0]}>
      {/* 🚨 追加: ガラスに圧倒的な美しさを与えるための「光」と「反射環境」 */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 2]} intensity={1.5} color="#8fd8ff" />
      <Environment preset="night" />

      {/* 内なるコア：蒼い静炎 */}
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

      {/* 外殻：黒曜の液体レンズ（ついに本領発揮） */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={2.5}             // 圧倒的な質量の厚み
          roughness={0.05}            // 鏡のような艶
          transmission={1}            // 100%ガラス透過
          ior={1.45}                  // 高い屈折率
          chromaticAberration={0.08}  // 色収差（フチの虹色）
          distortion={0.3}            // 流体のゆらぎ
          temporalDistortion={0.15}   // ゆらぎのスピード
          color="#0a1526"             // 深い黒曜色
          envMapIntensity={2.0}       // 🚨 周囲の光を強く反射させる
        />
      </Sphere>
    </group>
  )
}