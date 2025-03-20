# Crypto Perpetual Trading Technical Analysis AI

仮想通貨の永続取引（Perpetual Trading）に特化したテクニカル分析AIエージェントです。指定した暗号資産の最新チャート状態を監視し、大きな変化があった場合にアラートを発信します。Bybit APIを使用して市場データを取得します。

## 機能

- 複数のテクニカル指標を用いた総合的な市場分析
  - RSI（相対力指数）
  - MACD（移動平均収束拡散法）
  - ボリンジャーバンド
  - EMAクロス（複数時間枠）
  - 出来高分析
- WebSocketによるリアルタイムデータの監視
- REST APIによる設定変更と状態確認
- カスタマイズ可能なアラートシステム
- 複数の時間枠（15分、1時間、4時間、1日）をサポート
- Bybit APIとの統合

## テクニカル分析アプローチ

このAIエージェントは以下のシグナルを検出します：

- **RSIのオーバーソールド/オーバーボート状態**
- **RSIダイバージェンス**（価格と指標の乖離）
- **MACDのクロスオーバー**
- **ボリンジャーバンドの逸脱**
- **ボリンジャーバンドのスクイーズ**（ボラティリティの収束）
- **EMAクロス**（短期/中期/長期）
- **出来高の急増**

これらの指標を組み合わせて総合的な分析を行い、強気・弱気・中立のシグナルを生成します。

## インストール方法

### 前提条件

- Node.js (v14以上)
- npm または yarn
- Bybit API キーとシークレット（読み取り権限のみで十分です）

### インストール手順

1. リポジトリをクローン
```bash
git clone <repository-url>
cd crypto-technical-analysis-ai
```

2. 依存パッケージをインストール
```bash
npm install
```

3. 環境設定
`.env.example`ファイルを`.env`にコピーして必要な情報を設定

```bash
cp .env.example .env
```

4. アプリケーションのビルド
```bash
npm run build
```

5. アプリケーションの実行
```bash
npm start
```

## 設定方法

`.env`ファイルで以下の設定が可能です：

```
# API Keys (Bybit API)
EXCHANGE_API_KEY=your_bybit_api_key_here
EXCHANGE_API_SECRET=your_bybit_api_secret_here

# Exchange settings
EXCHANGE=bybit
BASE_URL=https://api.bybit.com

# Application settings
PORT=3000
NODE_ENV=development

# Alert settings
ALERT_THRESHOLD=5
POLLING_INTERVAL=60000  # ミリ秒単位

# Telegram Bot (アラート通知用、任意)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

## Bybit API設定

### APIキーの取得方法

1. Bybitアカウントにログイン
2. アカウント設定 > APIキー管理に移動
3. 新しいAPIキーを作成（読み取り権限のみでOK）
4. APIキーとシークレットをコピーし、`.env`ファイルに設定

### 対応している取引ペア

Bybitの永続先物取引（USDT Perpetual）のすべての取引ペアに対応しています。主な取引ペアの例：

- BTCUSDT
- ETHUSDT
- SOLUSDT
- BNBUSDT
- ADAUSDT
- XRPUSDT
など

### 対応している時間枠

当AIは以下の時間枠に対応しています：

- 1分 (`1m`)
- 3分 (`3m`)
- 5分 (`5m`)
- 15分 (`15m`)
- 30分 (`30m`)
- 1時間 (`1h`)
- 2時間 (`2h`)
- 4時間 (`4h`)
- 6時間 (`6h`)
- 12時間 (`12h`)
- 1日 (`1d`)
- 1週間 (`1w`)
- 1ヶ月 (`1M`)

## API エンドポイント

以下のREST APIエンドポイントを利用できます：

- `GET /api/assets` - 監視中の暗号資産一覧を取得
- `POST /api/assets` - 新しい暗号資産を監視リストに追加
- `DELETE /api/assets/:symbol` - 暗号資産を監視リストから削除
- `POST /api/monitor/start` - 監視を開始
- `POST /api/monitor/stop` - 監視を停止
- `PUT /api/monitor/interval` - ポーリング間隔を更新
- `POST /api/analyze` - 特定の通貨ペアと時間枠の手動分析を実行

### 例: 資産の追加

```bash
curl -X POST http://localhost:3000/api/assets \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "DOGEUSDT",
    "timeframes": ["15m", "1h", "4h"],
    "alert": {
      "enabled": true,
      "threshold": 5,
      "indicators": ["RSI", "MACD", "BOLLINGER"]
    }
  }'
```

### 例: 手動分析の実行

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "timeframe": "1h"
  }'
```

## WebSocketインターフェース

WebSocketを使用してリアルタイム更新を受信できます：

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'analysis') {
    // 分析結果の処理
    console.log(data.data);
  } else if (data.type === 'alert') {
    // アラートの処理
    console.log(data.data);
  }
};

// 特定の通貨ペアをサブスクライブ
ws.send(JSON.stringify({
  type: 'subscribe',
  symbols: ['BTCUSDT', 'ETHUSDT']
}));
```

## シグナルの解釈方法

AIが生成するシグナルの解釈方法：

1. **信頼度スコア** - 0〜100%のスコアで、複数の指標がどの程度一致しているかを示す
2. **シグナルの強さ** - 各シグナルには1〜10の強度が割り当てられる
3. **全体的傾向** - BULLISH（強気）、BEARISH（弱気）、NEUTRAL（中立）の3種類
4. **推奨アクション** - BUY（買い）、SELL（売り）、HOLD（保持）、WATCH（様子見）

例えば、信頼度スコア80%、強気シグナル、アクションBUYの場合は、買いのエントリーポイントの可能性が高いことを示します。

## 開発

### 開発モードでの実行

```bash
npm run dev
```

### テスト

```bash
npm test
```

## トラブルシューティング

### よくある問題

1. **API接続エラー**
   - Bybit APIキーとシークレットが正しく設定されているか確認
   - インターネット接続が安定しているか確認
   - Bybitのステータスページでサービスが正常に稼働しているか確認

2. **分析データが表示されない**
   - ポーリング間隔が適切か確認（短すぎるとレート制限にかかる可能性）
   - サポートされているシンボルと時間枠を使用しているか確認

3. **WebSocket接続が頻繁に切断される**
   - クライアント側でpingを定期的に送信して接続を維持

## ライセンス

ISC

## 貢献方法

プルリクエストや問題の報告は歓迎します。大きな変更を加える前には、まずissueを作成して議論してください。 