import { createSignal, getLatestSignalBySymbol, TradeSignal } from "../models/tradeSignal";
import { AnalysisResult, SignalDirection, SignalStrategy } from "../types";
import { Logger, LogLevel } from "../utils/logger";
import { PositionSizeManager } from "../utils/positionSizeManager";

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
   * 特定のシンボルの最新シグナルを取得
   * @param symbol シンボル
   * @returns 最新のトレードシグナル、または存在しない場合はnull
   */
  async getLatestSignalForSymbol(symbol: string): Promise<TradeSignal | null> {
    const result = await getLatestSignalBySymbol(symbol);

    if (!result) {
      return null;
    }

    // DB結果をTradeSignal形式に変換
    return {
      id: result.id,
      symbol: result.symbol,
      direction: result.direction as SignalDirection,
      price: result.price,
      strategy: result.strategy as SignalStrategy,
      strength: result.strength || 0,
      positionSizeUsd: 0, // DB保存されていない値は適当なデフォルト値を設定
      leverage: 1,
      timestamp: result.timestamp,
      executed: result.isExecuted === 1,
    };
  }

  /**
   * テクニカル分析結果から取引シグナルを生成して保存
   * @param symbol シンボル
   * @param analysis 分析結果
   * @returns 作成されたシグナルまたはnull
   */
  async processAnalysisResult(symbol: string, analysis: AnalysisResult): Promise<TradeSignal | null> {
    try {
      // シグナルの方向を決定
      const direction = this.determineSignalDirection(analysis);

      // シグナル強度が足りない場合はトレードしない
      const confidenceScore = analysis.summary.confidenceScore;
      if (confidenceScore < 65) {
        logger.info("SignalCheck", `${symbol}のシグナル強度が不十分です (${confidenceScore})`);
        return null;
      }

      // 戦略を決定
      const strategy = this.determineStrategy(analysis);

      // 市場状況に応じてリスク調整係数を計算
      const marketRiskFactor = this.calculateMarketRiskFactor(analysis);

      // ポジションサイズとレバレッジを計算（市場状況を反映）
      const basePositionSize = this.positionManager.calculatePositionSize(analysis);
      const positionSize = Math.round(basePositionSize * marketRiskFactor);

      const baseLeverage = this.positionManager.calculateLeverage(analysis);
      // ボラティリティが高い時はレバレッジを下げる、低い時は上げる
      const leverage = Math.max(1, Math.min(10, Math.round(baseLeverage * marketRiskFactor)));

      // シグナル強度（0-1）を計算
      const strength = confidenceScore / 100;

      // シグナルデータを作成
      const signalData = {
        id: `signal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        symbol,
        direction,
        price: analysis.price,
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
              value: analysis.indicators.macd?.macd,
              signal: analysis.indicators.macd?.signal,
              histogram: analysis.indicators.macd?.histogram,
            },
            confidenceScore,
            marketRiskFactor,
          },
        },
      };

      // データベースにシグナルを保存
      const savedSignal = await createSignal(signalData);

      // ログに記録
      logger.info(
        "TradeSignal",
        `${symbol}の取引シグナルを生成: ${direction} (強度: ${strength.toFixed(2)}, 戦略: ${strategy})`,
      );
      logger.debug(
        "TradeDetail",
        `シグナル詳細: ポジションサイズ=${positionSize}USD, レバレッジ=${leverage}x, リスク係数=${marketRiskFactor.toFixed(2)}`,
      );

      return savedSignal;
    } catch (error) {
      logger.error(
        "Error",
        `分析結果の処理中にエラーが発生: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 市場状況に基づいたリスク調整係数を計算
   * 値が1より小さいとリスクを減らす、1より大きいとリスクを増やす
   * @param analysis 分析結果
   * @returns リスク調整係数（0.5〜1.5）
   */
  private calculateMarketRiskFactor(analysis: AnalysisResult): number {
    // 初期係数は1.0
    let factor = 1.0;

    // 1. ボラティリティに基づく調整
    if (analysis.indicators.bollinger) {
      const bandwidth = analysis.indicators.bollinger.bandwidth;
      // ボラティリティが高いほどリスクを減らす
      if (bandwidth > 0.05) {
        factor *= 1 - bandwidth; // ボラティリティが高いとfactorを下げる
      } else {
        factor *= 1.1; // ボラティリティが低いとわずかに上げる
      }
    }

    // 2. RSIに基づく調整
    if (analysis.indicators.rsi) {
      const rsi = analysis.indicators.rsi.value;
      if (rsi > 70 || rsi < 30) {
        // 極端な値の場合は慎重にする
        factor *= 0.8;
      } else if (rsi > 45 && rsi < 55) {
        // 中央値に近い場合はややリスクを取れる
        factor *= 1.1;
      }
    }

    // 3. トレンド強度に基づく調整
    if (analysis.indicators.macd) {
      const histogram = Math.abs(analysis.indicators.macd.histogram);
      // トレンドが強いほど調整を増やす
      factor *= 1 + Math.min(0.3, histogram / 5);
    }

    // 4. 確信度スコアに基づく調整
    const confidenceBonus = (analysis.summary.confidenceScore - 65) / 100;
    factor *= 1 + confidenceBonus;

    // 最終的に0.5〜1.5の範囲に収める
    return Math.max(0.5, Math.min(1.5, factor));
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
