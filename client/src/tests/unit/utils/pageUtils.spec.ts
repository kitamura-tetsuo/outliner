import { describe, expect, it } from "vitest";
import type { Item } from "../../../schema/app-schema";
import { findPageByName, generateDefaultPageTitle } from "../../../utils/pageUtils";

describe("pageUtils", () => {
    describe("generateDefaultPageTitle", () => {
        it("should generate a title with the correct format", () => {
            const title = generateDefaultPageTitle();
            expect(title).toMatch(/^New Page \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}$/);
        });
    });

    describe("findPageByName", () => {
        it("should return null if items is null or undefined", () => {
            expect(findPageByName(null, "Test")).toBeNull();
            expect(findPageByName(undefined, "Test")).toBeNull();
        });

        it("should find a page by exact match", () => {
            const items = [{ text: "Test Page" }] as unknown as Iterable<Item>;
            expect(findPageByName(items, "Test Page")).toEqual({ text: "Test Page" });
        });

        it("should find a page ignoring case", () => {
            const items = [{ text: "test page" }] as unknown as Iterable<Item>;
            expect(findPageByName(items, "Test PAGE")).toEqual({ text: "test page" });
        });

        it("should find a page ignoring leading/trailing spaces", () => {
            const items = [{ text: "  Test Page  " }] as unknown as Iterable<Item>;
            expect(findPageByName(items, "Test Page")).toEqual({ text: "  Test Page  " });
        });

        it("should find a page with URI encoded names", () => {
            const items = [{ text: "Test%20Page" }] as unknown as Iterable<Item>;
            expect(findPageByName(items, "Test%20Page")).toEqual({ text: "Test%20Page" });
        });

        it("should return null if no matching page is found", () => {
            const items = [{ text: "Another Page" }] as unknown as Iterable<Item>;
            expect(findPageByName(items, "Test Page")).toBeNull();
        });

        it("should return the first match if there are duplicate titles", () => {
            const first = { text: "Alpha", id: "1" };
            const second = { text: "alpha", id: "2" };
            const items = [first, second] as unknown as Iterable<Item>;
            expect(findPageByName(items, "Alpha")).toBe(first);
        });

        it("should handle items with non-string text gracefully", () => {
            const items = [{ text: { toString: () => "Stringified Text" } }, { text: null }] as unknown as Iterable<
                Item
            >;
            expect(findPageByName(items, "Stringified Text")).toEqual({ text: { toString: expect.any(Function) } });
            expect(findPageByName(items, "Non-existent")).toBeNull();
        });
    });
});
