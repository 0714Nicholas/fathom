// 海面の天気を、音のつまみと「いまの海」のことばに変える。
// 音（hooks/useDeepSeaAudio.ts）と画面・通知の言葉が同じ基準で決まるように、ここにまとめる

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export type WeatherInput = {
  windSpeed: number   // m/s
  rainAmount: number  // mm/h
  snowAmount: number  // mm/h
  clouds: number      // 0..100 %
  temp: number        // °C
}

// 天気を 0..1 の「音のつまみ」に変換する
export function weatherToSound(w: WeatherInput) {
  return {
    wind: clamp01(w.windSpeed / 18),                                // 18 m/s（暴風）で最大
    rain: clamp01(Math.log1p(w.rainAmount) / Math.log1p(10)),       // 10 mm/h（本降り）で最大
    snow: clamp01(Math.log1p(w.snowAmount * 4) / Math.log1p(8)),    // 2 mm/h で最大
    overcast: clamp01(w.clouds / 100),
    cold: clamp01((20 - w.temp) / 40),                              // 20°C 以上で 0、-20°C で 1
  }
}

export type SeaCondition = {
  /** 「スヴァールバルは、いま吹雪。」の「吹雪」 */
  word: string
  /** 海面の音がはっきり聞こえる天気か（雨・雪・風）。凪や曇りでは静か */
  audible: boolean
}

// 音のつまみと同じ値から、いまの海をひとことで言う
export function seaCondition(w: WeatherInput): SeaCondition {
  const k = weatherToSound(w)
  const strongWind = k.wind >= 0.6  // 約 11 m/s 以上（波が高い）
  const windy = k.wind >= 0.3       // 約 5.4 m/s 以上（白波が立ち始め、風の音がはっきりする）
  const calm = k.wind < 0.15        // 約 2.7 m/s 未満

  if (k.snow >= 0.05) return { word: strongWind ? '吹雪' : '雪', audible: true }
  if (k.rain >= 0.05) {
    if (strongWind) return { word: '嵐', audible: true }
    return { word: k.rain >= 0.6 ? '強い雨' : '雨', audible: true }
  }
  if (strongWind) return { word: '荒れ模様', audible: true }
  if (windy) return { word: '白波', audible: true }
  if (k.overcast >= 0.7) return { word: '曇り空', audible: false }
  if (calm && k.overcast <= 0.2) return { word: '凪', audible: false }
  return { word: '穏やか', audible: false }
}

// 「北極圏 / スヴァールバル」→「スヴァールバル」
export function shortPlaceName(label: string): string {
  return label.split(' / ').pop()?.trim() || label
}
