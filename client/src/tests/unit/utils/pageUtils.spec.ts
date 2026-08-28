import { describe, expect, it } from "vitest";
import type { Item } from "../../../schema/app-schema";
import {
    allocatePageTitle,
    findPageByKey,
    findPageByName,
    generateDefaultPageTitle,
    isPageNamed,
} from "../../../utils/pageUtils";

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

    describe("findPageByKey", () => {
        const first = { key: "k1", id: "i1", text: "Alpha" };
        const second = { key: "k2", id: "i2", text: "Beta" };
        const items = [first, second] as unknown as Iterable<Item>;

        it("finds a page by key regardless of its current title", () => {
            expect(findPageByKey(items, "k2")).toBe(second);
        });

        it("accepts the id as an identity too", () => {
            expect(findPageByKey(items, "i1")).toBe(first);
        });

        it("returns undefined for an unknown key or empty input", () => {
            expect(findPageByKey(items, "k3")).toBeUndefined();
            expect(findPageByKey(items, undefined)).toBeUndefined();
            expect(findPageByKey(undefined, "k1")).toBeUndefined();
        });
    });

    describe("isPageNamed", () => {
        const item = { key: "k1", id: "i1", text: "  Test Page  " } as unknown as Item;

        it("matches the route segment a page's title produces", () => {
            expect(isPageNamed(item, "Test Page")).toBe(true);
            expect(isPageNamed(item, "test page")).toBe(true);
            expect(isPageNamed(item, "Test%20Page")).toBe(true);
        });

        it("matches encoded non-ASCII titles", () => {
            const japanese = { text: "書式" } as unknown as Item;
            expect(isPageNamed(japanese, "書式")).toBe(true);
            expect(isPageNamed(japanese, encodeURIComponent("書式"))).toBe(true);
        });

        it("does not match another page's name, an untitled page or an empty route", () => {
            expect(isPageNamed(item, "Another Page")).toBe(false);
            expect(isPageNamed(item, "")).toBe(false);
            expect(isPageNamed(undefined, "Test Page")).toBe(false);
            expect(isPageNamed({ text: "   " } as unknown as Item, "Test Page")).toBe(false);
        });
    });

    describe("allocatePageTitle", () => {
        it("should return the original title if there are no collisions", () => {
            const items = [{ text: "Other Page" }] as unknown as Iterable<Item>;
            expect(allocatePageTitle(items, "My New Page")).toBe("My New Page");
        });

        it("should trim the input title", () => {
            const items = [] as unknown as Iterable<Item>;
            expect(allocatePageTitle(items, "  My New Page  ")).toBe("My New Page");
        });

        it("should return 'Untitled' for empty or whitespace-only strings", () => {
            const items = [] as unknown as Iterable<Item>;
            expect(allocatePageTitle(items, "")).toBe("Untitled");
            expect(allocatePageTitle(items, "   ")).toBe("Untitled");
        });

        it("should allocate 'Untitled_2' if 'Untitled' already exists", () => {
            const items = [{ text: "Untitled" }] as unknown as Iterable<Item>;
            expect(allocatePageTitle(items, "")).toBe("Untitled_2");
        });

        it("should handle case-insensitive collisions", () => {
            const items = [{ text: "UNTITLED" }] as unknown as Iterable<Item>;
            expect(allocatePageTitle(items, "")).toBe("Untitled_2");
        });

        it("should skip existing suffixes and find the next gap", () => {
            const items = [{ text: "Untitled" }, { text: "Untitled_2" }, { text: "Untitled_4" }] as unknown as Iterable<
                Item
            >;
            expect(allocatePageTitle(items, "")).toBe("Untitled_3");
        });

        it("should exclude the current item ID when checking for collisions", () => {
            const items = [{ text: "Untitled", id: "item123" }] as unknown as Iterable<Item>;
            expect(allocatePageTitle(items, "", "item123")).toBe("Untitled");
        });

        it("should allocate names deterministically when repairing multiple blank titles sequentially", () => {
            const items = [] as unknown as Item[];
            const title1 = allocatePageTitle(items, "");
            items.push({ text: title1 } as unknown as Item);
            const title2 = allocatePageTitle(items, "");
            items.push({ text: title2 } as unknown as Item);
            const title3 = allocatePageTitle(items, "");

            expect(title1).toBe("Untitled");
            expect(title2).toBe("Untitled_2");
            expect(title3).toBe("Untitled_3");
        });

        it("suffixes '-', the reserved project-management path segment, instead of allocating it plain", () => {
            const items = [] as unknown as Iterable<Item>;
            expect(allocatePageTitle(items, "-")).toBe("-_2");
        });

        it("still resolves collisions among suffixed '-' titles", () => {
            const items = [{ text: "-_2" }] as unknown as Iterable<Item>;
            expect(allocatePageTitle(items, "-")).toBe("-_3");
        });

        it("does not reserve names that merely contain '-'", () => {
            const items = [] as unknown as Iterable<Item>;
            expect(allocatePageTitle(items, "well-known")).toBe("well-known");
        });
    });
});
