import { describe, expect, it } from "vitest";
import { filterObjects, generateBulkPreview, type NamedObject, validateRename } from "./ObjectManagerController";

describe("ObjectManagerController", () => {
    describe("filterObjects", () => {
        const mockObjects: NamedObject[] = [
            { id: "1", type: "Table", name: "User Table", placements: [] },
            { id: "2", type: "Table", name: "Admin Table", placements: [] },
            { id: "3", type: "Grid", name: "User Grid", placements: [] },
            { id: "4", type: "Schedule", name: "Nightly Sync", placements: [] },
            { id: "5", type: "Calendar", name: "User Calendar", placements: [] },
        ];

        it("should filter by selected types", () => {
            const selectedTypes = new Set(["Table"]);
            const result = filterObjects(mockObjects, selectedTypes, "");
            expect(result).toHaveLength(2);
            expect(result.map(o => o.id)).toEqual(["1", "2"]);
        });

        it("should filter by search query (case-insensitive)", () => {
            const selectedTypes = new Set(["Table", "Grid", "Schedule", "Calendar"]);
            const result = filterObjects(mockObjects, selectedTypes, "user");
            expect(result).toHaveLength(3);
            expect(result.map(o => o.id)).toEqual(["1", "3", "5"]);
        });

        it("should filter by both type and search query", () => {
            const selectedTypes = new Set(["Table"]);
            const result = filterObjects(mockObjects, selectedTypes, "user");
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1");
        });

        it("should include Calendar objects when selected", () => {
            const selectedTypes = new Set(["Calendar"]);
            const result = filterObjects(mockObjects, selectedTypes, "");
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe("Calendar");
        });

        it("should exclude Calendar objects when not selected", () => {
            const selectedTypes = new Set(["Table", "Grid", "Schedule"]);
            const result = filterObjects(mockObjects, selectedTypes, "");
            expect(result.some(o => o.type === "Calendar")).toBe(false);
        });
    });

    describe("generateBulkPreview", () => {
        const mockObjects: NamedObject[] = [
            { id: "1", type: "Table", name: "Template Users", placements: [] },
            { id: "2", type: "Table", name: "Template Orders", placements: [] },
            { id: "3", type: "Grid", name: "Template Users Grid", placements: [] },
            { id: "4", type: "Table", name: "Other Table", placements: [] },
            { id: "5", type: "Calendar", name: "Template Calendar", placements: [] },
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
            const obj: NamedObject[] = [{ id: "1", type: "Table", name: "copy test copy", placements: [] }];
            const selectedObjectIds = new Set(["1"]);
            const result = generateBulkPreview(obj, selectedObjectIds, "copy", "original");

            expect(result[0].newName).toBe("original test original");
        });

        it("should allow replacing with an empty string", () => {
            const selectedObjectIds = new Set(["5"]);
            const result = generateBulkPreview(mockObjects, selectedObjectIds, "Template ", "");
            expect(result[0].newName).toBe("Calendar");
        });
    });

    describe("validateRename", () => {
        it("rejects an empty name", () => {
            expect(validateRename(undefined, "Grid", "g1", "")).toBe("Name cannot be empty.");
        });

        it("rejects a whitespace-only name", () => {
            expect(validateRename(undefined, "Grid", "g1", "   ")).toBe("Name cannot be empty.");
        });

        it("accepts a non-empty name, including one that duplicates another object's name", () => {
            expect(validateRename(undefined, "Grid", "g1", "Duplicate Name")).toBeNull();
        });
    });
});
