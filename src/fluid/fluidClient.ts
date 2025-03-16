import { AzureClient } from '@fluidframework/azure-client';
import type { ContainerSchema } from '@fluidframework/fluid-static';
import { SharedString } from '@fluidframework/sequence';
import { SchemaFactory, SharedTree, TreeViewConfiguration } from '@fluidframework/tree';

export class FluidClient {
	// Public properties for easier debugging
	public client: AzureClient;
	public container: any; // IFluidContainerが見つからないので、any型を使用
	public containerId: string | null = null;
	public sharedTree: SharedTree | undefined;
	public sharedString: SharedString | undefined;
	// 直接rootにアクセスするように変更

	// Schema definition with SharedTree IdCompressor enabled
	static schema = {
		initialObjects: {
			tree: (id: string) => {
				const options: ISharedTreeOptions = { enableIdCompressor: true };
				return new SharedTree(id, { summarizeEarly: false }, options);
			},
			text: SharedString
		}
	};

	constructor() {
		// Set a breakpoint here to debug initialization
		console.debug('[FluidClient] Initializing...');

		// クライアントサイドかサーバーサイドかを判断
		const isBrowser = typeof window !== 'undefined';

		// 環境に基づいてエンドポイントを設定
		const endpoint = isBrowser
			? (window as any).__FLUID_RELAY_ENDPOINT__ ||
				import.meta.env.VITE_AZURE_FLUID_RELAY_ENDPOINT ||
				'https://your-azure-fluid-relay-instance.azurefluid.net'
			: process.env.AZURE_FLUID_RELAY_ENDPOINT || 'http://0.0.0.0:7070';

		// Azure Fluid Relay の設定 (Microsoft公式ドキュメント準拠)
		const config = {
			tenantId:
				import.meta.env.VITE_AZURE_TENANT_ID || process.env.AZURE_TENANT_ID || 'your-tenant-id',
			// 開発用のダミートークンプロバイダー
			// 本番環境では AzureFunctionTokenProvider を使用してください
			tokenProvider: {
				fetchOrdererToken: async () => ({ jwt: 'dummy-token', fromCache: true }),
				fetchStorageToken: async () => ({ jwt: 'dummy-token', fromCache: true })
			},
			endpoint: endpoint,
			type: 'remote'
		};

		console.debug('[FluidClient] Using endpoint:', endpoint);

		// Azure Fluid Relay クライアントの初期化
		const clientProps = {
			connection: config
		};

		this.client = new AzureClient(clientProps);

		// デバッガー用のデバッグポイント
		// debugger; // 初期化完了時にデバッガーが停止します
	}

	async initialize() {
		try {
			console.debug('[FluidClient] Starting initialization...');

			const containerSchema: ContainerSchema = {
				initialObjects: {
					appData: SharedTree
				}
			};

			const { container } = await this.client.createContainer(containerSchema, '2');
      this.container = container;

			const schemaFactory = new SchemaFactory('some-schema-id-prob-a-uuid');

			class TodoItem extends schemaFactory.object('TodoItem', {
				description: schemaFactory.string,
				isCompleted: schemaFactory.boolean
			}) {}
			class TodoItems extends schemaFactory.array('TodoItems', TodoItem) {}

			class TodoList extends schemaFactory.object('TodoList', {
				title: schemaFactory.string,
				items: TodoItems
			}) {}

			const treeConfiguration = new TreeViewConfiguration({ schema: TodoList });

			const appData = container.initialObjects.appData.viewWith(treeConfiguration);

			appData.initialize(
        new TodoList({
					title: 'todo list',
					items: []
				})

      );

			// appData.initialize(
			// 	new TodoList({
			// 		title: 'todo list',
			// 		items: [
			// 			new TodoItem({
			// 				description: 'first item',
			// 				isComplete: true
			// 			})
			// 		]
			// 	})
			// );

			// // Schema for better debugger access
			// const schema = FluidClient.schema;

			// // 既存のコンテナを取得または新しいコンテナを作成
			// const containerResponse = this.containerId
			// 	? await this.client.getContainer(this.containerId, schema)
			// 	: await this.client.createContainer(schema);

			// this.container = containerResponse.container;
			// this.containerId = await this.container.id;

			// // 共有オブジェクトへの参照を取得
			// this.sharedTree = this.container.initialObjects.tree as SharedTree;
			// this.sharedString = this.container.initialObjects.text as SharedString;

			// // 初期化時、ルートが空の場合は初期データ構造を作成
			// // 最新のSharedTree APIでは、TreeNodeHandleの代わりに別の方法でアクセスします
			// const currentContent = this.sharedTree.jsonObjects.get('root');
			// if (!currentContent) {
			// 	this.sharedTree.jsonObjects.set('root', {});
			// }

			// コンテナの接続状態を監視
			this.container.on('connected', () => {
				console.log('Connected to Fluid service');
				// デバッガー用のデバッグポイント
				debugger; // 接続成功時にデバッガーが停止します
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
			// エラー時にデバッグしやすいようにデバッガーを停止
			debugger; // エラー発生時にデバッガーが停止します
			throw error;
		}
	}

	// データの設定と取得のためのヘルパーメソッド - SharedTree版 - 最新API対応
	setData(key: string, value: any) {
		console.debug(`[FluidClient] Setting data: ${key} =`, value);
		if (this.sharedTree) {
			// 最新のSharedTree APIを使用
			const currentData = this.sharedTree.jsonObjects.get('root') || {};
			currentData[key] = value;
			this.sharedTree.jsonObjects.set('root', currentData);
		}
	}

	getData(key: string) {
		if (this.sharedTree) {
			const data = this.sharedTree.jsonObjects.get('root');
			const value = data?.[key];
			console.debug(`[FluidClient] Getting data: ${key} =`, value);
			return value ?? null;
		}
		return null;
	}

	// 全データを一度に取得
	getAllData() {
		if (this.sharedTree) {
			return this.sharedTree.jsonObjects.get('root') || {};
		}
		return {};
	}

	// テキストの操作用メソッド
	insertText(position: number, text: string) {
		console.debug(`[FluidClient] Inserting text at position ${position}:`, text);
		if (this.sharedString) {
			this.sharedString.insertText(position, text);
		}
	}

	getText() {
		const text = this.sharedString?.getText() || '';
		console.debug(`[FluidClient] Getting text:`, text);
		return text;
	}

	// VSCode debugger用の詳細なイベントリスナー
	private _setupDebugEventListeners() {
		if (!this.container) return;

		this.container.on('op', (op: any) => {
			console.debug('[FluidClient] Operation received:', op);
		});

		// SharedTree用のイベントリスナー - 最新APIに対応
		if (this.sharedTree) {
			this.sharedTree.on('changed', () => {
				console.debug('[FluidClient] Tree changed');
				if (typeof window !== 'undefined') {
					// データの変更をページに通知するためのカスタムイベント
					window.dispatchEvent(
						new CustomEvent('fluidTreeChanged', {
							detail: { data: this.getAllData() }
						})
					);
				}
			});
		}

		if (this.sharedString) {
			this.sharedString.on('sequenceDelta', (event: any) => {
				console.debug('[FluidClient] Text changed:', event);
			});
		}
	}

	// デバッグ用のヘルパーメソッド
	getDebugInfo() {
		const treeData = this.sharedTree ? this.getAllData() : {};

		return {
			clientInitialized: !!this.client,
			containerConnected: this.container?.connected || false,
			containerId: this.containerId,
			treeInitialized: !!this.sharedTree,
			treeData: treeData,
			treeKeys: treeData ? Object.keys(treeData) : [],
			textLength: this.sharedString ? this.getText().length : 0,
			textContent: this.getText()
		};
	}
}
