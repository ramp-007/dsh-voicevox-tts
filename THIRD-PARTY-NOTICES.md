# Third-party notices

## Bundled into `lib/client.js`

- **marked** — MIT License, Copyright (c) Christopher Jeffrey and marked contributors. Used to parse Markdown into tokens for speech text. https://github.com/markedjs/marked
- **esbuild** — MIT License, Copyright (c) Evan Wallace. Only esbuild's small module helpers (`__require`, `__toESM`) are emitted into the bundles; esbuild itself is a development tool.

## Not included

This repository does not include VOICEVOX Engine, VOICEVOX voice models or voice data, or any character images. VOICEVOX and each character voice are governed by their own terms of use; see https://voicevox.hiroshiba.jp/.

## Reference projects (no code copied)

The design was informed by reading these projects. No source code from them is included; only the public DSH extension points they also use (UI slots, `webServer` routes) were re-implemented from DSH's own documentation.

- DeepSeek Harness — MIT — https://github.com/deepseek-ai/deepseek-harness
- dsh-plugin-tts — MIT — https://github.com/1624318455/dsh-plugin-tts
- dsh-notify-say — MIT — https://github.com/unifilitence/dsh-notify-say
- dsh-gal — BSD-3-Clause — https://github.com/omdsh-dev/dsh-gal

If code from any of them is added later, keep its copyright notice and license text here.
