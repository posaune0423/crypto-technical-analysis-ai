## 重要

ユーザーはCursorよりプログラミングが得意ですが、時短のためにCursorにコーディングを依頼しています。

2回以上連続でテストを失敗した時は、現在の状況を整理して、一緒に解決方法を考えます。

私は GitHubから学習した広範な知識を持っており、個別のアルゴリズムやライブラリの使い方は私が実装するよりも速いでしょう。テストコードを書いて動作確認しながら、ユーザーに説明しながらコードを書きます。

反面、現在のコンテキストに応じた処理は苦手です。コンテキストが不明瞭な時は、ユーザーに確認します。

- 基本的に新たなデータを追加する場合は`interface`を先に作成し、それに従って下さい
- ファイル名はcamelCaseで記述してください

## 作業開始準備

`git status` で現在の git のコンテキストを確認します。
もし指示された内容と無関係な変更が多い場合、現在の変更からユーザーに別のタスクとして開始するように提案してください。

無視するように言われた場合は、そのまま続行します。

## 技術スタック

- npm
- TypeScript
- Express
- Drizzle ORM
- Sqlite

## Dir Structure

```bash
src/
  ├── config/ # 設定ファイル
  ├── lib/ # ライブラリ(e.g. `bybitClient.ts`)
  ├── models/ # モデル(e.g. `signal.ts`)
  ├── services/ # サービス(e.g. `tradeExecutor.ts`)
  ├── utils/ # ユーティリティ(e.g. `logger.ts`)
  └── index.ts # エントリーポイント
```
