import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config/config';
import { Candle } from '../models/types';
import { Logger, LogLevel } from '../utils/logger';

export class ExchangeService {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private logger: Logger;

  constructor() {
    this.baseUrl = config.exchange.baseUrl;
    this.apiKey = config.exchange.apiKey;
    this.apiSecret = config.exchange.apiSecret;

    this.logger = new Logger({
      level: config.app.nodeEnv === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
      enableTimestamp: true,
      enableColors: true,
    });
  }

  /**
   * Get kline/candlestick data for a symbol
   * @param symbol Symbol name (e.g. BTCUSDT)
   * @param interval Kline interval (e.g. 1h, 4h, 1d)
   * @param limit Number of candles to get (default: 100, max: 1000)
   * @returns Array of candles
   */
  async getCandles(symbol: string, interval: string, limit = 100): Promise<Candle[]> {
    try {
      // Convert timeframes to Bybit format
      const bybitInterval = this.convertTimeframeToBybit(interval);

      this.logger.debug('Exchange', `Fetching ${symbol} candles for ${interval} (${bybitInterval})`, { limit });

      const response = await axios.get(`${this.baseUrl}/v5/market/kline`, {
        params: {
          category: 'linear',
          symbol: symbol.toUpperCase(),
          interval: bybitInterval,
          limit,
        },
      });

      if (response.data.retCode !== 0) {
        this.logger.error('Exchange', `Bybit API error: ${response.data.retMsg}`, {
          symbol,
          interval,
          retCode: response.data.retCode
        });
        throw new Error(`Bybit API error: ${response.data.retMsg}`);
      }

      this.logger.debug('Exchange', `Received ${response.data.result.list.length} candles for ${symbol}`);

      return response.data.result.list.map((candle: string[]) => ({
        timestamp: parseInt(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));
    } catch (error) {
      this.logger.error('Exchange', `Error fetching candles for ${symbol}`, error);
      throw error;
    }
  }

  /**
   * Convert standard timeframe format to Bybit specific format
   * @param timeframe Timeframe in standard format (e.g. 15m, 1h, 4h, 1d)
   * @returns Bybit specific timeframe
   */
  private convertTimeframeToBybit(timeframe: string): string {
    const mapping: Record<string, string> = {
      '1m': '1',
      '3m': '3',
      '5m': '5',
      '15m': '15',
      '30m': '30',
      '1h': '60',
      '2h': '120',
      '4h': '240',
      '6h': '360',
      '12h': '720',
      '1d': 'D',
      '1w': 'W',
      '1M': 'M'
    };

    const bybitTimeframe = mapping[timeframe];
    if (!bybitTimeframe) {
      this.logger.error('Exchange', `Unsupported timeframe: ${timeframe}`);
      throw new Error(`Unsupported timeframe: ${timeframe}`);
    }

    return bybitTimeframe;
  }

  /**
   * Get recent trades for a symbol
   * @param symbol Symbol name (e.g. BTCUSDT)
   * @param limit Number of trades to get (default: 500, max: 1000)
   * @returns Recent trades
   */
  async getRecentTrades(symbol: string, limit = 500) {
    try {
      this.logger.debug('Exchange', `Fetching recent trades for ${symbol}`, { limit });

      const response = await axios.get(`${this.baseUrl}/v5/market/recent-trade`, {
        params: {
          category: 'linear',
          symbol: symbol.toUpperCase(),
          limit,
        },
      });

      if (response.data.retCode !== 0) {
        this.logger.error('Exchange', `Bybit API error: ${response.data.retMsg}`, {
          symbol,
          retCode: response.data.retCode
        });
        throw new Error(`Bybit API error: ${response.data.retMsg}`);
      }

      this.logger.debug('Exchange', `Received ${response.data.result.list.length} trades for ${symbol}`);
      return response.data.result.list;
    } catch (error) {
      this.logger.error('Exchange', `Error fetching recent trades for ${symbol}`, error);
      throw error;
    }
  }

  /**
   * Get mark price for a symbol
   * @param symbol Symbol name (e.g. BTCUSDT)
   * @returns Mark price info
   */
  async getMarkPrice(symbol: string) {
    try {
      this.logger.debug('Exchange', `Fetching mark price for ${symbol}`);

      const response = await axios.get(`${this.baseUrl}/v5/market/tickers`, {
        params: {
          category: 'linear',
          symbol: symbol.toUpperCase(),
        },
      });

      if (response.data.retCode !== 0) {
        this.logger.error('Exchange', `Bybit API error: ${response.data.retMsg}`, {
          symbol,
          retCode: response.data.retCode
        });
        throw new Error(`Bybit API error: ${response.data.retMsg}`);
      }

      const markPrice = response.data.result.list[0];
      this.logger.debug('Exchange', `Mark price for ${symbol}`, { price: markPrice.lastPrice });

      return markPrice;
    } catch (error) {
      this.logger.error('Exchange', `Error fetching mark price for ${symbol}`, error);
      throw error;
    }
  }

  /**
   * Get order book for a symbol
   * @param symbol Symbol name (e.g. BTCUSDT)
   * @param limit Depth of the order book (default: 100, max: 1000)
   * @returns Order book data
   */
  async getOrderBook(symbol: string, limit = 100) {
    try {
      this.logger.debug('Exchange', `Fetching order book for ${symbol}`, { limit });

      const response = await axios.get(`${this.baseUrl}/v5/market/orderbook`, {
        params: {
          category: 'linear',
          symbol: symbol.toUpperCase(),
          limit,
        },
      });

      if (response.data.retCode !== 0) {
        this.logger.error('Exchange', `Bybit API error: ${response.data.retMsg}`, {
          symbol,
          retCode: response.data.retCode
        });
        throw new Error(`Bybit API error: ${response.data.retMsg}`);
      }

      this.logger.debug('Exchange', `Received order book for ${symbol}`);
      return response.data.result;
    } catch (error) {
      this.logger.error('Exchange', `Error fetching order book for ${symbol}`, error);
      throw error;
    }
  }

  /**
   * Get funding rate history for a symbol
   * @param symbol Symbol name (e.g. BTCUSDT)
   * @param limit Number of funding rates to get (default: 100, max: 1000)
   * @returns Funding rate history
   */
  async getFundingRateHistory(symbol: string, limit = 100) {
    try {
      this.logger.debug('Exchange', `Fetching funding rate history for ${symbol}`, { limit });

      const response = await axios.get(`${this.baseUrl}/v5/market/funding/history`, {
        params: {
          category: 'linear',
          symbol: symbol.toUpperCase(),
          limit,
        },
      });

      if (response.data.retCode !== 0) {
        this.logger.error('Exchange', `Bybit API error: ${response.data.retMsg}`, {
          symbol,
          retCode: response.data.retCode
        });
        throw new Error(`Bybit API error: ${response.data.retMsg}`);
      }

      this.logger.debug('Exchange', `Received ${response.data.result.list.length} funding rates for ${symbol}`);
      return response.data.result.list;
    } catch (error) {
      this.logger.error('Exchange', `Error fetching funding rate history for ${symbol}`, error);
      throw error;
    }
  }

  /**
   * Generic signed request to the exchange API (private endpoints)
   * @param endpoint API endpoint
   * @param method HTTP method
   * @param params Request parameters
   * @returns Response data
   */
  async signedRequest(endpoint: string, method = 'GET', params: any = {}) {
    if (!this.apiKey || !this.apiSecret) {
      this.logger.error('Exchange', 'API key and secret required for signed requests');
      throw new Error('API key and secret required for signed requests');
    }

    const timestamp = Date.now();
    const recvWindow = 5000;

    // Prepare parameters for signature
    const queryParams = {
      ...params,
      api_key: this.apiKey,
      timestamp,
      recv_window: recvWindow
    };

    // Sort parameters alphabetically by key
    const sortedParams = Object.keys(queryParams)
      .sort()
      .reduce((result: Record<string, any>, key) => {
        result[key] = queryParams[key];
        return result;
      }, {});

    // Convert to query string
    const queryString = Object.keys(sortedParams)
      .map(key => `${key}=${sortedParams[key]}`)
      .join('&');

    // Create signature
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');

    try {
      const url = `${this.baseUrl}${endpoint}`;

      this.logger.debug('Exchange', `Making ${method} request to ${endpoint}`, { method, timestamp });

      // Add signature to parameters
      const requestParams = {
        ...sortedParams,
        sign: signature
      };

      let response;
      if (method === 'GET') {
        response = await axios.get(url, { params: requestParams });
      } else if (method === 'POST') {
        response = await axios.post(url, requestParams);
      }

      if (response?.data?.retCode !== 0) {
        this.logger.error('Exchange', `Bybit API error: ${response?.data?.retMsg}`, {
          endpoint,
          method,
          retCode: response?.data?.retCode
        });
        throw new Error(`Bybit API error: ${response?.data?.retMsg}`);
      }

      this.logger.debug('Exchange', `Successful ${method} request to ${endpoint}`);
      return response?.data?.result;
    } catch (error) {
      this.logger.error('Exchange', `Error in signed request to ${endpoint}`, error);
      throw error;
    }
  }
}