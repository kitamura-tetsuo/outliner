import type { ITokenProvider } from '@fluidframework/azure-client';
import { AzureClient } from '@fluidframework/azure-client';
import { type ContainerSchema, SharedTree } from "fluid-framework";
import { getFluidClient } from '../lib/fluidService';
import { appTreeConfiguration, Items } from "../schema/app-schema";

// ユーザー情報の型定義
export interface IUser {
  id: string;
  name: string;
  email?: string;
}

export class FluidClient {
	// Public properties for easier debugging
	public client: AzureClient;
	public container: any; // IFluidContainerが見つからないので、any型を使用
	public containerId: string | null = null;
	public sharedTree: SharedTree | undefined;
	// ユーザー情報を保持するプロパティ
	public currentUser: IUser | null = null;

	// Schema definition with SharedTree IdCompressor enabled
	constructor() {
		// Set a breakpoint here to debug initialization
		console.debug('[FluidClient] Initializing...');
		
		// fluidService.tsからシングルトンクライアントを取得
		const { client } = getFluidClient();
		this.client = client;
	}

	// ユーザー登録メソッド
	public async registerUser(userData: IUser): Promise<IUser> {
		try {
			console.debug(`[FluidClient] Registering user: ${userData.name}`);
			
			// 実際の環境では、ここでバックエンドAPIを呼び出してユーザーを登録し、
			// 認証トークンを取得します。このサンプルではシミュレーションします。
			
			// ユーザーIDが指定されていない場合はランダムに生成
			if (!userData.id) {
				userData.id = `user-${Math.random().toString(36).substring(2, 9)}`;
			}
			
			// ユーザー情報を保存
			this.currentUser = userData;
			
			// ローカルストレージにユーザー情報を保存（ブラウザ環境の場合）
			if (typeof window !== 'undefined') {
				localStorage.setItem('fluidUser', JSON.stringify(userData));
			}
			
			// クライアントを再初期化して新しいユーザー情報を反映
			this.reinitializeClient();
			
			console.debug(`[FluidClient] User registered successfully: ${userData.id}`);
			return userData;
		} catch (error) {
			console.error('Error registering user:', error);
			throw error;
		}
	}

	// 保存されたユーザー情報を取得
	public loadSavedUser(): IUser | null {
		if (typeof window !== 'undefined') {
			const savedUser = localStorage.getItem('fluidUser');
			if (savedUser) {
				this.currentUser = JSON.parse(savedUser);
				return this.currentUser;
			}
		}
		return null;
	}

	// クライアントを新しいユーザー情報で再初期化
	private reinitializeClient(): void {
		// シングルトン実装を利用するため、単にgetFluidClientを呼び出すだけでよい
		const { client } = getFluidClient(this.currentUser?.id);
		this.client = client;
		console.debug(`[FluidClient] Client reinitialized for user: ${this.currentUser?.id || 'anonymous'}`);
	}

	// ユーザー情報に基づいたトークンプロバイダーを取得
	private getTokenProvider(): ITokenProvider {
		// ユーザーが認証されている場合は実際のトークンを取得
		if (this.currentUser) {
			return {
				fetchOrdererToken: async () => {
					console.debug(`[FluidClient] Fetching orderer token for user: ${this.currentUser.id}`);
					return {
						jwt: `simulated-token-for-${this.currentUser.id}`,
						fromCache: false
					};
				},
				fetchStorageToken: async () => {
					console.debug(`[FluidClient] Fetching storage token for user: ${this.currentUser.id}`);
					return {
						jwt: `simulated-token-for-${this.currentUser.id}`,
						fromCache: false
					};
				}
			};
		}
		
		// 未認証の場合はダミートークンを使用（開発環境のみ）
		return {
			fetchOrdererToken: async () => ({ jwt: 'dummy-token', fromCache: true }),
			fetchStorageToken: async () => ({ jwt: 'dummy-token', fromCache: true })
		};
	}

	async initialize() {
		try {
			console.debug('[FluidClient] Starting initialization...');

			// 保存されたユーザー情報があれば読み込む
			if (!this.currentUser) {
				this.loadSavedUser();
			}

			// IdCompressorを有効にしたコンテナスキーマを定義
			const containerSchema: ContainerSchema = {
				initialObjects: {
					appData: SharedTree
				}
			};

			// fluid-service.ts から適切なクライアントを取得
			const { client, schema } = getFluidClient(this.currentUser?.id, containerSchema);
			this.client = client;

			// バージョン2を明示的に指定してIdCompressorを有効化
			const { container } = await this.client.createContainer(schema, "2");
			this.container = container;
			this.containerId = await container.attach();
			
			// スキーマを指定してTreeViewを構成
			const appData = container.initialObjects.appData.viewWith(appTreeConfiguration);
			
			// 初期データでアプリを初期化
			appData.initialize(new Items([]));
			appData.root.addNode("test");

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

	// デバッグ用のイベントリスナー設定
	private _setupDebugEventListeners() {
		if (!this.container) return;

		this.container.on('op', (op: any) => {
			console.debug('[FluidClient] Operation received:', op);
		});

		// SharedTree用のイベントリスナー
		if (this.sharedTree) {
			this.sharedTree.on('changed', () => {
				console.debug('[FluidClient] Tree changed');
				if (typeof window !== 'undefined') {
					window.dispatchEvent(
						new CustomEvent('fluidTreeChanged', {
							detail: { data: this.getAllData() }
						})
					);
				}
			});
		}
	}

	// デバッグ用のヘルパーメソッド
	getDebugInfo() {
		return {
			clientInitialized: !!this.client,
			containerConnected: this.container?.connected || false,
			containerId: this.containerId,
			treeInitialized: !!this.sharedTree,
			treeData: this.getAllData(),
			treeKeys: Object.keys(this.getAllData() || {}),
			currentUser: this.currentUser
		};
	}
	
	// 以下は共有データ操作用のヘルパーメソッド
	getAllData() {
		if (this.sharedTree) {
			return this.sharedTree.jsonObjects.get('root') || {};
		}
		return {};
	}
}

