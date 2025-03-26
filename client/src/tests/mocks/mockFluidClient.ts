import { ConnectionState } from "fluid-framework";
import { FluidClient } from "../../fluid/fluidClient";

// テスト用のFluidClientをモックする
export function setupMockFluidClient() {
  const originalGetInstance = FluidClient.getInstance;

  // シングルトンのgetInstanceをオーバーライドしてモックを返す
  FluidClient.getInstance = jest.fn().mockImplementation(() => {
    // 既存のインスタンスがあれば使用
    if ((FluidClient as any)._mockInstance) {
      return (FluidClient as any)._mockInstance;
    }

    // モックインスタンスの作成
    const mockClient = {
      isConnected: true,
      connectionState: ConnectionState.Connected,
      containerId: 'mock-container-id',
      initialize: jest.fn().mockResolvedValue({}),
      getConnectionStateString: jest.fn().mockReturnValue('接続済み'),
      getTree: jest.fn().mockReturnValue([{ id: 'item1', text: 'テストアイテム' }]),
      getDebugInfo: jest.fn().mockReturnValue({
        containerConnected: true,
        connectionState: '接続済み',
        containerId: 'mock-container-id'
      }),
      dispose: jest.fn()
    };

    // モックをキャッシュ
    (FluidClient as any)._mockInstance = mockClient;
    return mockClient;
  });

  // クリーンアップ関数を返す
  return () => {
    FluidClient.getInstance = originalGetInstance;
    delete (FluidClient as any)._mockInstance;
  };
}
