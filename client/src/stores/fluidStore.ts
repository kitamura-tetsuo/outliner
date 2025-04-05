import { writable } from 'svelte/store';
import { UserManager } from '../auth/UserManager';
import { FluidClient } from '../fluid/fluidClient';

// テスト環境用にMockFluidClientをインポート
// import { MockFluidClient, setupMockFluidClient } from '../tests/mocks/mockFluidClient';

// FluidClientのインスタンスを保持するStore
export const fluidClient = writable<FluidClient | null>(null);

// 初期化中フラグを追跡するための変数
let isInitializing = false;
let unsubscribeAuth: (() => void) | null = null;

// モックのクリーンアップ関数
let mockCleanup: (() => void) | null = null;

// ユーザー認証状態の変更を監視して、FluidClientを初期化/更新する
export async function initFluidClientWithAuth() {
  // // テスト環境の場合は自動的にモックを使用
  // if (import.meta.env.VITE_IS_TEST === 'true' || typeof window !== 'undefined' && (window as any).mockFluidClient) {
  //   console.log('[fluidStore] Test environment detected, using mock FluidClient');

  //   // モックセットアップしてクリーンアップ関数を保存
  //   mockCleanup = setupMockFluidClient();

  //   // FluidClientのインスタンスを取得して初期化
  //   const client = FluidClient.getInstance();
  //   await client.initialize();

  //   fluidClient.set(client);

  //   // デバッグ用にグローバル変数に設定
  //   if (typeof window !== 'undefined') {
  //     (window as any).__FLUID_CLIENT__ = client;
  //   }

  //   return;
  // }

  // 既に初期化中なら何もしない
  if (isInitializing) {
    console.log('FluidClient初期化は既に実行中です。重複呼び出しをスキップします。');
    return;
  }

  // 以前のリスナーがあればクリーンアップ
  if (unsubscribeAuth) {
    unsubscribeAuth();
    unsubscribeAuth = null;
  }

  isInitializing = true;
  const userManager = UserManager.getInstance();

  // 認証状態の変更を監視
  unsubscribeAuth = userManager.addEventListener(async (authResult) => {
    try {
      if (authResult) {
        console.log('認証成功により、Fluidクライアントを初期化します');

        // FluidClientのシングルトンインスタンスを取得し初期化
        const client = FluidClient.getInstance();
        await client.initialize();

        // Storeに保存
        fluidClient.set(client);

        // デバッグ用にグローバル変数に設定
        if (typeof window !== 'undefined') {
          (window as any).__FLUID_CLIENT__ = client;
        }
      } else {
        console.log('ログアウトにより、Fluidクライアントをリセットします');
        // 注意: シングルトンインスタンスはリセットせず、ストアからの参照のみ削除
        fluidClient.set(null);
        if (typeof window !== 'undefined') {
          delete (window as any).__FLUID_CLIENT__;
        }
      }
    } catch (error) {
      console.error('FluidClient初期化エラー:', error);
      fluidClient.set(null);
    }
  });

  // 既に認証済みの場合は初期化を試行
  const currentUser = userManager.getCurrentUser();
  if (currentUser) {
    try {
      const client = FluidClient.getInstance();
      await client.initialize();
      fluidClient.set(client);

      if (typeof window !== 'undefined') {
        (window as any).__FLUID_CLIENT__ = client;
      }
    } catch (error) {
      console.error('既存ユーザーでのFluidClient初期化エラー:', error);
    }
  }

  isInitializing = false;
}

// クリーンアップ関数
export function cleanupFluidClient() {
  if (unsubscribeAuth) {
    unsubscribeAuth();
    unsubscribeAuth = null;
  }

  // モックのクリーンアップ関数を実行
  if (mockCleanup) {
    mockCleanup();
    mockCleanup = null;
  }

  // 現在のクライアントをクリーンアップ
  fluidClient.update(client => {
    if (client) {
      try {
        // クライアントが接続状態のイベントハンドラを持っていれば解除
        if (client.container) {
          client.container.off('connected', () => { });
          client.container.off('disconnected', () => { });
        }
      } catch (e) {
        console.warn('FluidClient接続解除中のエラー:', e);
      }
    }
    return null;
  });
}

// アプリ起動時に初期化を実行
if (typeof window !== 'undefined') {
  // ページロード時の重複初期化を避けるため少し遅延させる
  setTimeout(() => {
    initFluidClientWithAuth();
  }, 100);

  // ページ終了時にクリーンアップ
  window.addEventListener('beforeunload', cleanupFluidClient);
}
