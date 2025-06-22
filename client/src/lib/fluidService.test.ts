import { type ViewableTree } from "fluid-framework";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import {
    appTreeConfiguration,
    Project,
} from "../schema/app-schema";
import * as fluidService from "./fluidService.svelte";

describe("fluidService", () => {
    beforeEach(() => {
    });

    it("getContainer", async () => {
        try {
            // Ensure VITE_IS_TEST is true for Tinylicious, or fluidService handles it.
            const [client, loadedContainer, services, appTreeView, projectRoot] = await fluidService.getFluidClient();

            expect(client).toBeDefined();
            // For a new client/container scenario without a provided ID,
            // getFluidClient might not return a fully hydrated container/project yet
            // until createNewContainer or loadContainer is called.
            // The current getContainer test seems to be more of an internal test of getFluidClient.
            // Let's adapt it or add new specific tests for container creation.

            // This test will be more meaningful if we ensure a container is created or loaded.
            // For now, just check client is created.
            // console.log("fluidService.test: getContainer returned client", client);

        } catch (error) {
            console.error("Error in getContainer test:", error);
            expect(error).toBeUndefined();
        }
    }, 10000); // Increase timeout for Fluid operations

    afterEach(() => {
        vi.useRealTimers();
        // Consider cleanup of created containers if any, though Tinylicious resets.
    });
});

// Helper function to wait for SharedTree changes to propagate
// This is a simplified version; real applications might need more robust eventing.
const waitForTreeSync = () => new Promise(resolve => setTimeout(resolve, 100));


describe("Fluid Table Synchronization", () => {
    let client: ReturnType<typeof fluidService.getFluidClient> extends Promise<infer T> ? T[0] : never;
    let container: ReturnType<typeof fluidService.getFluidClient> extends Promise<infer T> ? T[1] : never;
    let project: ReturnType<typeof fluidService.getFluidClient> extends Promise<infer T> ? T[4] : never;
    let containerId: string;

    // Helper to create a table item (Item node with JSON string in text)
    const createTableItem = (tableName: string, initialData: any[][]): import("../schema/app-schema").Item => {
        if (!project) throw new Error("Project not initialized");
        // For simplicity, table name is part of the item's text for now, or use a dedicated field if schema allows
        const tableNode = project.addPage(`Table: ${tableName}`, "test-user");
        tableNode.updateText(JSON.stringify(initialData));
        return tableNode;
    };

    const getTableData = (tableItem: import("../schema/app-schema").Item): any[][] => {
        try {
            return JSON.parse(tableItem.text);
        } catch (e) {
            console.error("Failed to parse table data from item text:", e);
            return [];
        }
    };

    const updateTableData = (tableItem: import("../schema/app-schema").Item, newData: any[][]) => {
        tableItem.updateText(JSON.stringify(newData));
    };

    beforeEach(async () => {
        // Create a new container for each test to ensure isolation
        const fluidClientInstance = await fluidService.createNewContainer("TestProjectForTableSync_" + Date.now()); // Unique name
        containerId = fluidClientInstance.containerId;

        // Re-fetch instances using the new containerId to ensure all parts are correctly initialized for the test scope
        const instances = await fluidService.getFluidClient(containerId);
        client = instances[0] as any;
        container = instances[1];
        project = instances[4];

        if (!project) throw new Error("Project could not be initialized in beforeEach for table tests.");

    }, 20000); // Increased timeout for container creation

    it("should create a table item with initial data", async () => {
        if (!project) throw new Error("Project not initialized for test");

        const initialTableData = [
            ["ID", "Name", "Value"],
            [1, "Row1", 100],
            [2, "Row2", 200],
        ];
        const tableName = "MyTestTable";

        const tableItem = createTableItem(tableName, initialTableData);
        await waitForTreeSync(); // Allow time for tree to update if necessary

        const retrievedData = getTableData(tableItem);
        expect(retrievedData).toEqual(initialTableData);
        // Also check if item text reflects the table name (as per current createTableItem helper)
        // expect(tableItem.text.includes(tableName) || project.items.find(i => i === tableItem)?.text.includes(tableName)).toBeTruthy();
         // The above check is a bit loose. A better way:
        const pageItem = project.items.find(p => p === tableItem);
        expect(pageItem).toBeDefined(); // Verify the item was added to the project
        // If table name is in title (as per addPage, before text override)
        // expect(pageItem?.text.startsWith(`Table: ${tableName}`)).toBe(true); // This is how addPage sets it.
        // The createTableItem sets the JSON to the text, overwriting the title.
        // We could modify createTableItem to store tableName in a structured way if needed.
        // For now, relying on getTableData for content verification.
    });

    it("should synchronize table data changes within a single client", async () => {
        if (!project) throw new Error("Project not initialized for test");

        const initialTableData = [ ["ID", "Name"], [1, "Alice"] ];
        const tableName = "SingleClientSyncTable";
        const tableItem = createTableItem(tableName, initialTableData);
        await waitForTreeSync();

        const updatedTableData = [ ["ID", "Name"], [1, "Alice Smith"] ]; // Name updated
        updateTableData(tableItem, updatedTableData);
        await waitForTreeSync(); // Wait for the update to process

        const retrievedData = getTableData(tableItem);
        expect(retrievedData).toEqual(updatedTableData);

        // Verify another way: fetch the item again from the project (simulating re-read)
        const reFetchedItem = project.items.find(item => item.id === tableItem.id);
        expect(reFetchedItem).toBeDefined();
        if (reFetchedItem) {
            const reFetchedItemData = getTableData(reFetchedItem);
            expect(reFetchedItemData).toEqual(updatedTableData);
        }
    });

    // More tests to come:
    // - 2-client data sync

    it("should synchronize table data changes between two clients", async () => {
        if (!project || !containerId) throw new Error("Project or containerId not initialized for 2-client test");

        // Client 1 (already set up in beforeEach)
        const project1 = project;

        // Create Client 2, connect to the same container
        const instances2 = await fluidService.getFluidClient(containerId);
        const project2 = instances2[4];
        if (!project2) throw new Error("Client 2 project could not be initialized");

        // Initial data setup by Client 1
        const initialTableData = [ ["ID", "Name"], [10, "Initial"] ];
        const tableName = "TwoClientTable";
        const tableItem1 = createTableItem(tableName, initialTableData); // Uses project1
        await waitForTreeSync(); // Ensure Client 1's change is initially set

        // Client 2 reads initial data
        // Need to find the corresponding item in project2. We assume IDs are stable.
        // However, createTableItem uses addPage which creates a new item with a new ID.
        // For this test, let's assume the table is the first item/page for simplicity,
        // or use a known path/ID if the schema supported it better.
        // A more robust way would be to list items and find by a unique name/property if set.

        // Let Client 2 wait for and find the item created by Client 1
        // This requires a mechanism for Client 2 to know when the item is available.
        // For now, we'll wait and assume it appears. A real app would use collection events.
        await waitForTreeSync(); // Allow Client 2 to receive initial item from Client 1

        let tableItem2 = project2.items.find(item => item.id === tableItem1.id);
        // If not found immediately, wait a bit more (very simplified sync wait)
        if (!tableItem2) {
            console.log("Client 2 waiting longer for table item to appear...");
            for (let i=0; i<5; i++) { // Poll a few times
                await waitForTreeSync();
                tableItem2 = project2.items.find(item => item.id === tableItem1.id);
                if (tableItem2) break;
            }
        }
        if (!tableItem2) throw new Error(`Client 2 could not find table item ${tableItem1.id}`);

        expect(getTableData(tableItem2)).toEqual(initialTableData);

        // Client 1 updates the data
        const updatedDataByClient1 = [ ["ID", "Name"], [10, "Updated by Client 1"] ];
        updateTableData(tableItem1, updatedDataByClient1); // tableItem1 is on project1
        await waitForTreeSync(); // Allow update to propagate from Client 1

        // Client 2 should see the update
        await waitForTreeSync(); // Allow Client 2 to receive the update
        expect(getTableData(tableItem2)).toEqual(updatedDataByClient1);

        // Client 2 updates the data
        const updatedDataByClient2 = [ ["ID", "Name"], [20, "Updated by Client 2"] ];
        updateTableData(tableItem2, updatedDataByClient2); // tableItem2 is on project2
        await waitForTreeSync(); // Allow update to propagate from Client 2

        // Client 1 should see Client 2's update
        await waitForTreeSync(); // Allow Client 1 to receive the update
        expect(getTableData(tableItem1)).toEqual(updatedDataByClient2);

    }, 30000); // Longer timeout for multi-client operations
});
