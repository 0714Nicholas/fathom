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
    // 共鳴の検知
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    // 余韻はゆっくりと消える（ロングディレイ）
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.5)

    const time = state.clock.elapsedTime

    // 1. 内なるコア：白飛びしない「深い蒼炎」
    if (innerMatRef.current) {
      // 🚨 修正：ベースの発光を抑え、「くすぶる熾火（おきび）」のように
      const baseGlow = 2.0 + Math.sin(time * 2.0) * 0.5 
      const flashGlow = flashEnergy.current * 6.0 
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
      
      innerMatRef.current.distort = 0.4 + flashEnergy.current * 0.4
      innerMatRef.current.speed = 5.0 + flashEnergy.current * 5.0
    }

    // 2. 外殻：重厚な黒曜石（ダークグラス）
    if (outerMatRef.current) {
      // 🚨 修正：ガラスそのものの色を「透明」から「深い蒼黒」へシフト
      const baseColor = new THREE.Color('#0a1322')
      const flashColor = new THREE.Color('#5ba8ff') // 共鳴時は明るい青へ
      outerMatRef.current.color.lerpColors(baseColor, flashColor, flashEnergy.current)

      // 🚨 修正：光の透過距離（これによって奥の蒼炎が「うっすら」と透ける）
      const baseDistance = 1.2 
      const flashDistance = 4.0 // 共鳴時は光が奥まで通る
      outerMatRef.current.attenuationDistance = THREE.MathUtils.lerp(
        outerMatRef.current.attenuationDistance || baseDistance,
        baseDistance + (flashDistance - baseDistance) * flashEnergy.current,
        delta * 4
      )

      const baseDistortion = 0.5 + (windSpeed * 0.04)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(
        outerMatRef.current.distortion,
        baseDistortion + flashEnergy.current * 1.0,
        delta * 3
      )
      outerMatRef.current.temporalDistortion = 0.2 + flashEnergy.current * 1.5
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
      const flashVibrateX = Math.sin(time * 20) * flashEnergy.current * 0.02
      const flashVibrateY = Math.cos(time * 23) * flashEnergy.current * 0.02

      const targetX = baseScale * wobbleX + flashExpand + flashVibrateX
      const targetY = baseScale * wobbleY + flashExpand + flashVibrateY
      const targetZ = baseScale * wobbleZ + flashExpand

      groupRef.current.scale.lerp(new THREE.Vector3(targetX, targetY, targetZ), delta * 5)
    }
  })

  return (
    <group ref={groupRef} scale={0.85} position={[0, -0.2, 0]}>
      {/* 🚨 修正：環境光を抑え、白っぽく浮くのを防ぐ */}
      <ambientLight intensity={0.1} />
      <directionalLight position={[5, 5, 2]} intensity={1.0} color="#8fd8ff" />
      <Environment preset="night" />

      {/* 内なるコア：圧縮された蒼炎 */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <Sphere args={[0.3, 64, 64]}> 
          <MeshDistortMaterial
            ref={innerMatRef}
            color="#000000" // 🚨 修正：白飛びを防ぐためベースは黒に
            emissive="#0044ff" // 深く純粋な青
            emissiveIntensity={2.0}
            toneMapped={false}
            distort={0.4} 
            speed={5}     
          />
        </Sphere>
      </Float>

      {/* 外殻：重厚な黒曜の液体レンズ */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={2.5}             // 重厚な厚み
          roughness={0.03}            // 鋭い艶
          transmission={1}            
          ior={1.42}                  
          chromaticAberration={0.05}  
          distortion={0.5}            
          temporalDistortion={0.2}    
          color="#0a1322"             // 🚨 修正：ベースを暗い黒曜石の色に
          attenuationColor="#020612"  // 光が通るとさらに深い闇へ
          attenuationDistance={1.2}   
          envMapIntensity={1.0}       // 🚨 修正：環境光の反射を抑えて落ち着かせる
        />
      </Sphere>
    </group>
  )
}