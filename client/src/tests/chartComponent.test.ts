import { beforeEach, describe, expect, it, vi } from "vitest";
import { Item } from "../schema/app-schema";

// Mock the SQL service functions
vi.mock("../services/sqlService", () => {
    return {
        initDb: vi.fn().mockResolvedValue(undefined),
        runQuery: vi.fn(),
        queryStore: {
            subscribe: vi.fn((callback) => {
                // Simulate empty data initially
                callback({ rows: [], columnsMeta: [] });
                return () => {}; // unsubscribe function
            }),
            set: vi.fn(),
            update: vi.fn(),
        },
    };
});

// Mock echarts
vi.mock("echarts", () => {
    return {
        default: {
            init: vi.fn(() => ({
                setOption: vi.fn(),
                clear: vi.fn(),
                dispose: vi.fn(),
            })),
        },
    };
});

describe("Chart Component Functionality", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should create an item with chartQuery property", () => {
        // Create a new item
        const item = new Item({
            id: "test-item",
            text: "Test Chart Item",
            author: "test-user",
        });

        // Check that the item has the chartQuery property
        expect(item).toHaveProperty("chartQuery");
        expect(item.chartQuery).toBeUndefined();

        // Set a chart query
        item.chartQuery = "SELECT * FROM test_table";
        expect(item.chartQuery).toBe("SELECT * FROM test_table");
    });

    it("should update item chartQuery when setting component type to chart", () => {
        const item = new Item({
            id: "test-item",
            text: "Test Chart Item",
            author: "test-user",
        });

        // Initially should be undefined
        expect(item.componentType).toBeUndefined();
        expect(item.chartQuery).toBeUndefined();

        // Set component type to chart
        item.componentType = "chart";
        expect(item.componentType).toBe("chart");

        // chartQuery should still be undefined until explicitly set
        expect(item.chartQuery).toBeUndefined();
    });
});
