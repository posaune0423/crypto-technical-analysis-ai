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
  private assets: AssetConfig[];
  private isRunning: boolean;
  private pollingInterval: number;
  private logger: Logger;
  private timer: NodeJS.Timeout | null = null;
  private strategyService: StrategyService;
  private enableAutoTrading = false;

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
          const alerts = this.alertService.processAnalysisResult(analysis);

          if (alerts.length > 0) {
            this.logger.info(
              "Monitor",
              `Generated ${alerts.length} alerts for ${asset.symbol} on ${timeframe} timeframe`,
              {
                alertCount: alerts.length,
                firstAlert: alerts[0],
              },
            );
          }

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
   * 取引処理
   * @param symbol シンボル
   * @param result 分析結果
   */
  private async processTrading(symbol: string, result: AnalysisResult): Promise<void> {
    try {
      // 確信度が閾値を超えているかチェック
      if (result.summary.confidenceScore >= 60) {
        this.logger.info(
          "Monitor",
          `${symbol}の取引シグナルを検出: 確信度=${result.summary.confidenceScore}, センチメント=${result.summary.overallSentiment}`,
        );

        // シグナル生成と執行
        const signal = await this.strategyService.processAnalysisResult(symbol, result);

        if (signal) {
          this.logger.info(
            "Monitor",
            `${symbol}の取引シグナルを生成しました: ${signal.direction} (戦略: ${signal.strategy}, レバレッジ: ${signal.leverage}x)`,
          );
        }
      } else {
        this.logger.debug("Monitor", `${symbol}の確信度が不十分: ${result.summary.confidenceScore} (60以上必要)`);
      }
    } catch (error) {
      this.logger.error(
        "Monitor",
        `取引処理中にエラーが発生: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export default new MonitorService();
