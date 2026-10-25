/** VOICEVOX /speakers の応答パースと話者の存在検証。 */

export interface SpeakerStyle {
  id: number
  name: string
}

export interface Speaker {
  uuid: string
  name: string
  styles: SpeakerStyle[]
}

/** 想定外の形のエントリは捨てる（Engine のバージョン差への耐性）。 */
export function parseSpeakers(json: unknown): Speaker[] {
  if (!Array.isArray(json)) throw new Error('speakers response is not an array')
  const out: Speaker[] = []
  for (const item of json) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    if (typeof rec['name'] !== 'string' || !Array.isArray(rec['styles'])) continue
    const styles: SpeakerStyle[] = []
    for (const s of rec['styles']) {
      if (typeof s !== 'object' || s === null) continue
      const st = s as Record<string, unknown>
      if (typeof st['id'] === 'number' && Number.isInteger(st['id']) && typeof st['name'] === 'string') {
        styles.push({ id: st['id'], name: st['name'] })
      }
    }
    if (styles.length === 0) continue
    out.push({ uuid: typeof rec['speaker_uuid'] === 'string' ? rec['speaker_uuid'] : '', name: rec['name'], styles })
  }
  return out
}

export function findStyle(speakers: readonly Speaker[], styleId: number): { speaker: Speaker; style: SpeakerStyle } | undefined {
  for (const speaker of speakers) {
    const style = speaker.styles.find((s) => s.id === styleId)
    if (style) return { speaker, style }
  }
  return undefined
}

/** 「VOICEVOX:四国めたん」形式のクレジット表記。 */
export function creditFor(speaker: Speaker): string {
  return `VOICEVOX:${speaker.name}`
}
