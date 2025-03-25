import { AzureClient, type AzureClientProps, type ITokenProvider } from '@fluidframework/azure-client';
import { InsecureTokenProvider } from '@fluidframework/test-client-utils';
import { type ContainerSchema } from 'fluid-framework';
import { UserManager } from '../auth/UserManager';

// シングルトンパターンでAzureClientを管理
let azureClient: AzureClient | null = null;

// Azure Fluid Relayエンドポイント設定
const azureConfig = {
  tenantId: import.meta.env.VITE_AZURE_TENANT_ID || '00000000-0000-0000-0000-000000000000',
  endpoint: import.meta.env.VITE_AZURE_FLUID_RELAY_ENDPOINT || 'https://us.fluidrelay.azure.com',
};

// 開発環境ではTinyliciousを使用する
const useTinylicious = import.meta.env.DEV && !import.meta.env.VITE_FORCE_AZURE;

// デフォルトのコンテナスキーマ
const defaultSchema: ContainerSchema = {
  initialObjects: {
    // 初期化時に指定するためここでは空
  }
};

// TokenProviderの取得
function getTokenProvider(userId?: string): ITokenProvider {
  // 本番環境の場合はUserManagerからトークンを取得
  if (import.meta.env.PROD) {
    const userManager = UserManager.getInstance();
    const fluidToken = userManager.getCurrentFluidToken();

    if (fluidToken) {
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
    }
  }

  // 開発環境または未認証の場合はInsecureTokenProviderを使用
  const userName = userId ? `User-${userId}` : 'Anonymous';
  return new InsecureTokenProvider(
    azureConfig.tenantId,
    { id: userId || 'anonymous', name: userName }
  );
}

// AzureClientの取得（またはTinyliciousClient）
export function getFluidClient(userId?: string, schema: ContainerSchema = defaultSchema) {
  // ユーザーIDが変わった場合は新しいクライアントを作成
  if (azureClient && userId) {
    // 既存クライアントの破棄（必要に応じて）
    azureClient = null;
  }

  if (!azureClient) {
    // TokenProvider設定
    const tokenProvider = getTokenProvider(userId);

    let clientProps: AzureClientProps;

    if (useTinylicious) {
      // Tinylicious（開発環境）用の設定
      clientProps = {
        connection: {
          type: "local",
          tokenProvider,
          endpoint: tinyliciousConfig.endpoint,
        },
      };
      console.log("[fluidService] Using Tinylicious local service for development");
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
      console.log("[fluidService] Using Azure Fluid Relay service");
    }

    // Azure Clientの作成
    azureClient = new AzureClient(clientProps);
    console.debug(`[fluidService] Created new AzureClient for user: ${userId || 'anonymous'}`);
  }

  return {
    client: azureClient,
    schema: schema,
    useTinylicious  // この値を返すようにする
  };
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