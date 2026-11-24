// 頭のまわりに音を置く。イヤホンで聞くと、水面が上に、深いところが下に、ほかの人が遠くに聞こえる。
// 聞く人は原点にいて、前が -z、上が +y、右が +x

export type Vec3 = { x: number, y: number, z: number }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// 水面の高さ。潜るほど上へ遠ざかる（向きが真上に近づき、音はこもって小さくなる）
export function surfaceHeight(depth: number): number {
  return 2.5 + clamp01(depth) * 22
}

// 向きだけを受け持つパンナー。距離による音量の変化はこちらで決める（急に大きくならないように）
export function createSpacePanner(ctx: BaseAudioContext, pos: Vec3): PannerNode {
  const panner = ctx.createPanner()
  panner.panningModel = 'HRTF'
  panner.distanceModel = 'inverse'
  panner.refDistance = 1
  panner.rolloffFactor = 0
  placeAt(panner, pos, ctx.currentTime)
  return panner
}

// timeConstant を渡すと、その速さでなめらかに移動する
export function placeAt(panner: PannerNode, pos: Vec3, at: number, timeConstant = 0) {
  if (!panner.positionX) {
    // 古い Safari 向け
    panner.setPosition(pos.x, pos.y, pos.z)
    return
  }
  const axes: [AudioParam, number][] = [[panner.positionX, pos.x], [panner.positionY, pos.y], [panner.positionZ, pos.z]]
  for (const [param, value] of axes) {
    if (timeConstant > 0) param.setTargetAtTime(value, at, timeConstant)
    else param.setValueAtTime(value, at)
  }
}

// from から to へ、duration 秒かけてまっすぐ動かす（泡が昇る、沈めた言葉が落ちていく）
export function glide(panner: PannerNode, from: Vec3, to: Vec3, start: number, duration: number) {
  if (!panner.positionX) {
    panner.setPosition(to.x, to.y, to.z)
    return
  }
  const axes: [AudioParam, number, number][] = [
    [panner.positionX, from.x, to.x],
    [panner.positionY, from.y, to.y],
    [panner.positionZ, from.z, to.z],
  ]
  for (const [param, a, b] of axes) {
    param.setValueAtTime(a, start)
    param.linearRampToValueAtTime(b, start + duration)
  }
}
