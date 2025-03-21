import schedule from "node-schedule";
import { Logger, LogLevel } from "../utils/logger";
import { processAllPendingSignals } from "./tradeExecutor";

// シグナルの処理スケジュール（30秒ごと）
const SIGNAL_PROCESSING_CRON = "*/30 * * * * *";

// シグナル処理ジョブ
let signalProcessingJob: schedule.Job | null = null;

// Loggerの初期化
const logger = new Logger({
  level: LogLevel.INFO,
  enableTimestamp: true,
  enableColors: true,
});

/**
 * シグナル処理スケジューラを開始
 */
export function startSignalProcessing(): void {
  // すでに実行中のジョブがあれば停止
  if (signalProcessingJob) {
    signalProcessingJob.cancel();
  }

  logger.info("Trading", "自動売買シグナルの処理スケジューラを開始しました");

  // スケジュールを設定
  signalProcessingJob = schedule.scheduleJob(SIGNAL_PROCESSING_CRON, async () => {
    try {
      logger.debug("Trading", `未処理シグナルの検索中: ${new Date().toISOString()}`);
      const processedSignals = await processAllPendingSignals();

      if (processedSignals.length > 0) {
        logger.info("Trading", `${processedSignals.length}件のシグナルを処理しました`);

        // 処理されたシグナルの詳細をログに記録
        processedSignals.forEach((signal) => {
          logger.info(
            "Execution",
            `${signal.symbol}の${signal.direction}シグナルを実行しました (ID: ${signal.id}, 戦略: ${signal.strategy})`,
          );
        });
      }
    } catch (error) {
      logger.error(
        "Trading",
        `シグナル処理中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

/**
 * シグナル処理スケジューラを停止
 */
export function stopSignalProcessing(): void {
  if (signalProcessingJob) {
    signalProcessingJob.cancel();
    signalProcessingJob = null;
    logger.info("Trading", "自動売買シグナルの処理スケジューラを停止しました");
  }
}

// アプリケーション終了時にスケジューラを停止
process.on("SIGINT", () => {
  stopSignalProcessing();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopSignalProcessing();
  process.exit(0);
});
