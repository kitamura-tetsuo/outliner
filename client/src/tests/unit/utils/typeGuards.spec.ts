import { describe, expect, it } from "vitest";
import { isArrayLikeItems, isArrayLikeUnknown, isYjsObservable, isYjsObservableDeep } from "../../../utils/typeGuards";

describe("typeGuards", () => {
    describe("isArrayLikeItems", () => {
        it("returns true for valid ArrayLikeItems", () => {
            expect(
                isArrayLikeItems({
                    length: 2,
                    at: (_idx: number) => undefined,
                }),
            ).toBe(true);
        });

        it("returns false for null", () => {
            expect(isArrayLikeItems(null)).toBe(false);
        });

        it("returns false for object missing length", () => {
            expect(
                isArrayLikeItems({
                    at: (_idx: number) => undefined,
                }),
            ).toBe(false);
        });

        it("returns false for object with non-number length", () => {
            expect(
                isArrayLikeItems({
                    length: "2",
                    at: (_idx: number) => undefined,
                }),
            ).toBe(false);
        });

        it("returns false for object missing at", () => {
            expect(
                isArrayLikeItems({
                    length: 2,
                }),
            ).toBe(false);
        });

        it("returns false for non-object", () => {
            expect(isArrayLikeItems("string")).toBe(false);
        });
    });

    describe("isArrayLikeUnknown", () => {
        it("returns true for object with length", () => {
            expect(isArrayLikeUnknown({ length: 2 })).toBe(true);
        });

        it("returns true for object with at", () => {
            expect(isArrayLikeUnknown({ at: () => {} })).toBe(true);
        });

        it("returns true for object with toArray", () => {
            expect(isArrayLikeUnknown({ toArray: () => [] })).toBe(true);
        });

        it("returns false for empty object", () => {
            expect(isArrayLikeUnknown({})).toBe(false);
        });

        it("returns false for null", () => {
            expect(isArrayLikeUnknown(null)).toBe(false);
        });
    });

    describe("isYjsObservableDeep", () => {
        it("returns true for object with observeDeep and unobserveDeep", () => {
            expect(
                isYjsObservableDeep({
                    observeDeep: () => {},
                    unobserveDeep: () => {},
                }),
            ).toBe(true);
        });

        it("returns false for object missing observeDeep", () => {
            expect(
                isYjsObservableDeep({
                    unobserveDeep: () => {},
                }),
            ).toBe(false);
        });

        it("returns false for object missing unobserveDeep", () => {
            expect(
                isYjsObservableDeep({
                    observeDeep: () => {},
                }),
            ).toBe(false);
        });

        it("returns false for null", () => {
            expect(isYjsObservableDeep(null)).toBe(false);
        });
    });

    describe("isYjsObservable", () => {
        it("returns true for object with observe and unobserve", () => {
            expect(
                isYjsObservable({
                    observe: () => {},
                    unobserve: () => {},
                }),
            ).toBe(true);
        });

        it("returns false for object missing observe", () => {
            expect(
                isYjsObservable({
                    unobserve: () => {},
                }),
            ).toBe(false);
        });

        it("returns false for object missing unobserve", () => {
            expect(
                isYjsObservable({
                    observe: () => {},
                }),
            ).toBe(false);
        });

        it("returns false for null", () => {
            expect(isYjsObservable(null)).toBe(false);
        });
    });
});
