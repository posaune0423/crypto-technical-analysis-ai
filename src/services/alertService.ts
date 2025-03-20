import axios from "axios";
import { config } from "../config/config";
import { AnalysisResult, MarketSignal } from "../types";

export class AlertService {
  private previousAnalysis: Map<string, AnalysisResult>;
  private telegramBotToken: string;
  private telegramChatId: string;
  private alertThreshold: number;

  constructor() {
    this.previousAnalysis = new Map<string, AnalysisResult>();
    this.telegramBotToken = config.telegram.botToken;
    this.telegramChatId = config.telegram.chatId;
    this.alertThreshold = config.alerts.threshold;
  }

  /**
   * Process new analysis results and generate alerts if significant changes detected
   * @param analysis New analysis result
   * @returns Array of alerts (if any)
   */
  processAnalysisResult(analysis: AnalysisResult): MarketSignal[] {
    const key = `${analysis.symbol}-${analysis.timeframe}`;
    const previousAnalysis = this.previousAnalysis.get(key);
    const alerts: MarketSignal[] = [];

    // If no previous analysis, store current and return
    if (!previousAnalysis) {
      this.previousAnalysis.set(key, analysis);
      return alerts;
    }

    // Check for significant changes in indicators
    // First, filter for strong signals
    const strongSignals = analysis.signals.filter((signal) => signal.strength >= this.alertThreshold);

    // Add signals that weren't present in the previous analysis
    for (const signal of strongSignals) {
      const signatureString = `${signal.indicator}_${signal.signalType}`;
      const previousSignal = previousAnalysis.signals.find(
        (ps) => ps.indicator === signal.indicator && ps.signalType === signal.signalType,
      );

      if (!previousSignal) {
        alerts.push(signal);
      }
    }

    // Check for sentiment changes
    if (previousAnalysis.summary.overallSentiment !== analysis.summary.overallSentiment) {
      // Create a sentiment change alert
      alerts.push({
        symbol: analysis.symbol,
        timeframe: analysis.timeframe,
        timestamp: analysis.timestamp,
        price: analysis.price,
        signalType: "SENTIMENT_CHANGE",
        indicator: "COMBINED",
        strength: 8,
        message: `Market sentiment changed from ${previousAnalysis.summary.overallSentiment} to ${analysis.summary.overallSentiment}`,
        action:
          analysis.summary.overallSentiment === "BULLISH"
            ? "BUY"
            : analysis.summary.overallSentiment === "BEARISH"
              ? "SELL"
              : "WATCH",
      });
    }

    // Check for significant price movement
    const priceChangePercent = ((analysis.price - previousAnalysis.price) / previousAnalysis.price) * 100;
    if (Math.abs(priceChangePercent) >= 3) {
      // 3% price movement threshold
      alerts.push({
        symbol: analysis.symbol,
        timeframe: analysis.timeframe,
        timestamp: analysis.timestamp,
        price: analysis.price,
        signalType: "PRICE_MOVEMENT",
        indicator: "PRICE",
        strength: 7,
        message: `Significant price movement: ${priceChangePercent.toFixed(2)}% in ${analysis.timeframe} timeframe`,
        action: priceChangePercent > 0 ? "BUY" : "SELL",
      });
    }

    // Store current analysis for future comparison
    this.previousAnalysis.set(key, analysis);

    // Send alerts
    for (const alert of alerts) {
      this.sendAlert(alert);
    }

    return alerts;
  }

  /**
   * Send an alert to configured channels (console, Telegram, etc.)
   * @param signal Alert signal to send
   */
  private async sendAlert(signal: MarketSignal): Promise<void> {
    // Always log to console
    console.log("🚨 ALERT:", JSON.stringify(signal, null, 2));

    // If Telegram is configured, send a message
    if (this.telegramBotToken && this.telegramChatId) {
      try {
        // Format a nice message for Telegram
        const formattedText = this.formatTelegramMessage(signal);

        await axios.post(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
          chat_id: this.telegramChatId,
          text: formattedText,
          parse_mode: "Markdown",
        });
      } catch (error) {
        console.error("Failed to send Telegram alert:", error);
      }
    }

    // Additional alert channels can be added here (email, Discord, Slack, etc.)
  }

  /**
   * Format a nice-looking message for Telegram
   * @param signal Signal to format
   * @returns Formatted message text (Markdown)
   */
  private formatTelegramMessage(signal: MarketSignal): string {
    const emoji =
      signal.action === "BUY" ? "🟢" : signal.action === "SELL" ? "🔴" : signal.action === "WATCH" ? "👀" : "⚠️";

    return (
      `${emoji} *${signal.symbol}* - ${signal.timeframe}\n` +
      `Signal: *${signal.signalType}* (${signal.indicator})\n` +
      `Message: ${signal.message}\n` +
      `Action: *${signal.action}*\n` +
      `Price: $${signal.price.toFixed(2)}\n` +
      `Strength: ${signal.strength}/10\n` +
      `Time: ${new Date(signal.timestamp).toISOString()}`
    );
  }

  /**
   * Clear all stored previous analysis results
   */
  clearPreviousAnalysis(): void {
    this.previousAnalysis.clear();
  }
}
