// import { ConnectionState, type ContainerSchema, type IFluidContainer, SharedTree } from "fluid-framework";
// import { TinyliciousClient } from "@fluidframework/tinylicious-client";
// import { FluidClient } from "../../fluid/fluidClient";
// import { appTreeConfiguration, Item, Items, Project } from "../../schema/app-schema";
// import { v4 as uuid } from 'uuid';

// // TreeView型を型エイリアスとして定義（SSR互換）
// type TreeViewType<T> = ReturnType<typeof SharedTree.prototype.viewWith>;

// // Tinylicious用のモックFluidClient
// export class MockFluidClient {
//   // オリジナルのFluidClientのシングルトンメソッドを保存
//   private static originalGetInstance: typeof FluidClient.getInstance;
  
//   // Tinyliciousクライアント
//   private client: TinyliciousClient;
//   public container!: IFluidContainer;
//   public containerId: string | undefined;
//   public appData!: TreeViewType<typeof Project>;
//   private isInitialized = false;
//   public isConnected = false;
//   public currentUser = { id: 'test-user-id' };

//   /**
//    * Tinyliciousに接続するモックFluidClientを初期化
//    */
//   constructor() {
//     this.client = new TinyliciousClient({ connection: { port: import.meta.env.VITE_TINYLICIOUS_PORT } });
//   }

//   /**
//    * モックをセットアップし、オリジナルのFluidClientのgetInstanceを置き換える
//    */
//   public static setup(): () => void {
//     // オリジナルのメソッドを保存
//     this.originalGetInstance = FluidClient.getInstance;
    
//     // モックインスタンスを作成
//     const mockInstance = new MockFluidClient();
    
//     // FluidClient.getInstanceをオーバーライド
//     FluidClient.getInstance = () => {
//       return mockInstance as unknown as FluidClient;
//     };
    
//     // クリーンアップ関数を返す
//     return () => {
//       FluidClient.getInstance = this.originalGetInstance;
//     };
//   }

//   /**
//    * Fluidクライアントを初期化して新しいコンテナを作成
//    */
//   public async initialize(): Promise<MockFluidClient> {
//     if (this.isInitialized) {
//       console.log('[MockFluidClient] Already initialized');
//       return this;
//     }

//     try {
//       console.log('[MockFluidClient] Creating new container for testing');
      
//       // IdCompressorを有効にしたコンテナスキーマを定義
//       const containerSchema: ContainerSchema = {
//         initialObjects: {
//           appData: SharedTree
//         }
//       };

//       // テスト用の新しいコンテナを常に作成
//       const createResponse = await this.client.createContainer(containerSchema,"2");
//       this.container = createResponse.container;
//       const containerID = await this.container.attach();
//       this.containerId = containerID;
//       console.log(`[MockFluidClient] Created new container with ID: ${this.containerId}`);

//       // スキーマを指定してTreeViewを構成（SSR互換の書き方）
//       const sharedTree = this.container.initialObjects.appData as SharedTree;
//       this.appData = sharedTree.viewWith(appTreeConfiguration);
      
//       // 初期データを作成
//       if (this.appData.compatibility.canInitialize) {
//         this.appData.initialize(new Project({
//           title: "Test Project",
//           items: new Items([])
//         }));
        
//         // テスト用のアイテムを追加
//         this.addSampleItems();
//       }
      
//       this.isInitialized = true;
//       this.isConnected = true;
      
//       // コンソールでデバッグ用に表示
//       if (typeof window !== 'undefined') {
//         (window as any).__FLUID_CLIENT__ = this;
//       }
      
//       return this;
//     } catch (error) {
//       console.error('[MockFluidClient] Initialization error:', error);
//       throw error;
//     }
//   }

//   /**
//    * テスト用のサンプルアイテムを追加
//    */
//   private addSampleItems() {
//     const items = this.appData.root.items as Items;
//     const timeStamp = new Date().getTime();
    
//     // 3つのテストアイテムを追加
//     for (let i = 0; i < 3; i++) {
//       const newItem = new Item({
//         id: uuid(),
//         text: `Test Item ${i + 1}`,
//         author: 'test-user',
//         votes: [],
//         created: timeStamp,
//         lastChanged: timeStamp,
//         items: new Items([]),
//       });
      
//       items.insertAtEnd(newItem);
//     }
//   }

//   /**
//    * ツリーデータを取得
//    */
//   public getTree() {
//     return this.appData.root.items;
//   }

//   /**
//    * 接続状態を文字列で取得
//    */
//   public getConnectionStateString(): string {
//     if (!this.container) return "未初期化";
    
//     switch (this.container.connectionState) {
//       case ConnectionState.Connected:
//         return "接続済み";
//       case ConnectionState.Disconnected:
//         return "切断";
//       case ConnectionState.EstablishingConnection:
//         return "接続中";
//       case ConnectionState.CatchingUp:
//         return "同期中";
//       default:
//         return "不明";
//     }
//   }

//   /**
//    * 接続テスト用のメソッド
//    */
//   public testConnection(): string {
//     if (this.isConnected) {
//       return "Connection test successful! Connected to Tinylicious server.";
//     } else {
//       return "Connection test failed. Not connected to Tinylicious server.";
//     }
//   }

//   /**
//    * デバッグ情報を取得
//    */
//   public getDebugInfo() {
//     const rootItems = this.appData.root.items as Items;
//     return {
//       clientInitialized: true,
//       containerConnected: this.isConnected,
//       connectionState: this.getConnectionStateString(),
//       containerId: this.containerId,
//       treeData: {
//         itemCount: rootItems.length,
//         items: [...rootItems].map(item => ({
//           id: item.id,
//           text: item.text
//         }))
//       },
//       treeCount: rootItems.length,
//       treeFirstItem: rootItems[0]?.text || null,
//       timeStamp: new Date().toISOString(),
//       currentUser: this.currentUser
//     };
//   }

//   /**
//    * リソースの解放
//    */
//   public dispose() {
//     if (this.container) {
//       try {
//         console.log('[MockFluidClient] Disposing resources');
//         this.container.disconnect();
//       } catch (e) {
//         console.warn('[MockFluidClient] Disposal error:', e);
//       }
//     }
//   }
// }

// /**
//  * テスト用のモックFluidClientをセットアップする関数
//  * @returns クリーンアップ関数
//  */
// export function setupMockFluidClient() {
//   return MockFluidClient.setup();
// }
