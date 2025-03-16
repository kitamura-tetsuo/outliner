/**
 * VSCodeデバッグ用のヘルパー関数
 * このファイルにブレークポイントを設定して、デバッグセッション中に使用できます。
 */

// デバッガーのためのグローバル参照にアクセスするヘルパー
export function getFluidClient() {
	if (typeof window === 'undefined') {
		console.error('Window is not defined (server-side context)');
		return null;
	}

	const client = (window as any).__FLUID_CLIENT__;

	if (!client) {
		console.error('FluidClient not found on window.__FLUID_CLIENT__');
		return null;
	}

	return client;
}

// VSCodeデバッガーからこの関数を呼び出すと、FluidClientの状態を検査できます
export function inspectFluidState() {
	const client = getFluidClient();
	if (!client) return null;

	// デバッガーのためのブレークポイント
	debugger;

	return {
		containerId: client.containerId,
		isConnected: client.container?.connected || false,
		treeData: client.getAllData(),
		textContent: client.getText(),
		clientState: client.getDebugInfo()
	};
}

// VSCodeデバッガーでSharedTreeにデータを追加するためのヘルパー
export function setTreeData(key: string, value: any) {
	const client = getFluidClient();
	if (!client) return;

	try {
		client.setData(key, value);
		return {
			success: true,
			key,
			value,
			allData: client.getAllData()
		};
	} catch (error) {
		console.error('Error setting tree data:', error);
		debugger;
		return { success: false, error };
	}
}

// VSCodeデバッガーでエラーをシミュレートするためのヘルパー
export function simulateError() {
	const client = getFluidClient();
	if (!client) return;

	try {
		console.log('Simulating an error for debugging purposes...');
		// わざとエラーを発生させる
		const nonExistentMethod = (client as any).nonExistentMethod();
		return nonExistentMethod;
	} catch (error) {
		// デバッガーでここに停止します
		debugger;
		console.error('Simulated error caught:', error);
		throw error;
	}
}
