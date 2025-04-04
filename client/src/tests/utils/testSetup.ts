/**
 * テスト用のユーティリティ関数。WindowグローバルオブジェクトにモックFluidClientフラグを設定し、
 * テスト実行時に実際のTinyliciousサーバーに接続するモックFluidClientを使用できるようにします。
 */
export function setupTestEnvironment() {
  if (typeof window !== 'undefined') {
    // テスト環境でモックFluidClientを使用することを示すフラグ
    window.mockFluidClient = true;
    
    // テスト用のモックユーザー情報を設定
    window.mockUser = {
      id: 'test-user-id',
      name: 'Test User',
      email: 'test@example.com'
    };
    
    // テスト用のモックトークン情報を設定
    window.mockFluidToken = {
      token: 'mock-jwt-token',
      user: {
        id: 'test-user-id',
        name: 'Test User'
      }
    };
    
    // 認証済み状態にする
    window.localStorage.setItem('authenticated', 'true');
    
    // TinyliciousをFluid Relayサービスとして使用するための環境変数を設定
    window.localStorage.setItem('VITE_USE_TINYLICIOUS', 'true');
    window.localStorage.setItem('VITE_TINYLICIOUS_PORT', '7082');
    
    console.log('Test environment setup completed. Using MockFluidClient with Tinylicious.');
  }
}