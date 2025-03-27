// import { FullConfig } from '@playwright/test';
import { ChildProcess, spawn } from 'child_process';

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
  console.log('Starting Tinylicious server on port', TINYLICIOUS_PORT);

  // Tinyliciousサーバーを起動
  const tinyliciousProcess = spawn('npx', ['tinylicious', '--port', TINYLICIOUS_PORT], {
    stdio: 'pipe',
    shell: true,
    env: { ...process.env }
  });

  // 出力をログに記録
  tinyliciousProcess.stdout?.on('data', (data) => {
    console.log(`Tinylicious: ${data}`);
  });

  tinyliciousProcess.stderr?.on('data', (data) => {
    console.error(`Tinylicious error: ${data}`);
  });

  // サーバーが起動するまで待機
  await new Promise(resolve => setTimeout(resolve, 3000));

  // グローバル変数に保存
  global.__tinyliciousProcess = tinyliciousProcess;
}

export default globalSetup;
