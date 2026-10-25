/** 設定ファイル（DSH home 配下）の読み書き。書き込みは一時ファイル経由で原子的に行う。 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_SETTINGS, validateSettings, type Settings } from '../shared/settings.ts'

/** DSH_HOME が空白なら未設定扱い。無ければ ~/.dsh。 */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env['DSH_HOME']?.trim()
  return configured ? configured : join(homedir(), '.dsh')
}

export function settingsPath(home: string = resolveDshHome()): string {
  return join(home, 'dsh-voicevox-tts', 'settings.json')
}

export class ConfigStore {
  private current: Settings = DEFAULT_SETTINGS

  constructor(private readonly file: string = settingsPath()) {}

  get(): Settings {
    return this.current
  }

  /** ファイルが無い・壊れている場合は初期値で起動する（DSH の起動は止めない）。 */
  async load(): Promise<void> {
    try {
      const r = validateSettings(JSON.parse(await readFile(this.file, 'utf8')))
      this.current = r.ok ? r.value : DEFAULT_SETTINGS
    } catch {
      this.current = DEFAULT_SETTINGS
    }
  }

  async save(next: Settings): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8')
    await rename(tmp, this.file)
    this.current = next
  }
}
