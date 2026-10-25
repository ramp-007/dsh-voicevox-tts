/** 読み上げテキストを文のまとまりに分割する。小数・バージョン番号では分割しない。 */

export interface ChunkOptions {
  /** これより短いまとまりは次と結合する。 */
  minLength?: number
  /** これより長いまとまりは読点などで再分割する。 */
  maxLength?: number
}

const DEFAULT_MIN = 20
const DEFAULT_MAX = 120

/** 文末記号の直後（閉じ括弧・引用符を含む）で切る。ASCII の . は後ろが空白/末尾のときだけ文末扱い。 */
function splitSentences(text: string): string[] {
  const out: string[] = []
  let buf = ''
  const chars = Array.from(text)
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string
    buf += ch
    const next = chars[i + 1]
    let end = false
    if (ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?' || ch === '\n') end = true
    else if (ch === '.') end = next === undefined || /\s/.test(next)
    if (!end) continue
    while (next !== undefined && i + 1 < chars.length && /[」』）)"'”’]/.test(chars[i + 1] as string)) {
      buf += chars[++i] as string
    }
    out.push(buf)
    buf = ''
  }
  if (buf !== '') out.push(buf)
  return out.map((s) => s.trim()).filter((s) => s !== '')
}

function splitLong(sentence: string, maxLength: number): string[] {
  if (sentence.length <= maxLength) return [sentence]
  const parts: string[] = []
  let rest = sentence
  while (rest.length > maxLength) {
    const window = rest.slice(0, maxLength)
    const cut = Math.max(window.lastIndexOf('、'), window.lastIndexOf(','), window.lastIndexOf('，'))
    const at = cut > 0 ? cut + 1 : maxLength
    parts.push(rest.slice(0, at))
    rest = rest.slice(at)
  }
  if (rest !== '') parts.push(rest)
  return parts
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const min = options.minLength ?? DEFAULT_MIN
  const max = options.maxLength ?? DEFAULT_MAX
  const pieces = splitSentences(text).flatMap((s) => splitLong(s, max))
  const out: string[] = []
  for (const piece of pieces) {
    const last = out[out.length - 1]
    if (last !== undefined && last.length < min && last.length + piece.length <= max) {
      out[out.length - 1] = last + piece
    } else out.push(piece)
  }
  return out
}
