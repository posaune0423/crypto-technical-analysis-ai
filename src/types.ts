export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorValue {
  timestamp: number;
  value: number | number[] | null;
}

export interface RSIResult {
  timestamp: number;
  value: number;
  isOverbought: boolean;
  isOversold: boolean;
}

export interface MACDResult {
  timestamp: number;
  macd: number;
  signal: number;
  histogram: number;
  isBullish: boolean;
  isBearish: boolean;
}

export interface BollingerBandsResult {
  timestamp: number;
  upper: number;
  middle: number;
  lower: number;
  isAboveUpper: boolean;
  isBelowLower: boolean;
  bandwidth: number;
}

export interface EMACrossResult {
  timestamp?: number;
  fastEMA?: number;
  slowEMA?: number;
  shortEma?: number[];
  longEma?: number[];
  isCrossOver?: boolean; // Fast crosses above slow
  isCrossUnder?: boolean; // Fast crosses below slow
  signal?: "bullish" | "bearish" | "neutral";
  direction?: "up" | "down" | "none";
  strength?: number;
  crossover?: boolean;
  message?: string;
}

export interface VolumeAnalysisResult {
  timestamp: number;
  volume: number;
  averageVolume: number;
  isHighVolume: boolean;
  volumeChange: number; // percentage
}

export interface MarketSignal {
  symbol: string;
  timeframe: string;
  timestamp: number;
  price: number;
  signalType: string;
  indicator: string;
  strength: number; // 1-10
  message: string;
  action: "BUY" | "SELL" | "HOLD" | "WATCH";
}

export interface AlertConfig {
  enabled: boolean;
  threshold: number;
  indicators: string[];
}

export interface AssetConfig {
  symbol: string;
  timeframes: string[];
  alert: AlertConfig;
}

export interface AnalysisResult {
  symbol: string;
  timeframe: string;
  timestamp: number;
  price: number;
  indicators: {
    rsi?: RSIResult;
    macd?: MACDResult;
    bollinger?: BollingerBandsResult;
    emaCross?: EMACrossResult[];
    volumeAnalysis?: VolumeAnalysisResult;
  };
  signals: MarketSignal[];
  summary: {
    bullishSignals: number;
    bearishSignals: number;
    neutralSignals: number;
    overallSentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
    confidenceScore: number; // 0-100
  };
}
