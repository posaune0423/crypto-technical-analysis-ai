import { config } from "../config";
import { AnalysisResult, AssetConfig } from "../types";
import { Logger, LogLevel } from "../utils/logger";
import { AlertService } from "./alertService";
import { ExchangeService } from "./exchangeService";
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
}
