// lib/identity/coordinates.ts

// 1. 状態や情景を表す形容詞（Atmosphere / State）
const ADJECTIVES_STATE = [
    'silent', 'drifting', 'sinking', 'fading', 'echoing',
    'distant', 'deep', 'lucid', 'hollow', 'frozen',
    'submerged', 'hidden', 'gentle', 'still', 'sleeping',
    'wandering', 'lost', 'falling', 'floating', 'quiet',
    'forgotten', 'blind', 'calm', 'sunken', 'muted'
  ]
  
  // 2. 色彩、光、質感を規定する形容詞（Color / Texture）
  const ADJECTIVES_COLOR = [
    'pale', 'dark', 'silver', 'midnight', 'abyssal',
    'twilight', 'obsidian', 'glass', 'faint', 'dim',
    'azure', 'cerulean', 'white', 'cold', 'lunar',
    'stellar', 'phantom', 'crystal', 'ash', 'pearl',
    'lucid', 'shadowed', 'clear', 'shimmering', 'void'
  ]
  
  // 3. 海や水底を連想させる名詞（Sea / Object）
  const NOUNS = [
    'snow', 'coral', 'echo', 'tide', 'current',
    'shell', 'ray', 'depth', 'pulse', 'ghost',
    'shadow', 'trace', 'whisper', 'drift', 'trench',
    'abyss', 'reef', 'wave', 'sea', 'water',
    'glass', 'stone', 'sand', 'dust', 'light'
  ]
  
  /**
   * 3つの単語を組み合わせて、Fathomの世界観に合った固有の座標（ID）を生成します。
   * 例: "silent-pale-snow", "drifting-midnight-echo"
   */
  export function generateFathomCoordinate(): string {
    const state = ADJECTIVES_STATE[Math.floor(Math.random() * ADJECTIVES_STATE.length)]
    const color = ADJECTIVES_COLOR[Math.floor(Math.random() * ADJECTIVES_COLOR.length)]
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
    return `${state}-${color}-${noun}`
  }
  
  /**
   * 入力された文字列が正しい座標のフォーマット（辞書に存在する3単語の組み合わせ）か検証します。
   * ユーザーが復帰する際（ログイン時）のバリデーションに使用します。
   */
  export function isValidFathomCoordinate(input: string): boolean {
    // ユーザーがスペース区切りで入力してもハイフンに正規化する
    const normalized = input.toLowerCase().trim().replace(/\s+/g, '-')
    const parts = normalized.split('-')
    
    if (parts.length !== 3) return false
    
    return (
      ADJECTIVES_STATE.includes(parts[0]) &&
      ADJECTIVES_COLOR.includes(parts[1]) &&
      NOUNS.includes(parts[2])
    )
  }
  
  /**
   * 表示用にフォーマットします（例: "silent-pale-snow" -> "silent pale snow"）
   */
  export function formatCoordinateForDisplay(coordinate: string): string {
    return coordinate.replace(/-/g, ' ')
  }
  
  /**
   * 検索用にフォーマットします（例: "silent pale snow" -> "silent-pale-snow"）
   */
  export function formatCoordinateForSystem(input: string): string {
    return input.toLowerCase().trim().replace(/\s+/g, '-')
  }