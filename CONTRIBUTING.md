# Contributing

```sh
pnpm install
pnpm run check
```

- `pnpm run check` runs typecheck, tests, build and package verification.
- `lib/` is committed because DSH installs GitHub dependencies without running a build. Rebuild with `pnpm run build` and commit it together with the source change; CI fails if they differ.
- Keep modules small and single-purpose. VOICEVOX-specific code lives in `src/voicevox/`; playback control is independent of it so another TTS provider can be added.
- Never log reply text. Never add network access beyond the configured VOICEVOX URL.
- Design decisions are recorded in `docs/decisions/`.
- Adding a runtime dependency requires a discussion first (everything is bundled into `lib/`, so licenses must be added to THIRD-PARTY-NOTICES.md).
