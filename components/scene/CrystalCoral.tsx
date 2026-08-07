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

  // 3Dノイズ関数（頂点の暴走用）
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
    
    // 🚨 チャージ中、コアがエネルギーを抑えきれずに激しく波打つ（暴走状態）
    float turbulence = noise(p * 5.0 + uTime * 10.0) * 0.15 * uCharge;
    float pulse = sin(uTime * 3.0) * 0.03 * uResonance;
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
    
    // 🚨 圧倒的な発光（HDR領域へ突入させる）
    vec3 pulseGlow = vec3(0.4, 0.8, 1.0) * uResonance * 1.5;
    // チャージ時は限界突破の純白・シアンエネルギーを放出 (x8.0で強烈なブルーム効果)
    vec3 chargeGlow = vec3(0.8, 0.95, 1.0) * pow(uCharge, 1.5) * 8.0; 

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
  const chargeLevel = useRef(0) // チャージの滑らかな遷移用

  // 普段は深い海の色
  const baseEmissive = useMemo(() => new THREE.Color('#003388'), [])
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
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 3.0)
    
    // 🚨 チャージ状態を滑らかに上げる（長押しで徐々にエネルギーが溜まる）
    const targetCharge = isCharging ? 1.0 : 0.0
    chargeLevel.current = THREE.MathUtils.lerp(chargeLevel.current, targetCharge, delta * (isCharging ? 1.5 : 3.0))
    
    // フラッシュとチャージの合計エネルギー
    const totalEnergy = Math.min(1.0, flashEnergy.current + chargeLevel.current)

    const time = state.clock.elapsedTime
    const depthHardening = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1)

    if (karmaMatRef.current) {
      const uniforms = karmaMatRef.current.uniforms
      uniforms.uTime.value = time
      uniforms.uAge.value = THREE.MathUtils.lerp(uniforms.uAge.value, Math.min(1.0, diveTimeMs / 36000000), 0.02)
      uniforms.uRelease.value = THREE.MathUtils.lerp(uniforms.uRelease.value, Math.min(1.0, releaseCount / 100), 0.02)
      uniforms.uResonance.value = flashEnergy.current
      uniforms.uCharge.value = chargeLevel.current

      if (isCharging) {
        uniforms.uBaseColor.value.lerp(new THREE.Color('#ffffff'), 0.1) 
      } else if (isTuning) {
        const targetHue = 0.5 + (tuningValue / 100) * 0.4
        const tuneColor = new THREE.Color().setHSL(targetHue, 1.0, 0.4)
        uniforms.uBaseColor.value.lerp(tuneColor, 0.15)
      } else {
        uniforms.uBaseColor.value.lerp(baseEmissive, 0.05)
      }
    }

    if (outerMatRef.current) {
      // 🚨 【最大のカギ】ガラスの透過性の解放（発散ギミック）
      // 普段は光を飲み込むブラックホールのような色(#000511)
      const darkGlass = new THREE.Color('#000511')
      // チャージ・共鳴時は、光を外へ逃がす純白に近いシアン(#aaddff)へ劇的変化
      const radiantGlass = new THREE.Color('#aaddff')
      
      outerMatRef.current.attenuationColor.lerpColors(darkGlass, radiantGlass, totalEnergy)
      
      // 🚨 普段(2.0)は分厚いガラスに光が吸収されるが、チャージ時(15.0)はガラスが完全に透き通り、コアの爆光が外へ突き抜ける
      outerMatRef.current.attenuationDistance = THREE.MathUtils.lerp(2.0, 15.0, totalEnergy)
      
      // エネルギーが高まるほど、ガラス自体も激しく歪む
      outerMatRef.current.distortion = THREE.MathUtils.lerp(0.5, 1.8, totalEnergy)
    }

    if (groupRef.current) {
      const spinSpeed = isTuning ? 1.5 : (isCharging ? 3.0 : 0.1) // チャージ中はさらに高速回転
      groupRef.current.rotation.y += delta * spinSpeed
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.015

      const baseScale = 1.0 - (progress * 0.05)
      // 🚨 チャージ中、エネルギーで全体が大きく膨張する
      const energyExpand = totalEnergy * 0.15 
      const vibrate = isCharging ? Math.sin(time * 80) * 0.01 : 0
      const tuneExpand = isTuning ? Math.sin(time * 15) * 0.02 : 0

      groupRef.current.scale.lerp(
        new THREE.Vector3(
          baseScale * wobbleX + energyExpand + vibrate + tuneExpand, 
          baseScale * wobbleY + energyExpand + vibrate + tuneExpand, 
          baseScale * wobbleZ + energyExpand + vibrate + tuneExpand
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
          roughness={0.04}         
          transmission={1.0} 
          ior={1.52}               
          chromaticAberration={0.08} 
          distortion={0.5}            
          color="#ffffff"          // ガラス自体は純白にして、色の制御はattenuationで行う
          attenuationColor="#000511" // 🚨 初期状態は漆黒（ブラックホール）
          attenuationDistance={2.0}  // 🚨 光を閉じ込める短い距離
          envMapIntensity={1.5}    
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </Sphere>
    </group>
  )
}