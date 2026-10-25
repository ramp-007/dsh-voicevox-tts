# 0001 アーキテクチャと実装方式（2026-10-25）

## 決定
1. **新規の独立実装**にする（Fork しない）。参考にした dsh-plugin-tts は約 1 万行の単一ファイルで中国語向け機能が多く、ライセンス表記の維持・追随コストが大きい。参考 OSS のコードは複製していない。
2. **TypeScript + esbuild**。Host は ESM、Client は DSH のモジュールローダー形式 `window.__ModuleLoader__.load({id, factory})` に包む（`scripts/build.mjs`）。React は `factory` の `require` で供給される外部扱い。
3. **`lib/` をコミット**する。公式仕様（publish.md）: GitHub インストールはソースのみで build も実行されず、pnpm 10+ は `prepare` を既定で拒否する。ビルド済みを同梱すれば利用者の許可操作が不要。
4. **Host 中継**: 画面→Host `/dsh-voicevox-api/*`→VOICEVOX。接続先を Host だけが持つので、画面から任意 URL への SSRF ができず、CORS も回避できる。公開操作は status / synthesize / settings の固定 4 つ。
5. **Desktop 対応**: 公式 architecture.md により Electron は `file://` で UI を読み、Web サーバー経由ではない。ルートが無い場合は画面から Engine へ直接接続に自動で切り替える（要 CORS 緩和。未検証）。
6. **設定の保存**: Cordis Config（schemastery）は peer 依存と型が増えるため採用せず、Host 側 JSON（DSH home 配下）+ localStorage ミラー。カスタム設定タブは `settings.plugins.tab` スロット。
7. **webServer ルートは DSH の /api 認証の対象外**（参考 OSS dsh-notify-say が実測で確認している）。このため Origin / Sec-Fetch-Site / Content-Type を自前で検査する（`src/host/guard.ts`）。
8. **本文の取得**: `conversation.chat.assistant-actions` の owner props は `messageId` のみ。`useChat` セレクターで `assistant-step.data.finalNode`（`messageId`・`blocks`・`time`）から text ブロックだけを取り出す（思考過程は除外）。
9. **自動読み上げの履歴対策**: ボタンは履歴表示でも全メッセージ分マウントされるため、確定時刻が 30 秒以内のものだけを自動読み上げ対象にし、messageId で重複を防ぐ。
10. **音声はディスクに保存しない**（メモリ上の Blob を再生後に解放）。キャッシュ期間・削除方法の問題が生じない。

## 未決・将来
- 音声キャッシュ（同一文の再利用）、読み方辞書、ストリーミング途中読み上げ、通知（完了・承認待ち）は Phase 2/3。
- ESLint は未導入（CI は型チェックで代替）。
