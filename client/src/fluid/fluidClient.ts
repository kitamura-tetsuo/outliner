import { AzureClient } from '@fluidframework/azure-client';
import { ConnectionState, type ContainerSchema, type IFluidContainer, type ImplicitFieldSchema, SharedTree, type TreeView } from "fluid-framework";
import { UserManager } from '../auth/UserManager';
import { getFluidClient, setupConnectionListeners } from '../lib/fluidService';
import { appTreeConfiguration, Items } from "../schema/app-schema";

// ローカルストレージのキー名
const CONTAINER_ID_STORAGE_KEY = 'fluid_container_id';

export class FluidClient {
  // シングルトンインスタンス
  private static instance: FluidClient | null = null;

  // 初期化状態フラグ
  private isInitialized = false;
  private isInitializing = false;
  private initPromise: Promise<FluidClient> | null = null;

  // Public properties for easier debugging
  public client: AzureClient;
  public container!: IFluidContainer;
  public containerId: string | null = null;
  public appData!: TreeView<ImplicitFieldSchema>;
  public useTinylicious?: boolean;

  // ユーザーマネージャー
  private userManager: UserManager;

  // 接続ステータスの追跡
  private connectionListenerCleanup: (() => void) | null = null;
  private connectionRetryCount = 0;
  private readonly MAX_RETRY_COUNT = 3;
  services: any;

  /**
   * シングルトンインスタンスを取得します
   */
  public static getInstance(): FluidClient {
    if (!FluidClient.instance) {
      FluidClient.instance = new FluidClient();
    }
    return FluidClient.instance;
  }

  /**
   * コンストラクタはプライベートにして外部からのインスタンス化を防止
   */
  private constructor() {
    // Set a breakpoint here to debug initialization
    console.debug('[FluidClient] Initializing...');

    // ユーザーマネージャーのインスタンスを取得
    this.userManager = UserManager.getInstance();

    // 保存されたコンテナIDがあれば読み込む
    this.loadContainerId();

    // 一時的にプレースホルダーのクライアントを設定
    // 実際の初期化はinitialize()で行う
    const userId = this.userManager.getCurrentUser()?.id;
    // 同期的に取得できる初期値だけを設定
    const clientInfo = {
      client: new AzureClient({ connection: { type: "local", endpoint: "http://localhost:7070", tokenProvider: { fetchOrdererToken: async () => ({ jwt: "", fromCache: true }), fetchStorageToken: async () => ({ jwt: "", fromCache: true }) } } }),
      useTinylicious: true
    };
    this.client = clientInfo.client;
    this.useTinylicious = clientInfo.useTinylicious;
  }

  // ローカルストレージからコンテナIDを読み込む
  private loadContainerId(): void {
    if (typeof window !== 'undefined') {
      const savedContainerId = localStorage.getItem(CONTAINER_ID_STORAGE_KEY);
      if (savedContainerId) {
        console.log(`[FluidClient] Loading saved container ID: ${savedContainerId}`);
        this.containerId = savedContainerId;
      }
    }
  }

  // コンテナIDをローカルストレージに保存
  private saveContainerId(containerId: string): void {
    if (typeof window !== 'undefined') {
      console.log(`[FluidClient] Saving container ID: ${containerId}`);
      localStorage.setItem(CONTAINER_ID_STORAGE_KEY, containerId);
    }
  }

  // コンテナIDをリセット（削除）する
  public resetContainerId(): void {
    if (typeof window !== 'undefined') {
      console.log('[FluidClient] Resetting container ID');
      localStorage.removeItem(CONTAINER_ID_STORAGE_KEY);
      this.containerId = null;
    }
  }

  /**
   * Fluidクライアントを初期化します
   * 既に初期化済み/初期化中の場合は既存のプロミスを返します
   */
  public async initialize(): Promise<FluidClient> {
    // 既に初期化済みの場合は早期リターン
    if (this.isInitialized) {
      console.log('[FluidClient] Already initialized, returning instance');
      return this;
    }

    // 初期化中の場合は既存のプロミスを返す
    if (this.isInitializing && this.initPromise) {
      console.log('[FluidClient] Initialization already in progress, returning existing promise');
      return this.initPromise;
    }

    // 初期化中フラグを設定
    this.isInitializing = true;

    // 初期化処理をプロミスとして保存し、他のcallerが共有できるようにする
    this.initPromise = new Promise<FluidClient>(async (resolve, reject) => {
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
        const userId = userInfo?.id;

        if (!userId) {
          console.warn('[FluidClient] No user ID available for initialization');
        }

        // fluid-service.ts から適切なクライアントを取得
        // 既存のcontainerIdがある場合は、それに対応するトークンを取得するよう指定
        const fluidClientInfo = await getFluidClient(userId, containerSchema, this.containerId);
        this.client = fluidClientInfo.client;
        this.useTinylicious = fluidClientInfo.useTinylicious;

        // バージョン2を明示的に指定してIdCompressorを有効化
        const createOption = this.useTinylicious ? undefined : "2";

        var isCreatingContainer = false;
        // 既存のコンテナIDがあれば、そのコンテナに接続
        if (this.containerId) {
          try {
            console.log(`[FluidClient] Connecting to existing container: ${this.containerId}`);
            ({ container: this.container, services: this.services } = await this.client.getContainer(this.containerId, fluidClientInfo.schema, createOption));
            console.log(`[FluidClient] Successfully connected to existing container: ${this.containerId}`);
          } catch (error) {
            console.warn(`[FluidClient] Failed to connect to existing container: ${this.containerId}`, error);
            console.warn('[FluidClient] Creating a new container instead...');
            this.containerId = null; // コンテナIDをリセット
            localStorage.removeItem(CONTAINER_ID_STORAGE_KEY);
            isCreatingContainer = true;
            ({ container: this.container, services: this.services } = await this.client.createContainer(fluidClientInfo.schema, createOption));
          }
        } else {
          // 新しいコンテナを作成
          console.log('[FluidClient] Creating a new container');
          isCreatingContainer = true;
          ({ container: this.container, services: this.services } = await this.client.createContainer(fluidClientInfo.schema, createOption));
        }

        // コンテナをアタッチして、コンテナIDを取得または確認
        if (this.container.connectionState === ConnectionState.Disconnected) {
          const attachedContainerId = await this.container.attach();
          // コンテナIDが変わった場合は更新
          if (attachedContainerId !== this.containerId) {
            this.containerId = attachedContainerId;
            // 新しいコンテナIDを保存
            this.saveContainerId(this.containerId);
          }
        }


        // スキーマを指定してTreeViewを構成
        this.appData = this.container.initialObjects.appData.viewWith(appTreeConfiguration);

        if (this.appData.compatibility.canInitialize) {
          console.log('[FluidClient] Initializing appData with default items');
          this.appData.initialize(new Items([]));
          this.appData.root.addNode("test");
        }

        // コンテナの接続状態を監視
        this.setupConnectionMonitoring();

        console.log('[FluidClient] Fluid client initialized with container ID:', this.containerId);

        // VSCode debugger用のイベントリスナーを設定
        this._setupDebugEventListeners();

        // 初期化完了フラグを設定
        this.isInitialized = true;
        this.isInitializing = false;

        resolve(this);
      } catch (error) {
        console.error('[FluidClient] Failed to initialize Fluid container:', error);
        this.isInitializing = false;
        this.initPromise = null;
        this.resetContainerId(); // コンテナIDをリセット
        reject(error);
      }
    });

    return this.initPromise;
  }

  // 接続状態の監視を設定
  private setupConnectionMonitoring() {
    if (!this.container) return;

    // 以前のリスナーがあれば解除
    if (this.connectionListenerCleanup) {
      this.connectionListenerCleanup();
    }

    // 接続状態の監視を設定
    this.connectionListenerCleanup = setupConnectionListeners(
      this.container,
      // 接続時のコールバック
      () => {
        console.log('Connected to Fluid service');
        this.connectionRetryCount = 0; // 接続成功したらリトライカウントをリセット

        // カスタムイベントを発行して接続成功を通知
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fluidConnected', {
            detail: { containerId: this.containerId }
          }));
        }
      },
      // 切断時のコールバック
      () => {
        console.log('Disconnected from Fluid service');

        // 切断イベントを発行
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fluidDisconnected'));
        }

        // リトライ回数が上限に達していなければ再接続を試みる
        if (this.connectionRetryCount < this.MAX_RETRY_COUNT) {
          this.connectionRetryCount++;
          // console.log(`再接続を試みます (${this.connectionRetryCount}/${this.MAX_RETRY_COUNT})...`);

          // // 少し待ってから再接続
          // setTimeout(() => {
          //   this.reconnect();
          // }, 2000);
        } else {
          console.warn('最大再接続回数に達しました。手動での再接続が必要です。');
        }
      }
    );
  }

  // 再接続を試みる
  private async reconnect() {
    try {
      // ユーザートークンの更新
      const userManager = UserManager.getInstance();
      await userManager.refreshToken();

      // コンテナの再接続
      if (this.container) {
        this.container.connect();
      }
    } catch (error) {
      console.error('Fluid service reconnection failed:', error);
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

  /**
   * コンテナが接続済みかどうかを確認します
   */
  public get isConnected(): boolean {
    if (!this.container) return false;
    return this.container.connectionState !== ConnectionState.Disconnected;
  }

  /**
   * コンテナの接続状態を取得します
   */
  public get connectionState(): ConnectionState | undefined {
    return this.container?.connectionState;
  }

  /**
   * コンテナの接続状態を文字列で取得します
   */
  public getConnectionStateString(): string {
    if (!this.container) return "未初期化";

    switch (this.container.connectionState) {
      case ConnectionState.Connected:
        return "接続済み";
      case ConnectionState.Disconnected:
        return "切断";
      case ConnectionState.EstablishingConnection:
        return "接続中";
      case ConnectionState.CatchingUp:
        return "同期中";
      case ConnectionState.WriteStopped:
        return "読取専用";
      default:
        return "不明";
    }
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
      containerConnected: this.isConnected,
      connectionState: this.getConnectionStateString(),
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

  // コンポーネント破棄時のクリーンアップ
  public dispose() {
    if (this.connectionListenerCleanup) {
      this.connectionListenerCleanup();
      this.connectionListenerCleanup = null;
    }

    try {
      // コンテナの切断
      if (this.container && this.container.connected) {
        this.container.disconnect();
      }
    } catch (e) {
      console.warn('FluidClient disposal error:', e);
    }
  }
}

