import { TradeSignal } from "../models/tradeSignal";
import { AnalysisResult, SignalDirection, SignalStrategy } from "../types";
import { Logger, LogLevel } from "../utils/logger";
import { PositionSizeManager } from "../utils/positionSizeManager";
import { executeSignalOrder } from "./tradeExecutor";

// Loggerのインスタンスを作成
const logger = new Logger({
  level: LogLevel.DEBUG,
  enableColors: true,
  enableTimestamp: true,
});

/**
 * 取引戦略を決定するサービス
 */
export class StrategyService {
  private positionManager: PositionSizeManager;

  /**
   * コンストラクタ
   * @param positionManager ポジションサイズマネージャー
   */
  constructor(positionManager?: PositionSizeManager) {
    this.positionManager = positionManager || new PositionSizeManager();
  }

  /**
   * テクニカル分析結果から取引シグナルを生成して実行
   * @param symbol シンボル
   * @param analysis 分析結果
   * @returns 作成されたシグナル（実行された場合）またはnull
   */
  async processAnalysisResult(symbol: string, analysis: AnalysisResult): Promise<TradeSignal | null> {
    try {
      // シグナルの方向を決定
      const direction = this.determineSignalDirection(analysis);

      // シグナル強度が足りない場合はトレードしない
      const confidenceScore = analysis.summary.confidenceScore;
      if (confidenceScore < 60) {
        logger.info("SignalCheck", `${symbol}のシグナル強度が不十分です (${confidenceScore})`);
        return null;
      }

      // 戦略を決定
      const strategy = this.determineStrategy(analysis);

      // ポジションサイズとレバレッジを計算
      const positionSize = this.positionManager.calculatePositionSize(analysis);
      const leverage = this.positionManager.calculateLeverage(analysis);

      // シグナル強度（0-1）を計算
      const strength = confidenceScore / 100;

      // シグナルを作成
      const signal: TradeSignal = {
        id: "", // DBに保存時に生成
        symbol,
        direction,
        strategy,
        strength,
        positionSizeUsd: positionSize,
        leverage,
        timestamp: new Date().toISOString(),
        executed: false,
        metadata: {
          analysis: {
            rsi: analysis.indicators.rsi?.value,
            macd: {
              value: analysis.indicators.macd?.histogram,
              signal: analysis.indicators.macd?.signal,
              histogram: analysis.indicators.macd?.histogram,
            },
            confidenceScore,
          },
        },
      };

      // ログに記録
      logger.info(
        "TradeSignal",
        `${symbol}の取引シグナルを生成: ${direction} (強度: ${strength.toFixed(2)}, 戦略: ${strategy})`,
      );
      logger.debug("TradeDetail", `シグナル詳細: ポジションサイズ=${positionSize}USD, レバレッジ=${leverage}x`);

      // シグナルを実行
      await executeSignalOrder(signal);

      return signal;
    } catch (error) {
      logger.error(
        "Error",
        `分析結果の処理中にエラーが発生: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * テクニカル分析結果からシグナルの方向を決定
   * @param analysis 分析結果
   * @returns シグナルの方向（BUY/SELL）
   */
  private determineSignalDirection(analysis: AnalysisResult): SignalDirection {
    // 総合的なセンチメントを取得
    const sentiment = analysis.summary.overallSentiment;

    // センチメントに基づいてシグナルの方向を決定
    return sentiment === "BEARISH" ? "SELL" : "BUY";
  }

  /**
   * 分析結果に基づいて取引戦略を決定
   * @param analysis 分析結果
   * @returns 取引戦略
   */
  private determineStrategy(analysis: AnalysisResult): SignalStrategy {
    const rsiValue = analysis.indicators.rsi?.value || 50;
    const macdValue = analysis.indicators.macd?.histogram || 0;

    // RSIが極端な値を示している場合
    if (rsiValue <= 30) {
      return "RSI_OVERSOLD";
    } else if (rsiValue >= 70) {
      return "RSI_OVERBOUGHT";
    }

    // MACDのクロスオーバーまたはダイバージェンスを示唆
    if (Math.abs(macdValue) > 0.5) {
      return macdValue > 0 ? "MACD_BULLISH" : "MACD_BEARISH";
    }

    // デフォルトはトレンドフォロー
    return "TREND_FOLLOWING";
  }

  /**
   * ポジションマネージャーを更新
   * @param newManager 新しいポジションマネージャー
   */
  updatePositionManager(newManager: PositionSizeManager): void {
    this.positionManager = newManager;
  }
}
