import { AzureClient, type AzureClientProps } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
import {
  type ContainerSchema,
  type IFluidContainer,
  SharedTree
} from "fluid-framework";

// シングルトンインスタンスを保持する変数
let clientInstance: AzureClient | null = null;
let currentUserId: string | null = null;

// 開発環境フラグ (SvelteKit の環境変数を使用)
const isDevelopment = import.meta.env.DEV;

// Tinylicious接続設定（開発環境用）
const getTinyliciousConfig = (): AzureClientProps => {
  // Azureユーザー形式に準拠したユーザー情報を提供
  const user = {
    id: "user-tinylicious",
    name: "Tinylicious User" // nameプロパティの追加
  };

  // 固定IPアドレスを使用して接続する
  const endpoint = "http://192.168.50.13:7070";

  return {
    connection: {
      type: "local",
      tokenProvider: new InsecureTokenProvider("", user),
      endpoint,
      localAddress: endpoint,
    },
  };
};

// Azure Fluid Relay の接続設定（本番環境用）
const getAzureConfig = (userId = "anonymous-user"): AzureClientProps => {
  // Azureユーザー形式に準拠したユーザー情報を提供
  const user = {
    id: userId,
    name: `User ${userId.split('-').pop()}` // nameプロパティを追加
  };

  return {
    connection: {
      type: "remote",
      tenantId: import.meta.env.VITE_AZURE_TENANT_ID || "your-tenant-id",
      tokenProvider: new InsecureTokenProvider("your-secret-key", user),
      endpoint: import.meta.env.VITE_AZURE_FLUID_RELAY_ENDPOINT || "your-azure-fluid-relay-endpoint",
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
export function getFluidClient(userId?: string, schema: ContainerSchema = defaultContainerSchema) {
  // ユーザーIDが変更された場合、または初回の場合はクライアントを作成/再作成
  if (!clientInstance || (userId && userId !== currentUserId)) {
    const clientProps = isDevelopment ? getTinyliciousConfig() : getAzureConfig(userId);

    if (isDevelopment) {
      console.debug("[fluid-service] Creating new AzureClient with Tinylicious configuration");
    } else {
      console.debug("[fluid-service] Creating new AzureClient with Azure configuration");
    }

    clientInstance = new AzureClient(clientProps);
    currentUserId = userId || null;
    console.debug(`[fluid-service] Client initialized for user: ${currentUserId}`);
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