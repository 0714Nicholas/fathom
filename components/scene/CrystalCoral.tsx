'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshTransmissionMaterial, Float, Environment } from '@react-three/drei'
import * as THREE from 'three'
import type { DeepSeaCanvasProps } from './DeepSeaCanvas'

// --------------------------------------------------------
// 🚨 魂のコア（Karma）を司るWebGLシェーダー
// --------------------------------------------------------

const karmaVertexShader = `
  uniform float uTime;
  uniform float uAge;       // 0.0(初期) 〜 1.0(究極の結晶)
  uniform float uResonance; // ソナーの共鳴エネルギー

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec3 p = position;
    
    // --- 1. 相転移（State of Matter）の計算 ---
    // Ageに応じて、球体(L2) から 正八面体(L1) へと頂点座標をモーフさせる
    float l1_norm = abs(p.x) + abs(p.y) + abs(p.z);
    // 収縮しすぎないように 1.2倍してスケールを補正
    vec3 octahedron = (p / l1_norm) * 1.2; 
    
    vec3 morphedPos = mix(p, octahedron, smoothstep(0.0, 1.0, uAge));
    
    // --- 2. 呼吸と共鳴（Resonance） ---
    float pulse = sin(uTime * 5.0) * 0.05 * uResonance;
    morphedPos += normal * pulse;

    vec4 worldPosition = modelMatrix * vec4(morphedPos, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    
    vWorldPosition = worldPosition.xyz;
    vViewPosition = -mvPosition.xyz;
    
    // 法線のブレンド
    vNormal = normalize(normalMatrix * mix(normal, normalize(octahedron), smoothstep(0.0, 1.0, uAge)));
    
    gl_Position = projectionMatrix * mvPosition;
  }
`

const karmaFragmentShader = `
  uniform float uTime;
  uniform float uRelease;    // 手放した回数（0.0 〜 1.0）
  uniform float uResonance;  
  uniform vec3 uBaseColor;   

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  // FBM (Fractal Brownian Motion) ノイズ関数
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

  // 薄膜干渉カラーパレット
  vec3 palette(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    // --- フラクタル構造の複雑化 ---
    // Releaseが増えるほどノイズが細かく、深くなる
    vec3 p = vWorldPosition * (2.0 + uRelease * 6.0) + uTime * 0.1;
    float fbmNoise = noise(p) * 0.5 + noise(p * 2.0) * 0.25;
    
    // --- 構造色（Iridescence）の計算 ---
    float fresnel = max(0.0, dot(normal, viewDir));
    float interference = fresnel + (fbmNoise * uRelease * 2.0);
    
    vec3 a = vec3(0.5); vec3 b = vec3(0.5); vec3 c = vec3(1.0);
    vec3 d = vec3(0.0, 0.33, 0.67) + (uTime * 0.05);
    
    vec3 iridescenceColor = palette(interference, a, b, c, d);
    
    // 暗いベース色と構造色のブレンド
    vec3 finalColor = mix(uBaseColor * 0.3, iridescenceColor, smoothstep(0.0, 1.0, uRelease));
    
    // ソナー受信時に白青く発光する
    finalColor += vec3(0.8, 0.9, 1.0) * uResonance * (0.4 + fbmNoise * 0.6);

    float alpha = clamp(0.9 + (uResonance * 0.1), 0.0, 1.0);
    gl_FragColor = vec4(finalColor, alpha);
  }
`

// --------------------------------------------------------
// メインコンポーネント
// --------------------------------------------------------

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
  const groupRef = useRef<THREE.Group>(null)
  const karmaMatRef = useRef<THREE.ShaderMaterial>(null)
  
  const prevPulse = useRef(resonancePulse)
  const flashEnergy = useRef(0)

  // あなたの既存コード：温度による色の変化
  const colorRatio = useMemo(() => THREE.MathUtils.clamp((temp + 10) / 45, 0, 1), [temp])
  const baseEmissive = useMemo(() => {
    const cold = new THREE.Color('#0044ff') 
    const hot = new THREE.Color('#00ff66')  
    return new THREE.Color().lerpColors(cold, hot, colorRatio)
  }, [colorRatio])

  const outerColors = useMemo(() => {
    const cold = new THREE.Color('#88ccff')
    const hot = new THREE.Color('#88ffcc')
    return new THREE.Color().lerpColors(cold, hot, colorRatio)
  }, [colorRatio])

  const lightIntensity = useMemo(() => THREE.MathUtils.lerp(1.2, 0.4, clouds / 100), [clouds])
  const waterMurkiness = useMemo(() => Math.max(0.05, THREE.MathUtils.lerp(0.05, 0.2, Math.min(rainAmount / 5, 1))), [rainAmount])

  // シェーダーへ渡すUniforms
  const karmaUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAge: { value: 0 },
    uRelease: { value: 0 },
    uResonance: { value: 0 },
    uBaseColor: { value: baseEmissive }
  }), [baseEmissive])

  useFrame((state, delta) => {
    if (resonancePulse > prevPulse.current) {
      flashEnergy.current = 1.0
      prevPulse.current = resonancePulse
    }
    flashEnergy.current = THREE.MathUtils.lerp(flashEnergy.current, 0, delta * 0.4)
    
    const time = state.clock.elapsedTime
    const depthHardening = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1)

    // 🚨 1. インナーコア（Karma）の更新
    if (karmaMatRef.current) {
      const uniforms = karmaMatRef.current.uniforms
      uniforms.uTime.value = time
      
      // Age: 例として10時間(36,000,000 ms)で完全な正八面体になるよう設定
      const targetAge = Math.min(1.0, diveTimeMs / 36000000)
      uniforms.uAge.value = THREE.MathUtils.lerp(uniforms.uAge.value, targetAge, 0.02)
      
      // Release: 100回手放すと完全なフラクタル構造色になるよう設定
      const targetRelease = Math.min(1.0, releaseCount / 100)
      uniforms.uRelease.value = THREE.MathUtils.lerp(uniforms.uRelease.value, targetRelease, 0.02)
      
      uniforms.uResonance.value = flashEnergy.current
    }

    // 🚨 2. アウターガラス（Shell）の更新（あなたの既存ロジック）
    if (outerMatRef.current) {
      const flashAtten = new THREE.Color('#ffffff') 
      outerMatRef.current.attenuationColor.lerpColors(outerColors, flashAtten, flashEnergy.current)

      const baseDistortion = 0.4 + (windSpeed * 0.06)
      const currentTemporalDistortion = 0.2 + (windSpeed * 0.05) + flashEnergy.current * 1.5
      outerMatRef.current.temporalDistortion = THREE.MathUtils.lerp(currentTemporalDistortion, 0.0, depthHardening)
      
      const currentDistortion = baseDistortion + flashEnergy.current * 1.5
      outerMatRef.current.distortion = THREE.MathUtils.lerp(currentDistortion, 0.8, depthHardening)

      outerMatRef.current.ior = THREE.MathUtils.lerp(1.2, 1.45, depthHardening)
      outerMatRef.current.thickness = THREE.MathUtils.lerp(1.5, 5.0, depthHardening)
    }

    // 🚨 3. 全体の浮遊と振動アニメーション
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15
      groupRef.current.rotation.z = Math.sin(time * 0.4) * 0.05

      const wobbleX = 1 + Math.sin(time * 0.7) * 0.025 + Math.sin(time * 1.3) * 0.015
      const wobbleY = 1 + Math.cos(time * 0.8) * 0.025 + Math.cos(time * 1.4) * 0.015
      const wobbleZ = 1 + Math.sin(time * 0.9) * 0.025 + Math.cos(time * 1.5) * 0.015

      const baseScale = 0.55 - (progress * 0.03)
      const flashExpand = flashEnergy.current * 0.15
      
      groupRef.current.scale.lerp(
        new THREE.Vector3(baseScale * wobbleX + flashExpand, baseScale * wobbleY + flashExpand, baseScale * wobbleZ + flashExpand), 
        delta * 5
      )
    }
  })

  return (
    <group ref={groupRef} scale={0.55} position={[0, -0.2, 0]}>
      <ambientLight intensity={lightIntensity * 0.5} />
      <directionalLight position={[5, 5, 2]} intensity={lightIntensity} color="#8fd8ff" />
      <Environment preset="night" />

      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        {/* 🚨 魂のコア：Karma（AgeとRelease）によって球体から正八面体へ形を変え、構造色を放つ */}
        <Sphere args={[0.55, 64, 64]}> 
          <shaderMaterial
            ref={karmaMatRef}
            args={[{
              uniforms: karmaUniforms,
              vertexShader: karmaVertexShader,
              fragmentShader: karmaFragmentShader,
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false
            }]}
          />
        </Sphere>
      </Float>

      {/* 🚨 外殻：あなたが作り上げた美しい屈折ガラス（深度で硬化する） */}
      <Sphere args={[1.2, 64, 64]}>
        <MeshTransmissionMaterial
          ref={outerMatRef}
          thickness={1.5}    
          roughness={waterMurkiness}      
          transmission={1.0} 
          ior={1.2}               
          chromaticAberration={0.05}  
          distortion={0.5}            
          temporalDistortion={0.3}    
          color="#ffffff" 
          attenuationColor={outerColors} 
          attenuationDistance={3.0} 
          envMapIntensity={0.8}       
        />
      </Sphere>
    </group>
  )
}