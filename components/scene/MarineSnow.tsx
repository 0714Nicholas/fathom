'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function MarineSnow({ 
  variant = 'near', progress = 0, descent = 0, windSpeed = 0, rainAmount = 0, clouds = 0,
  isSuspended = false // 🚨 追加
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const localTime = useRef(0) // 🚨 独自の時計を用意
  
  const count = variant === 'near' ? 350 : 1200
  
  const [positions, randoms] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const rnd = new Float32Array(count * 3)
    
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 20 
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20 
      pos[i * 3 + 2] = variant === 'near' ? (Math.random() * 6 - 2) : (Math.random() * -15 - 3)
      
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

        float fallSpeed = -0.15 * aRandom.y;
        float diveSpeed = 5.0 * uDescent * aRandom.y;
        pos.y += uTime * (fallSpeed + diveSpeed);

        pos.x += sin(uTime * 0.3 * aRandom.y + aRandom.x) * 0.4 * aRandom.z;
        pos.z += cos(uTime * 0.2 * aRandom.y + aRandom.x) * 0.4 * aRandom.z;

        pos.y = mod(pos.y + 10.0, 20.0) - 10.0;

        vec4 mvPosition = viewMatrix * modelMatrix * vec4(pos, 1.0);
        
        float distToCamera = -mvPosition.z; 
        float focusDist = 4.5; 
        float blur = abs(distToCamera - focusDist) * 0.25; 
        
        float baseSize = 25.0 * aRandom.z;
        float pointSize = baseSize + (blur * 30.0);
        
        gl_PointSize = pointSize * (20.0 / distToCamera); 
        gl_Position = projectionMatrix * mvPosition;

        float energyConservation = 1.0 / (1.0 + blur * 2.0);
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

        float intensity = exp(-16.0 * ll);
        float core = exp(-60.0 * ll) * 0.6;

        if (intensity < 0.001) discard;

        vec3 color = vec3(0.85, 0.95, 1.0);
        
        gl_FragColor = vec4(color, (intensity + core) * vAlpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending 
  }), [variant])

  useFrame((_, delta) => {
    // 🚨 サスペンド(一時停止)中でなければ、時計の針を進める
    if (!isSuspended) {
      localTime.current += delta
    }

    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.ShaderMaterial
      mat.uniforms.uTime.value = localTime.current // 🚨 独自の時間を渡す
      mat.uniforms.uDescent.value = THREE.MathUtils.lerp(mat.uniforms.uDescent.value, descent, 0.1)
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aRandom" args={[randoms, 3]} />
      </bufferGeometry>
      <shaderMaterial args={[shaderArgs]} />
    </points>
  )
}