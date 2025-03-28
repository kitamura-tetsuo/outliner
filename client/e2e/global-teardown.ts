import { ChildProcess } from 'child_process';
import findProcess from 'find-process';
import path from 'path';
import pino from 'pino';
import { fileURLToPath } from 'url';

// ESモジュールで__dirnameを使うための設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// pinoロガーを設定
const logger = pino({
  level: 'info',
  // }, pino.destination('/logs/tinylicious-server.log'));
}, pino.destination(path.join(__dirname, './logs/tinylicious-server.log')));

// グローバル変数の型定義
declare global {
  var __tinyliciousProcess: ChildProcess | null;
}

// Tinylicious サーバーのポート
const TINYLICIOUS_PORT = process.env.VITE_TINYLICIOUS_PORT || '7170';

/**
 * テスト全体の実行後に1度だけ呼び出される後処理
 */
async function globalTeardown(config: any) {
  // グローバル変数からTinyliciousプロセスを取得して停止
  const tinyliciousProcess = global.__tinyliciousProcess;

  if (tinyliciousProcess) {
    logger.info('Stopping Tinylicious process via reference');
    tinyliciousProcess.kill();
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 万が一プロセスが残っている場合に備え、ポート7170を使用しているすべてのプロセスを終了
  try {
    logger.info(`Finding processes using port ${TINYLICIOUS_PORT}`);
    const portNumber = parseInt(TINYLICIOUS_PORT);
    const processList = await findProcess('port', portNumber);

    if (processList.length > 0) {
      logger.info(`Found ${processList.length} processes using port ${TINYLICIOUS_PORT}`);

      // 各プロセスを強制終了
      for (const proc of processList) {
        logger.info(`Killing process ${proc.pid} (${proc.name}) using port ${TINYLICIOUS_PORT}`);
        try {
          process.kill(proc.pid);
          logger.info(`Successfully killed process ${proc.pid}`);
        } catch (killError) {
          logger.error(`Failed to kill process ${proc.pid}: ${killError}`);
        }
      }
    } else {
      logger.info(`No processes found using port ${TINYLICIOUS_PORT}`);
    }
  } catch (error) {
    logger.error(`Error finding or killing processes on port ${TINYLICIOUS_PORT}:`, error);
  }

  logger.info('Tinylicious server cleanup completed');

  // 完全に終了するまで少し待機
  await new Promise(resolve => setTimeout(resolve, 1000));
}

export default globalTeardown;
