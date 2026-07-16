import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatDateTimeSeconds } from "./dateUtils";

describe("dateUtils", () => {
    describe("formatDate", () => {
        it("returns empty string for null or undefined", () => {
            expect(formatDate(null)).toBe("");
            expect(formatDate(undefined)).toBe("");
        });

        it("returns empty string for invalid dates", () => {
            expect(formatDate("invalid-date")).toBe("");
            expect(formatDate(NaN)).toBe("");
        });

        it("formats valid Date objects to YYYY-MM-DD", () => {
            const d = new Date("2023-01-15T00:00:00Z");
            expect(formatDate(d)).toMatch(/^2023-01-1[456]$/); // Account for timezone offset
        });

        it("formats timestamps to YYYY-MM-DD", () => {
            const timestamp = 1673740800000; // 2023-01-15T00:00:00Z
            expect(formatDate(timestamp)).toMatch(/^2023-01-1[456]$/);
        });
    });

    describe("formatDateTime", () => {
        it("returns empty string for null or undefined", () => {
            expect(formatDateTime(null)).toBe("");
            expect(formatDateTime(undefined)).toBe("");
        });

        it("returns empty string for invalid dates", () => {
            expect(formatDateTime("invalid-date")).toBe("");
            expect(formatDateTime(NaN)).toBe("");
        });

        it("formats valid Date objects to YYYY-MM-DD HH:MM", () => {
            const d = new Date("2023-01-15T14:30:00Z");
            expect(formatDateTime(d)).toMatch(/^2023-01-1[456] \d{2}:\d{2}$/);
        });
    });

    describe("formatDateTimeSeconds", () => {
        it("returns empty string for null or undefined", () => {
            expect(formatDateTimeSeconds(null)).toBe("");
            expect(formatDateTimeSeconds(undefined)).toBe("");
        });

        it("returns empty string for invalid dates", () => {
            expect(formatDateTimeSeconds("invalid-date")).toBe("");
            expect(formatDateTimeSeconds(NaN)).toBe("");
        });

        it("formats valid Date objects to YYYY-MM-DD HH:MM:SS", () => {
            const d = new Date("2023-01-15T14:30:45Z");
            expect(formatDateTimeSeconds(d)).toMatch(/^2023-01-1[456] \d{2}:\d{2}:[0-5]\d$/);
        });
    });
});
