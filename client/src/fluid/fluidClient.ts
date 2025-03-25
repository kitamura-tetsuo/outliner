import { AzureClient } from '@fluidframework/azure-client';
import { type ContainerSchema, type IFluidContainer, type ImplicitFieldSchema, SharedTree, type TreeView } from "fluid-framework";
import { UserManager } from '../auth/UserManager';
import { getFluidClient } from '../lib/fluidService';
import { appTreeConfiguration, Items } from "../schema/app-schema";

export class FluidClient {
  // Public properties for easier debugging
  public client: AzureClient;
  public container!: IFluidContainer;
  public containerId: string | null = null;
  public appData!: TreeView<ImplicitFieldSchema>;

  // ユーザーマネージャー
  private userManager: UserManager;

  // Schema definition with SharedTree IdCompressor enabled
  constructor() {
    // Set a breakpoint here to debug initialization
    console.debug('[FluidClient] Initializing...');

    // ユーザーマネージャーのインスタンスを取得
    this.userManager = UserManager.getInstance();

    // fluidService.tsからシングルトンクライアントを取得
    // ユーザー情報がある場合はそれを使用
    const userId = this.userManager.getCurrentUser()?.id;
    const { client } = getFluidClient(userId);
    this.client = client;
  }

  async initialize() {
    try {
      console.debug('[FluidClient] Starting initialization...');

      // IdCompressorを有効にしたコンテナスキーマを定義
      const containerSchema: ContainerSchema = {
        initialObjects: {
          appData: SharedTree
        }
      };

      // ユーザー情報を取得
      const userInfo = this.userManager.getFluidUserInfo();

      // fluid-service.ts から適切なクライアントを取得
      const { client, schema } = getFluidClient(userInfo?.id, containerSchema);
      this.client = client;

      // バージョン2を明示的に指定してIdCompressorを有効化
      const { container } = await this.client.createContainer(schema, "2");
      this.container = container;
      this.containerId = await container.attach();

      // スキーマを指定してTreeViewを構成
      this.appData = container.initialObjects.appData.viewWith(appTreeConfiguration);

      // 初期データでアプリを初期化
      this.appData.initialize(new Items([]));
      this.appData.root.addNode("test");

      // コンテナの接続状態を監視
      this.container.on('connected', () => {
        console.log('Connected to Fluid service');
      });

      this.container.on('disconnected', () => {
        console.log('Disconnected from Fluid service');
      });

      console.log('Fluid client initialized with container ID:', this.containerId);

      // VSCode debugger用のイベントリスナーを設定
      this._setupDebugEventListeners();

      return this;
    } catch (error) {
      console.error('Failed to initialize Fluid container:', error);
      throw error;
    }
  }

  public getTree() {
    if (this.container) {
      console.log(this.appData.root.length);
      console.log(this.appData.root[0]);
      const rootItems = this.appData.root;
      const items = [...rootItems];
      console.log(items);
      this.appData.root.map(element => {
        console.log('Element:', element);
      });

      return this.appData.root;
    }
    return null;
  }

  // デバッグ用のイベントリスナー設定
  private _setupDebugEventListeners() {
    if (!this.container) return;

    this.container.on('op', (op: any) => {
      console.debug('[FluidClient] Operation received:', op);
    });
  }

  // デバッグ用のヘルパーメソッド
  getDebugInfo() {
    return {
      clientInitialized: !!this.client,
      containerConnected: this.container?.connected || false,
      containerId: this.containerId,
      treeData: this.appData ? this.getAllData() : {},
      treeCount: this.appData?.root?.length || 0,
      treeFirstItem: this.appData?.root?.[0]?.text || null,
      timeStamp: new Date().toISOString(), // タイムスタンプを追加してデバッグ情報が毎回変わるようにする
      currentUser: this.userManager.getCurrentUser()
    };
  }

  // 以下は共有データ操作用のヘルパーメソッド
  getAllData() {
    if (this.appData?.root) {
      return {
        itemCount: this.appData.root.length,
        items: [...this.appData.root].map(item => ({
          id: item.id,
          text: item.text
        }))
      };
    }
    return {};
  }
}

