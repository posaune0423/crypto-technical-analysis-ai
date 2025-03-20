import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  exchange: {
    name: process.env.EXCHANGE || 'bybit',
    apiKey: process.env.EXCHANGE_API_KEY || '',
    apiSecret: process.env.EXCHANGE_API_SECRET || '',
    baseUrl: process.env.BASE_URL || 'https://api.bybit.com',
  },
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  alerts: {
    threshold: parseFloat(process.env.ALERT_THRESHOLD || '5'),
    pollingInterval: parseInt(process.env.POLLING_INTERVAL || '60000', 10),
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  // Add default technical indicators to track
  indicators: {
    rsi: {
      period: 14,
      overbought: 70,
      oversold: 30,
    },
    macd: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
    },
    bollinger: {
      period: 20,
      stdDev: 2,
    },
    ema: {
      periods: [9, 21, 50, 200],
    },
    volume: {
      period: 20,
    }
  },
  // Default assets to monitor
  assets: [
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT'
  ],
  // Default timeframes to analyze
  timeframes: [
    '15m',
    '1h',
    '4h',
    '1d'
  ]
};