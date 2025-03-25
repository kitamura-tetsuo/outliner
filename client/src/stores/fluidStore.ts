import { writable } from 'svelte/store';
import { UserManager } from '../auth/UserManager';
import { FluidClient } from '../fluid/fluidClient';

// FluidClientのインスタンスを保持するStore
export const fluidClient = writable<FluidClient | null>(null);

// ユーザー認証状態の変更を監視して、FluidClientを初期化/更新する
export async function initFluidClientWithAuth() {
  const userManager = UserManager.getInstance();

  // 認証状態の変更を監視
  userManager.addEventListener(async (authResult) => {
    if (authResult) {
      console.log('認証成功により、Fluidクライアントを初期化します');
      try {
        // FluidClientのインスタンスを作成して初期化
        const client = new FluidClient();
        await client.initialize();

        // Storeに保存
        fluidClient.set(client);

        // デバッグ用にグローバル変数に設定
        if (typeof window !== 'undefined') {
          (window as any).__FLUID_CLIENT__ = client;
        }
      } catch (error) {
        console.error('FluidClient初期化エラー:', error);
        fluidClient.set(null);
      }
    } else {
      console.log('ログアウトにより、Fluidクライアントをリセットします');
      fluidClient.set(null);
      if (typeof window !== 'undefined') {
        delete (window as any).__FLUID_CLIENT__;
      }
    }
  });

  // 既に認証済みの場合は初期化を試行
  const currentUser = userManager.getCurrentUser();
  if (currentUser) {
    try {
      const client = new FluidClient();
      await client.initialize();
      fluidClient.set(client);

      if (typeof window !== 'undefined') {
        (window as any).__FLUID_CLIENT__ = client;
      }
    } catch (error) {
      console.error('既存ユーザーでのFluidClient初期化エラー:', error);
    }
  }
}

// アプリ起動時に初期化を実行
if (typeof window !== 'undefined') {
  initFluidClientWithAuth();
}
