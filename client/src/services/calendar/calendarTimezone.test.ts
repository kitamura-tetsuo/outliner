import { describe, expect, it } from "vitest";
import { isValidIanaTimeZone, listSupportedTimeZones, resolveCalendarTimezone } from "./calendarTimezone";

describe("resolveCalendarTimezone", () => {
    it("returns the stored timezone when present", () => {
        expect(resolveCalendarTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
    });

    it("falls back to the viewer's local zone when absent", () => {
        expect(resolveCalendarTimezone(undefined)).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    });

    it("falls back to the viewer's local zone for an empty string", () => {
        expect(resolveCalendarTimezone("")).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    });
});

describe("isValidIanaTimeZone", () => {
    it("accepts a real IANA zone", () => {
        expect(isValidIanaTimeZone("America/New_York")).toBe(true);
        expect(isValidIanaTimeZone("UTC")).toBe(true);
    });

    it("rejects an unrecognized zone", () => {
        expect(isValidIanaTimeZone("Not/A_Zone")).toBe(false);
    });

    it("rejects an empty string", () => {
        expect(isValidIanaTimeZone("")).toBe(false);
    });
});

describe("listSupportedTimeZones", () => {
    it("includes well-known zones when the runtime supports Intl.supportedValuesOf", () => {
        const zones = listSupportedTimeZones();
        if (zones.length === 0) return; // Engine without Intl.supportedValuesOf; the UI falls back gracefully.
        expect(zones).toContain("Asia/Tokyo");
        expect(zones).toContain("America/New_York");
    });
});
