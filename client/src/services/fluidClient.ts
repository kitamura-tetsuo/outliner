import type {
    ContainerSchema,
    IFluidContainer,
} from "@fluidframework/fluid-static";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedMap } from "fluid-framework";

export interface UpdateCellArgs {
    tableId: string;
    rowId: string;
    column: string;
    value: any;
}

export class FluidTableClient {
    private client = new TinyliciousClient();
    public container?: IFluidContainer;
    public tables?: SharedMap;
    public containerId?: string;

    private readonly schema: ContainerSchema = {
        initialObjects: { tables: SharedMap },
    } as any;

    async createContainer(): Promise<string> {
        const { container } = await this.client.createContainer(this.schema, "1");
        const id = await container.attach();
        this.container = container;
        this.containerId = id;
        this.tables = container.initialObjects.tables as SharedMap;
        return id;
    }

    async loadContainer(id: string) {
        const { container } = await this.client.getContainer(id, this.schema, "1");
        this.container = container;
        this.containerId = id;
        this.tables = container.initialObjects.tables as SharedMap;
    }

    updateCell({ tableId, rowId, column, value }: UpdateCellArgs) {
        if (!this.tables) throw new Error("tables map not ready");
        let table = this.tables.get(tableId) as SharedMap | undefined;
        if (!table) {
            table = new SharedMap();
            this.tables.set(tableId, table);
        }
        let row = table.get(rowId) as SharedMap | undefined;
        if (!row) {
            row = new SharedMap();
            table.set(rowId, row);
        }
        row.set(column, value);
    }
}
