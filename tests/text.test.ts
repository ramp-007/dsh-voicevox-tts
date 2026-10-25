import { describe, expect, it } from 'vitest'
import { chunkText } from '../src/text/chunker.ts'
import { markdownToSpeech } from '../src/text/markdown-to-speech.ts'

const speech = (md: string, readCodeBlocks = false) => markdownToSpeech(md, { readCodeBlocks })

describe('markdownToSpeech', () => {
  it('強調・見出し・箇条書きを自然な文にする', () => {
    const out = speech('# 概要\n\n**重要**な点です\n\n- 一つ目\n- 二つ目')
    expect(out).toBe('概要。\n重要な点です。\n一つ目。\n二つ目。')
  })
  it('コードブロックは既定でスキップ、ON で読む', () => {
    const md = '前\n\n```ts\nconst a = 1\n```\n\n後'
    expect(speech(md)).toBe('前。\n後。')
    expect(speech(md, true)).toContain('const a = 1')
  })
  it('リンクはテキストだけ、裸の URL は「リンク」に置換', () => {
    expect(speech('[公式サイト](https://example.com/x)を見て')).toBe('公式サイトを見て。')
    expect(speech('詳細は https://example.com/a?b=1 です')).toBe('詳細はリンクです。')
  })
  it('表はヘッダー付きの行として読む', () => {
    const out = speech('| 名前 | 値 |\n|---|---|\n| 速度 | 1.0 |')
    expect(out).toBe('名前 速度、値 1.0。')
  })
  it('絵文字と HTML を除去する', () => {
    expect(speech('完了しました 🎉')).toBe('完了しました。')
    expect(speech('<div>隠し</div>')).toBe('')
  })
  it('インラインコードは中身を読む', () => {
    expect(speech('`npm test` を実行')).toBe('npm testを実行。')
  })
  it('入力の Markdown 文字列自体は変更しない', () => {
    const md = '# 見出し\n**太字**'
    speech(md)
    expect(md).toBe('# 見出し\n**太字**')
  })
})

describe('chunkText', () => {
  it('文末記号で分割し順序を保つ', () => {
    expect(chunkText('一つ目の文です。二つ目の文です。三つ目！', { minLength: 1 })).toEqual([
      '一つ目の文です。', '二つ目の文です。', '三つ目！',
    ])
  })
  it('小数・バージョン番号・ドメインで分割しない', () => {
    const out = chunkText('円周率は3.14です。バージョンはv1.2.3です。example.comを見て。', { minLength: 1 })
    expect(out).toEqual(['円周率は3.14です。', 'バージョンはv1.2.3です。', 'example.comを見て。'])
  })
  it('英語の文末ピリオドは空白の前で分割', () => {
    expect(chunkText('Hello world. Next one.', { minLength: 1 })).toEqual(['Hello world.', 'Next one.'])
  })
  it('短い文は結合し、長い文は読点で再分割する', () => {
    expect(chunkText('はい。そう。', { minLength: 10 })).toEqual(['はい。そう。'])
    const long = `${'あ'.repeat(30)}、${'い'.repeat(30)}、${'う'.repeat(30)}`
    const out = chunkText(long, { minLength: 1, maxLength: 40 })
    expect(out.every((c) => c.length <= 40)).toBe(true)
    expect(out.join('')).toBe(long)
  })
  it('空文字は空配列', () => {
    expect(chunkText('  \n ')).toEqual([])
  })
})
