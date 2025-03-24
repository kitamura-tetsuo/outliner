import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { writable } from 'svelte/store';
import type { IUser } from '../fluid/fluidClient';
import { FluidClient } from '../fluid/fluidClient';

// Fluid クライアントのストア
export const fluidClient = writable<FluidClient | null>(null);

// アプリケーション起動時にFluidクライアントを初期化
let initialized = false;

// Fluid クライアントを初期化する関数
export async function initializeFluidClient(): Promise<FluidClient> {
  if (initialized) {
    // 既に初期化されている場合はストアから取得
    let client: FluidClient | null = null;
    fluidClient.subscribe(value => {
      client = value;
    })();

    if (client) return client;
  }

  try {
    console.debug('[fluidStore] Initializing new FluidClient');
    const client = new FluidClient();
    await client.initialize();

    // ストアを更新
    fluidClient.set(client);
    initialized = true;

    return client;
  } catch (error) {
    console.error('[fluidStore] Failed to initialize FluidClient:', error);
    throw error;
  }
}

// ユーザー認証状態の変更を監視し、必要ならFluidクライアントを再初期化
export function watchAuthState() {
  const auth = getAuth();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // ユーザーがログインした場合
      const userData: IUser = {
        id: user.uid,
        name: user.displayName || 'User',
        email: user.email || undefined,
        photoURL: user.photoURL || undefined
      };

      // Fluid クライアントが初期化されていない場合は初期化
      let client: FluidClient | null = null;
      fluidClient.subscribe(value => {
        client = value;
      })();

      if (client) {
        // 既存のクライアントにユーザー情報を設定
        await client.registerUser(userData);
      } else {
        // 新しいクライアントを初期化
        await initializeFluidClient();
      }
    } else {
      // ユーザーがログアウトした場合、クライアントをリセットするか決定
      // 今回はそのままにしています
    }
  });
}

// アプリ起動時に自動的に初期化
if (typeof window !== 'undefined') {
  initializeFluidClient()
    .then(() => {
      console.debug('[fluidStore] FluidClient initialized and stored');
      watchAuthState();
    })
    .catch(err => {
      console.error('[fluidStore] Error during FluidClient initialization:', err);
    });
}
