'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshTransmissionMaterial, Float, Environment, MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'
import type { DeepSeaCanvasProps } from './DeepSeaCanvas'

export function CrystalCoral({ 
  progress = 0, 
  windSpeed = 0,
  clouds = 0,
  rainAmount = 0,
  resonancePulse = 0,
  temp = 15,
  diveTimeMs = 0,
  releaseCount = 0
}: DeepSeaCanvasProps) {
  const outerMatRef = useRef<any>(null)
  const innerMatRef = useRef<any>(null)
  const groupRef = useRef<THREE.Group>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  // 🚨 CPUでの滑らかな変形状態を管理
  const currentMorph = useRef(0)
  const lastMorph = useRef(-1)

  // 🚨 シェーダーを壊さない「CPU頂点計算」のためのデータを準備
  const { basePositions, targetPositions, sphereGeometry } = useMemo(() => {
    const radius = 0.4;
    const sphere = new THREE.SphereGeometry(radius, 64, 64);
    const icosa = new THREE.IcosahedronGeometry(radius, 0);

    // 正二十面体の面（Plane）を計算
    const posAttr = icosa.attributes.position;
    const planes: THREE.Plane[] = [];
    for (let i = 0; i < posAttr.count; i += 3) {
      const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i);
      const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i+1);
      const v3 = new THREE.Vector3().fromBufferAttribute(posAttr, i+2);
      const plane = new THREE.Plane().setFromCoplanarPoints(v1, v2, v3);
      if (plane.normal.lengthSq() > 0) planes.push(plane);
    }

    const spherePosAttr = sphere.attributes.position;
    const basePos = new Float32Array(spherePosAttr.array);
    const targetPos = new Float32Array(spherePosAttr.count * 3);

    // 球体の頂点を、最も近い二十面体の面に射影（吸着）させる
    for (let i = 0; i < spherePosAttr.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(spherePosAttr, i);
      let closestPoint = new THREE.Vector3();
      let minDstSq = Infinity;
      for (let j = 0; j < planes.length; j++) {
        const projected = planes[j].projectPoint(v, new THREE.Vector3());
        const dstSq = v.distanceToSquared(projected);
        if (dstSq < minDstSq) {
          minDstSq = dstSq;
          closestPoint = projected;
        }
      }
      closestPoint.toArray(targetPos, i * 3);
    }

    return { basePositions: basePos, targetPositions: targetPos, sphereGeometry: sphere };
  }, []);

  const evolutionScore = (diveTimeMs / 60000) + (releaseCount * 5)
  const evolutionRatio = useMemo(() => THREE.MathUtils.clamp(evolutionScore / 100, 0, 1), [evolutionScore])

  const colorRatio = useMemo(() => THREE.MathUtils.clamp((temp + 10) / 45, 0, 1), [temp])
  const coreColors = useMemo(() => {
    const coldEmissive = new THREE.Color('#0044ff') 
    const hotEmissive = new THREE.Color('#00ff66')  
    return {
      emissive: new THREE.Color().lerpColors(coldEmissive, hotEmissive, colorRatio)
    }
  }, [colorRatio])

  const outerColors = useMemo(() => {
    const coldAtten = new THREE.Color('#88ccff')
    const hotAtten = new THREE.Color('#88ffcc')
    return new THREE.Color().lerpColors(coldAtten, hotAtten, colorRatio)
  }, [colorRatio])

  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(1.2, 0.4, clouds / 100), [clouds])
  const waterMurkiness = useMemo(() => Math.max(0.05, THREE.MathUtils.lerp(0.05, 0.2, Math.min(rainAmount / 5, 1))), [rainAmount])

  const glassThickness = useMemo(() => THREE.MathUtils.lerp(1.5, 3.5, evolutionRatio), [evolutionRatio])
  const glassIor = useMemo(() => THREE.MathUtils.lerp(1.2, 1.28, evolutionRatio), [evolutionRatio])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.4)

    const time = state.clock.elapsedTime

    // 🚨 CPU側での頂点モーフィング計算（水深50%から開始）
    const targetMorphValue = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1);
    // ゆっくりと変形させるための lerp
    currentMorph.current = THREE.MathUtils.lerp(currentMorph.current, targetMorphValue, delta * 0.5);

    // 頂点の位置を毎フレーム書き換える（シェーダーを壊さない安全な方法）
    if (Math.abs(currentMorph.current - lastMorph.current) > 0.001) {
      const posAttr = sphereGeometry.attributes.position;
      for (let i = 0; i < basePositions.length; i++) {
        posAttr.array[i] = basePositions[i] + (targetPositions[i] - basePositions[i]) * currentMorph.current;
      }
      posAttr.needsUpdate = true;
      sphereGeometry.computeVertexNormals(); // 陰影を正しく出すための法線再計算
      lastMorph.current = currentMorph.current;
    }

    if (innerMatRef.current) {
      const baseGlow = 1.5 + Math.sin(time * 3.0) * 0.5 
      const flashGlow = flashEnergy.current * 5.0 
      innerMatRef.current.emissiveIntensity = baseGlow + flashGlow
      
      const pressureDistortion = progress * 0.3
      const evolutionDistortion = evolutionRatio * 0.4 
      innerMatRef.current.distort = 0.5 + pressureDistortion + evolutionDistortion + flashEnergy.current * 0.4
      innerMatRef.current.speed = 8.0 + (evolutionRatio * 6.0) + flashEnergy.current * 6.0
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
      <ambientLight intensity={lightIntensity * 0.5} />
      <directionalLight position={[5, 5, 2]} intensity={lightIntensity} color="#8fd8ff" />
      <Environment preset="night" />

      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        {/* 🚨 morphTargets を使わず、直接更新された sphereGeometry を渡す */}
        <mesh geometry={sphereGeometry}> 
          <MeshDistortMaterial
            ref={innerMatRef}
            color="#000000" 
            emissive={coreColors.emissive} 
            emissiveIntensity={1.5} 
            toneMapped={false}
            distort={0.6} 
            speed={8}     
          />
        </mesh>
      </Float>

      <mesh geometry={sphereGeometry}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={glassThickness}   
          roughness={waterMurkiness}      
          transmission={1.0} 
          ior={glassIor}               
          chromaticAberration={0.05}  
          distortion={0.5}            
          temporalDistortion={0.3}    
          color="#ffffff" 
          attenuationColor={outerColors} 
          attenuationDistance={3.0} 
          envMapIntensity={0.8}       
        />
      </mesh>
    </group>
  )
}