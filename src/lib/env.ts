/**
 * ブラウザとサーバーの両方で環境変数にアクセスするためのヘルパー
 */
export const getEnv = (key: string, defaultValue: string = ''): string => {
	// ブラウザ環境
	if (typeof window !== 'undefined') {
		return (import.meta.env?.[key] || defaultValue) as string;
	}

	// サーバー環境
	return process.env[key] || defaultValue;
};

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
