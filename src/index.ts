import { desc } from "drizzle-orm";
import express from "express";
import http from "http";
import WebSocket from "ws";
import { config } from "./config";
import { db } from "./db";
import { tradeSignals } from "./db/schema";
import * as OrderModel from "./models/order";
import { ExchangeService } from "./services/exchangeService";
import { MonitorService } from "./services/monitorService";
import { startSignalProcessing, stopSignalProcessing } from "./services/scheduler";
import { TechnicalAnalysisService } from "./services/technicalAnalysisService";
import { processAllPendingSignals } from "./services/tradeExecutor";
import { Logger, LogLevel } from "./utils/logger";
import { generateForcedSignal, generateRandomSignal } from "./utils/signalGenerator";

// Initialize logger
const logger = new Logger({
  level: config.app.nodeEnv === "development" ? LogLevel.DEBUG : LogLevel.INFO,
  enableTimestamp: true,
  enableColors: true,
});

async function main() {
  logger.info("App", "Starting Crypto Technical Analysis AI Agent");
  logger.info("App", "==========================================");
  logger.info("App", `Environment: ${config.app.nodeEnv}`);

  try {
    // Initialize services
    const exchangeService = new ExchangeService();
    const technicalAnalysisService = new TechnicalAnalysisService();
    const monitorService = new MonitorService();

    // Create Express app
    const app = express();
    const port = config.app.port;

    // Middleware
    app.use(express.json());

    // Create HTTP server
    const server = http.createServer(app);

    // Create WebSocket server
    const wss = new WebSocket.Server({ server });

    // WebSocket connection
    wss.on("connection", (ws) => {
      logger.info("WebSocket", "Client connected");

      ws.send(
        JSON.stringify({
          type: "connection",
          message: "Connected to Crypto Technical Analysis AI",
          timestamp: Date.now(),
        }),
      );

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message.toString());
          logger.debug("WebSocket", "Received message", data);

          // Handle message types
          if (data.type === "subscribe") {
            ws.send(
              JSON.stringify({
                type: "subscribed",
                message: `Subscribed to ${data.symbols}`,
                symbols: data.symbols,
              }),
            );
            logger.info("WebSocket", `Client subscribed to ${data.symbols}`);
          }
        } catch (error) {
          logger.error("WebSocket", "Error processing message", error);
        }
      });

      ws.on("close", () => {
        logger.info("WebSocket", "Client disconnected");
      });
    });

    // API Routes
    app.get("/", (req, res) => {
      res.json({
        status: "ok",
        message: "Crypto Technical Analysis AI API is running",
      });
    });

    app.get("/api/assets", (req, res) => {
      logger.debug("API", "GET /api/assets - Fetching assets");
      res.json({
        status: "ok",
        data: monitorService.getAssets(),
      });
    });

    app.post("/api/assets", (req, res) => {
      const { symbol, timeframes } = req.body;
      logger.debug("API", "POST /api/assets", { symbol, timeframes });

      if (!symbol) {
        logger.warn("API", "Missing symbol in request");
        res.status(400).json({
          status: "error",
          message: "Symbol is required",
        });
        return;
      }

      const asset = {
        symbol,
        timeframes: timeframes || config.timeframes,
        alert: {
          enabled: true,
          threshold: config.alerts.threshold,
          indicators: ["RSI", "MACD", "BOLLINGER", "EMA", "VOLUME"],
        },
      };

      monitorService.addAsset(asset);
      logger.info("API", `Added asset ${symbol} to monitoring`);

      res.json({
        status: "ok",
        message: `Added ${symbol} to monitored assets`,
        data: asset,
      });
    });

    app.post("/api/monitor/start", (req, res) => {
      logger.info("API", "Starting market monitor");
      monitorService.start();

      res.json({
        status: "ok",
        message: "Market monitoring started",
      });
    });

    app.post("/api/monitor/stop", (req, res) => {
      logger.info("API", "Stopping market monitor");
      monitorService.stop();

      res.json({
        status: "ok",
        message: "Market monitoring stopped",
      });
    });

    // Manual analysis endpoint
    app.post("/api/analyze", async (req, res) => {
      const { symbol, timeframe } = req.body;
      logger.debug("API", "POST /api/analyze", { symbol, timeframe });

      if (!symbol || !timeframe) {
        logger.warn("API", "Missing required parameters", { symbol, timeframe });
        res.status(400).json({
          status: "error",
          message: "Symbol and timeframe are required",
        });
        return;
      }

      try {
        // Get candles
        logger.debug("API", `Fetching candles for ${symbol} on ${timeframe}`);
        const candles = await exchangeService.getCandles(symbol, timeframe, 100);

        if (candles.length < 50) {
          logger.warn("API", `Not enough data for analysis: ${candles.length} candles`);
          res.status(400).json({
            status: "error",
            message: "Not enough data for analysis",
          });
          return;
        }

        // Run analysis
        logger.info("API", `Analyzing ${symbol} on ${timeframe}`);
        const analysis = technicalAnalysisService.analyzeMarket(symbol, timeframe, candles);

        // Return result
        res.json({
          status: "ok",
          data: analysis,
        });
      } catch (error) {
        logger.error("API", `Analysis error for ${symbol}:${timeframe}`, error);
        res.status(500).json({
          status: "error",
          message: "Failed to analyze market",
        });
      }
    });

    // 自動トレード関連のAPIエンドポイント
    app.post("/api/signals/generate", async (req, res) => {
      logger.debug("API", "POST /api/signals/generate - Generating test signal");
      try {
        const signal = await generateRandomSignal();
        res.json({
          status: "ok",
          message: "Test signal generated",
          data: signal,
        });
      } catch (error) {
        logger.error("API", "Failed to generate test signal", error);
        res.status(500).json({
          status: "error",
          message: "Failed to generate test signal",
        });
      }
    });

    app.post("/api/signals/force", async (req, res) => {
      const { symbol, direction } = req.body;
      logger.debug("API", "POST /api/signals/force", { symbol, direction });

      if (!symbol || !direction) {
        logger.warn("API", "Missing required parameters", { symbol, direction });
        res.status(400).json({
          status: "error",
          message: "Symbol and direction are required",
        });
        return;
      }

      if (direction !== "BUY" && direction !== "SELL") {
        logger.warn("API", "Invalid direction", { direction });
        res.status(400).json({
          status: "error",
          message: "Direction must be BUY or SELL",
        });
        return;
      }

      try {
        const signal = await generateForcedSignal(symbol, direction);
        res.json({
          status: "ok",
          message: `Forced ${direction} signal generated for ${symbol}`,
          data: signal,
        });
      } catch (error) {
        logger.error("API", `Failed to generate forced signal for ${symbol}`, error);
        res.status(500).json({
          status: "error",
          message: "Failed to generate forced signal",
        });
      }
    });

    app.post("/api/signals/process", async (req, res) => {
      try {
        logger.info("API", "未処理の取引シグナルを処理します");

        const processedSignals = await processAllPendingSignals();

        res.json({
          status: "ok",
          message: "取引シグナルの処理を完了しました",
          data: {
            processedCount: processedSignals.length,
            signals: processedSignals,
          },
        });
      } catch (error) {
        logger.error("API", "シグナル処理中にエラーが発生しました", error);
        res.status(500).json({
          status: "error",
          message: "シグナル処理中にエラーが発生しました",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    app.get("/api/signals", async (req, res) => {
      try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

        const signals = await db.select().from(tradeSignals).orderBy(desc(tradeSignals.timestamp)).limit(limit).all();

        res.json({
          status: "ok",
          data: signals,
        });

        logger.debug("API", `最新の${signals.length}件の取引シグナルを取得しました`);
      } catch (error) {
        logger.error("API", "取引シグナル取得中にエラーが発生しました", error);
        res.status(500).json({
          status: "error",
          message: "取引シグナル取得中にエラーが発生しました",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    app.get("/api/orders", async (req, res) => {
      try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

        const orders = await OrderModel.getRecentOrders(limit);

        res.json({
          status: "ok",
          data: orders,
        });

        logger.debug("API", `最新の${orders.length}件の注文履歴を取得しました`);
      } catch (error) {
        logger.error("API", "注文履歴取得中にエラーが発生しました", error);
        res.status(500).json({
          status: "error",
          message: "注文履歴取得中にエラーが発生しました",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // 自動取引のON/OFF切り替えエンドポイント
    app.route("/api/autotrading/toggle").post((req, res) => {
      try {
        const { enable } = req.body;

        if (typeof enable !== "boolean") {
          res.status(400).json({
            status: "error",
            message: "リクエストにはenableフィールド（true/false）が必要です",
          });
          return;
        }

        monitorService.setAutoTrading(enable);

        res.json({
          status: "ok",
          message: `自動取引を${enable ? "有効" : "無効"}にしました`,
          data: { autoTradingEnabled: enable },
        });

        logger.info("API", `自動取引を${enable ? "有効" : "無効"}に切り替えました`);
      } catch (error) {
        logger.error("API", "自動取引設定中にエラーが発生しました", error);
        res.status(500).json({
          status: "error",
          message: "自動取引設定中にエラーが発生しました",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // アカウントサイズとリスク設定の更新エンドポイント
    app.route("/api/autotrading/settings").post((req, res) => {
      try {
        const { accountSize, maxRiskPerTrade } = req.body;

        if (typeof accountSize !== "number" || accountSize <= 0) {
          res.status(400).json({
            status: "error",
            message: "有効なアカウントサイズ（正の数値）を指定してください",
          });
          return;
        }

        if (typeof maxRiskPerTrade !== "number" || maxRiskPerTrade <= 0 || maxRiskPerTrade > 100) {
          res.status(400).json({
            status: "error",
            message: "有効な最大リスク率（0〜100の間の数値）を指定してください",
          });
          return;
        }

        monitorService.updatePositionSizeManager(accountSize, maxRiskPerTrade);

        res.json({
          status: "ok",
          message: "取引設定を更新しました",
          data: { accountSize, maxRiskPerTrade },
        });

        logger.info(
          "API",
          `取引設定を更新しました: アカウントサイズ=${accountSize}USD, 最大リスク=${maxRiskPerTrade}%`,
        );
      } catch (error) {
        logger.error("API", "取引設定の更新中にエラーが発生しました", error);
        res.status(500).json({
          status: "error",
          message: "取引設定の更新中にエラーが発生しました",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Start the server
    server.listen(port, () => {
      logger.info("Server", `Running on port ${port}`);

      // Start monitoring after a short delay
      setTimeout(() => {
        logger.info("Monitor", "Starting market monitor");
        monitorService.start();

        // 自動売買を有効化
        monitorService.setAutoTrading(true);
        logger.info("App", "自動売買システムを有効化しました");

        // シグナル処理スケジューラを開始
        logger.info("App", "Starting automated trading system");
        startSignalProcessing();
      }, 1000);
    });

    // Handle process termination
    process.on("SIGINT", () => {
      logger.info("App", "Shutting down...");
      monitorService.stop();
      stopSignalProcessing(); // シグナル処理を停止
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      logger.info("App", "Shutting down...");
      monitorService.stop();
      stopSignalProcessing(); // シグナル処理を停止
      process.exit(0);
    });
  } catch (error) {
    logger.error("App", "Failed to start application", error);
    process.exit(1);
  }
}

// Start application
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
