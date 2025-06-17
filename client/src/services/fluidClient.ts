import type {
    ContainerSchema,
    IFluidContainer,
} from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

export interface UpdateCellArgs {
    tableId: string;
    rowId: string;
    column: string;
    value: any;
}

export class FluidTableClient {
    private client = new TinyliciousClient({
        connection: {
            port: 7092,
        },
    });
    public container?: IFluidContainer;
    public tables?: SharedMap;
    public containerId?: string;
    public cursors: Map<string, any> = new Map();
    public presence: Map<string, any> = new Map();

    private readonly schema: ContainerSchema = {
        initialObjects: { tables: SharedMap },
    } as any;

    async createContainer(): Promise<string> {
        console.log("Creating new Fluid container...");
        const { container } = await this.client.createContainer(this.schema, "1");
        const id = await container.attach();
        this.container = container;
        this.containerId = id;
        this.tables = container.initialObjects.tables as SharedMap;
        console.log(`Container created with ID: ${id}`);
        console.log(`Container connection state: ${container.connectionState}`);
        this.setupSignalHandlers();
        return id;
    }

    async loadContainer(id: string) {
        console.log(`Loading existing Fluid container with ID: ${id}`);
        const { container } = await this.client.getContainer(id, this.schema, "1");
        this.container = container;
        this.containerId = id;
        this.tables = container.initialObjects.tables as SharedMap;
        console.log(`Container loaded with ID: ${id}`);
        console.log(`Container connection state: ${container.connectionState}`);
        this.setupSignalHandlers();
    }

    updateCell({ tableId, rowId, column, value }: UpdateCellArgs) {
        if (!this.tables) throw new Error("tables map not ready");

        // フラットなキー構造を使用: "tableId:rowId:column"
        const cellKey = `${tableId}:${rowId}:${column}`;
        this.tables.set(cellKey, value);
    }

    getCell(tableId: string, rowId: string, column: string): any {
        if (!this.tables) throw new Error("tables map not ready");

        const cellKey = `${tableId}:${rowId}:${column}`;
        return this.tables.get(cellKey);
    }

    getAllCells(tableId: string): Map<string, any> {
        if (!this.tables) throw new Error("tables map not ready");

        const result = new Map<string, any>();
        const prefix = `${tableId}:`;

        for (const [key, value] of this.tables) {
            if (key.startsWith(prefix)) {
                const cellKey = key.substring(prefix.length); // "rowId:column"
                result.set(cellKey, value);
            }
        }

        return result;
    }

    // テスト用のヘルパーメソッド: ネストしたMap構造をシミュレート
    getTableAsNestedMap(tableId: string): Map<string, Map<string, any>> | undefined {
        if (!this.tables) throw new Error("tables map not ready");

        const result = new Map<string, Map<string, any>>();
        const prefix = `${tableId}:`;
        let hasData = false;

        for (const [key, value] of this.tables) {
            if (key.startsWith(prefix)) {
                hasData = true;
                const cellKey = key.substring(prefix.length); // "rowId:column"
                const [rowId, column] = cellKey.split(":");

                if (!result.has(rowId)) {
                    result.set(rowId, new Map<string, any>());
                }
                result.get(rowId)!.set(column, value);
            }
        }

        return hasData ? result : undefined;
    }

    private setupSignalHandlers() {
        if (!this.container) {
            console.warn("Cannot setup signal handlers: container not available");
            return;
        }

        console.log("Setting up signal handlers for FluidTableClient");
        this.container.on("signal", (message: any, local: boolean) => {
            console.log(`Received signal - type: ${message.type}, local: ${local}, content:`, message.content);

            if (local) {
                console.log("Ignoring local signal");
                return; // 自分が送信したシグナルは無視
            }

            if (message.type === "cursor") {
                const { userId, cursor } = message.content;
                console.log(`Setting cursor for user ${userId}:`, cursor);
                this.cursors.set(userId, cursor);
            }
            else if (message.type === "presence") {
                const { userId, presence } = message.content;
                console.log(`Setting presence for user ${userId}:`, presence);
                // シグナルで受信した場合は直接Mapに設定（ブロードキャストしない）
                this.presence.set(userId, presence);
            }
        });
        console.log("Signal handlers setup completed");
    }

    public setCursor(userId: string, cursor: any) {
        this.cursors.set(userId, cursor);
        this.broadcastSignal("cursor", { userId, cursor });
    }

    // カーソル情報をローカルのみに設定（ブロードキャストしない）
    public setCursorLocal(userId: string, cursor: any) {
        this.cursors.set(userId, cursor);
    }

    public setPresence(userId: string, presence: any) {
        console.log(`setPresence called for user ${userId}:`, presence);
        // ローカルに設定してからブロードキャスト
        this.presence.set(userId, presence);
        console.log(`Local presence set, current presence size: ${this.presence.size}`);
        this.broadcastSignal("presence", { userId, presence });
    }

    // プレゼンス情報をローカルのみに設定（ブロードキャストしない）
    public setPresenceLocal(userId: string, presence: any) {
        console.log(`setPresenceLocal called for user ${userId}:`, presence);
        this.presence.set(userId, presence);
        console.log(`Local presence set (no broadcast), current presence size: ${this.presence.size}`);
    }

    private broadcastSignal(type: string, content: any) {
        if (!this.container) {
            console.warn(`Cannot broadcast ${type} signal: container not available`);
            return;
        }

        try {
            console.log(`Broadcasting ${type} signal:`, content);
            this.container.deltaManager.submitSignal(type, content);
            console.log(`Successfully broadcasted ${type} signal`);
        }
        catch (error) {
            console.error(`Failed to broadcast ${type} signal:`, error);
        }
    }

    public disconnect() {
        if (this.container) {
            this.container.disconnect();
        }
    }
}
