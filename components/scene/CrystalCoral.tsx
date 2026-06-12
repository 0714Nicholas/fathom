'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float, Environment, MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'
import type { DeepSeaCanvasProps } from './DeepSeaCanvas'

export function CrystalCoral({ 
  progress = 0, 
  windSpeed = 0,
  clouds = 0,
  rainAmount = 0,
  resonancePulse = 0,
  temp = 15
}: DeepSeaCanvasProps) {
  const outerMatRef = useRef<any>(null)
  const innerMatRef = useRef<any>(null)
  const groupRef = useRef<THREE.Group>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  // 気温（temp）による「明確な色変化」 (-10℃ 〜 35℃)
  const colorRatio = useMemo(() => THREE.MathUtils.clamp((temp + 10) / 45, 0, 1), [temp])
  
  const coreColors = useMemo(() => {
    // 🚨 修正：色をより濃く、鮮やかに設定
    const coldEmissive = new THREE.Color('#0033ff') // 冴え渡るブルー
    const hotEmissive = new THREE.Color('#00ff55')  // 強烈なエメラルドグリーン
    const coldBase = new THREE.Color('#0000cc')
    const hotBase = new THREE.Color('#008822')

    return {
      emissive: new THREE.Color().lerpColors(coldEmissive, hotEmissive, colorRatio),
      base: new THREE.Color().lerpColors(coldBase, hotBase, colorRatio)
    }
  }, [colorRatio])

  const outerColors = useMemo(() => {
    // 🚨 修正：外側のガラスの透過色も、温度に合わせて鮮やかに
    const coldAtten = new THREE.Color('#4499ff')
    const hotAtten = new THREE.Color('#33ff99')
    return new THREE.Color().lerpColors(coldAtten, hotAtten, colorRatio)
  }, [colorRatio])

  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(1.5, 0.4, clouds / 100), [clouds])
  const waterMurkiness = useMemo(() => THREE.MathUtils.lerp(0.01, 0.25, Math.min(rainAmount / 5, 1)), [rainAmount])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.4)

    const time = state.clock.elapsedTime

    if (innerMatRef.current) {
      // 🚨 修正：ベースの発光を 8.0 → 4.0 に下げて白飛びを防ぎ、色の濃さを引き出す
      const baseGlow = 4.0 + Math.sin(time * 3.0) * 1.5 
      const flashGlow = flashEnergy.current * 15.0 // フラッシュ時は強烈に光る
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
      
      const pressureDistortion = progress * 0.3
      innerMatRef.current.distort = 0.5 + pressureDistortion + flashEnergy.current * 0.4
      innerMatRef.current.speed = 8.0 + flashEnergy.current * 6.0
    }

    if (outerMatRef.current) {
      const flashAtten = new THREE.Color('#ffffff') 
      outerMatRef.current.attenuationColor.lerpColors(outerColors, flashAtten, flashEnergy.current)

      const baseDistortion = 0.4 + (windSpeed * 0.06)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(
        outerMatRef.current.distortion,
        baseDistortion + flashEnergy.current * 1.5,
        delta * 3
      )
      outerMatRef.current.temporalDistortion = 0.2 + (windSpeed * 0.05) + flashEnergy.current * 1.5
    }

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.025 + Math.sin(time * 1.3) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.025 + Math.cos(time * 1.4) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.025 + Math.cos(time * 1.5) * 0.015

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
      <ambientLight intensity={lightIntensity * 0.2} />
      <directionalLight position={[5, 5, 2]} intensity={lightIntensity} color="#8fd8ff" />
      <Environment preset="night" />

      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <Sphere args={[0.4, 64, 64]}> 
          <MeshDistortMaterial
            ref={innerMatRef}
            color={coreColors.base}
            emissive={coreColors.emissive} 
            emissiveIntensity={4.0} // 🚨 ここも 4.0 に下げる
            toneMapped={false}
            distort={0.6} 
            speed={8}     
          />
        </Sphere>
      </Float>

      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={1.5}             
          roughness={waterMurkiness}      
          transmission={1}            
          ior={1.33}                  
          chromaticAberration={0.06}  
          distortion={0.5}            
          temporalDistortion={0.3}    
          color="#ffffff"             
          attenuationColor={outerColors} 
          attenuationDistance={2.0} // 🚨 距離を縮めて色を濃く出す  
          envMapIntensity={1.0}       
        />
      </Sphere>
    </group>
  )
}