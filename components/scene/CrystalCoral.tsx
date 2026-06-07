'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float, Environment, MeshDistortMaterial } from '@react-three/drei'
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
  const innerMatRef = useRef<any>(null)
  const groupRef = useRef<THREE.Group>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.4)

    const time = state.clock.elapsedTime

    // 1. 内なるコア：常に激しく燃えるプラズマ
    if (innerMatRef.current) {
      // プラズマの発光は常に限界突破させておく（重い外殻を貫通させるため）
      const baseGlow = 8.0 + Math.sin(time * 3.0) * 2.0 
      const flashGlow = flashEnergy.current * 10.0 
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
      
      innerMatRef.current.distort = 0.6 + flashEnergy.current * 0.4
      innerMatRef.current.speed = 8.0 + flashEnergy.current * 6.0
    }

    // 2. 外殻：深淵の重厚な液体レンズ
    if (outerMatRef.current) {
      // 🚨 黄金比その1：色は「極めて深い蒼黒（深海の闇）」
      const baseAtten = new THREE.Color('#020816') 
      const flashAtten = new THREE.Color('#a8dcff') // 共鳴時は透き通る蒼へ
      outerMatRef.current.attenuationColor.lerpColors(baseAtten, flashAtten, flashEnergy.current)

      // 🚨 黄金比その2：光の透過距離を「動的」に変化させる
      const baseDistance = 0.85 // 平時は少し光が進むと真っ黒に吸収される（重厚感）
      const flashDistance = 4.0 // 共鳴時は奥まで完全に光が通る（解放）
      outerMatRef.current.attenuationDistance = THREE.MathUtils.lerp(
        outerMatRef.current.attenuationDistance || baseDistance,
        baseDistance + (flashDistance - baseDistance) * flashEnergy.current,
        delta * 4 // 開放は素早く、戻るのはflashEnergyの0.4のスピードに依存する
      )

      const baseDistortion = 0.5 + (windSpeed * 0.04)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(
        outerMatRef.current.distortion,
        baseDistortion + flashEnergy.current * 1.5,
        delta * 3
      )
      outerMatRef.current.temporalDistortion = 0.3 + flashEnergy.current * 1.5
    }

    // 3. シルエット自体の「1/f 流体うねり」
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.025 + Math.sin(time * 1.3) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.025 + Math.cos(time * 1.4) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.025 + Math.cos(time * 1.5) * 0.015

      const baseScale = 0.85
      
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
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 2]} intensity={1.5} color="#8fd8ff" />
      <Environment preset="night" />

      {/* 内なるコア：常に激しく燃えるプラズマ */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <Sphere args={[0.35, 64, 64]}> 
          <MeshDistortMaterial
            ref={innerMatRef}
            color="#ffffff"
            emissive="#0044ff" // 深く、暴力的な青
            emissiveIntensity={8.0}
            toneMapped={false}
            distort={0.6} 
            speed={8}     
          />
        </Sphere>
      </Float>

      {/* 外殻：重厚な深海レンズ */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={2.2}             // 🚨 重厚感を出すために厚みを復活
          roughness={0.03}            // 艶やかで冷たい質感
          transmission={1}            
          ior={1.42}                  // 🚨 屈折率を少し上げ、外周を暗く歪ませる
          chromaticAberration={0.05}  
          distortion={0.5}            
          temporalDistortion={0.3}    
          color="#ffffff"             
          envMapIntensity={2.0}
          // attenuationColor と attenuationDistance は useFrame で動的に制御
        />
      </Sphere>
    </group>
  )
}