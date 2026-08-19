import { describe, expect, it } from "vitest";
import {
    canBeLayoutChild,
    DEFAULT_COLUMN_SPAN,
    isLayoutComponentType,
    isVisualComponentType,
    LAYOUT_COLUMN_COUNT,
    LAYOUT_COMPONENT_TYPE,
    normalizeColumnSpan,
    visualComponentTypes,
} from "./layoutModel";

describe("layoutModel", () => {
    describe("the visual component registry", () => {
        it("accepts the Grid and Calendar blocks", () => {
            expect(isVisualComponentType("yjstable")).toBe(true);
            expect(isVisualComponentType("calendar")).toBe(true);
            expect(visualComponentTypes().sort()).toEqual(["calendar", "yjstable"]);
        });

        it("rejects ordinary text items, which carry no component type", () => {
            expect(isVisualComponentType(undefined)).toBe(false);
            expect(canBeLayoutChild(undefined)).toBe(false);
        });

        it("rejects an unknown component type rather than assuming it renders", () => {
            expect(isVisualComponentType("chart")).toBe(false);
        });

        it("keeps the Layout itself out, so nested Layouts need no special case", () => {
            expect(isLayoutComponentType(LAYOUT_COMPONENT_TYPE)).toBe(true);
            expect(isVisualComponentType(LAYOUT_COMPONENT_TYPE)).toBe(false);
            expect(canBeLayoutChild(LAYOUT_COMPONENT_TYPE)).toBe(false);
        });
    });

    describe("normalizeColumnSpan", () => {
        it("keeps a valid span untouched", () => {
            for (let span = 1; span <= LAYOUT_COLUMN_COUNT; span++) {
                expect(normalizeColumnSpan(span)).toBe(span);
            }
        });

        it("clamps to the 12-column track system", () => {
            expect(normalizeColumnSpan(0)).toBe(1);
            expect(normalizeColumnSpan(-4)).toBe(1);
            expect(normalizeColumnSpan(13)).toBe(LAYOUT_COLUMN_COUNT);
            expect(normalizeColumnSpan(1000)).toBe(LAYOUT_COLUMN_COUNT);
        });

        it("floors a fractional span instead of producing a fractional track", () => {
            expect(normalizeColumnSpan(4.9)).toBe(4);
        });

        it("falls back to the documented default for a missing or unusable value", () => {
            expect(normalizeColumnSpan(undefined)).toBe(DEFAULT_COLUMN_SPAN);
            expect(normalizeColumnSpan(null)).toBe(DEFAULT_COLUMN_SPAN);
            expect(normalizeColumnSpan("6")).toBe(DEFAULT_COLUMN_SPAN);
            expect(normalizeColumnSpan(Number.NaN)).toBe(DEFAULT_COLUMN_SPAN);
            expect(normalizeColumnSpan(Number.POSITIVE_INFINITY)).toBe(DEFAULT_COLUMN_SPAN);
        });

        it("defaults to full width", () => {
            expect(DEFAULT_COLUMN_SPAN).toBe(LAYOUT_COLUMN_COUNT);
        });
    });
});
