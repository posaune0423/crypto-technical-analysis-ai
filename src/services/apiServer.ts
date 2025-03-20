import express, { Request, RequestHandler, Response, Router } from "express";
import http from "http";
import WebSocket from "ws";
import { config } from "../config";
import { AnalysisResult, AssetConfig } from "../types";
import { MonitorService } from "./monitorService";

export class ApiServer {
  private app: express.Application;
  private router: Router;
  private server: http.Server;
  private wss: WebSocket.Server;
  private monitorService: MonitorService;
  private port: number;

  constructor(monitorService: MonitorService) {
    this.app = express();
    this.router = express.Router();
    this.monitorService = monitorService;
    this.port = config.app.port;

    // Create HTTP server
    this.server = http.createServer(this.app);

    // Create WebSocket server
    this.wss = new WebSocket.Server({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();

    // Use router with app
    this.app.use(this.router);

    // 404 handler - must be the last middleware
    this.app.use(this.handleNotFound);
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS middleware
    this.app.use((req: Request, res: Response, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      next();
    });

    // Request logging middleware
    this.app.use((req: Request, res: Response, next) => {
      console.log(`${req.method} ${req.url}`);
      next();
    });
  }

  /**
   * 404 Not Found handler
   */
  private handleNotFound: RequestHandler = (req, res) => {
    res.status(404).json({
      status: "error",
      message: "Endpoint not found",
    });
  };

  /**
   * Handler for adding a new asset
   */
  private handleAddAsset: RequestHandler = (req, res) => {
    const { symbol, timeframes, alert } = req.body;

    if (!symbol) {
      res.status(400).json({
        status: "error",
        message: "Symbol is required",
      });
      return;
    }

    const asset: AssetConfig = {
      symbol,
      timeframes: timeframes || config.timeframes,
      alert: {
        enabled: alert?.enabled !== undefined ? alert.enabled : true,
        threshold: alert?.threshold || config.alerts.threshold,
        indicators: alert?.indicators || ["RSI", "MACD", "BOLLINGER", "EMA", "VOLUME"],
      },
    };

    this.monitorService.addAsset(asset);

    res.json({
      status: "ok",
      message: `Added ${symbol} to monitored assets`,
      data: asset,
    });
  };

  /**
   * Handler for updating polling interval
   */
  private handleUpdateInterval: RequestHandler = (req, res) => {
    const { interval } = req.body;

    if (!interval || interval < 1000) {
      res.status(400).json({
        status: "error",
        message: "Interval must be at least 1000ms",
      });
      return;
    }

    this.monitorService.setPollingInterval(interval);

    res.json({
      status: "ok",
      message: `Polling interval updated to ${interval}ms`,
    });
  };

  /**
   * Set up API routes
   */
  private setupRoutes(): void {
    // Root endpoint
    this.router.get("/", (req: Request, res: Response) => {
      res.json({
        status: "ok",
        message: "Crypto Technical Analysis AI API is running",
      });
    });

    // Get all monitored assets
    this.router.get("/api/assets", (req: Request, res: Response) => {
      res.json({
        status: "ok",
        data: this.monitorService.getAssets(),
      });
    });

    // Add new asset to monitor
    this.router.post("/api/assets", this.handleAddAsset);

    // Remove an asset from monitoring
    this.router.delete("/api/assets/:symbol", (req: Request, res: Response) => {
      const { symbol } = req.params;

      this.monitorService.removeAsset(symbol);

      res.json({
        status: "ok",
        message: `Removed ${symbol} from monitored assets`,
      });
    });

    // Start monitoring
    this.router.post("/api/monitor/start", (req: Request, res: Response) => {
      this.monitorService.start();

      res.json({
        status: "ok",
        message: "Market monitoring started",
      });
    });

    // Stop monitoring
    this.router.post("/api/monitor/stop", (req: Request, res: Response) => {
      this.monitorService.stop();

      res.json({
        status: "ok",
        message: "Market monitoring stopped",
      });
    });

    // Update polling interval
    this.router.put("/api/monitor/interval", this.handleUpdateInterval);
  }

  /**
   * Set up WebSocket server
   */
  private setupWebSocket(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      console.log("Client connected to WebSocket");

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: "connection",
          message: "Connected to Crypto Technical Analysis AI WebSocket",
          timestamp: Date.now(),
        }),
      );

      // Handle client messages
      ws.on("message", (messageData: WebSocket.Data) => {
        try {
          const message = messageData.toString();
          const data = JSON.parse(message);

          // Handle different message types
          if (data.type === "subscribe") {
            console.log(`Client subscribed to ${data.symbols}`);
            // You can store client subscriptions here
            ws.send(
              JSON.stringify({
                type: "subscribed",
                symbols: data.symbols,
              }),
            );
          }
        } catch (error) {
          console.error("Error handling WebSocket message:", error);
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid message format",
            }),
          );
        }
      });

      // Handle disconnection
      ws.on("close", () => {
        console.log("Client disconnected from WebSocket");
      });
    });
  }

  /**
   * Start the server
   */
  start(): void {
    this.server.listen(this.port, () => {
      console.log(`Server running on port ${this.port}`);
    });
  }

  /**
   * Broadcast analysis result to all connected WebSocket clients
   * @param result Analysis result to broadcast
   */
  broadcastAnalysisResult(result: AnalysisResult): void {
    if (this.wss.clients.size === 0) {
      return; // No clients connected
    }

    const message = JSON.stringify({
      type: "analysis",
      data: result,
      timestamp: Date.now(),
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Broadcast alert to all connected WebSocket clients
   * @param alert Alert to broadcast
   */
  broadcastAlert(alert: any): void {
    if (this.wss.clients.size === 0) {
      return; // No clients connected
    }

    const message = JSON.stringify({
      type: "alert",
      data: alert,
      timestamp: Date.now(),
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}
