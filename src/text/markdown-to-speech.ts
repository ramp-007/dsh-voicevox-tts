/** アシスタント回答の Markdown を読み上げ用テキストに変換する。表示用の本文は変更しない。 */
import { Lexer, type Token, type Tokens } from 'marked'

export interface SpeechOptions {
  readCodeBlocks: boolean
}

const EMOJI = /\p{Extended_Pictographic}|️|‍/gu
const URL_RE = /https?:\/\/[^\s)）」』]+/g

function cleanInline(text: string): string {
  return text.replace(URL_RE, 'リンク').replace(EMOJI, '').replace(/[*_~`#>|]/g, '').replace(/[ \t]+/g, ' ').trim()
}

function inlineText(tokens: Token[] | undefined, fallback: string): string {
  if (!tokens) return cleanInline(fallback)
  let out = ''
  for (const t of tokens) {
    switch (t.type) {
      case 'link':
        // リンクテキストだけ読む（URL 自体は読まない）
        out += inlineText((t as Tokens.Link).tokens, (t as Tokens.Link).text)
        break
      case 'image':
        out += (t as Tokens.Image).text
        break
      case 'codespan':
        out += (t as Tokens.Codespan).text
        break
      case 'br':
        out += '\n'
        break
      case 'html':
        break
      default: {
        const inner = (t as { tokens?: Token[] }).tokens
        out += inner ? inlineText(inner, t.raw) : cleanInline((t as { text?: string }).text ?? t.raw)
      }
    }
  }
  return cleanInline(out)
}

function sentence(text: string): string {
  const t = text.trim()
  if (t === '') return ''
  return /[。！？!?.]$/.test(t) ? t : `${t}。`
}

function walk(tokens: Token[], options: SpeechOptions, lines: string[]): void {
  for (const t of tokens) {
    switch (t.type) {
      case 'heading':
        lines.push(sentence(inlineText((t as Tokens.Heading).tokens, (t as Tokens.Heading).text)))
        break
      case 'paragraph':
      case 'text': {
        const tk = t as Tokens.Paragraph
        lines.push(sentence(inlineText(tk.tokens, tk.text)))
        break
      }
      case 'list':
        for (const item of (t as Tokens.List).items) walk(item.tokens, options, lines)
        break
      case 'blockquote':
        walk((t as Tokens.Blockquote).tokens, options, lines)
        break
      case 'code':
        if (options.readCodeBlocks) lines.push(sentence((t as Tokens.Code).text.replace(/\n+/g, '、')))
        break
      case 'table': {
        const table = t as Tokens.Table
        const head = table.header.map((h) => inlineText(h.tokens, h.text))
        for (const row of table.rows) {
          const cells = row.map((c, i) => `${head[i] ?? ''} ${inlineText(c.tokens, c.text)}`.trim())
          lines.push(sentence(cells.join('、')))
        }
        break
      }
      default:
        // hr / html / space / def などは読まない
        break
    }
  }
}

export function markdownToSpeech(markdown: string, options: SpeechOptions): string {
  const tokens = new Lexer({ gfm: true }).lex(markdown)
  const lines: string[] = []
  walk(tokens, options, lines)
  return lines.filter((l) => l !== '').join('\n')
}
