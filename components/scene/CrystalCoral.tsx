'use client'

import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber' 
import { Sphere, MeshTransmissionMaterial, Float, Environment } from '@react-three/drei'
import * as THREE from 'three'
import type { DeepSeaCanvasProps } from './DeepSeaCanvas'

export type CrystalCoralProps = DeepSeaCanvasProps

const karmaVertexShader = `
  uniform float uTime;
  uniform float uAge;       
  uniform float uResonance; 
  uniform float uCharge;
  uniform float uFlash; 

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec3 p = position;
    
    // 🚨 トゲトゲも、うねりも、砂嵐も全て排除。
    // 球体としての美しさを極限まで保つため、頂点の変形はごくわずかな「呼吸」のみ。
    
    float pulse = sin(uTime * 3.0) * 0.02 * uResonance; // ゆっくりとした呼吸
    float condense = -0.1 * uCharge; // チャージ中は少しだけ小さく引き締まる
    
    // 解放時も形は崩さず、少しだけフワッと膨らむ（生命の鼓動）
    float flashExpand = uFlash * 0.15; 
    
    vec3 morphedPos = p + (normal * (pulse + condense + flashExpand));

    vec4 worldPosition = modelMatrix * vec4(morphedPos, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    
    vWorldPosition = worldPosition.xyz;
    vViewPosition = -mvPosition.xyz;
    
    // 法線も変なノイズを入れず、美しい球体のまま
    vNormal = normalize(normalMatrix * normal);
    
    gl_Position = projectionMatrix * mvPosition;
  }
`

const karmaFragmentShader = `
  uniform float uTime;
  uniform float uRelease;    
  uniform float uResonance;  
  uniform float uCharge;     
  uniform float uFlash;      
  uniform vec3 uBaseColor;   

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  // 滑らかで美しいノイズ（オーロラのような揺らぎ用）
  float hash(float n) { return fract(sin(n) * 1e4); }
  float noise(vec3 x) {
    const vec3 step = vec3(110, 241, 171);
    vec3 i = floor(x); vec3 f = fract(x);
    float n = dot(i, step);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(n + dot(step, vec3(0, 0, 0))), hash(n + dot(step, vec3(1, 0, 0))), u.x),
                   mix(hash(n + dot(step, vec3(0, 1, 0))), hash(n + dot(step, vec3(1, 1, 0))), u.x), u.y),
               mix(mix(hash(n + dot(step, vec3(0, 0, 1))), hash(n + dot(step, vec3(1, 0, 1))), u.x),
                   mix(hash(n + dot(step, vec3(0, 1, 1))), hash(n + dot(step, vec3(1, 1, 1))), u.x), u.y), u.z);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    vec3 p = vWorldPosition * 2.0 + uTime * 0.1;
    
    // 🚨 砂嵐（Discard）は完全廃止。
    
    // 1. チャージ中：光を失い、漆黒の深淵へと沈み込む（絶対零度の静寂）
    vec3 deepAbyss = vec3(0.01, 0.02, 0.05); // ほぼ真っ黒な紺色
    vec3 currentColor = mix(uBaseColor, deepAbyss, uCharge);

    // 2. 解放の瞬間：内側から溢れ出す「純度100%のサファイアブルー」
    // 白飛びしないように、上品で深い青色に設定
    vec3 pureSapphire = vec3(0.1, 0.5, 1.0); 
    
    // コア（中心）ほど明るく、縁（エッジ）に向かってスッと消える美しいグラデーション
    float coreGlow = smoothstep(0.7, 0.0, length(vNormal.xy));
    
    // オーロラのような滑らかな光の揺らぎ
    float aura = noise(p * 3.0 - vec3(0.0, uTime * 2.0, 0.0));
    
    // フラッシュの光を合成
    vec3 flashLight = pureSapphire * (coreGlow + aura * 0.5) * uFlash * 3.0;

    vec3 finalColor = currentColor + flashLight;

    // ACESトーンマッピング（色を鮮やかに保ちつつ、白飛びを防ぐ）
    finalColor = (finalColor * (2.51 * finalColor + 0.03)) / (finalColor * (2.43 * finalColor + 0.59) + 0.14);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

export function CrystalCoral({ 
  progress = 0, windSpeed = 0, clouds = 0, rainAmount = 0, resonancePulse = 0, temp = 15,
  diveTimeMs = 0, releaseCount = 0, isCharging = false, turbidity = 0,
  onChargeStart, onChargeStop, 
  tuningValue = 50, isTuning = false
}: CrystalCoralProps) {
  
  const outerMatRef = useRef<any>(null)
  const groupRef = useRef<THREE.Group>(null)
  const karmaMatRef = useRef<THREE.ShaderMaterial>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)
  const chargeLevel = useRef(0)

  const { viewport } = useThree() 

  const surfaceColor = useMemo(() => {
    const tRatio = THREE.MathUtils.clamp((temp + 10) / 40, 0, 1) 
    const cold = new THREE.Color('#002244') // 深みのある青
    const hot = new THREE.Color('#0055aa')  
    return new THREE.Color().lerpColors(cold, hot, tRatio)
  }, [temp])

  const deepColor = useMemo(() => new THREE.Color('#000511'), [])
  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(1.2, 0.5, clouds / 100), [clouds])

  const karmaUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAge: { value: 0 },
    uRelease: { value: 0 },
    uResonance: { value: 0 },
    uCharge: { value: 0 },
    uFlash: { value: 0 }, 
    uBaseColor: { value: surfaceColor.clone() }
  }), [surfaceColor])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0 
      prevPulse.current = resonancePulse
    }
    
    // 余韻（8秒間）を美しく保つため、減衰はゆっくり
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.45)
    
    const targetCharge = isCharging ? 1.0 : 0.0
    chargeLevel.current = THREE.MathUtils.lerp(chargeLevel.current, targetCharge, delta * (isCharging ? 1.5 : 4.0))

    const time = state.clock.elapsedTime

    if (karmaMatRef.current) {
      const uniforms = karmaMatRef.current.uniforms
      uniforms.uTime.value = time
      uniforms.uAge.value = THREE.MathUtils.lerp(uniforms.uAge.value, Math.min(1.0, diveTimeMs / 36000000), 0.02)
      uniforms.uRelease.value = THREE.MathUtils.lerp(uniforms.uRelease.value, Math.min(1.0, releaseCount / 100), 0.02)
      
      uniforms.uResonance.value = flashEnergy.current
      uniforms.uCharge.value = chargeLevel.current
      uniforms.uFlash.value = flashEnergy.current

      const currentEnvironmentColor = surfaceColor.clone().lerp(deepColor, progress)

      if (isTuning) {
        const targetHue = 0.5 + (tuningValue / 100) * 0.4
        const tuneColor = new THREE.Color().setHSL(targetHue, 1.0, 0.4)
        uniforms.uBaseColor.value.lerp(tuneColor, 0.15)
      } else {
        uniforms.uBaseColor.value.lerp(currentEnvironmentColor, 0.05)
      }
    }

    if (outerMatRef.current) {
      const baseColor = new THREE.Color('#000511')    
      // 🚨 チャージ中は外側のガラスも極限まで暗く（漆黒に）なる
      const chargeColor = new THREE.Color('#000103') 
      // 解放の瞬間、透き通ったシアンブルーに輝く
      const flashColor = new THREE.Color('#88ddff')   
      
      const currentColor = baseColor.clone().lerp(chargeColor, chargeLevel.current)
      currentColor.lerp(flashColor, flashEnergy.current)
      outerMatRef.current.attenuationColor.copy(currentColor)
      
      const baseDist = 2.0 
      // チャージ中は光を閉じ込め、解放で一気に透明感を出す
      const targetDist = THREE.MathUtils.lerp(baseDist, 0.2, chargeLevel.current)
      outerMatRef.current.attenuationDistance = THREE.MathUtils.lerp(targetDist, 20.0, flashEnergy.current) 
      
      // 🚨 砂嵐の原因だった Roughness（すりガラス化）の極端な数値を廃止し、常に美しく透き通ったガラスを維持する
      outerMatRef.current.roughness = 0.02 // 常にクリア
      
      // ガラスの厚みで「重さ」と「軽さ」を表現
      const baseThickness = 2.5
      const chargeThickness = THREE.MathUtils.lerp(baseThickness, 4.0, chargeLevel.current) // チャージで分厚く重くなる
      outerMatRef.current.thickness = THREE.MathUtils.lerp(chargeThickness, 0.5, flashEnergy.current) // 解放で薄く軽くなる
      
      // 🚨 歪み（Distortion）もバグらない安全な範囲（最大0.5）に固定
      const pressureDistortion = THREE.MathUtils.lerp(0.5, 0.1, progress) // 深く潜るほど静かになる
      outerMatRef.current.distortion = THREE.MathUtils.lerp(pressureDistortion, 0.0, flashEnergy.current) // 解放の瞬間は歪みゼロの完全な球体
    }

    if (groupRef.current) {
      const spinSpeed = isTuning ? 1.5 : 0.1 
      groupRef.current.rotation.y += delta * spinSpeed
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      // ゆったりとした海中の浮遊感
      const wobbleX = 1 + Math.sin(time * 0.7) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.015

      const responsiveScale = viewport.aspect < 1.0 ? 0.7 : 1.0
      
      const pressureShrink = 1.0 - (progress * 0.15)
      const baseScale = pressureShrink * responsiveScale
      
      // チャージ中は少し沈み込む（凝縮）
      const chargeShrink = chargeLevel.current * -0.1 * responsiveScale
      
      // 解放の瞬間、軽く息を吐くようにフワッと一回り大きくなり、ゆっくり戻る
      const flashExpand = flashEnergy.current * 0.2 * responsiveScale
      
      const tuneExpand = isTuning ? Math.sin(time * 15) * 0.02 * responsiveScale : 0

      groupRef.current.scale.lerp(
        new THREE.Vector3(
          baseScale * wobbleX + chargeShrink + flashExpand + tuneExpand, 
          baseScale * wobbleY + chargeShrink + flashExpand + tuneExpand, 
          baseScale * wobbleZ + chargeShrink + flashExpand + tuneExpand
        ), 
        delta * 6 
      )
    }
  })

  return (
    <group 
      ref={groupRef} 
      scale={1.0} 
      position={[0, 0, 0]}
      onPointerDown={(e) => { e.stopPropagation(); if (onChargeStart) onChargeStart(); }}
      onPointerUp={(e) => { e.stopPropagation(); if (onChargeStop) onChargeStop(); }}
      onPointerOut={(e) => { e.stopPropagation(); if (onChargeStop) onChargeStop(); }}
    >
      {/* 光源を少し抑えめにし、結晶自身の発光を際立たせる */}
      <ambientLight intensity={lightIntensity * 0.3} />
      <directionalLight position={[5, 10, 5]} intensity={lightIntensity * 1.0} color="#ffffff" />
      <pointLight position={[-3, 0, 3]} intensity={0.5} color="#8fd8ff" />
      <Environment preset="night" />

      <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.1}>
        <Sphere args={[0.42, 64, 64]}> 
          <shaderMaterial
            ref={karmaMatRef}
            args={[{
              uniforms: karmaUniforms,
              vertexShader: karmaVertexShader,
              fragmentShader: karmaFragmentShader,
              transparent: true,
              blending: THREE.NormalBlending,
              depthWrite: false
            }]}
          />
        </Sphere>
      </Float>

      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={2.5}          
          roughness={0.02}         
          transmission={1.0} 
          ior={1.52}               
          chromaticAberration={0.05} 
          distortion={0.3}            
          color="#ffffff"          
          attenuationColor="#000511" 
          attenuationDistance={2.0}  
          envMapIntensity={1.0}    
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </Sphere>
    </group>
  )
}