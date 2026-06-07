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
    
    // 🚨 修正：減衰スピードを遅くし（2.0 -> 0.4）、共鳴の爆発と透明な状態を「長く持続」させる
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.4)

    const time = state.clock.elapsedTime

    // 1. 内なるコア：圧縮された蒼炎
    if (innerMatRef.current) {
      // 🚨 修正：暗い液体を透過させるため、ベースの発光をさらに強く
      const baseGlow = 4.0 + Math.sin(time * 2.0) * 1.0 
      const flashGlow = flashEnergy.current * 8.0
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
      
      // 共鳴時はさらに激しくうねる
      innerMatRef.current.distort = 0.4 + flashEnergy.current * 0.5
      innerMatRef.current.speed = 4.0 + flashEnergy.current * 6.0
    }

    // 2. 外殻：黒曜の液体レンズ
    if (outerMatRef.current) {
      // 🚨 修正：減衰色を真っ黒ではなく「極めて深い群青色」にし、透明感を出す
      const baseAtten = new THREE.Color('#030b1c') 
      const flashAtten = new THREE.Color('#ffffff') // 共鳴時は完全なクリア
      outerMatRef.current.attenuationColor.lerpColors(baseAtten, flashAtten, flashEnergy.current)

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
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 2]} intensity={1.5} color="#8fd8ff" />
      <Environment preset="night" />

      {/* 内なるコア */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        {/* 🚨 修正：中身のプラズマを一回り大きく（0.3 -> 0.4）して存在感をアピール */}
        <Sphere args={[0.4, 64, 64]}> 
          <MeshDistortMaterial
            ref={innerMatRef}
            color="#ffffff"
            emissive="#0055ff" // 鮮烈な蒼
            emissiveIntensity={4.0}
            toneMapped={false}
            distort={0.4} 
            speed={4}     
          />
        </Sphere>
      </Float>

      {/* 外殻 */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={1.5}             // 🚨 修正：2.8 -> 1.5 （厚みを減らして光を透過させる）
          roughness={0.05}            
          transmission={1}            
          ior={1.33}                  // 🚨 修正：1.45 -> 1.33 （水の屈折率にし、中身を直接見えやすくする）
          chromaticAberration={0.08}  
          distortion={0.5}            
          temporalDistortion={0.3}    
          color="#ffffff"             
          attenuationColor="#030b1c"  // 🚨 修正：光が減衰した時の色
          attenuationDistance={1.8}   // 🚨 修正：0.5 -> 1.8 （光が吸収される距離を伸ばし、中のプラズマを外へ逃がす）
          envMapIntensity={2.0}
        />
      </Sphere>
    </group>
  )
}