import { describe, expect, it } from "vitest";
import { isArrayLikeItems, isArrayLikeUnknown, isYjsObservable, isYjsObservableDeep } from "./typeGuards";

describe("typeGuards", () => {
    describe("isArrayLikeItems", () => {
        it("should return true for valid ArrayLikeItems", () => {
            const obj = { length: 2, at: () => {} };
            expect(isArrayLikeItems(obj)).toBe(true);
        });

        it("should return false for invalid objects", () => {
            expect(isArrayLikeItems(null)).toBe(false);
            expect(isArrayLikeItems(undefined)).toBe(false);
            expect(isArrayLikeItems({})).toBe(false);
            expect(isArrayLikeItems({ length: "2", at: () => {} })).toBe(false); // length is not a number
            expect(isArrayLikeItems({ length: 2 })).toBe(false); // missing 'at'
            expect(isArrayLikeItems({ length: 2, at: "not a function" })).toBe(false); // 'at' is not a function
        });
    });

    describe("isArrayLikeUnknown", () => {
        it("should return true for valid ArrayLikeUnknown", () => {
            expect(isArrayLikeUnknown({ length: 2 })).toBe(true);
            expect(isArrayLikeUnknown({ at: () => {} })).toBe(true);
            expect(isArrayLikeUnknown({ toArray: () => [] })).toBe(true);
        });

        it("should return false for invalid objects", () => {
            expect(isArrayLikeUnknown(null)).toBe(false);
            expect(isArrayLikeUnknown(undefined)).toBe(false);
            expect(isArrayLikeUnknown({})).toBe(false);
            expect(isArrayLikeUnknown("string")).toBe(false); // Not an object (typeof string is string)
        });
    });

    describe("isYjsObservableDeep", () => {
        it("should return true for valid YjsObservableDeep", () => {
            const obj = { observeDeep: () => {}, unobserveDeep: () => {} };
            expect(isYjsObservableDeep(obj)).toBe(true);
        });

        it("should return false for invalid objects", () => {
            expect(isYjsObservableDeep(null)).toBe(false);
            expect(isYjsObservableDeep(undefined)).toBe(false);
            expect(isYjsObservableDeep({})).toBe(false);
            expect(isYjsObservableDeep({ observeDeep: () => {} })).toBe(false);
            expect(isYjsObservableDeep({ unobserveDeep: () => {} })).toBe(false);
        });
    });

    describe("isYjsObservable", () => {
        it("should return true for valid YjsObservable", () => {
            const obj = { observe: () => {}, unobserve: () => {} };
            expect(isYjsObservable(obj)).toBe(true);
        });

        it("should return false for invalid objects", () => {
            expect(isYjsObservable(null)).toBe(false);
            expect(isYjsObservable(undefined)).toBe(false);
            expect(isYjsObservable({})).toBe(false);
            expect(isYjsObservable({ observe: () => {} })).toBe(false);
            expect(isYjsObservable({ unobserve: () => {} })).toBe(false);
        });
    });
});
