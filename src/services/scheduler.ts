import schedule from "node-schedule";
import { processAllPendingSignals } from "./tradeExecutor";

// シグナルの処理スケジュール（1分ごと）
const SIGNAL_PROCESSING_CRON = "*/1 * * * *";

// シグナル処理ジョブ
let signalProcessingJob: schedule.Job | null = null;

/**
 * シグナル処理スケジューラを開始
 */
export function startSignalProcessing(): void {
  // すでに実行中のジョブがあれば停止
  if (signalProcessingJob) {
    signalProcessingJob.cancel();
  }

  console.log("start signal processing");

  // スケジュールを設定
  signalProcessingJob = schedule.scheduleJob(SIGNAL_PROCESSING_CRON, async () => {
    try {
      console.log(`start signal processing: ${new Date().toISOString()}`);
      await processAllPendingSignals();
    } catch (error) {
      console.error("schedule execution error:", error);
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
    console.log("stop signal processing");
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
