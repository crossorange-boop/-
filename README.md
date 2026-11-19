# AI統合管制システム

複数のAIエージェントに割り振った業務・プロジェクト・スケジュール・成果物を一元管理する Webアプリです。
Google Apps Script + Google Sheets で動作し、追加の有料サービスは使いません。

- 設計書：[docs/01_全体設計書.md](docs/01_全体設計書.md)
- 構成：`src/`（GASに反映するコード）、`test/`（Node 単体テスト）、`docs/`（設計・手順書）

## 開発状況

| STEP | 内容 | 状態 |
| --- | --- | --- |
| 1 | GASプロジェクト雛形・設定・共通関数 | 完了 |
| 2 | セットアップ（シート自動作成・既存データ保護） | 完了 |
| 3 | データ管理（リポジトリ・各サービス・状態遷移・権限） | 完了 |
| 4 | Webアプリ基本画面・ダッシュボード・API窓口 | 完了 |
| 5〜11 | 設計書 11章参照 | 未着手 |

## テスト（ローカル）

```bash
npm test
```

## GAS への反映（clasp）

認証情報（`.clasprc.json`）と `.clasp.json` はリポジトリに含めません。詳細な導入手順は STEP 11 で `docs/02_導入手順.md` にまとめます。

```bash
npm install
npx clasp login
npx clasp create --type standalone --title "AI統合管制システム" --rootDir src
npx clasp push
```

## 画面のローカルプレビュー（開発用）

サンプルデータ入りの模擬環境で画面を確認できます（Googleには接続しません）。

```bash
node tools/preview-server.js 8787
```
