import { DEFAULT_TRADE_SIZE_USD, MAX_LEVERAGE } from "../config/bybit";
import { getCurrentPrice } from "../lib/bybitClient";
import { AnalysisResult } from "../types";

/**
 * ポジションサイズとリスク管理を担当するクラス
 */
export class PositionSizeManager {
  private accountSize: number; // アカウント残高（USD）
  private maxRiskPerTrade: number; // 1トレードあたりの最大リスク率（%）
  private defaultPositionSize: number; // デフォルトのポジションサイズ（USD）
  private maxLeverage: number; // 最大レバレッジ

  /**
   * コンストラクタ
   * @param accountSize アカウント残高（USD）
   * @param maxRiskPerTrade 1トレードあたりの最大リスク率（%）
   * @param defaultPositionSize デフォルトのポジションサイズ（USD）
   * @param maxLeverage 最大レバレッジ
   */
  constructor(
    accountSize: number = 1000,
    maxRiskPerTrade: number = 2,
    defaultPositionSize: number = DEFAULT_TRADE_SIZE_USD,
    maxLeverage: number = MAX_LEVERAGE,
  ) {
    this.accountSize = accountSize;
    this.maxRiskPerTrade = maxRiskPerTrade;
    this.defaultPositionSize = defaultPositionSize;
    this.maxLeverage = maxLeverage;
  }

  /**
   * 分析結果に基づいてレバレッジを計算
   * @param analysis 分析結果
   * @returns 最適なレバレッジ
   */
  calculateLeverage(analysis: AnalysisResult): number {
    // 確信度スコアに基づいてレバレッジを調整
    const confidenceScore = analysis.summary.confidenceScore;
    let leverage: number;

    if (confidenceScore >= 90) {
      leverage = this.maxLeverage;
    } else if (confidenceScore >= 80) {
      leverage = Math.floor(this.maxLeverage * 0.8);
    } else if (confidenceScore >= 70) {
      leverage = Math.floor(this.maxLeverage * 0.6);
    } else if (confidenceScore >= 60) {
      leverage = Math.floor(this.maxLeverage * 0.4);
    } else {
      leverage = Math.floor(this.maxLeverage * 0.2);
    }

    // 最小値は1、最大値はMAX_LEVERAGE
    return Math.max(1, Math.min(leverage, this.maxLeverage));
  }

  /**
   * 分析結果とアカウントサイズに基づいてポジションサイズを計算
   * @param analysis 分析結果
   * @returns ポジションサイズ（USD）
   */
  calculatePositionSize(analysis: AnalysisResult): number {
    // 確信度スコアに基づいてポジションサイズを調整
    const confidenceScore = analysis.summary.confidenceScore;

    // リスクベースのポジションサイズ計算
    // アカウントの一定割合をリスクとして設定
    const maxRiskAmount = this.accountSize * (this.maxRiskPerTrade / 100);

    // 確信度によりリスク率を変動させる
    let riskFactor = 0;
    if (confidenceScore >= 90) {
      riskFactor = 1.0; // 最大リスク
    } else if (confidenceScore >= 80) {
      riskFactor = 0.8;
    } else if (confidenceScore >= 70) {
      riskFactor = 0.6;
    } else if (confidenceScore >= 60) {
      riskFactor = 0.4;
    } else {
      riskFactor = 0.2; // 最小リスク
    }

    // リスクに基づくポジションサイズ
    const positionSize = maxRiskAmount * riskFactor;

    // 最小値はデフォルトポジションサイズ、最大値はアカウントの10%まで
    return Math.max(this.defaultPositionSize, Math.min(positionSize, this.accountSize * 0.1));
  }

  /**
   * トレード戦略の強さに基づいて取引量を調整
   * @param symbol 取引シンボル
   * @param basePositionSize 基本ポジションサイズ（USD）
   * @param strengthMultiplier 強度乗数（0.0-1.0）
   * @returns 調整後のポジションサイズ（USD）
   */
  async adjustPositionSizeByStrength(
    symbol: string,
    basePositionSize: number,
    strengthMultiplier: number,
  ): Promise<number> {
    // 現在の価格を取得
    const currentPrice = await getCurrentPrice(symbol);

    // 強度に基づいてポジションサイズを調整
    const adjustedSize = basePositionSize * strengthMultiplier;

    // 最小値は50USDとする
    return Math.max(50, adjustedSize);
  }

  /**
   * シンボルのボラティリティに基づいてポジションサイズを調整
   * @param symbol シンボル
   * @param basePositionSize 基本ポジションサイズ
   * @param volatility ボラティリティ（%）
   * @returns 調整後のポジションサイズ
   */
  adjustPositionSizeByVolatility(symbol: string, basePositionSize: number, volatility: number): number {
    // ボラティリティが高い場合、ポジションサイズを減らす
    let volatilityFactor = 1.0;

    if (volatility > 5) {
      volatilityFactor = 0.5; // 非常に高いボラティリティ
    } else if (volatility > 3) {
      volatilityFactor = 0.7; // 高いボラティリティ
    } else if (volatility > 2) {
      volatilityFactor = 0.85; // 中程度のボラティリティ
    }

    return basePositionSize * volatilityFactor;
  }

  /**
   * アカウントサイズを更新
   * @param newSize 新しいアカウントサイズ
   */
  setAccountSize(newSize: number): void {
    this.accountSize = newSize;
  }

  /**
   * 最大リスク率を更新
   * @param newRisk 新しい最大リスク率（%）
   */
  setMaxRiskPerTrade(newRisk: number): void {
    this.maxRiskPerTrade = newRisk;
  }
}
