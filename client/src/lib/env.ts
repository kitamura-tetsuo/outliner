// dotenvを直接importしてテスト時に.env.testを読み込めるようにする

/**
 * 環境変数を取得する関数
 * @param key 環境変数のキー
 * @param defaultValue デフォルト値
 * @returns 環境変数の値、または未定義の場合はデフォルト値
 */
export function getEnv(key: string, defaultValue: string = ''): string {
  // 実行環境の検出
  const isTestEnv =
    import.meta.env.MODE === 'test' ||
    process.env.NODE_ENV === 'test' ||
    import.meta.env.VITE_IS_TEST === 'true';

  // テスト環境専用の処理
  if (isTestEnv) {
    // テスト関連のログ出力
    if (key === 'VITE_USE_TINYLICIOUS' || key === 'VITE_FORCE_AZURE' || key === 'VITE_API_BASE_URL') {
      console.log(`[env] Test environment detected, checking value for ${key}`);
    }

    // 環境変数から直接値を取得
    const envValue = import.meta.env[key];
    if (envValue !== undefined) {
      console.log(`[env] Using value for ${key}: ${envValue}`);
      return envValue;
    }

    // テスト環境のデフォルト値
    if (key === 'VITE_USE_TINYLICIOUS') return 'true';
    if (key === 'VITE_FORCE_AZURE') return 'false';
    if (key === 'VITE_API_BASE_URL') return 'http://localhost:7071';
  }

  return import.meta.env[key] || defaultValue;
}

/**
 * デバッグ用の環境設定を取得する関数
 */
export function getDebugConfig() {
  return {
    isDevelopment: import.meta.env.DEV,
    host: typeof window !== 'undefined' ? window.location.host : 'server-side',
    nodeEnv: import.meta.env.MODE,
    fluidEndpoint: import.meta.env.VITE_AZURE_FLUID_RELAY_ENDPOINT || 'development-endpoint'
  };
}
