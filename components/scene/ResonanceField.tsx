'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

export type ResonanceFieldProps = {
  /**
   * 直近に受信したリモート共鳴の強度 (0..1) と時刻。
   * 同じ値を渡しても at が変わっていればパルスとして扱う。
   */
  remoteResonance: { energy: number; at: number } | null
  /**
   * 結晶ローカルの共鳴強度 (0..1)。手紙受信や自分の筆致のとき強くなる。
   */
  localResonance: number
  /**
   * progress (0..1)。深いほどリングが内側に縮みます
   */
}

