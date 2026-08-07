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
  uniform float uCharge;    // 🚨 長押し時のエネルギー

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec3 p = position;
    float l1_norm = abs(p.x) + abs(p.y) + abs(p.z);
    vec3 octahedron = (p / l1_norm) * 1.2; 
    
    vec3 morphedPos = mix(p, octahedron, smoothstep(0.0, 1.0, uAge));
    
    // 🚨 チャージ中はコアが激しく脈動する
    float pulse = sin(uTime * 3.0) * 0.03 * uResonance;
    float chargePulse = sin(uTime * 20.0) * 0.02 * uCharge;
    morphedPos += normal * (pulse + chargePulse);

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
  uniform float uCharge;     // 🚨 長押し時の光量
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
    
    // 🚨 煌めきと、長押しチャージ時の眩い発光
    vec3 pulseGlow = vec3(0.4, 0.8, 1.0) * uResonance * 1.0;
    vec3 chargeGlow = vec3(0.8, 0.95, 1.0) * uCharge * 2.5; // チャージ時は白く強烈に光る

    finalColor += pulseGlow + chargeGlow;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

export function CrystalCoral({ 
  progress = 0, windSpeed = 0, clouds = 0, rainAmount = 0, resonancePulse = 0, temp = 15,
  diveTimeMs = 0, releaseCount = 0, isCharging = false, turbidity = 0,
  onChargeStart, onChargeStop
}: CrystalCoralProps) {
  
  const outerMatRef = useRef<any>(null)
  const groupRef = useRef<THREE.Group>(null)
  const karmaMatRef = useRef<THREE.ShaderMaterial>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  // 🚨 美しい深海ブルーのコア
  const baseEmissive = useMemo(() => new THREE.Color('#00ccff'), [])
  const outerColors = useMemo(() => new THREE.Color('#44aaff'), [])

  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(0.8, 0.2, clouds / 100), [clouds])
  const waterMurkiness = useMemo(() => Math.max(0.02, THREE.MathUtils.lerp(0.02, 0.15, Math.min(rainAmount / 5, 1))), [rainAmount])

  const karmaUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAge: { value: 0 },
    uRelease: { value: 0 },
    uResonance: { value: 0 },
    uCharge: { value: 0 }, // 追加: チャージ強度
    uBaseColor: { value: baseEmissive.clone() }
  }), [baseEmissive])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 3.0)
    
    const time = state.clock.elapsedTime
    const depthHardening = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1)

    if (karmaMatRef.current) {
      const uniforms = karmaMatRef.current.uniforms
      uniforms.uTime.value = time
      uniforms.uAge.value = THREE.MathUtils.lerp(uniforms.uAge.value, Math.min(1.0, diveTimeMs / 36000000), 0.02)
      uniforms.uRelease.value = THREE.MathUtils.lerp(uniforms.uRelease.value, Math.min(1.0, releaseCount / 100), 0.02)
      uniforms.uResonance.value = flashEnergy.current
      
      // 🚨 チャージ状態をシェーダーに滑らかに渡す
      uniforms.uCharge.value = THREE.MathUtils.lerp(uniforms.uCharge.value, isCharging ? 1.0 : 0.0, delta * 2.0)
    }

    if (outerMatRef.current) {
      outerMatRef.current.attenuationColor.lerpColors(outerColors, new THREE.Color('#ffffff'), flashEnergy.current + (isCharging ? 0.5 : 0))
      const baseMurkiness = waterMurkiness + (turbidity * 0.5) 
      outerMatRef.current.roughness = THREE.MathUtils.lerp(outerMatRef.current.roughness, baseMurkiness, 0.1)
      outerMatRef.current.temporalDistortion = THREE.MathUtils.lerp(0.1 + flashEnergy.current, 0.0, depthHardening)
      outerMatRef.current.distortion = THREE.MathUtils.lerp(0.3 + flashEnergy.current, 0.6, depthHardening)
    }

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.015

      const baseScale = 1.0 - (progress * 0.05)
      const chargeScale = isCharging ? -0.05 : 0 
      const flashExpand = flashEnergy.current * 0.08
      const vibrate = isCharging ? Math.sin(time * 50) * 0.005 : 0

      groupRef.current.scale.lerp(
        new THREE.Vector3(
          baseScale * wobbleX + flashExpand + chargeScale + vibrate, 
          baseScale * wobbleY + flashExpand + chargeScale + vibrate, 
          baseScale * wobbleZ + flashExpand + chargeScale + vibrate
        ), 
        delta * 5
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
      <ambientLight intensity={lightIntensity * 0.3} />
      <directionalLight position={[5, 5, 2]} intensity={lightIntensity * 0.8} color="#8fd8ff" />
      <Environment preset="night" />

      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        <Sphere args={[0.55, 64, 64]}> 
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
          thickness={1.5}          // 🚨 ガラスの透明感を引き出す厚み
          roughness={0.02}         // 🚨 表面を磨き上げ、強い光沢（煌めき）を出す
          transmission={1.0} 
          ior={1.25}               // 🚨 重すぎず、水晶のような美しい屈折率
          chromaticAberration={0.06} // 🚨 宝石のような虹色の分散効果
          distortion={0.2}            
          color="#ffffff"          // 🚨 濁りのない純白のガラス
          attenuationColor="#44aaff" // 🚨 内部を通る光を美しいシアンブルーに
          attenuationDistance={2.5} 
          envMapIntensity={1.0}    // 🚨 環境光を強く反射して煌めかせる
        />
      </Sphere>
    </group>
  )
}