import { writable } from 'svelte/store';
import { FluidClient } from '../fluid/fluidClient';

// FluidClientのインスタンスを保持するストア
export const fluidClient = writable<FluidClient | null>(null);

// FluidClientの初期化関数
export async function initializeFluidClient(): Promise<FluidClient> {
  const client = new FluidClient();
  await client.initialize();
  fluidClient.set(client);
  return client;
}

// ユーザー情報が変更されたときにFluidClientを更新する関数
export async function updateFluidClientWithUser(userData: any): Promise<void> {
  let client: FluidClient;
  
  fluidClient.update(currentClient => {
    if (currentClient) {
      // 既存のクライアントがある場合は再利用
      client = currentClient;
    } else {
      // なければ新しく作成
      client = new FluidClient();
    }
    return client;
  });
  
  // ユーザー情報を設定
  await client.registerUser(userData);
  
  // 初期化がまだであれば初期化
  if (!client.container) {
    await client.initialize();
  }
}
