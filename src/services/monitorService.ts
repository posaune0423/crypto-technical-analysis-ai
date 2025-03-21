import { config } from "../config";
import { AnalysisResult, AssetConfig } from "../types";
import { Logger, LogLevel } from "../utils/logger";
import { PositionSizeManager } from "../utils/positionSizeManager";
import { AlertService } from "./alertService";
import { ExchangeService } from "./exchangeService";
import { StrategyService } from "./strategyService";
import { TechnicalAnalysisService } from "./technicalAnalysisService";

export class MonitorService {
  private exchangeService: ExchangeService;
  private technicalAnalysisService: TechnicalAnalysisService;
  private alertService: AlertService;
  private assets: AssetConfig[] = [];
  private isRunning = false;
  private pollingInterval: number;
  private logger: Logger;
  private timer: NodeJS.Timeout | null = null;
  private strategyService: StrategyService;
  private enableAutoTrading = true;

  constructor() {
    this.exchangeService = new ExchangeService();
    this.technicalAnalysisService = new TechnicalAnalysisService();
    this.alertService = new AlertService();
    this.isRunning = false;
    this.pollingInterval = config.alerts.pollingInterval;

    this.logger = new Logger({
      level: config.app.nodeEnv === "development" ? LogLevel.DEBUG : LogLevel.INFO,
      enableTimestamp: true,
      enableColors: true,
    });

    // Initialize assets from configuration
    this.assets = config.assets.map((symbol) => ({
      symbol,
      timeframes: config.timeframes,
      alert: {
        enabled: true,
        threshold: config.alerts.threshold,
        indicators: ["RSI", "MACD", "BOLLINGER", "EMA", "VOLUME"],
      },
    }));

    this.strategyService = new StrategyService(new PositionSizeManager());
  }

  /**
   * Start monitoring all configured assets
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn("Monitor", "Monitor is already running");
      return;
    }

    this.isRunning = true;
    this.logger.info("Monitor", "Starting market monitor...");

    // Log the configured assets and timeframes
    this.logger.info("Monitor", `Monitoring assets: ${this.assets.map((a) => a.symbol).join(", ")}`);
    this.logger.info("Monitor", `Timeframes: ${config.timeframes.join(", ")}`);
    this.logger.info("Monitor", `Polling interval: ${this.pollingInterval / 1000} seconds`);

    // Run once immediately
    this.runAnalysis();

    // Then set up polling interval
    this.timer = setInterval(() => {
      if (this.isRunning) {
        this.runAnalysis();
      }
    }, this.pollingInterval);
  }

  /**
   * Stop the monitoring process
   */
  stop(): void {
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.logger.info("Monitor", "Market monitor stopped");
  }

  /**
   * Add a new asset to monitor
   * @param asset Asset configuration
   */
  addAsset(asset: AssetConfig): void {
    const existingAssetIndex = this.assets.findIndex((a) => a.symbol === asset.symbol);

    if (existingAssetIndex !== -1) {
      this.assets[existingAssetIndex] = asset;
      this.logger.info("Monitor", `Updated monitoring settings for ${asset.symbol}`, asset);
    } else {
      this.assets.push(asset);
      this.logger.info("Monitor", `Added ${asset.symbol} to monitored assets`, asset);
    }

    if (this.isRunning) {
      this.startAssetMonitoring(asset);
    }
  }

  /**
   * Remove an asset from the monitor
   * @param symbol Symbol to remove
   */
  removeAsset(symbol: string): void {
    const initialLength = this.assets.length;
    this.assets = this.assets.filter((a) => a.symbol !== symbol);

    if (this.assets.length < initialLength) {
      this.logger.info("Monitor", `Removed ${symbol} from monitored assets`);
    } else {
      this.logger.warn("Monitor", `Symbol ${symbol} not found in monitored assets`);
    }
  }

  /**
   * Analyze all assets across all timeframes
   */
  private async runAnalysis(): Promise<void> {
    this.logger.info("Monitor", `Running analysis at ${new Date().toISOString()}`);

    for (const asset of this.assets) {
      for (const timeframe of asset.timeframes) {
        try {
          this.logger.debug("Monitor", `Analyzing ${asset.symbol} on ${timeframe} timeframe`);

          // Fetch candle data
          const candles = await this.exchangeService.getCandles(asset.symbol, timeframe, 100);

          if (candles.length < 50) {
            this.logger.warn(
              "Monitor",
              `Not enough candles for ${asset.symbol} on ${timeframe} timeframe. Skipping analysis.`,
            );
            continue;
          }

          // Run technical analysis
          const analysis = this.technicalAnalysisService.analyzeMarket(asset.symbol, timeframe, candles);

          // Process results and check for alerts
          await this.processAnalysisResult(asset.symbol, timeframe, analysis);

          // Optionally store/log the analysis results
          this.logAnalysisSummary(analysis);
        } catch (error) {
          this.logger.error("Monitor", `Error analyzing ${asset.symbol} on ${timeframe} timeframe`, error);
        }
      }
    }
  }

  /**
   * Log a summary of the analysis results
   * @param analysis Analysis result
   */
  private logAnalysisSummary(analysis: AnalysisResult): void {
    const { symbol, timeframe, summary } = analysis;

    // Create a colorful summary
    const sentiment = summary.overallSentiment;
    const score = summary.confidenceScore;

    this.logger.info(
      "Analysis",
      `${symbol} ${timeframe} | Sentiment: ${sentiment} | Score: ${score}% | Bull: ${summary.bullishSignals} | Bear: ${summary.bearishSignals} | Neutral: ${summary.neutralSignals}`,
    );
  }

  /**
   * Get current assets configuration
   * @returns Current assets
   */
  getAssets(): AssetConfig[] {
    return [...this.assets];
  }

  /**
   * Update polling interval
   * @param interval New interval in milliseconds
   */
  setPollingInterval(interval: number): void {
    this.pollingInterval = interval;
    this.logger.info("Monitor", `Polling interval updated to ${interval / 1000} seconds`);

    // Restart polling with new interval if running
    if (this.isRunning && this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (this.isRunning) {
          this.runAnalysis();
        }
      }, this.pollingInterval);
    }
  }

  /**
   * Start monitoring a specific asset
   * @param asset Asset to monitor
   */
  private startAssetMonitoring(asset: AssetConfig): void {
    this.logger.info("Monitor", `Starting monitoring for ${asset.symbol}...`);
    // Run initial analysis for the new asset
    for (const timeframe of asset.timeframes) {
      this.analyzeAsset(asset.symbol, timeframe);
    }
  }

  /**
   * Analyze a specific asset on a specific timeframe
   * @param symbol Symbol to analyze
   * @param timeframe Timeframe to analyze
   */
  private async analyzeAsset(symbol: string, timeframe: string): Promise<void> {
    try {
      this.logger.debug("Monitor", `Analyzing ${symbol} on ${timeframe} timeframe`);

      // Fetch candle data
      const candles = await this.exchangeService.getCandles(symbol, timeframe, 100);

      if (candles.length < 50) {
        this.logger.warn("Monitor", `Not enough candles for ${symbol} on ${timeframe} timeframe. Skipping analysis.`);
        return;
      }

      // Run technical analysis
      const analysis = this.technicalAnalysisService.analyzeMarket(symbol, timeframe, candles);

      // Process results
      await this.processAnalysisResult(symbol, timeframe, analysis);
    } catch (error) {
      this.logger.error("Monitor", `Error analyzing ${symbol} on ${timeframe} timeframe`, error);
    }
  }

  /**
   * 分析結果の処理
   * @param symbol シンボル
   * @param timeframe 時間枠
   * @param result 分析結果
   */
  private async processAnalysisResult(symbol: string, timeframe: string, result: AnalysisResult): Promise<void> {
    try {
      // アラート処理
      const alerts = this.alertService.processAnalysisResult(result);
      if (alerts.length > 0) {
        this.logger.info("Monitor", `Generated ${alerts.length} alerts for ${symbol} on ${timeframe} timeframe`, {
          alertCount: alerts.length,
          firstAlert: alerts[0],
        });
      }

      // 自動取引の処理（有効な場合）
      if (this.enableAutoTrading) {
        await this.processTrading(symbol, result);
      }

      // ログに分析結果のサマリーを出力
      this.logAnalysisSummary(result);
    } catch (error) {
      this.logger.error("Monitor", `Error processing analysis results for ${symbol} on ${timeframe}`, error);
    }
  }

  /**
   * 自動取引の有効/無効を設定
   * @param enable 有効にする場合はtrue
   */
  setAutoTrading(enable: boolean): void {
    this.enableAutoTrading = enable;
    this.logger.info("Monitor", `自動取引を${enable ? "有効" : "無効"}にしました`);
  }

  /**
   * ポジションサイズマネージャーを更新
   * @param accountSize アカウント残高（USD）
   * @param maxRiskPerTrade 1トレードあたりの最大リスク率（%）
   */
  updatePositionSizeManager(accountSize: number, maxRiskPerTrade: number): void {
    const positionManager = new PositionSizeManager(accountSize, maxRiskPerTrade);
    this.strategyService.updatePositionManager(positionManager);
    this.logger.info(
      "Monitor",
      `ポジションマネージャーを更新しました: アカウントサイズ=${accountSize}USD, 最大リスク=${maxRiskPerTrade}%`,
    );
  }

  /**
   * 分析結果に基づいてトレード処理を行う
   * 信頼性スコアが高い場合にのみシグナルを生成し、トレードを実行する
   * @param symbol シンボル
   * @param analysisResult 分析結果
   */
  async processTrading(symbol: string, analysisResult: AnalysisResult) {
    // 自動売買が有効になっていない場合は何もしない
    if (!this.enableAutoTrading) {
      this.logger.debug("AutoTrading", `自動売買が無効なので ${symbol} のトレード処理をスキップします`);
      return;
    }

    try {
      const { timeframe, summary, indicators } = analysisResult;
      this.logger.debug("TradeDecision", `${symbol}(${timeframe})のトレード判断を開始します`);

      // 信頼性スコアが閾値を超えているか確認
      const confidenceScore = summary.confidenceScore;
      const requiredScore = 65; // 信頼性スコアの閾値を65に設定

      if (confidenceScore < requiredScore) {
        this.logger.debug(
          "SignalCheck",
          `${symbol}の信頼性スコア(${confidenceScore})が閾値(${requiredScore})未満のためシグナル生成をスキップします`,
        );
        return;
      }

      // 市場の状態を確認（ボラティリティが高すぎる場合などはスキップ）
      if (indicators.bollinger && indicators.bollinger.bandwidth > 0.1) {
        this.logger.debug(
          "MarketCheck",
          `${symbol}のボラティリティが高すぎます (${indicators.bollinger.bandwidth.toFixed(3)})。トレードをスキップします`,
        );
        return;
      }

      // RSIが極端な値の場合は慎重に判断
      if (indicators.rsi) {
        const rsiValue = indicators.rsi.value;
        if (rsiValue < 20 || rsiValue > 80) {
          this.logger.info(
            "TechnicalCheck",
            `${symbol}のRSIが極端な値です (${rsiValue.toFixed(1)})。これは重要なシグナルになります`,
          );
        }
      }

      // 同じシンボルの最新シグナルを取得
      const latestSignal = await this.strategyService.getLatestSignalForSymbol(symbol);

      // 1時間以内にシグナルが生成されているか確認
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      if (latestSignal && new Date(latestSignal.timestamp) > oneHourAgo) {
        this.logger.info(
          "SignalCheck",
          `${symbol}の最新シグナルは1時間以内(${new Date(latestSignal.timestamp).toLocaleString()})に既に生成されています。スキップします。`,
        );
        return;
      }

      // 取引方向と現在の市場トレンドを比較
      const marketTrend = summary.overallSentiment;
      this.logger.debug("MarketTrend", `${symbol}の市場トレンド: ${marketTrend}, 確信度: ${confidenceScore}%`);

      // MACDの確認（トレンドの強さの確認）
      let trendStrength = "中程度";
      if (indicators.macd) {
        const macdHistogram = indicators.macd.histogram;
        if (Math.abs(macdHistogram) > 0.5) {
          trendStrength = "強い";
        } else if (Math.abs(macdHistogram) < 0.2) {
          trendStrength = "弱い";
        }

        this.logger.debug(
          "TechnicalIndicator",
          `${symbol}のMACDヒストグラム: ${macdHistogram.toFixed(4)}, トレンドの強さ: ${trendStrength}`,
        );
      }

      // トレードの総合判断
      this.logger.info(
        "TradeDecision",
        `${symbol}のトレード判断: 信頼性=${confidenceScore}%, 市場=${marketTrend}, トレンド=${trendStrength}`,
      );

      // シグナルを生成して保存
      const signal = await this.strategyService.processAnalysisResult(symbol, analysisResult);

      if (signal) {
        // シグナル生成の詳細をログに記録
        this.logger.info(
          "SignalGenerated",
          `${symbol}の${signal.direction}シグナルを生成しました (戦略: ${signal.strategy})`,
        );
        this.logger.debug(
          "SignalDetails",
          `ID: ${signal.id}, レバレッジ: ${signal.leverage}x, サイズ: ${signal.positionSizeUsd}USD, 時間: ${new Date(signal.timestamp).toLocaleString()}`,
        );
      }
    } catch (error) {
      this.logger.error(
        "TradingError",
        `${symbol}のトレード処理中にエラーが発生: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export default new MonitorService();
