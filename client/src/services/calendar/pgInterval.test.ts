import { describe, expect, it } from "vitest";
import { msToIsoDuration, parsePgIntervalMs } from "./pgInterval";

describe("parsePgIntervalMs", () => {
    it("returns undefined for empty/null input", () => {
        expect(parsePgIntervalMs(undefined)).toBeUndefined();
        expect(parsePgIntervalMs(null)).toBeUndefined();
        expect(parsePgIntervalMs("")).toBeUndefined();
        expect(parsePgIntervalMs("   ")).toBeUndefined();
    });

    it("parses a plain HH:MM:SS interval, matching what itemsRelation.ts projects for PT1H30M", () => {
        expect(parsePgIntervalMs("01:30:00")).toBe(90 * 60 * 1000);
    });

    it("parses a days-only interval", () => {
        expect(parsePgIntervalMs("1 day")).toBe(24 * 60 * 60 * 1000);
        expect(parsePgIntervalMs("3 days")).toBe(3 * 24 * 60 * 60 * 1000);
    });

    it("parses a combined days + time interval", () => {
        expect(parsePgIntervalMs("1 day 02:03:04")).toBe(
            24 * 3600 * 1000 + (2 * 3600 + 3 * 60 + 4) * 1000,
        );
    });

    it("parses months and years", () => {
        expect(parsePgIntervalMs("2 mons")).toBe(2 * 30 * 24 * 60 * 60 * 1000);
        expect(parsePgIntervalMs("1 year")).toBe(365 * 24 * 60 * 60 * 1000);
    });

    it("handles fractional seconds", () => {
        expect(parsePgIntervalMs("00:00:01.5")).toBe(1500);
    });

    it("returns undefined for unrecognized text", () => {
        expect(parsePgIntervalMs("not an interval")).toBeUndefined();
    });
});

describe("msToIsoDuration", () => {
    it("round-trips through parsePgIntervalMs for a simple duration", () => {
        const ms = 90 * 60 * 1000;
        const iso = msToIsoDuration(ms);
        expect(iso).toBe("PT1H30M");
    });

    it("formats days", () => {
        expect(msToIsoDuration(2 * 24 * 60 * 60 * 1000)).toBe("P2D");
    });

    it("formats a combined day + time duration", () => {
        expect(msToIsoDuration(24 * 3600 * 1000 + 45 * 60 * 1000)).toBe("P1DT45M");
    });

    it("formats zero as PT0S", () => {
        expect(msToIsoDuration(0)).toBe("PT0S");
    });

    it("clamps negative input to zero", () => {
        expect(msToIsoDuration(-1000)).toBe("PT0S");
    });

    it("rounds sub-second precision to the nearest second", () => {
        expect(msToIsoDuration(1499)).toBe("PT1S");
    });
});
