// 「沈めた」もやもやの保存先。中身は人に見せるものではないので、この端末の localStorage にだけ置き、
// サーバーにも他の人にも送らない
const KEY = 'fathom:sunk-thoughts'
const MAX_KEEP = 200

export type SunkThought = { text: string, at: number }

function readAll(): SunkThought[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(list: SunkThought[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_KEEP))) } catch { /* noop */ }
}

export function saveThought(text: string): SunkThought {
  const thought = { text: text.slice(0, 200), at: Date.now() }
  writeAll([...readAll(), thought])
  return thought
}

// 浮上後に「手放す」を選んだものを、端末からも消す
export function releaseThoughts(ats: number[]) {
  const drop = new Set(ats)
  writeAll(readAll().filter((t) => !drop.has(t.at)))
}
