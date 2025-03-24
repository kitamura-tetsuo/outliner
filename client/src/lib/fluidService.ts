import { AzureClient, type AzureClientProps, type TokenProvider, type TokenResponse } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
import {
  type ContainerSchema,
  type IFluidContainer,
  SharedTree
} from "fluid-framework";
import type { IUser } from '../fluid/fluidClient';
import { getFluidToken } from './api';
import { getEnv } from './env';

// シングルトンインスタンスを保持する変数
let clientInstance: AzureClient | null = null;
let currentUserId: string | null = null;

// 開発環境フラグ (SvelteKit の環境変数を使用)
const isDevelopment = import.meta.env.DEV;

// Tinylicious接続設定（開発環境用）
const getTinyliciousConfig = (): AzureClientProps => {
  // 環境変数から取得
  const userId = getEnv('VITE_DEBUG_USER_ID', 'tinylicious-user');
  const userName = getEnv('VITE_DEBUG_USER_NAME', 'Tinylicious User');

  // Azureユーザー形式に準拠したユーザー情報を提供
  const user = {
    id: userId,
    name: userName
  };

  // 環境変数から取得
  const endpoint = getEnv('VITE_TINYLICIOUS_ENDPOINT');

  if (!endpoint) {
    console.warn('Tinylicious endpoint not set in environment variables. ' +
      'Please set VITE_TINYLICIOUS_ENDPOINT in your .env file.');
  }

  return {
    connection: {
      type: "local",
      tokenProvider: new InsecureTokenProvider("", user),
      endpoint: endpoint || "http://localhost:7070",
      localAddress: endpoint || "http://localhost:7070",
    },
  };
};

// APIを使用したトークンプロバイダー
class ApiTokenProvider implements TokenProvider {
  constructor(
    private readonly user: IUser
  ) { }

  async fetchOrdererToken(): Promise<TokenResponse> {
    return this.getToken();
  }

  async fetchStorageToken(): Promise<TokenResponse> {
    return this.getToken();
  }

  private async getToken(): Promise<TokenResponse> {
    try {
      const result = await getFluidToken();
      if (!result || !result.token) {
        console.warn('[ApiTokenProvider] Failed to get token from API, falling back to insecure token');
        return {
          jwt: `demo-token-${this.user.id}`,
          fromCache: false
        };
      }

      console.debug('[ApiTokenProvider] Successfully obtained token from API');
      return {
        jwt: result.token,
        fromCache: false
      };
    } catch (error) {
      console.error('[ApiTokenProvider] Error getting token:', error);
      throw new Error('Failed to get authentication token');
    }
  }
}

// Azure Fluid Relay の接続設定（本番環境用）
const getAzureConfig = (user?: IUser): AzureClientProps => {
  // ユーザー情報がない場合は環境変数から取得
  const fluidUser = user || {
    id: getEnv('VITE_DEBUG_USER_ID', 'anonymous-user'),
    name: getEnv('VITE_DEBUG_USER_NAME', 'Anonymous User')
  };

  // 必要な環境変数の確認
  const tenantId = getEnv('VITE_AZURE_TENANT_ID');
  const endpoint = getEnv('VITE_AZURE_FLUID_RELAY_ENDPOINT');

  if (!tenantId || !endpoint) {
    console.warn(`[fluid-service] Missing environment variables for Azure Fluid Relay: 
      VITE_AZURE_TENANT_ID=${tenantId ? 'set' : 'missing'}, 
      VITE_AZURE_FLUID_RELAY_ENDPOINT=${endpoint ? 'set' : 'missing'}`);
    console.warn('Please set these variables in your .env file and restart the application.');
  }

  // 環境変数で Firebase 認証の使用を制御
  const useApiAuth = getEnv('VITE_USE_API_AUTH') === 'true';
  const tokenKey = getEnv('VITE_FLUID_TOKEN_KEY', '');

  if (!useApiAuth && !tokenKey) {
    console.warn('[fluid-service] No token key provided for insecure token provider.');
  }

  // APIベースの認証を使用（バックエンドサーバー経由）
  const tokenProvider = useApiAuth
    ? new ApiTokenProvider(fluidUser)
    : new InsecureTokenProvider(tokenKey, fluidUser);

  return {
    connection: {
      type: "remote",
      tenantId: tenantId || '',
      tokenProvider,
      endpoint: endpoint || '',
    }
  };
};

// デフォルトのコンテナスキーマ定義
export const defaultContainerSchema: ContainerSchema = {
  initialObjects: {
    tree: SharedTree,
  },
  idCompressor: true,
};

// シングルトンのFluidクライアントを取得する関数
export function getFluidClient(user?: IUser, schema: ContainerSchema = defaultContainerSchema) {
  // ユーザーIDが変更された場合、または初回の場合はクライアントを作成/再作成
  if (!clientInstance || (user && (currentUserId === null || user.id !== currentUserId))) {
    const clientProps = isDevelopment ? getTinyliciousConfig() : getAzureConfig(user);

    if (isDevelopment) {
      console.debug("[fluid-service] Creating new AzureClient with Tinylicious configuration");
    } else {
      console.debug("[fluid-service] Creating new AzureClient with Azure configuration");
    }

    clientInstance = new AzureClient(clientProps);
    currentUserId = user?.id || null;
    console.debug(`[fluid-service] Client initialized for user: ${currentUserId || 'anonymous'}`);
  } else {
    console.debug("[fluid-service] Reusing existing AzureClient instance");
  }

  return {
    client: clientInstance,
    schema
  };
}

// クライアントを強制的に再初期化するメソッド（テスト時などに使用）
export function resetFluidClient(): void {
  clientInstance = null;
  currentUserId = null;
  console.debug("[fluid-service] Client instance reset");
}

// コンテナ作成関数
export async function createContainer(
  schema: ContainerSchema = defaultContainerSchema,
  userId?: string
): Promise<IFluidContainer> {
  const { client } = getFluidClient(userId, schema);
  // バージョン2を明示的に指定してIdCompressorを有効化
  const { container } = await client.createContainer(schema, "2");
  const containerId = await container.attach();
  console.log(`Container created with ID: ${containerId}`);
  return container;
}

// 既存のコンテナを取得する関数
export async function getContainer(
  containerId: string,
  schema: ContainerSchema = defaultContainerSchema,
  userId?: string
): Promise<IFluidContainer> {
  const { client } = getFluidClient(userId, schema);
  const { container } = await client.getContainer(containerId, schema);
  console.log(`Container loaded with ID: ${containerId}`);
  return container;
}

// 認証状態をチェックする関数（ページロード時などに使用）
export function isAuthenticated(): boolean {
  return currentUserId !== null;
}

// 接続エラーを処理するヘルパー関数
export async function handleConnectionError(error: any): Promise<string> {
  console.error('[fluid-service] Connection error:', error);

  // エラーの種類によって異なるメッセージを返す
  if (error.errorType === 'authenticationError') {
    return '認証エラーが発生しました。ログインし直してください。';
  } else if (error.errorType === 'notFound') {
    return 'コンテナが見つかりませんでした。URLを確認してください。';
  } else if (error.errorType === 'connectionError') {
    return 'サーバーへの接続に失敗しました。ネットワーク接続を確認してください。';
  }

  return 'エラーが発生しました。もう一度お試しください。';
}