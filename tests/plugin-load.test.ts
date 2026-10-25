import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import { beforeAll, describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

beforeAll(() => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' })
})

describe('Host half（ビルド済み lib/index.js）', () => {
  interface Route { kind: string; path: string }
  const fakeCtx = (withServer: boolean) => {
    const routes: Route[] = []
    const disposers: (() => void)[] = []
    return {
      routes,
      unload: () => disposers.splice(0).forEach((d) => d()),
      ctx: {
        get: () => (withServer
          ? { register: (r: Route) => { routes.push(r); return () => { routes.splice(routes.indexOf(r), 1) } } }
          : undefined),
        effect: (setup: () => () => void) => { disposers.push(setup()) },
      },
    }
  }

  it('ロードで中継ルートを登録し、アンロードで解除する', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dvt-home-'))
    process.env['DSH_HOME'] = home
    const mod = (await import(pathToFileURL(join(root, 'lib', 'index.js')).href)) as {
      apply: (ctx: unknown) => Promise<void>; inject: string[]; name: string
    }
    expect(mod.inject).toEqual(['webServer'])
    const f = fakeCtx(true)
    await mod.apply(f.ctx)
    expect(f.routes).toEqual([expect.objectContaining({ kind: 'prefix', path: '/dsh-voicevox-api' })])
    f.unload()
    expect(f.routes).toEqual([])
    delete process.env['DSH_HOME']
    await rm(home, { recursive: true, force: true })
  })

  it('webServer が無くても例外を出さない（DSH 本体に影響しない）', async () => {
    const mod = (await import(pathToFileURL(join(root, 'lib', 'index.js')).href)) as { apply: (ctx: unknown) => Promise<void> }
    await expect(mod.apply(fakeCtx(false).ctx)).resolves.toBeUndefined()
  })
})

describe('Client half（ビルド済み lib/client.js）', () => {
  it('モジュールローダーに factory を登録し、スロットへ 2 つ登録・解除できる', async () => {
    const code = await readFile(join(root, 'lib', 'client.js'), 'utf8')
    let loaded: { id: string; factory: (req: (n: string) => unknown) => { inject: string[]; apply: (ctx: unknown) => void } } | undefined
    const sandbox = {
      window: { __ModuleLoader__: { load: (m: typeof loaded) => { loaded = m } } },
      URL, Blob, console, setTimeout, AbortController, AbortSignal,
    }
    runInContext(code, createContext(sandbox))
    expect(loaded?.id).toBe('dsh-voicevox-tts')

    const fakeReact = { createElement: () => null, useSyncExternalStore: () => null }
    const exports = loaded!.factory((name) => {
      if (name === 'react') return fakeReact
      throw new Error(`unexpected require: ${name}`)
    })
    expect(exports.inject).toEqual(['slots'])

    const registered: string[] = []
    const disposed: string[] = []
    const slots = {
      inject: (key: string, setup: () => () => void) => { const d = setup(); disposed.push(key); void d },
      register: (entry: { name: string }) => { registered.push(entry.name); return () => {} },
    }
    exports.apply({ slots })
    expect(registered.sort()).toEqual(['conversation.chat.assistant-actions', 'settings.plugins.tab'])
  })

  it('slots が無ければ明示的なエラー', async () => {
    const code = await readFile(join(root, 'lib', 'client.js'), 'utf8')
    let loaded: { factory: (req: (n: string) => unknown) => { apply: (ctx: unknown) => void } } | undefined
    runInContext(code, createContext({ window: { __ModuleLoader__: { load: (m: typeof loaded) => { loaded = m } } }, URL, Blob, console, setTimeout, AbortController, AbortSignal }))
    const exports = loaded!.factory(() => ({ createElement: () => null }))
    expect(() => exports.apply({})).toThrow(/slots service unavailable/)
  })
})
