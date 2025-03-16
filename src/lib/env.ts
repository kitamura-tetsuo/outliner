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

// デバッグするとき用の設定取得関数
export const getDebugConfig = () => {
	return {
		userId: getEnv('VITE_DEBUG_USER_ID', 'dev-user'),
		userName: getEnv('VITE_DEBUG_USER_NAME', 'Developer'),
		fluidEndpoint: getEnv('VITE_AZURE_FLUID_RELAY_ENDPOINT', 'http://0.0.0.0:7070'),
		tenantId: getEnv('VITE_AZURE_TENANT_ID', 'your-tenant-id')
	};
};
