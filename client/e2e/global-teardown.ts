// import { FullConfig } from '@playwright/test';
import { ChildProcess } from 'child_process';

// グローバル変数の型定義
declare global {
  var __tinyliciousProcess: ChildProcess | null;
}

/**
 * テスト全体の実行後に1度だけ呼び出される後処理
 */
async function globalTeardown(config: any) {
  // グローバル変数からTinyliciousプロセスを取得
  const tinyliciousProcess = global.__tinyliciousProcess;

  if (tinyliciousProcess) {
    console.log('Stopping Tinylicious server');
    tinyliciousProcess.kill();
    // 完全に終了するまで少し待機
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

export default globalTeardown;
