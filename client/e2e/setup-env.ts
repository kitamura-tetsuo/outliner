// このファイルはテスト実行前にロードされ、環境変数を設定します
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// .env.testファイルのパス
const envTestPath = path.join(__dirname, '..', '.env.test');

// ファイルが存在するか確認
if (fs.existsSync(envTestPath)) {
  console.log('Loading test environment from:', envTestPath);
  // 環境変数を読み込む
  const result = dotenv.config({ path: envTestPath, override: true });

  if (result.error) {
    console.error('Error loading .env.test file:', result.error);
  } else {
    console.log('Successfully loaded test environment variables');

    // 主要な環境変数をログに出力
    console.log('VITE_USE_TINYLICIOUS:', process.env.VITE_USE_TINYLICIOUS);
    console.log('VITE_FORCE_AZURE:', process.env.VITE_FORCE_AZURE);
    console.log('VITE_API_BASE_URL:', process.env.VITE_API_BASE_URL);

    // テスト環境であることを明示
    process.env.NODE_ENV = 'test';
    process.env.VITE_IS_TEST = 'true';
  }
} else {
  console.warn('.env.test file not found at:', envTestPath);
}

// グローバル環境にテスト用フラグを設定
global.isTestEnvironment = true;

// Mark this as an E2E test environment
window.isE2ETest = true;

// Add URL parameter to trigger test account login
const url = new URL(window.location.href);
url.searchParams.set('e2e-test', 'true');
window.history.replaceState({}, '', url.toString());
