import { describe, expect, it } from "vitest";
import { parseIsoDurationMs } from "../../src/utils/isoDuration";

describe("parseIsoDurationMs", () => {
    it("returns undefined for absent, empty or malformed input", () => {
        expect(parseIsoDurationMs(undefined)).toBeUndefined();
        expect(parseIsoDurationMs("")).toBeUndefined();
        expect(parseIsoDurationMs("not a duration")).toBeUndefined();
        expect(parseIsoDurationMs("P")).toBeUndefined();
    });

    it("parses hours and minutes", () => {
        expect(parseIsoDurationMs("PT1H30M")).toBe((60 + 30) * 60 * 1000);
    });

    it("parses a whole day", () => {
        expect(parseIsoDurationMs("P1D")).toBe(24 * 60 * 60 * 1000);
    });

    it("parses a combined date and time duration", () => {
        expect(parseIsoDurationMs("P1DT2H")).toBe((24 + 2) * 60 * 60 * 1000);
    });

    it("parses seconds", () => {
        expect(parseIsoDurationMs("PT90S")).toBe(90 * 1000);
    });
});
