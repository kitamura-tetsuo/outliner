import { describe, expect, it } from "vitest";
import type { Item } from "../schema/app-schema";
import { isArrayLikeItems, isArrayLikeUnknown, isYjsObservable, isYjsObservableDeep } from "./typeGuards";

describe("typeGuards", () => {
    describe("isArrayLikeItems", () => {
        it("returns true for objects matching ArrayLikeItems structure", () => {
            const mockItems = {
                length: 2,
                at: (_idx: number) => ({ id: "item1" } as Item),
            };
            expect(isArrayLikeItems(mockItems)).toBe(true);
        });

        it("returns false for null/undefined/primitives", () => {
            expect(isArrayLikeItems(null)).toBe(false);
            expect(isArrayLikeItems(undefined)).toBe(false);
            expect(isArrayLikeItems("string")).toBe(false);
        });

        it("returns false for missing properties", () => {
            expect(isArrayLikeItems({ length: 1 })).toBe(false);
            expect(isArrayLikeItems({ at: () => {} })).toBe(false);
            expect(isArrayLikeItems({ length: "1", at: () => {} })).toBe(false);
        });
    });

    describe("isArrayLikeUnknown", () => {
        it("returns true for matching objects", () => {
            expect(isArrayLikeUnknown({ length: 0 })).toBe(true);
            expect(isArrayLikeUnknown({ at: () => {} })).toBe(true);
            expect(isArrayLikeUnknown({ toArray: () => [] })).toBe(true);
            expect(isArrayLikeUnknown([])).toBe(true);
        });

        it("returns false for non-matching or null", () => {
            expect(isArrayLikeUnknown(null)).toBe(false);
            expect(isArrayLikeUnknown({})).toBe(false);
            expect(isArrayLikeUnknown("test")).toBe(false);
        });
    });

    describe("isYjsObservableDeep", () => {
        it("returns true for objects with observeDeep and unobserveDeep", () => {
            expect(isYjsObservableDeep({
                observeDeep: () => {},
                unobserveDeep: () => {},
            })).toBe(true);
        });

        it("returns false otherwise", () => {
            expect(isYjsObservableDeep({ observeDeep: () => {} })).toBe(false);
            expect(isYjsObservableDeep(null)).toBe(false);
        });
    });

    describe("isYjsObservable", () => {
        it("returns true for objects with observe and unobserve", () => {
            expect(isYjsObservable({
                observe: () => {},
                unobserve: () => {},
            })).toBe(true);
        });

        it("returns false otherwise", () => {
            expect(isYjsObservable({ observe: () => {} })).toBe(false);
            expect(isYjsObservable(null)).toBe(false);
        });
    });
});
