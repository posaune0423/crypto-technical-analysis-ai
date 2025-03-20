import {
  RSI,
  MACD,
  BollingerBands,
  EMA,
  SMA
} from 'technicalindicators';
import {
  Candle,
  RSIResult,
  MACDResult,
  BollingerBandsResult,
  EMACrossResult,
  VolumeAnalysisResult,
  MarketSignal,
  AnalysisResult
} from '../models/types';
import { config } from '../config/config';

export class TechnicalAnalysisService {
  /**
   * Calculate RSI for a series of candles
   * @param candles Array of candles
   * @param period RSI period (default: 14)
   * @returns RSI results
   */
  calculateRSI(candles: Candle[], period = config.indicators.rsi.period): RSIResult[] {
    if (candles.length < period) {
      throw new Error(`Not enough candles for RSI calculation. Need at least ${period} candles.`);
    }

    const prices = candles.map(candle => candle.close);
    const timestamps = candles.map(candle => candle.timestamp);

    const rsiValues = RSI.calculate({
      values: prices,
      period: period
    });

    // Pad the beginning with nulls since RSI needs 'period' candles to start calculating
    const paddingLength = prices.length - rsiValues.length;

    const results: RSIResult[] = [];

    for (let i = 0; i < rsiValues.length; i++) {
      const value = rsiValues[i];
      const timestamp = timestamps[i + paddingLength];

      results.push({
        timestamp,
        value,
        isOverbought: value >= config.indicators.rsi.overbought,
        isOversold: value <= config.indicators.rsi.oversold
      });
    }

    return results;
  }

  /**
   * Calculate MACD for a series of candles
   * @param candles Array of candles
   * @param fastPeriod Fast period (default: 12)
   * @param slowPeriod Slow period (default: 26)
   * @param signalPeriod Signal period (default: 9)
   * @returns MACD results
   */
  calculateMACD(
    candles: Candle[],
    fastPeriod = config.indicators.macd.fastPeriod,
    slowPeriod = config.indicators.macd.slowPeriod,
    signalPeriod = config.indicators.macd.signalPeriod
  ): MACDResult[] {
    if (candles.length < slowPeriod + signalPeriod) {
      throw new Error(`Not enough candles for MACD calculation. Need at least ${slowPeriod + signalPeriod} candles.`);
    }

    const prices = candles.map(candle => candle.close);
    const timestamps = candles.map(candle => candle.timestamp);

    const macdValues = MACD.calculate({
      values: prices,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });

    // Pad the beginning with nulls (MACD needs more candles to start calculating)
    const paddingLength = prices.length - macdValues.length;

    const results: MACDResult[] = [];

    // Create results with previous values for comparison
    let prevHistogram = 0;

    for (let i = 0; i < macdValues.length; i++) {
      const { MACD: macd, signal, histogram } = macdValues[i];
      const timestamp = timestamps[i + paddingLength];

      // Ensure histogram is a number (TS safety)
      const histogramValue = histogram || 0;

      // Determine if bullish or bearish based on histogram
      // Bullish when histogram is positive and increasing
      // Bearish when histogram is negative and decreasing
      const histogramIncreasing = histogramValue > prevHistogram;
      const histogramDecreasing = histogramValue < prevHistogram;

      results.push({
        timestamp,
        macd: macd || 0,
        signal: signal || 0,
        histogram: histogramValue,
        isBullish: (histogramValue > 0 && histogramIncreasing) || (histogramValue < 0 && histogramIncreasing),
        isBearish: (histogramValue < 0 && histogramDecreasing) || (histogramValue > 0 && histogramDecreasing)
      });

      prevHistogram = histogramValue;
    }

    return results;
  }

  /**
   * Calculate Bollinger Bands for a series of candles
   * @param candles Array of candles
   * @param period Bollinger Bands period (default: 20)
   * @param stdDev Standard deviation multiplier (default: 2)
   * @returns Bollinger Bands results
   */
  calculateBollingerBands(
    candles: Candle[],
    period = config.indicators.bollinger.period,
    stdDev = config.indicators.bollinger.stdDev
  ): BollingerBandsResult[] {
    if (candles.length < period) {
      throw new Error(`Not enough candles for Bollinger Bands calculation. Need at least ${period} candles.`);
    }

    const prices = candles.map(candle => candle.close);
    const timestamps = candles.map(candle => candle.timestamp);

    const bbValues = BollingerBands.calculate({
      values: prices,
      period,
      stdDev
    });

    // Pad the beginning with nulls
    const paddingLength = prices.length - bbValues.length;

    const results: BollingerBandsResult[] = [];

    for (let i = 0; i < bbValues.length; i++) {
      const { upper, middle, lower } = bbValues[i];
      const currentPrice = prices[i + paddingLength];
      const timestamp = timestamps[i + paddingLength];

      // Calculate bandwidth (indicator of volatility)
      const bandwidth = (upper - lower) / middle;

      results.push({
        timestamp,
        upper,
        middle,
        lower,
        isAboveUpper: currentPrice > upper,
        isBelowLower: currentPrice < lower,
        bandwidth
      });
    }

    return results;
  }

  /**
   * Calculate EMA crosses for a series of candles
   * @param candles Array of candles
   * @param fastPeriod Fast EMA period (default: 9)
   * @param slowPeriod Slow EMA period (default: 21)
   * @returns EMA cross results
   */
  calculateEMACross(
    candles: Candle[],
    fastPeriod = 9,
    slowPeriod = 21
  ): EMACrossResult {
    // We need at least {slowPeriod} candles to calculate EMA
    if (candles.length < Math.max(fastPeriod, slowPeriod) + 5) {
      return {
        signal: 'neutral',
        direction: 'none',
        strength: 0,
        crossover: false,
        shortEma: [],
        longEma: [],
        message: `Not enough data for EMA cross calculation. Need at least ${Math.max(fastPeriod, slowPeriod) + 5} candles, but got ${candles.length}.`
      };
    }

    const prices = candles.map(candle => candle.close);
    const timestamps = candles.map(candle => candle.timestamp);

    const fastEMA = EMA.calculate({
      values: prices,
      period: fastPeriod
    });

    const slowEMA = EMA.calculate({
      values: prices,
      period: slowPeriod
    });

    // Both arrays should have the same length after this point
    const paddingLength = prices.length - slowEMA.length;
    const fastEMAPadded = Array(paddingLength).fill(null).concat(fastEMA.slice(fastEMA.length - slowEMA.length));

    const results: EMACrossResult[] = [];

    // Track previous values for cross detection
    let prevFastEMA = fastEMAPadded[0];
    let prevSlowEMA = slowEMA[0];

    for (let i = 1; i < slowEMA.length; i++) {
      const timestamp = timestamps[i + paddingLength];
      const fastEMAValue = fastEMAPadded[i];
      const slowEMAValue = slowEMA[i];

      // Check for crosses
      const isCrossOver = prevFastEMA <= prevSlowEMA && fastEMAValue > slowEMAValue;
      const isCrossUnder = prevFastEMA >= prevSlowEMA && fastEMAValue < slowEMAValue;

      results.push({
        timestamp,
        fastEMA: fastEMAValue,
        slowEMA: slowEMAValue,
        isCrossOver,
        isCrossUnder
      });

      prevFastEMA = fastEMAValue;
      prevSlowEMA = slowEMAValue;
    }

    return {
      signal: results.length > 0 ? (results[results.length - 1].isCrossOver ? 'bullish' : 'bearish') : 'neutral',
      direction: results.length > 0 ? (results[results.length - 1].isCrossOver ? 'up' : 'down') : 'none',
      strength: results.length > 0 ? 7 : 0,
      crossover: results.length > 0 ? results[results.length - 1].isCrossOver : false,
      shortEma: fastEMA,
      longEma: slowEMA,
      message: results.length > 0 ? `EMA ${fastPeriod}/${slowPeriod} ${results[results.length - 1].isCrossOver ? 'bullish' : 'bearish'} crossover` : 'No EMA cross detected'
    };
  }

  /**
   * Analyze volume for a series of candles
   * @param candles Array of candles
   * @param period Period for volume average (default: 20)
   * @returns Volume analysis results
   */
  analyzeVolume(
    candles: Candle[],
    period = config.indicators.volume.period
  ): VolumeAnalysisResult[] {
    if (candles.length < period) {
      throw new Error(`Not enough candles for volume analysis. Need at least ${period} candles.`);
    }

    const volumes = candles.map(candle => candle.volume);
    const timestamps = candles.map(candle => candle.timestamp);

    const results: VolumeAnalysisResult[] = [];

    // Calculate SMA for volume
    const volumeSMA = SMA.calculate({
      values: volumes,
      period
    });

    // Pad the beginning with nulls
    const paddingLength = volumes.length - volumeSMA.length;

    for (let i = 0; i < volumeSMA.length; i++) {
      const index = i + paddingLength;
      const currentVolume = volumes[index];
      const averageVolume = volumeSMA[i];
      const timestamp = timestamps[index];

      // Calculate percentage change from average
      const volumeChange = ((currentVolume - averageVolume) / averageVolume) * 100;

      // Consider high volume when 50% above average
      const isHighVolume = currentVolume > averageVolume * 1.5;

      results.push({
        timestamp,
        volume: currentVolume,
        averageVolume,
        isHighVolume,
        volumeChange
      });
    }

    return results;
  }

  /**
   * Generate market signals based on technical indicators
   * @param symbol Trading pair symbol
   * @param timeframe Chart timeframe
   * @param candles Array of candles
   * @returns Analysis result with signals
   */
  analyzeMarket(symbol: string, timeframe: string, candles: Candle[]): AnalysisResult {
    if (candles.length < 50) {
      throw new Error('Not enough candles for comprehensive analysis');
    }

    const signals: MarketSignal[] = [];
    const currentPrice = candles[candles.length - 1].close;
    const timestamp = candles[candles.length - 1].timestamp;

    // Calculate all indicators
    const rsiResults = this.calculateRSI(candles);
    const macdResults = this.calculateMACD(candles);
    const bollingerResults = this.calculateBollingerBands(candles);

    // EMA Crosses (multiple periods)
    const emaCrosses = [
      this.calculateEMACross(candles, 9, 21),    // Short-term
      this.calculateEMACross(candles, 21, 50),   // Medium-term
      this.calculateEMACross(candles, 50, 200)   // Long-term
    ];

    const volumeResults = this.analyzeVolume(candles);

    // Get latest indicator values
    const latestRSI = rsiResults[rsiResults.length - 1];
    const latestMACD = macdResults[macdResults.length - 1];
    const latestBB = bollingerResults[bollingerResults.length - 1];
    const latestVolume = volumeResults[volumeResults.length - 1];

    // Generate signals from RSI
    if (latestRSI) {
      if (latestRSI.isOversold) {
        signals.push({
          symbol,
          timeframe,
          timestamp,
          price: currentPrice,
          signalType: 'OVERSOLD',
          indicator: 'RSI',
          strength: 7, // Scale 1-10
          message: `RSI is oversold (${latestRSI.value.toFixed(2)})`,
          action: 'BUY'
        });
      } else if (latestRSI.isOverbought) {
        signals.push({
          symbol,
          timeframe,
          timestamp,
          price: currentPrice,
          signalType: 'OVERBOUGHT',
          indicator: 'RSI',
          strength: 7,
          message: `RSI is overbought (${latestRSI.value.toFixed(2)})`,
          action: 'SELL'
        });
      }

      // RSI divergence (price makes new low but RSI makes higher low)
      const rsiLength = rsiResults.length;
      if (rsiLength > 5) {
        const priceDown = candles[candles.length - 1].close < candles[candles.length - 5].close;
        const rsiUp = rsiResults[rsiLength - 1].value > rsiResults[rsiLength - 5].value;

        if (priceDown && rsiUp) {
          signals.push({
            symbol,
            timeframe,
            timestamp,
            price: currentPrice,
            signalType: 'BULLISH_DIVERGENCE',
            indicator: 'RSI',
            strength: 8,
            message: 'Bullish divergence detected (price down, RSI up)',
            action: 'BUY'
          });
        }

        const priceUp = candles[candles.length - 1].close > candles[candles.length - 5].close;
        const rsiDown = rsiResults[rsiLength - 1].value < rsiResults[rsiLength - 5].value;

        if (priceUp && rsiDown) {
          signals.push({
            symbol,
            timeframe,
            timestamp,
            price: currentPrice,
            signalType: 'BEARISH_DIVERGENCE',
            indicator: 'RSI',
            strength: 8,
            message: 'Bearish divergence detected (price up, RSI down)',
            action: 'SELL'
          });
        }
      }
    }

    // Generate signals from MACD
    if (latestMACD) {
      if (latestMACD.histogram > 0 && macdResults[macdResults.length - 2].histogram <= 0) {
        signals.push({
          symbol,
          timeframe,
          timestamp,
          price: currentPrice,
          signalType: 'BULLISH_CROSS',
          indicator: 'MACD',
          strength: 6,
          message: 'MACD bullish cross detected',
          action: 'BUY'
        });
      } else if (latestMACD.histogram < 0 && macdResults[macdResults.length - 2].histogram >= 0) {
        signals.push({
          symbol,
          timeframe,
          timestamp,
          price: currentPrice,
          signalType: 'BEARISH_CROSS',
          indicator: 'MACD',
          strength: 6,
          message: 'MACD bearish cross detected',
          action: 'SELL'
        });
      }
    }

    // Generate signals from Bollinger Bands
    if (latestBB) {
      if (latestBB.isAboveUpper) {
        signals.push({
          symbol,
          timeframe,
          timestamp,
          price: currentPrice,
          signalType: 'PRICE_ABOVE_UPPER_BAND',
          indicator: 'BOLLINGER',
          strength: 5,
          message: 'Price above upper Bollinger Band',
          action: 'SELL'
        });
      } else if (latestBB.isBelowLower) {
        signals.push({
          symbol,
          timeframe,
          timestamp,
          price: currentPrice,
          signalType: 'PRICE_BELOW_LOWER_BAND',
          indicator: 'BOLLINGER',
          strength: 5,
          message: 'Price below lower Bollinger Band',
          action: 'BUY'
        });
      }

      // Check for Bollinger Band squeeze (decreasing bandwidth)
      const bbLength = bollingerResults.length;
      if (bbLength > 10) {
        const currentBandwidth = bollingerResults[bbLength - 1].bandwidth;
        const prevBandwidth = bollingerResults[bbLength - 10].bandwidth;

        if (currentBandwidth < prevBandwidth * 0.8) {
          signals.push({
            symbol,
            timeframe,
            timestamp,
            price: currentPrice,
            signalType: 'BOLLINGER_SQUEEZE',
            indicator: 'BOLLINGER',
            strength: 7,
            message: 'Bollinger Bands squeezing (potential breakout)',
            action: 'WATCH'
          });
        }
      }
    }

    // Generate signals from EMA crosses
    emaCrosses.forEach((emaCross, index) => {
      const periods = index === 0 ? '9/21' : index === 1 ? '21/50' : '50/200';
      const latestCross = emaCross;

      if (latestCross.crossover) {
        signals.push({
          symbol,
          timeframe,
          timestamp,
          price: currentPrice,
          signalType: latestCross.signal === 'bullish' ? 'EMA_CROSS_OVER' : 'EMA_CROSS_UNDER',
          indicator: `EMA_${periods}`,
          strength: index === 2 ? 9 : index === 1 ? 7 : 5, // Stronger for longer periods
          message: `EMA ${periods} ${latestCross.signal} crossover`,
          action: latestCross.signal === 'bullish' ? 'BUY' : 'SELL'
        });
      }
    });

    // Generate signals from volume analysis
    if (latestVolume && latestVolume.isHighVolume) {
      // Determine if the increased volume is bullish or bearish
      const priceIncrease = candles[candles.length - 1].close > candles[candles.length - 2].close;

      signals.push({
        symbol,
        timeframe,
        timestamp,
        price: currentPrice,
        signalType: priceIncrease ? 'HIGH_VOLUME_BULLISH' : 'HIGH_VOLUME_BEARISH',
        indicator: 'VOLUME',
        strength: 6,
        message: `High volume detected (${latestVolume.volumeChange.toFixed(2)}% above average)`,
        action: priceIncrease ? 'BUY' : 'SELL'
      });
    }

    // Calculate summary metrics
    const bullishSignals = signals.filter(s => s.action === 'BUY').length;
    const bearishSignals = signals.filter(s => s.action === 'SELL').length;
    const neutralSignals = signals.filter(s => s.action === 'WATCH' || s.action === 'HOLD').length;

    let overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';

    if (bullishSignals > bearishSignals * 1.5) {
      overallSentiment = 'BULLISH';
    } else if (bearishSignals > bullishSignals * 1.5) {
      overallSentiment = 'BEARISH';
    } else {
      overallSentiment = 'NEUTRAL';
    }

    // Calculate confidence score (0-100)
    const totalSignalStrength = signals.reduce((sum, signal) => sum + signal.strength, 0);
    const maxPossibleStrength = signals.length * 10; // Maximum possible strength
    const confidenceScore = maxPossibleStrength > 0
      ? Math.round((totalSignalStrength / maxPossibleStrength) * 100)
      : 0;

    return {
      symbol,
      timeframe,
      timestamp,
      price: currentPrice,
      indicators: {
        rsi: latestRSI,
        macd: latestMACD,
        bollinger: latestBB,
        emaCross: emaCrosses.map(cross => cross),
        volumeAnalysis: latestVolume
      },
      signals,
      summary: {
        bullishSignals,
        bearishSignals,
        neutralSignals,
        overallSentiment,
        confidenceScore
      }
    };
  }
}