'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float, Environment } from '@react-three/drei'
import * as THREE from 'three'
import type { DeepSeaCanvasProps } from './DeepSeaCanvas'

export type CrystalCoralProps = DeepSeaCanvasProps

const karmaVertexShader = `
  uniform float uTime;
  uniform float uAge;       
  uniform float uResonance; 
  uniform float uCharge;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

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
    vUv = uv;
    vec3 p = position;
    float l1_norm = abs(p.x) + abs(p.y) + abs(p.z);
    vec3 octahedron = (p / l1_norm) * 1.2; 
    
    vec3 morphedPos = mix(p, octahedron, smoothstep(0.0, 1.0, uAge));
    
    // 🚨 チャージ中(長押し)は乱気流のように激しくコアが暴れる
    float turbulence = noise(p * 8.0 + uTime * 15.0) * 0.15 * uCharge;
    // 🚨 解放(指を放した瞬間)は美しい波紋が広がる
    float pulse = sin(uTime * 10.0) * 0.08 * uResonance;
    
    morphedPos += normal * (pulse + turbulence);

    vec4 worldPosition = modelMatrix * vec4(morphedPos, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    
    vWorldPosition = worldPosition.xyz;
    vViewPosition = -mvPosition.xyz;
    vNormal = normalize(normalMatrix * mix(normal, normalize(octahedron), smoothstep(0.0, 1.0, uAge)));
    
    gl_Position = projectionMatrix * mvPosition;
  }
`

const karmaFragmentShader = `
  uniform float uTime;
  uniform float uRelease;    
  uniform float uResonance;  
  uniform float uCharge;     
  uniform vec3 uBaseColor;   

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

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

  vec3 palette(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    vec3 p = vWorldPosition * 3.0 + uTime * 0.05;
    float fbmNoise = noise(p) * 0.5 + noise(p * 2.0) * 0.25;
    
    float fresnel = max(0.0, dot(normal, viewDir));
    float interference = fresnel + (fbmNoise * 0.5);
    
    vec3 a = vec3(0.5); vec3 b = vec3(0.5); vec3 c = vec3(1.0);
    vec3 d = vec3(0.0, 0.33, 0.67) + (uTime * 0.05);
    
    vec3 iridescenceColor = palette(interference, a, b, c, d);
    vec3 finalColor = mix(uBaseColor, iridescenceColor, smoothstep(0.0, 1.0, uRelease));
    
    // 🚨 白飛び防止：光量を1.5〜2.0倍程度に抑え、色味を残す
    // チャージ中は危険な熱を帯びたような赤紫の輝き
    vec3 chargeGlow = vec3(0.9, 0.1, 0.3) * uCharge * 1.5; 
    // 指を放した瞬間の解放フラッシュは、透き通るシアン
    vec3 pulseGlow = vec3(0.2, 0.9, 1.0) * uResonance * 2.0;

    finalColor += pulseGlow + chargeGlow;

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

  // 普段の深海ブルー
  const baseEmissive = useMemo(() => new THREE.Color('#002266'), [])
  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(1.2, 0.5, clouds / 100), [clouds])

  const karmaUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAge: { value: 0 },
    uRelease: { value: 0 },
    uResonance: { value: 0 },
    uCharge: { value: 0 },
    uBaseColor: { value: baseEmissive.clone() }
  }), [baseEmissive])

  useFrame((state, delta) => {
    // 🚨 resonancePulse が更新された瞬間＝【指を放して解放成功した瞬間】
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0 // 閃光エネルギーをMAXに！
      prevPulse.current = resonancePulse
    }
    // フラッシュは素早く減衰させる
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 2.5)
    
    // チャージ状態の滑らかな上下
    const targetCharge = isCharging ? 1.0 : 0.0
    chargeLevel.current = THREE.MathUtils.lerp(chargeLevel.current, targetCharge, delta * (isCharging ? 1.5 : 4.0))

    const time = state.clock.elapsedTime
    const depthHardening = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1)

    if (karmaMatRef.current) {
      const uniforms = karmaMatRef.current.uniforms
      uniforms.uTime.value = time
      uniforms.uAge.value = THREE.MathUtils.lerp(uniforms.uAge.value, Math.min(1.0, diveTimeMs / 36000000), 0.02)
      uniforms.uRelease.value = THREE.MathUtils.lerp(uniforms.uRelease.value, Math.min(1.0, releaseCount / 100), 0.02)
      
      uniforms.uResonance.value = flashEnergy.current
      uniforms.uCharge.value = chargeLevel.current

      // コアのベースカラーの変化
      if (isCharging) {
        // チャージ中は禍々しい深紅へ
        uniforms.uBaseColor.value.lerp(new THREE.Color('#660022'), 0.05) 
      } else if (isTuning) {
        const targetHue = 0.5 + (tuningValue / 100) * 0.4
        const tuneColor = new THREE.Color().setHSL(targetHue, 1.0, 0.4)
        uniforms.uBaseColor.value.lerp(tuneColor, 0.15)
      } else {
        uniforms.uBaseColor.value.lerp(baseEmissive, 0.05)
      }
    }

    if (outerMatRef.current) {
      // 🚨 外側のガラス（透過）の制御
      const baseColor = new THREE.Color('#000511')    // 普段：光を飲み込む黒
      const chargeColor = new THREE.Color('#220011')  // 長押し中：熱を帯びた黒紫
      const flashColor = new THREE.Color('#00ffff')   // 解放時：強烈なシアン（完全透過）

      // チャージ色とベース色を混ぜた後、解放時のフラッシュ色で上書き
      const currentColor = baseColor.clone().lerp(chargeColor, chargeLevel.current)
      currentColor.lerp(flashColor, flashEnergy.current)
      outerMatRef.current.attenuationColor.copy(currentColor)
      
      // 🚨 解放の瞬間、ガラスが一気に透き通って中の光を爆発させる
      const baseDist = 2.0 + (chargeLevel.current * 0.5) // 普段〜チャージ中は光を閉じ込める
      outerMatRef.current.attenuationDistance = THREE.MathUtils.lerp(baseDist, 10.0, flashEnergy.current) // 解放時一気に透ける
      
      // 解放の瞬間はガラスの表面がツルツルになって眩しくなる
      outerMatRef.current.roughness = THREE.MathUtils.lerp(0.06, 0.0, flashEnergy.current)
      
      // 歪み（ディストーション）の暴走
      outerMatRef.current.distortion = THREE.MathUtils.lerp(0.5, 2.0, Math.max(chargeLevel.current, flashEnergy.current))
    }

    if (groupRef.current) {
      const spinSpeed = isTuning ? 1.5 : (isCharging ? 4.0 : 0.1) 
      groupRef.current.rotation.y += delta * spinSpeed
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.015

      const baseScale = 1.0 - (progress * 0.05)
      
      // 🚨 カタルシスの表現：「溜め」と「解放」
      // 長押し中はエネルギーを押し込めるように少し縮む(-0.06)
      const chargeShrink = chargeLevel.current * -0.06 
      // 指を放した瞬間に一気にドカンと膨張する(+0.25)
      const flashExpand = flashEnergy.current * 0.25 
      
      const vibrate = isCharging ? Math.sin(time * 80) * 0.015 : 0
      const tuneExpand = isTuning ? Math.sin(time * 15) * 0.02 : 0

      groupRef.current.scale.lerp(
        new THREE.Vector3(
          baseScale * wobbleX + chargeShrink + flashExpand + vibrate + tuneExpand, 
          baseScale * wobbleY + chargeShrink + flashExpand + vibrate + tuneExpand, 
          baseScale * wobbleZ + chargeShrink + flashExpand + vibrate + tuneExpand
        ), 
        delta * 8 // スケール変化を鋭くする
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
      <ambientLight intensity={lightIntensity * 0.5} />
      <directionalLight position={[5, 10, 5]} intensity={lightIntensity * 1.5} color="#ffffff" />
      <pointLight position={[-3, 0, 3]} intensity={1.0} color="#8fd8ff" />
      <Environment preset="night" />

      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
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
          roughness={0.06}         
          transmission={1.0} 
          ior={1.52}               
          chromaticAberration={0.08} 
          distortion={0.5}            
          color="#ffffff"          
          attenuationColor="#000511" 
          attenuationDistance={2.0}  
          envMapIntensity={1.5}    
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </Sphere>
    </group>
  )
}