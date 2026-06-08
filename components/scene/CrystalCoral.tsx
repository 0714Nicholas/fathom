'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float, Environment, MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'
import type { DeepSeaCanvasProps } from './DeepSeaCanvas'

export function CrystalCoral({ 
  progress = 0, 
  windSpeed = 0,
  resonancePulse = 0,
  temp = 15 // デフォルト15度
}: DeepSeaCanvasProps) {
  const outerMatRef = useRef<any>(null)
  const innerMatRef = useRef<any>(null)
  const groupRef = useRef<THREE.Group>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  // 🚨 気温（temp）からコアの色を計算（-10℃〜35℃の範囲でマッピング）
  const coreColors = useMemo(() => {
    const t = Math.max(-10, Math.min(35, temp))
    const ratio = (t + 10) / 45 // 0.0(極寒) 〜 1.0(猛暑)
    
    // 寒い：深く鋭い氷の青 / 暑い：生命力を感じるエメラルドグリーン
    const coldEmissive = new THREE.Color('#0044ff')
    const hotEmissive = new THREE.Color('#00ffaa')
    
    // ベースの色味（白飛び防止用）
    const coldBase = new THREE.Color('#0000cc')
    const hotBase = new THREE.Color('#006644')

    return {
      emissive: new THREE.Color().lerpColors(coldEmissive, hotEmissive, ratio),
      base: new THREE.Color().lerpColors(coldBase, hotBase, ratio)
    }
  }, [temp])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.4)

    const time = state.clock.elapsedTime

    if (innerMatRef.current) {
      const baseGlow = 7.0 + Math.sin(time * 3.0) * 1.5 
      const flashGlow = flashEnergy.current * 8.0 
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
      
      // 🚨 水圧（progress）が深いほど、コアのプラズマが強く圧縮され激しく歪む
      const pressureDistortion = progress * 0.3
      innerMatRef.current.distort = 0.5 + pressureDistortion + flashEnergy.current * 0.4
      innerMatRef.current.speed = 8.0 + flashEnergy.current * 6.0
    }

    if (outerMatRef.current) {
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

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.025 + Math.sin(time * 1.3) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.025 + Math.cos(time * 1.4) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.025 + Math.cos(time * 1.5) * 0.015

      // 🚨 深海に行くほど、水圧で全体がミリ単位で圧縮される（0.55 -> 0.52）
      const baseScale = 0.55 - (progress * 0.03)
      
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
    <group ref={groupRef} scale={0.55} position={[0, -0.2, 0]}>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 5, 2]} intensity={1.0} color="#8fd8ff" />
      <Environment preset="night" />

      {/* 内なるコア：気温によって色が変化 */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <Sphere args={[0.4, 64, 64]}> 
          <MeshDistortMaterial
            ref={innerMatRef}
            color={coreColors.base}
            emissive={coreColors.emissive} 
            emissiveIntensity={7.0}
            toneMapped={false}
            distort={0.6} 
            speed={8}     
          />
        </Sphere>
      </Float>

      {/* 外殻 */}
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
          envMapIntensity={1.2}       
        />
      </Sphere>
    </group>
  )
}