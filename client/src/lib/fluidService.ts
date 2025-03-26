import { AzureClient, type AzureClientProps, type AzureRemoteConnectionConfig, type ITokenProvider } from '@fluidframework/azure-client';
import { InsecureTokenProvider } from '@fluidframework/test-client-utils';
import { TinyliciousClient } from '@fluidframework/tinylicious-client';
import { UserManager } from '../auth/UserManager';

// シングルトンパターンでAzureClientを管理
let azureClient: AzureClient | null = null;

// Azure Fluid Relayエンドポイント設定
const azureConfig = {
  tenantId: import.meta.env.VITE_AZURE_TENANT_ID || '00000000-0000-0000-0000-000000000000',
  endpoint: import.meta.env.VITE_AZURE_FLUID_RELAY_ENDPOINT || 'https://us.fluidrelay.azure.com',
};

// Tinylicious設定(ローカル開発用)
const tinyliciousConfig = {
  endpoint: import.meta.env.VITE_TINYLICIOUS_ENDPOINT || "http://localhost:7070",
};

// 開発環境ではTinyliciousを使用する - 環境変数で強制的に切り替え可能
const isTestEnvironment = import.meta.env.MODE === 'test' || process.env.NODE_ENV === 'test';
const useTinylicious =
  isTestEnvironment || // テスト環境では常にTinyliciousを使用
  import.meta.env.VITE_USE_TINYLICIOUS === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_FORCE_AZURE !== 'true');

// TokenProviderの取得
async function getTokenProvider(userId?: string, containerId?: string): Promise<ITokenProvider> {
  if (!useTinylicious) {
    // Azureモードの場合はUserManagerからトークンを取得
    const userManager = UserManager.getInstance();

    // 特定のコンテナID用のトークンが必要な場合
    if (containerId) {
      console.log(`[fluidService] Requesting token for specific container: ${containerId}`);
      // コンテナID付きで強制的にトークンを更新
      await userManager.refreshToken(containerId);
    }

    // トークンが利用可能になるまで待機
    const fluidToken = await userManager.getCurrentFluidToken();

    if (fluidToken) {
      // サーバーから受け取ったテナントIDを確認
      const tokenTenantId = (fluidToken as any).tenantId;

      // テナントIDをログに出力（デバッグ用）
      console.log(`[fluidService] Server provided tenantId: ${tokenTenantId || 'not provided'}`);
      console.log(`[fluidService] Local configured tenantId: ${azureConfig.tenantId}`);

      // サーバーから受け取ったテナントIDがある場合は、それを使用する
      if (tokenTenantId) {
        azureConfig.tenantId = tokenTenantId;
      }

      console.log(`[fluidService] Using Azure Fluid Relay with token for user: ${fluidToken.user.name} and tenantId: ${azureConfig.tenantId}`);

      // コンテナID制限のログ出力
      if (fluidToken.containerId) {
        console.log(`[fluidService] Token is scoped to container: ${fluidToken.containerId}`);
      }

      return {
        fetchOrdererToken: async () => {
          return {
            jwt: fluidToken.token,
            fromCache: true
          };
        },
        fetchStorageToken: async () => {
          return {
            jwt: fluidToken.token,
            fromCache: true
          };
        }
      };
    } else {
      console.warn('[fluidService] No Fluid token available for Azure mode, fallback to insecure provider');
    }
  }

  // Tinyliciousモードまたはトークンが無い場合はInsecureTokenProviderを使用
  const userName = userId ? `User-${userId}` : 'Anonymous';
  console.log(`[fluidService] Using InsecureTokenProvider for user: ${userName}`);
  return new InsecureTokenProvider(
    useTinylicious ? "tinylicious" : azureConfig.tenantId,
    { id: userId || 'anonymous', name: userName }
  );
}

// AzureClientの取得（またはTinyliciousClient）
export async function getFluidClient(userId?: string, containerId?: string) {
  if (useTinylicious) {
    return new TinyliciousClient();
  }
  // ユーザーIDが変わった場合は新しいクライアントを作成
  if (azureClient && userId) {
    // 既存クライアントの破棄（必要に応じて）
    azureClient = null;
  }

  if (!azureClient) {
    // TokenProvider設定 - コンテナIDが指定されている場合はそれも渡す
    const tokenProvider = await getTokenProvider(userId, containerId);

    let clientProps: AzureClientProps;

    if (useTinylicious) {
      // Tinylicious（開発環境・テスト環境）用の設定
      clientProps = {
        connection: {
          type: "local",
          tokenProvider,
          endpoint: tinyliciousConfig.endpoint,
        },
      };
      console.log(`[fluidService] Using Tinylicious local service at ${tinyliciousConfig.endpoint}`);

      if (isTestEnvironment) {
        console.log('[fluidService] Test environment detected, forcing Tinylicious usage');
      }
    } else {
      // Azure Fluid Relay（本番環境）用の設定
      const connectionConfig: AzureRemoteConnectionConfig = {
        type: "remote",
        tenantId: azureConfig.tenantId,
        tokenProvider: tokenProvider,
        endpoint: azureConfig.endpoint,
      };

      clientProps = {
        connection: connectionConfig,
      };
      console.log(`[fluidService] Using Azure Fluid Relay service at ${azureConfig.endpoint}`);
    }

    try {
      // Azure Clientの作成
      azureClient = new AzureClient(clientProps);
      console.debug(`[fluidService] Created new Fluid client for user: ${userId || 'anonymous'}`);
    } catch (error) {
      console.error("[fluidService] Failed to create Fluid client:", error);
      throw error;
    }
  }

  return azureClient;
}

// AzureClientの再設定（トークン更新時など）
export function resetFluidClient(): void {
  azureClient = null;
  console.debug('[fluidService] Reset AzureClient');
}

/**
 * Fluid Framework接続エラーを処理する
 * @param error エラーオブジェクト
 * @returns ユーザー向けエラーメッセージとステータスコード
 */
export function handleConnectionError(error: any): { message: string; statusCode?: number } {
  console.error('[fluidService] Connection error:', error);

  // エラーメッセージの初期値
  let message = 'Azure Fluid Relayへの接続中にエラーが発生しました';
  let statusCode = undefined;

  // errorがResponseオブジェクトを含むか確認
  if (error.response) {
    statusCode = error.response.status;

    // HTTPステータスコードに基づいて詳細なエラーメッセージを提供
    switch (statusCode) {
      case 401:
      case 403:
        message = '認証に失敗しました。トークンが無効または期限切れです。';
        break;
      case 404:
        message = '指定されたコンテナが見つかりません。';
        break;
      case 429:
        message = 'リクエスト制限を超えました。しばらく待ってから再試行してください。';
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        message = 'サーバーエラーが発生しました。しばらく待ってから再試行してください。';
        break;
      default:
        if (statusCode >= 400) {
          message = `エラーが発生しました (${statusCode})`;
        }
    }
  } else if (error.code === 'ECONNABORTED') {
    message = '接続がタイムアウトしました。ネットワーク接続を確認してください。';
  } else if (error.message) {
    // エラーメッセージが存在する場合はそれを使用
    message = `エラー: ${error.message}`;
  }

  return { message, statusCode };
}

/**
 * Fluidコンテナの接続状態を監視する
 * @param container Fluidコンテナ
 * @param onConnected 接続時のコールバック
 * @param onDisconnected 切断時のコールバック
 * @returns イベントリスナー解除用の関数
 */
export function setupConnectionListeners(
  container: any,
  onConnected?: () => void,
  onDisconnected?: () => void
): () => void {
  if (!container) {
    return () => { };
  }

  const connectedListener = () => {
    console.log('[fluidService] Connected to Fluid Relay service');
    if (onConnected) onConnected();
  };

  const disconnectedListener = () => {
    console.log('[fluidService] Disconnected from Fluid Relay service');
    if (onDisconnected) onDisconnected();
  };

  container.on('connected', connectedListener);
  container.on('disconnected', disconnectedListener);

  // イベントリスナー解除用の関数を返す
  return () => {
    container.off('connected', connectedListener);
    container.off('disconnected', disconnectedListener);
  };
}