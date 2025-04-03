import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { fileURLToPath } from 'url';

// ESモジュールで__dirnameを使うための設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ログディレクトリの作成
// const logDir = '/logs');
const logDir = path.join(__dirname, './logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// pinoロガーを設定
const logger = pino({
  level: 'info',
}, pino.destination(path.join(logDir, 'tinylicious-server.log')));

// グローバル変数の型定義を追加
declare global {
  var __tinyliciousProcess: ChildProcess | null;
}

// Tinyliciousサーバーのポートは設定ファイルと同期
const TINYLICIOUS_PORT = process.env.VITE_TINYLICIOUS_PORT || '7170';

/**
 * テスト全体の実行前に1度だけ呼び出される設定
 */
async function globalSetup(config: any) {
  logger.info(`Starting Tinylicious server on port ${TINYLICIOUS_PORT}`);

  // Tinyliciousサーバーを起動（正しく PORT 環境変数を設定）
  const tinyliciousProcess = spawn('npx', ['tinylicious'], {
    stdio: 'pipe',
    shell: true,
    env: {
      ...process.env,
      PORT: TINYLICIOUS_PORT  // PORTを環境変数として正しく設定
    },
    cwd: __dirname
  });

  // 出力をログに記録
  tinyliciousProcess.stdout?.on('data', (data) => {
    logger.info(`Tinylicious: ${data.toString().trim()}`);
  });

  tinyliciousProcess.stderr?.on('data', (data) => {
    logger.error(`Tinylicious error: ${data.toString().trim()}`);
  });

  // サーバーが起動するまで待機
  await new Promise(resolve => setTimeout(resolve, 7073));
  logger.info('Tinylicious server startup wait completed');

  // グローバル変数に保存
  global.__tinyliciousProcess = tinyliciousProcess;
}

export default globalSetup;
