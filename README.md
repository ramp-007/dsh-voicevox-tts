# dsh-voicevox-tts

English | [日本語](README.ja.md)

An **unofficial** plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) that reads assistant replies aloud with a local [VOICEVOX Engine](https://github.com/VOICEVOX/voicevox_engine). It is not affiliated with DeepSeek or VOICEVOX.

> Status: v0.1.0 (pre-release). Automated tests pass; the checks that need a real DSH and a real VOICEVOX Engine are listed under [Known limitations](#known-limitations).

## Features

- 🔊 A read-aloud button on every assistant reply (stop / read again from the same button)
- Auto-read of new replies (**off by default**)
- Speaker and style picker populated from the running Engine, with a preview button
- Speed, pitch, intonation and volume settings (ranges follow the VOICEVOX editor)
- Reads only the assistant's final answer text — never reasoning, tool logs or your own messages
- Markdown is converted to speech text (code blocks skipped by default, links read as their text, tables read row by row). The text shown on screen is never modified
- Long replies are split into sentences and synthesized ahead of playback; stopping or switching replies discards stale audio
- If VOICEVOX is not running, only reading is affected — DSH keeps working

## Requirements

- DeepSeek Harness `>=0.2.1-rc.2 <0.3.0` (Node.js 24.9+, as required by DSH)
- A [VOICEVOX](https://voicevox.hiroshiba.jp/) Engine (the app or the standalone engine), started by you
- Windows 11 is the primary target. Linux and macOS are expected to work (the code has no OS-specific parts) but are not verified.

## Install

The repository ships its built `lib/`, so no build step or `prepare` permission is needed.

```sh
dsh plugin --profile <your-profile> add github:ramp-007/dsh-voicevox-tts
```

Pin a commit for reproducibility: `github:ramp-007/dsh-voicevox-tts#<sha>`. From a tarball: `pnpm pack` in this repo, then `dsh plugin add ./dsh-voicevox-tts-0.1.3.tgz`.

To remove it: `dsh plugin --profile <your-profile> remove dsh-voicevox-tts` (or disable it from Settings → Plugins). Settings are kept in `<DSH_HOME>/dsh-voicevox-tts/settings.json` (`~/.dsh` by default) and can be deleted by hand.

## Start VOICEVOX

Start the VOICEVOX app, or run the standalone engine so that it listens on `http://127.0.0.1:50021` (the default). Then open **Settings → Plugins → VOICEVOX reading** and press **Check connection**.

## Initial settings

| Setting | Default |
|---|---|
| Auto-read | off |
| VOICEVOX URL | `http://127.0.0.1:50021` |
| Speaker / style | 四国めたん / ノーマル (style ID 2) |
| Speed / pitch / intonation / volume | 1.0 / 0.0 / 1.0 / 1.0 |
| Read code blocks | off |
| Show connection status | on |

The saved speaker ID is verified against the list the Engine returns. If it does not exist you are asked to pick another one. Press **Preview** to hear the current voice.

## Troubleshooting

| Symptom | What to do |
|---|---|
| "Not connected: unreachable" | Start VOICEVOX and check the URL/port. |
| "timeout" | The Engine is busy or the first synthesis is loading; try again. |
| No button / no settings tab | Make sure the plugin is enabled and reload the page. |
| Desktop app: "Not connected" while the Engine runs | Desktop talks to the Engine directly from the page; start the Engine with `--cors_policy_mode all` (see limitations). |
| Speaker ID does not exist | The Engine's voice set changed; choose a speaker again in settings. |

## Security

- Only loopback addresses are allowed by default. A remote Engine needs **Allow remote connection**, must use **https**, and receives your reply text. Credentials in the URL and link-local addresses are always rejected.
- The plugin's local API is not covered by DSH's `/api` authentication, so it rejects cross-site and non-JSON requests itself and exposes only four fixed operations (no arbitrary proxying).
- Reply text is never logged. No audio is written to disk (audio lives in memory and is released after playback), so there is no audio cache to clean up.

See [SECURITY.md](SECURITY.md).

## License and credits

The plugin source code is MIT-licensed ([LICENSE](LICENSE)). This repository does **not** include VOICEVOX Engine, voice models, voice data or character images.

VOICEVOX, its Engine and each character voice have **separate terms of use**. When you publish audio produced with this plugin, credit the voice you used, for example **"VOICEVOX:四国めたん"**. Read the terms of every character you use ([VOICEVOX](https://voicevox.hiroshiba.jp/) lists them); this README is not legal advice. Generated audio is not stored by the plugin.

Third-party code: see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Known limitations

- Not yet verified on a real DSH install or against a real VOICEVOX Engine; see [CHANGELOG.md](CHANGELOG.md).
- Message text is read from DSH's chat snapshot (`assistant-step` → `finalNode.blocks`); a future DSH release that changes this shape would hide the button until updated.
- Desktop (Electron) loads the UI from `file://` and has no web-server routes, so the plugin falls back to a direct browser→Engine connection that needs VOICEVOX's CORS setting relaxed.
- Remote Engines: no authentication header support and no DNS-rebinding protection beyond the https requirement.
- Streaming (mid-reply) reading, pronunciation dictionary and per-session speakers are not implemented.

## Development

```sh
pnpm install
pnpm run check   # typecheck, tests, build, package verification
```

`lib/` is committed and must match the sources (CI enforces this). See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/decisions](docs/decisions).
