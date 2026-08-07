'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function MarineSnow({ variant = 'near', progress = 0, descent = 0, windSpeed = 0, rainAmount = 0, clouds = 0 }) {
  const pointsRef = useRef<THREE.Points>(null)
  
  // 妥協のない密度。奥(far)の空間は微細な粒子で埋め尽くし、手前(near)は大きなボケを作り出す
  const count = variant === 'near' ? 350 : 1200
  
  // 粒子の座標と、固有のランダムパラメータを生成
  const [positions, randoms] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const rnd = new Float32Array(count * 3)
    
    for (let i = 0; i < count; i++) {
      // 空間の広がり（幅と高さ）
      pos[i * 3 + 0] = (Math.random() - 0.5) * 20 
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20 
      // Z軸: nearは手前〜クリスタル付近、farはクリスタルの奥の深淵
      pos[i * 3 + 2] = variant === 'near' ? (Math.random() * 6 - 2) : (Math.random() * -15 - 3)
      
      // x: 位相(Phase), y: 速度係数(Speed), z: サイズ係数(Scale)
      rnd[i * 3 + 0] = Math.random() * Math.PI * 2
      rnd[i * 3 + 1] = 0.2 + Math.random() * 0.8
      rnd[i * 3 + 2] = 0.5 + Math.random() * 1.5
    }
    return [pos, rnd]
  }, [count, variant])

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uDescent: { value: 0 },
      uOpacity: { value: variant === 'near' ? 0.6 : 0.3 }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uDescent;
      attribute vec3 aRandom;
      varying float vAlpha;

      void main() {
        vec3 pos = position;

        // 1. 物理ベースの海流（ゆっくり落ちる基本速度 + 潜行時の強烈な上昇気流）
        float fallSpeed = -0.15 * aRandom.y;
        float diveSpeed = 5.0 * uDescent * aRandom.y;
        pos.y += uTime * (fallSpeed + diveSpeed);

        // 2. 有機的な揺らぎ（プランクトンやマリンスノーの自然な漂い）
        pos.x += sin(uTime * 0.3 * aRandom.y + aRandom.x) * 0.4 * aRandom.z;
        pos.z += cos(uTime * 0.2 * aRandom.y + aRandom.x) * 0.4 * aRandom.z;

        // 3. 永遠に続く海（空間のループ）
        pos.y = mod(pos.y + 10.0, 20.0) - 10.0;

        vec4 mvPosition = viewMatrix * modelMatrix * vec4(pos, 1.0);
        
        // 4. 光学的な被写界深度（DoF / ボケ感）の計算
        // カメラ(z=4.5)からクリスタル(z=0)付近までの距離を焦点(Focus)とする
        float distToCamera = -mvPosition.z; 
        float focusDist = 4.5; 
        float blur = abs(distToCamera - focusDist) * 0.25; // 焦点から離れるほどボケる
        
        // ボケるほど粒子は大きく広がる
        float baseSize = 25.0 * aRandom.z;
        float pointSize = baseSize + (blur * 30.0);
        
        gl_PointSize = pointSize * (20.0 / distToCamera); // 透視投影によるスケール
        gl_Position = projectionMatrix * mvPosition;

        // 5. エネルギー保存の法則（大きくボケた粒子ほど透明になる）
        float energyConservation = 1.0 / (1.0 + blur * 2.0);
        // 奥深くの粒子は暗闇に溶け込ませる
        float depthFade = 1.0 - smoothstep(12.0, 20.0, distToCamera);
        
        vAlpha = energyConservation * depthFade;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vAlpha;
      
      void main() {
        vec2 xy = gl_PointCoord.xy - vec2(0.5);
        float ll = dot(xy, xy);

        // 🚨 圧倒的なリアリティの鍵: ガウス関数による完璧な光の減衰（Bokeh効果）
        // ただの切り抜きではなく、中心から縁へ向かって数学的に滑らかに溶ける
        float intensity = exp(-16.0 * ll);
        
        // コア（中心の強い発光）
        float core = exp(-60.0 * ll) * 0.6;

        // 完全に透明な部分は描画をスキップしてGPUを最適化
        if (intensity < 0.001) discard;

        // 深海の美しい青白さ（個体によってわずかに色温度を揺らす処理も可能）
        vec3 color = vec3(0.85, 0.95, 1.0);
        
        gl_FragColor = vec4(color, (intensity + core) * vAlpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending // 光が重なると白く飛ぶリアルな加算合成
  }), [variant])

  useFrame((state) => {
    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.ShaderMaterial
      mat.uniforms.uTime.value = state.clock.elapsedTime
      // 滑らかに潜行速度（descent）をシェーダーへ渡す
      mat.uniforms.uDescent.value = THREE.MathUtils.lerp(mat.uniforms.uDescent.value, descent, 0.1)
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        {/* 🚨 TSエラーを解消: count, array, itemSize を args 配列にまとめる正しい構文 */}
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aRandom" args={[randoms, 3]} />
      </bufferGeometry>
      <shaderMaterial args={[shaderArgs]} />
    </points>
  )
}