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

    // 1. 内なるコア：白飛びを完全に封じ込めた「極彩色の蒼炎プラズマ」
    if (innerMatRef.current) {
      // 🚨 平時から最高レベルのうねりと発光。光量(intensity)を上げてもベースが青いため白飛びしない
      const baseGlow = 7.0 + Math.sin(time * 3.0) * 1.5 
      const flashGlow = flashEnergy.current * 8.0 
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
      
      // 1/fの激しいうねりを平時から維持
      innerMatRef.current.distort = 0.6 + flashEnergy.current * 0.4
      innerMatRef.current.speed = 8.0 + flashEnergy.current * 6.0
    }

    // 2. 外殻：白飛び反射を抑えた、純度の高いクリアレンズ
    if (outerMatRef.current) {
      // 剥き出し感を邪魔しない、クリアな色を維持
      const baseAtten = new THREE.Color('#cce6ff') 
      const flashAtten = new THREE.Color('#ffffff') 
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
      
      const flashExpand = flashEnergy.current * 0.15
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
      {/* 🚨 ライトの強さを調整し、ガラス表面の白飛びを軽減 */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 5, 2]} intensity={1.0} color="#8fd8ff" />
      <Environment preset="night" />

      {/* 内なるコア：剥き出しの純蒼炎 */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <Sphere args={[0.4, 64, 64]}> 
          <MeshDistortMaterial
            ref={innerMatRef}
            color="#0011cc" // 🚨 修正：白（#ffffff）から深い青へ。これで白飛びが完全に消え、青の濃淡が残る
            emissive="#0066ff" // 鮮烈なコバルトブルー
            emissiveIntensity={7.0}
            toneMapped={false}
            distort={0.6} 
            speed={8}     
          />
        </Sphere>
      </Float>

      {/* 外殻：クリアな水滴レンズ */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={1.5}             
          roughness={0.02}            
          transmission={1}            
          ior={1.33}                  
          chromaticAberration={0.06}  
          distortion={0.5}            
          temporalDistortion={0.3}    
          color="#ffffff"             
          attenuationColor="#cce6ff"  
          attenuationDistance={3.0}   
          envMapIntensity={1.2}       // 🚨 修正：2.0 -> 1.2（外側の白い映り込みを抑え、中の青を引き立たせる）
        />
      </Sphere>
    </group>
  )
}