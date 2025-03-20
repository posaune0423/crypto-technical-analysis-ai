import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import { config } from './config/config';
import { MonitorService } from './services/monitorService';
import { TechnicalAnalysisService } from './services/technicalAnalysisService';
import { ExchangeService } from './services/exchangeService';
import { Logger, LogLevel } from './utils/logger';

// Initialize logger
const logger = new Logger({
  level: config.app.nodeEnv === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  enableTimestamp: true,
  enableColors: true,
});

async function main() {
  logger.info('App', 'Starting Crypto Technical Analysis AI Agent');
  logger.info('App', '==========================================');
  logger.info('App', `Environment: ${config.app.nodeEnv}`);

  try {
    // Initialize services
    const exchangeService = new ExchangeService();
    const technicalAnalysisService = new TechnicalAnalysisService();
    const monitorService = new MonitorService();

    // Create Express app
    const app = express();
    const port = config.app.port;

    // Middleware
    app.use(express.json());

    // Create HTTP server
    const server = http.createServer(app);

    // Create WebSocket server
    const wss = new WebSocket.Server({ server });

    // WebSocket connection
    wss.on('connection', (ws) => {
      logger.info('WebSocket', 'Client connected');

      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to Crypto Technical Analysis AI',
        timestamp: Date.now()
      }));

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          logger.debug('WebSocket', 'Received message', data);

          // Handle message types
          if (data.type === 'subscribe') {
            ws.send(JSON.stringify({
              type: 'subscribed',
              message: `Subscribed to ${data.symbols}`,
              symbols: data.symbols
            }));
            logger.info('WebSocket', `Client subscribed to ${data.symbols}`);
          }
        } catch (error) {
          logger.error('WebSocket', 'Error processing message', error);
        }
      });

      ws.on('close', () => {
        logger.info('WebSocket', 'Client disconnected');
      });
    });

    // API Routes
    app.get('/', (req, res) => {
      res.json({
        status: 'ok',
        message: 'Crypto Technical Analysis AI API is running'
      });
    });

    app.get('/api/assets', (req, res) => {
      logger.debug('API', 'GET /api/assets - Fetching assets');
      res.json({
        status: 'ok',
        data: monitorService.getAssets()
      });
    });

    app.post('/api/assets', (req, res) => {
      const { symbol, timeframes } = req.body;
      logger.debug('API', 'POST /api/assets', { symbol, timeframes });

      if (!symbol) {
        logger.warn('API', 'Missing symbol in request');
        res.status(400).json({
          status: 'error',
          message: 'Symbol is required'
        });
        return;
      }

      const asset = {
        symbol,
        timeframes: timeframes || config.timeframes,
        alert: {
          enabled: true,
          threshold: config.alerts.threshold,
          indicators: ['RSI', 'MACD', 'BOLLINGER', 'EMA', 'VOLUME']
        }
      };

      monitorService.addAsset(asset);
      logger.info('API', `Added asset ${symbol} to monitoring`);

      res.json({
        status: 'ok',
        message: `Added ${symbol} to monitored assets`,
        data: asset
      });
    });

    app.post('/api/monitor/start', (req, res) => {
      logger.info('API', 'Starting market monitor');
      monitorService.start();

      res.json({
        status: 'ok',
        message: 'Market monitoring started'
      });
    });

    app.post('/api/monitor/stop', (req, res) => {
      logger.info('API', 'Stopping market monitor');
      monitorService.stop();

      res.json({
        status: 'ok',
        message: 'Market monitoring stopped'
      });
    });

    // Manual analysis endpoint
    app.post('/api/analyze', async (req, res) => {
      const { symbol, timeframe } = req.body;
      logger.debug('API', 'POST /api/analyze', { symbol, timeframe });

      if (!symbol || !timeframe) {
        logger.warn('API', 'Missing required parameters', { symbol, timeframe });
        res.status(400).json({
          status: 'error',
          message: 'Symbol and timeframe are required'
        });
        return;
      }

      try {
        // Get candles
        logger.debug('API', `Fetching candles for ${symbol} on ${timeframe}`);
        const candles = await exchangeService.getCandles(symbol, timeframe, 100);

        if (candles.length < 50) {
          logger.warn('API', `Not enough data for analysis: ${candles.length} candles`);
          res.status(400).json({
            status: 'error',
            message: 'Not enough data for analysis'
          });
          return;
        }

        // Run analysis
        logger.info('API', `Analyzing ${symbol} on ${timeframe}`);
        const analysis = technicalAnalysisService.analyzeMarket(symbol, timeframe, candles);

        // Return result
        res.json({
          status: 'ok',
          data: analysis
        });
      } catch (error) {
        logger.error('API', `Analysis error for ${symbol}:${timeframe}`, error);
        res.status(500).json({
          status: 'error',
          message: 'Failed to analyze market'
        });
      }
    });

    // Start the server
    server.listen(port, () => {
      logger.info('Server', `Running on port ${port}`);

      // Start monitoring after a short delay
      setTimeout(() => {
        logger.info('Monitor', 'Starting market monitor');
        monitorService.start();
      }, 1000);
    });

    // Handle process termination
    process.on('SIGINT', () => {
      logger.info('App', 'Shutting down...');
      monitorService.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('App', 'Shutting down...');
      monitorService.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('App', 'Failed to start application', error);
    process.exit(1);
  }
}

// Start application
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});