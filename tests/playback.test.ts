import { describe, expect, it } from 'vitest'
import { TtsController, type PlayerLike } from '../src/client/controller.ts'
import { findAssistantMessage, isFresh } from '../src/client/message-text.ts'
import { Player, type AudioLike } from '../src/client/player.ts'
import { SynthesisJob } from '../src/client/synthesis-queue.ts'
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/settings.ts'

const blobOf = (s: string) => new Blob([s])
const textOf = (b: Blob) => b.text()

class FakePlayer implements PlayerLike {
  played: string[] = []
  stops = 0
  private pending: ((ok: boolean) => void) | null = null
  constructor(private readonly auto = true) {}
  async play(blob: Blob): Promise<boolean> {
    this.played.push(await textOf(blob))
    if (this.auto) return true
    return new Promise((resolve) => { this.pending = resolve })
  }
  stop(): void {
    this.stops++
    this.pending?.(false)
    this.pending = null
  }
  finish(): void {
    this.pending?.(true)
    this.pending = null
  }
}

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch })
const tick = () => new Promise((r) => setTimeout(r, 10))

describe('SynthesisJob', () => {
  it('合成が逆順に終わっても取り出しは元の順序', async () => {
    const delays = [30, 5, 15]
    const job = new SynthesisJob(['a', 'b', 'c'], (t, signal) => new Promise((res, rej) => {
      const i = ['a', 'b', 'c'].indexOf(t)
      signal.addEventListener('abort', () => rej(new Error('aborted')))
      setTimeout(() => res(blobOf(t)), delays[i])
    }), { concurrency: 3 })
    const order: string[] = []
    for (let n = await job.next(); n; n = await job.next()) order.push(await textOf(n.blob))
    expect(order).toEqual(['a', 'b', 'c'])
  })
  it('同時合成数が上限を超えない', async () => {
    let active = 0
    let peak = 0
    const job = new SynthesisJob(['1', '2', '3', '4', '5'], async (t) => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
      return blobOf(t)
    }, { concurrency: 2 })
    while (await job.next()) { /* drain */ }
    expect(peak).toBeLessThanOrEqual(2)
  })
  it('キャンセル後は null を返し、進行中の合成を中断する', async () => {
    let aborted = false
    const job = new SynthesisJob(['a'], (_t, signal) => new Promise((_res, rej) => {
      signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')) })
    }), { concurrency: 1 })
    const p = job.next().catch(() => 'rejected')
    job.cancel()
    expect(await p).toBe('rejected')
    expect(aborted).toBe(true)
    expect(await job.next()).toBeNull()
  })
})

describe('TtsController', () => {
  const make = (player: PlayerLike, synth?: (t: string) => Promise<Blob>, s = settings()) =>
    new TtsController({
      getSettings: () => s,
      makeSynthesizer: () => async (t) => (synth ? synth(t) : blobOf(t)),
      player,
    })

  it('分割した文を順番どおりに再生し idle に戻る', async () => {
    const player = new FakePlayer()
    const c = make(player)
    await c.speak('m1', '一つ目の文はこれです。二つ目の文はこちらです。'.repeat(1))
    expect(player.played.join('')).toBe('一つ目の文はこれです。二つ目の文はこちらです。')
    expect(c.getState().status).toBe('idle')
  })
  it('新しい回答に切り替えると古い再生は止まり、古い結果は再生されない', async () => {
    const player = new FakePlayer(false)
    let release: (() => void) | undefined
    const gate = new Promise<void>((r) => { release = r })
    const c = make(player, async (t) => { if (t.includes('古い')) await gate; return blobOf(t) })
    void c.speak('old', '古い回答です。')
    await tick()
    const second = c.speak('new', '新しい回答です。')
    await tick()
    release?.()
    await tick()
    player.finish()
    await second
    expect(player.played).toEqual(['新しい回答です。'])
  })
  it('stop で idle に戻り、再生を止める', async () => {
    const player = new FakePlayer(false)
    const c = make(player)
    void c.speak('m', '読み上げ中の回答です。')
    await tick()
    expect(c.getState().status).toBe('playing')
    c.stop()
    expect(c.getState().status).toBe('idle')
    expect(player.stops).toBeGreaterThan(0)
  })
  it('トグル：再生中に同じメッセージで押すと停止', async () => {
    const player = new FakePlayer(false)
    const c = make(player)
    c.toggle('m', '回答です。')
    await tick()
    c.toggle('m', '回答です。')
    expect(c.getState().status).toBe('idle')
  })
  it('合成エラーは error 状態になり、例外を投げない', async () => {
    const c = make(new FakePlayer(), async () => { throw new Error('engine down') })
    await expect(c.speak('m', '回答です。')).resolves.toBeUndefined()
    expect(c.getState()).toMatchObject({ status: 'error', error: 'engine down', messageId: 'm' })
  })
  it('自動読み上げ：OFF なら読まず、ON でも同じ回答は一度だけ', async () => {
    const off = new FakePlayer()
    make(off).maybeAutoRead('a', '回答です。')
    await tick()
    expect(off.played).toEqual([])

    const on = new FakePlayer()
    const c = make(on, undefined, settings({ autoRead: true }))
    c.maybeAutoRead('a', '回答です。')
    await tick()
    c.maybeAutoRead('a', '回答です。')
    await tick()
    expect(on.played).toEqual(['回答です。'])
  })
  it('読み上げ対象が空（コードのみ）なら何もしない', async () => {
    const player = new FakePlayer()
    await make(player).speak('m', '```\ncode\n```')
    expect(player.played).toEqual([])
  })
})

describe('Player', () => {
  it('stop で play が false で解決し URL を解放する', async () => {
    const revoked: string[] = []
    const audio: AudioLike = { volume: 0, src: '', onended: null, onerror: null, play: () => new Promise(() => {}), pause() {} }
    const player = new Player(() => audio, { createObjectURL: () => 'blob:x', revokeObjectURL: (u) => { revoked.push(u) } })
    const p = player.play(new Blob(['x']), 5)
    expect(audio.volume).toBe(1)
    player.stop()
    expect(await p).toBe(false)
    expect(revoked).toEqual(['blob:x'])
  })
  it('再生完了で true', async () => {
    const audio: AudioLike = { volume: 0, src: '', onended: null, onerror: null, play: async () => {}, pause() {} }
    const player = new Player(() => audio, { createObjectURL: () => 'blob:y', revokeObjectURL: () => {} })
    const p = player.play(new Blob(['x']), 0.5)
    audio.onended?.()
    expect(await p).toBe(true)
  })
})

describe('findAssistantMessage', () => {
  const nodes = new Map<string, unknown>([
    ['1:1', { kind: 'assistant-step', data: { finalNode: { messageId: 'm1', time: 1000, blocks: [
      { kind: 'reasoning', text: '考え中' }, { kind: 'text', text: '答え' }, { kind: 'text', text: 'です' },
    ] } } }],
    ['1:2', { kind: 'tool-call', data: {} }],
  ])
  const snapshot = { order: ['1:1', '1:2'], nodes: { get: (k: string) => nodes.get(k) } }
  it('text ブロックだけを連結（思考過程は含めない）', () => {
    expect(findAssistantMessage(snapshot, 'm1')).toEqual({ text: '答えです', time: 1000 })
  })
  it('見つからなければ null', () => {
    expect(findAssistantMessage(snapshot, 'zzz')).toBeNull()
  })
  it('isFresh は古い履歴を除外する', () => {
    expect(isFresh(Date.now() - 1000)).toBe(true)
    expect(isFresh(Date.now() - 10 * 60_000)).toBe(false)
    expect(isFresh(0)).toBe(false)
  })
})
