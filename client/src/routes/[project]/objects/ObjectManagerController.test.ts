import { describe, expect, it } from "vitest";
import { filterObjects, generateBulkPreview, type NamedObject } from "./ObjectManagerController";

describe("ObjectManagerController", () => {
    describe("filterObjects", () => {
        const mockObjects: NamedObject[] = [
            { id: "1", type: "Table", name: "User Table" },
            { id: "2", type: "Table", name: "Admin Table" },
            { id: "3", type: "Grid", name: "User Grid" },
            { id: "4", type: "Schedule", name: "Nightly Sync" },
        ];

        it("should filter by selected types", () => {
            const selectedTypes = new Set(["Table"]);
            const result = filterObjects(mockObjects, selectedTypes, "");
            expect(result).toHaveLength(2);
            expect(result.map(o => o.id)).toEqual(["1", "2"]);
        });

        it("should filter by search query (case-insensitive)", () => {
            const selectedTypes = new Set(["Table", "Grid", "Schedule"]);
            const result = filterObjects(mockObjects, selectedTypes, "user");
            expect(result).toHaveLength(2);
            expect(result.map(o => o.id)).toEqual(["1", "3"]);
        });

        it("should filter by both type and search query", () => {
            const selectedTypes = new Set(["Table"]);
            const result = filterObjects(mockObjects, selectedTypes, "user");
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1");
        });
    });

    describe("generateBulkPreview", () => {
        const mockObjects: NamedObject[] = [
            { id: "1", type: "Table", name: "Template Users" },
            { id: "2", type: "Table", name: "Template Orders" },
            { id: "3", type: "Grid", name: "Template Users Grid" },
            { id: "4", type: "Table", name: "Other Table" },
        ];

        it("should generate a preview with new names using replaceAll", () => {
            const selectedObjectIds = new Set(["1", "2", "3"]);
            const result = generateBulkPreview(mockObjects, selectedObjectIds, "Template ", "Project A ");

            expect(result).toHaveLength(3);
            expect(result.find(r => r.id === "1")?.newName).toBe("Project A Users");
            expect(result.find(r => r.id === "2")?.newName).toBe("Project A Orders");
            expect(result.find(r => r.id === "3")?.newName).toBe("Project A Users Grid");
        });

        it("should only include objects whose names will actually change", () => {
            const selectedObjectIds = new Set(["1", "2", "3", "4"]);
            // Object 4 does not contain "Template", so its name won't change
            const result = generateBulkPreview(mockObjects, selectedObjectIds, "Template ", "");

            expect(result).toHaveLength(3);
            expect(result.map(r => r.id)).not.toContain("4");
        });

        it("should replace all occurrences of the find string", () => {
            const obj: NamedObject[] = [{ id: "1", type: "Table", name: "copy test copy" }];
            const selectedObjectIds = new Set(["1"]);
            const result = generateBulkPreview(obj, selectedObjectIds, "copy", "original");

            expect(result[0].newName).toBe("original test original");
        });
    });
});
