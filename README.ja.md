# dsh-voicevox-tts

[English](README.md) | 日本語

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）の回答を、ローカルの [VOICEVOX Engine](https://github.com/VOICEVOX/voicevox_engine) で読み上げる**非公式**プラグインです。DeepSeek 社・VOICEVOX 公式とは関係ありません。

> 状態：v0.1.0（プレリリース）。自動テストは通っていますが、実際の DSH と VOICEVOX Engine が必要な確認は[既知の制限](#既知の制限)に挙げた未検証事項です。

## 機能

- 🔊 各回答に読み上げボタン（同じボタンで停止・読み直し）
- 新しい回答の自動読み上げ（**初期値は OFF**）
- 起動中の Engine から取得した話者・スタイルの選択と試聴
- 話速・音高・抑揚・音量の設定（範囲は VOICEVOX エディタに準拠）
- 読み上げるのはアシスタントの最終回答だけ。思考過程・ツールのログ・あなたの発言は読みません
- Markdown を読み上げ用に整形（コードブロックは既定でスキップ、リンクはテキストのみ、表は行ごと）。画面上の本文は変更しません
- 長文は文で分割して先行合成。停止や別の回答への切り替えで、古い音声は破棄されます
- VOICEVOX が起動していなくても影響は読み上げだけで、DSH は通常どおり動きます

## 必要なもの

- DeepSeek Harness `>=0.2.1-rc.2 <0.3.0`（DSH の要件に従い Node.js 24.9 以上）
- [VOICEVOX](https://voicevox.hiroshiba.jp/) Engine（アプリ版またはエンジン単体）。起動はご自身で行います
- 主な対象は Windows 11。Linux / macOS も動く想定です（OS 依存の処理なし）が未検証です

## インストール

ビルド済みの `lib/` を同梱しているため、ビルドや `prepare` の許可は不要です。

```sh
dsh plugin --profile <プロファイル名> add github:ramp-007/dsh-voicevox-tts
```

再現性のため、コミットを固定できます：`github:ramp-007/dsh-voicevox-tts#<sha>`。tarball からは、このリポジトリで `pnpm pack` してから `dsh plugin add ./dsh-voicevox-tts-0.1.3.tgz`。

削除：`dsh plugin --profile <プロファイル名> remove dsh-voicevox-tts`（または 設定 → プラグイン で無効化）。設定は `<DSH_HOME>/dsh-voicevox-tts/settings.json`（既定は `~/.dsh`）に保存され、手で削除できます。

## VOICEVOX の起動

VOICEVOX アプリを起動するか、エンジン単体を `http://127.0.0.1:50021`（既定）で待ち受けるよう起動します。その後 **設定 → プラグイン → VOICEVOX 読み上げ** で **接続確認** を押してください。

## 初期設定

| 設定 | 初期値 |
|---|---|
| 自動読み上げ | OFF |
| VOICEVOX の URL | `http://127.0.0.1:50021` |
| 話者 / スタイル | 四国めたん / ノーマル（スタイル ID 2） |
| 話速 / 音高 / 抑揚 / 音量 | 1.0 / 0.0 / 1.0 / 1.0 |
| コードブロックを読む | OFF |
| 接続状態の表示 | ON |

保存済みの話者 ID は、Engine が返す一覧と照合します。存在しなければ選び直しを案内します。**試聴** で現在の声を確認できます。

## エラー対処

| 症状 | 対処 |
|---|---|
| 「未接続: unreachable」 | VOICEVOX を起動し、URL とポートを確認 |
| 「timeout」 | Engine が混んでいるか初回の合成中です。もう一度試してください |
| ボタン・設定タブが出ない | プラグインが有効か確認し、ページを再読み込み |
| Desktop 版で Engine 起動中なのに未接続 | Desktop は画面から Engine へ直接つなぎます。`--cors_policy_mode all` で Engine を起動（制限事項を参照） |
| 話者 ID が存在しない | Engine の音声が変わっています。設定で話者を選び直してください |

## セキュリティ

- 既定では**ループバックのみ**許可します。リモートの Engine は「リモート接続を許可」が必要で、**https のみ**、回答の文章がその相手に送られます。URL 内の認証情報とリンクローカルアドレスは常に拒否します
- プラグインのローカル API は DSH の `/api` 認証の対象外のため、クロスサイト・非 JSON のリクエストを自前で拒否し、固定の 4 操作だけを公開します（任意パスの中継はしません）
- 回答本文はログに出しません。音声はディスクに保存せず（メモリ上で再生後に解放）、消すべき音声キャッシュはありません

詳細は [SECURITY.md](SECURITY.md)。

## ライセンスとクレジット

プラグインのソースコードは MIT です（[LICENSE](LICENSE)）。VOICEVOX Engine、音声モデル、音声データ、キャラクター画像は**同梱していません**。

VOICEVOX 本体・Engine・各キャラクターの音声には**それぞれ別の利用規約**があります。このプラグインで作った音声を公開するときは、使った声のクレジット（例：**「VOICEVOX:四国めたん」**）を表記してください。使うキャラクターごとの規約は [VOICEVOX 公式サイト](https://voicevox.hiroshiba.jp/)から確認してください（この README は法的助言ではありません）。生成した音声をプラグインが保存することはありません。

第三者コードは [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) を参照。

## 既知の制限

- 実際の DSH への導入と、実際の VOICEVOX Engine との接続は未検証です（[CHANGELOG.md](CHANGELOG.md) 参照）
- 回答本文は DSH のチャットスナップショット（`assistant-step` → `finalNode.blocks`）から取得します。将来の DSH で形が変わると、更新までボタンが出なくなります
- Desktop（Electron）は `file://` で UI を読み込み、Web サーバーのルートがないため、画面から Engine へ直接つなぎます。VOICEVOX 側の CORS 設定を緩める必要があります
- リモート Engine は認証ヘッダー非対応で、https 必須以外の DNS リバインディング対策はありません
- 回答の途中読み上げ、読み方辞書、セッションごとの話者は未実装です

## 開発

```sh
pnpm install
pnpm run check   # 型チェック・テスト・ビルド・配布物検証
```

`lib/` はコミット対象で、ソースと一致している必要があります（CI で検査）。[CONTRIBUTING.md](CONTRIBUTING.md) と [docs/decisions](docs/decisions) を参照してください。
