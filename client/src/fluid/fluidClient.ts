import { AzureClient } from '@fluidframework/azure-client';
import { TinyliciousClient } from '@fluidframework/tinylicious-client';
import { ConnectionState, type ContainerSchema, type IFluidContainer, SharedTree, type TreeView, type ViewableTree } from "fluid-framework";
import { UserManager } from '../auth/UserManager';
import { getEnv } from '../lib/env';
import { getFluidClient, setupConnectionListeners } from '../lib/fluidService';
import { appTreeConfiguration, Items, Project } from "../schema/app-schema";

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
  public client: AzureClient | TinyliciousClient | undefined = undefined;
  public container!: IFluidContainer;
  public containerId: string | undefined = undefined;
  public appData!: TreeView<typeof Project>;

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
      console.log(`[FluidClient] Saving container ID locally: ${containerId}`);
      localStorage.setItem(CONTAINER_ID_STORAGE_KEY, containerId);
    }
  }

  /**
   * コンテナIDをサーバー側に保存する
   * @param containerId 保存するコンテナID
   */
  private async saveContainerIdToServer(containerId: string): Promise<void> {
    try {
      // ユーザーがログインしていることを確認
      const userManager = UserManager.getInstance();
      const currentUser = userManager.getCurrentUser();

      if (!currentUser) {
        console.warn('[FluidClient] Cannot save container ID to server: User not logged in');
        return;
      }

      // Firebase IDトークンを取得
      const firebaseUser = userManager['auth'].currentUser;
      if (!firebaseUser) {
        console.warn('[FluidClient] Cannot save container ID to server: Firebase user not available');
        return;
      }

      const idToken = await firebaseUser.getIdToken();
      const apiBaseUrl = getEnv('VITE_API_BASE_URL', 'http://localhost:7073');

      // サーバー側にコンテナIDを保存
      const response = await fetch(`${apiBaseUrl}/api/save-container`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          idToken,
          containerId
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save container ID to server: ${response.statusText}`);
      }

      console.log(`[FluidClient] Successfully saved container ID to server for user ${currentUser.id}`);
    } catch (error) {
      console.error('[FluidClient] Error saving container ID to server:', error);
      // エラーが発生してもクリティカルではないので、処理は続行
    }
  }

  // コンテナIDをリセット（削除）する
  public resetContainerId(): void {
    if (typeof window !== 'undefined') {
      console.log('[FluidClient] Resetting container ID');
      localStorage.removeItem(CONTAINER_ID_STORAGE_KEY);
      this.containerId = undefined;
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

        try {
          // fluid-service.ts から適切なクライアントを取得
          this.client = await getFluidClient(userId, this.containerId);
        } catch (error) {
          window.alert('Fluid client: getFluidClient failed. Please check your server.');
          throw error;
        }

        const createOption = "2";
        let tokenRefreshNeeded = false;

        // 既存のコンテナIDがあれば、そのコンテナに接続
        if (this.containerId) {
          try {
            console.log(`[FluidClient] Connecting to existing container: ${this.containerId}`);
            ({ container: this.container, services: this.services } = await this.client.getContainer(this.containerId, containerSchema, createOption));
            console.log(`[FluidClient] Successfully connected to existing container: ${this.containerId}`);
          } catch (error) {
            console.warn(`[FluidClient] Failed to connect to existing container: ${this.containerId}`, error);
            console.warn('[FluidClient] Creating a new container instead...');
            this.containerId = undefined; // コンテナIDをリセット
            localStorage.removeItem(CONTAINER_ID_STORAGE_KEY);
            ({ container: this.container, services: this.services } = await this.client.createContainer(containerSchema, createOption));
            tokenRefreshNeeded = true; // 新しいコンテナを作成したので、後でトークンを再取得
          }
        } else {
          // 新しいコンテナを作成
          console.log('[FluidClient] Creating a new container');
          ({ container: this.container, services: this.services } = await this.client.createContainer(containerSchema, createOption));
          tokenRefreshNeeded = true; // 新しいコンテナを作成したので、後でトークンを再取得
        }

        // スキーマを指定してTreeViewを構成
        this.appData = (this.container.initialObjects.appData as ViewableTree).viewWith(appTreeConfiguration);


        if (this.appData.compatibility.canInitialize) {
          console.log('[FluidClient] Initializing appData with default items');
          // @ts-ignore - GitHub Issue #22101 に関連する既知の型の問題(https://github.com/microsoft/FluidFramework/issues/22101)
          this.appData.initialize(new Project({ title: "", items: new Items([]) }));
          this.appData.root.addPage("test", "author");
        }

        // コンテナをアタッチして、コンテナIDを取得または確認
        if (this.container.connectionState === ConnectionState.Disconnected) {
          const attachedContainerId = await this.container.attach();
          // コンテナIDが変わった場合は更新
          if (attachedContainerId !== this.containerId) {
            this.containerId = attachedContainerId;
            tokenRefreshNeeded = true; // コンテナIDが変更されたのでトークンを再取得

            // 新しいコンテナIDを保存
            this.saveContainerId(this.containerId);

            // サーバー側にもコンテナIDを保存する（ユーザーがログインしている場合のみ）
            if (userId) {
              await this.saveContainerIdToServer(this.containerId);
            }
          }

          // 新しいコンテナIDでトークンを更新
          if (tokenRefreshNeeded) {
            console.log(`[FluidClient] Refreshing token for new container: ${this.containerId}`);
            try {
              // 新しいコンテナID用のトークンを取得
              await this.userManager.refreshToken(this.containerId);
              // 更新されたトークンで新しいクライアントを作成
              this.client = await getFluidClient(userId, this.containerId);

              // 新しいクライアントでコンテナに再接続
              ({ container: this.container, services: this.services } =
                await this.client.getContainer(this.containerId, containerSchema, createOption));
              console.log(`[FluidClient] Successfully reconnected with refreshed token`);
            } catch (refreshError) {
              console.error('[FluidClient] Failed to refresh token for new container:', refreshError);
              // エラーをスローせず、現在のクライアントで続行を試みる
            }
          }
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
      console.log('[FluidClient] Attempting to reconnect...');

      // 現在のコンテナIDがある場合は、そのIDに特化したトークンを更新
      if (this.containerId) {
        console.log(`[FluidClient] Refreshing token for container: ${this.containerId}`);
        await this.userManager.refreshToken(this.containerId);

        // 更新したトークンで再接続
        if (this.container) {
          console.log('[FluidClient] Reconnecting with refreshed token...');
          this.container.connect();
        }
      } else {
        // 一般的なトークン更新
        const userManager = UserManager.getInstance();
        await userManager.refreshToken();

        if (this.container) {
          this.container.connect();
        }
      }
    } catch (error) {
      console.error('[FluidClient] Reconnection failed:', error);
    }
  }

  public getTree() {
    const rootItems = this.appData.root.items as Items;
    console.log(rootItems.length);
    console.log(rootItems[0]);
    const items = [...rootItems];
    console.log(items);
    rootItems.map(element => {
      console.log('Element:', element);
    });

    return this.appData.root.items;
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
      default:
        return "不明";
    }
  }

  // デバッグ用のイベントリスナー設定
  private _setupDebugEventListeners() {
    if (!this.container) return;

    // TypeScriptの型定義ではopイベントは認識されていないが、実際のランタイムでは機能する
    // @ts-ignore - カスタムイベントタイプはTypeScriptの型定義に含まれていない
    this.container.on('op', (op: any) => {
      console.debug('[FluidClient] Operation received:', op);
    });

  }

  // デバッグ用のヘルパーメソッド
  getDebugInfo() {
    const rootItems = this.appData.root.items as Items;
    return {
      clientInitialized: !!this.client,
      containerConnected: this.isConnected,
      connectionState: this.getConnectionStateString(),
      containerId: this.containerId,
      treeData: this.appData ? this.getAllData() : {},
      treeCount: rootItems.length || 0,
      treeFirstItem: rootItems[0]?.text || null,
      timeStamp: new Date().toISOString(), // タイムスタンプを追加してデバッグ情報が毎回変わるようにする
      currentUser: this.userManager.getCurrentUser()
    };
  }

  // 以下は共有データ操作用のヘルパーメソッド
  getAllData() {
    if (this.appData?.root) {
      const rootItems = this.appData.root.items as Items;
      return {
        itemCount: rootItems.length,
        items: [...rootItems].map(item => ({
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
      if (this.isConnected) {
        this.container.disconnect();
      }
    } catch (e) {
      console.warn('FluidClient disposal error:', e);
    }
  }
}

