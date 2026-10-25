# Changelog

## 0.1.3 — unreleased

### Changed
- Widened parameter ranges (speed 0.1–5.0, pitch ±0.5, intonation 0–3, volume 0–3). The previous 2.0 speed cap came from the VOICEVOX editor UI, not the Engine API, which has no upper bound for speed.

## 0.1.2 — unreleased

### Added
- Numeric inputs next to the speed / pitch / intonation / volume sliders (values are clamped to the valid range).

## 0.1.1 — unreleased

### Fixed
- Settings tab was unreadable on dark themes; inputs, selects and buttons now use DSH theme tokens.

## 0.1.0 — unreleased

First release candidate.

### Added
- Read-aloud button on assistant replies; stop / read again; progress display.
- Auto-read (off by default) with duplicate and stale-history protection.
- VOICEVOX Engine integration (`/speakers`, `/audio_query`, `/synthesis`), speaker/style picker, preview.
- Settings tab (speed, pitch, intonation, volume, code blocks, connection status) persisted in `<DSH_HOME>/dsh-voicevox-tts/settings.json`.
- Markdown-to-speech conversion, sentence chunking, look-ahead synthesis with bounded concurrency, cancellation.
- Loopback-only connection policy, request guard on the local API.

### Verification status
- Automated: 68 unit/integration tests (mock VOICEVOX Engine, plugin load/unload via fake context) pass.
- **Not verified**: installation into a real DSH profile, rendering in the DSH UI, real VOICEVOX Engine, Linux/macOS, DSH Desktop.
