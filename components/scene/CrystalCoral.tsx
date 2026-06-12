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

  const colorRatio = useMemo(() => THREE.MathUtils.clamp((temp + 10) / 45, 0, 1), [temp])
  
  const coreColors = useMemo(() => {
    // 🚨 修正：色が白く飛ばないように、より深く鮮やかな原色を指定
    const coldEmissive = new THREE.Color('#0055ff') // 冴え渡るアクアブルー
    const hotEmissive = new THREE.Color('#00ff44')  // 生命力あふれる純粋な緑
    const coldBase = new THREE.Color('#0022aa')
    const hotBase = new THREE.Color('#008822')

    return {
      emissive: new THREE.Color().lerpColors(coldEmissive, hotEmissive, colorRatio),
      base: new THREE.Color().lerpColors(coldBase, hotBase, colorRatio)
    }
  }, [colorRatio])

  const outerColors = useMemo(() => {
    // 🚨 修正：ガラス自体の透過色を明るく設定
    const coldAtten = new THREE.Color('#88ccff')
    const hotAtten = new THREE.Color('#66ffaa')
    return new THREE.Color().lerpColors(coldAtten, hotAtten, colorRatio)
  }, [colorRatio])

  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(1.5, 0.4, clouds / 100), [clouds])
  const waterMurkiness = useMemo(() => Math.max(0.05, THREE.MathUtils.lerp(0.01, 0.25, Math.min(rainAmount / 5, 1))), [rainAmount])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.4)

    const time = state.clock.elapsedTime

    if (innerMatRef.current) {
      // 🚨 修正：ベースの発光を 6.0 → 2.0 に大幅に下げ、色が白に飛ぶのを防ぐ
      const baseGlow = 2.0 + Math.sin(time * 3.0) * 0.5 
      const flashGlow = flashEnergy.current * 6.0 
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
      <ambientLight intensity={lightIntensity * 0.3} />
      <directionalLight position={[5, 5, 2]} intensity={lightIntensity} color="#8fd8ff" />
      <Environment preset="night" />

      {/* 内側のコア */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <Sphere args={[0.4, 64, 64]}> 
          <MeshDistortMaterial
            ref={innerMatRef}
            color={coreColors.base}
            emissive={coreColors.emissive} 
            emissiveIntensity={2.0} // 白飛び防止
            toneMapped={true} // 🚨 追加：色味を保つためのトーンマッピング有効化
            distort={0.6} 
            speed={8}     
          />
        </Sphere>
      </Float>

      {/* 外側のガラス外殻 */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={1.5}             
          roughness={waterMurkiness}      
          transmission={0.9} // 🚨 修正：1.0(完全透明)から0.9に下げ、ガラス自体に色を残す       
          ior={1.05} // 🚨 修正：屈折率を極限まで下げて「黒背景の吸い込み」を防止
          chromaticAberration={0.05}  
          distortion={0.5}            
          temporalDistortion={0.3}    
          color={outerColors} // 🚨 修正：白ではなく、温度に合わせた色を指定
          emissive={outerColors} // 🚨 修正：ガラス自体をごく僅かに発光させ、暗黒化を防ぐ
          emissiveIntensity={0.15}
          attenuationColor={outerColors} 
          attenuationDistance={2.0}  
          envMapIntensity={0.3} // 🚨 修正：暗い空（環境）の反射を弱める       
        />
      </Sphere>
    </group>
  )
}