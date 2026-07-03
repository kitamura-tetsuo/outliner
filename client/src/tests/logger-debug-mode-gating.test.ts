import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isVerboseConsoleSuppressed } from "../lib/logger";

// Regression test for GitHub issue #3420: verbose (trace/debug) console output must be
// centrally gated behind window.DEBUG_MODE so hot paths (e.g. per-keystroke logging)
// don't flood the console in production regardless of individual call-site guards.
describe("isVerboseConsoleSuppressed", () => {
    const originalWindow = globalThis.window;

    afterEach(() => {
        globalThis.window = originalWindow;
    });

    describe("when window.DEBUG_MODE is falsy (default)", () => {
        beforeEach(() => {
            globalThis.window = { DEBUG_MODE: false } as unknown as Window & typeof globalThis;
        });

        it("suppresses trace and debug levels", () => {
            expect(isVerboseConsoleSuppressed("trace")).toBe(true);
            expect(isVerboseConsoleSuppressed("debug")).toBe(true);
        });

        it("does not suppress info, warn, error, fatal", () => {
            expect(isVerboseConsoleSuppressed("info")).toBe(false);
            expect(isVerboseConsoleSuppressed("warn")).toBe(false);
            expect(isVerboseConsoleSuppressed("error")).toBe(false);
            expect(isVerboseConsoleSuppressed("fatal")).toBe(false);
        });
    });

    describe("when window.DEBUG_MODE is undefined", () => {
        beforeEach(() => {
            globalThis.window = {} as unknown as Window & typeof globalThis;
        });

        it("suppresses trace and debug levels by default", () => {
            expect(isVerboseConsoleSuppressed("trace")).toBe(true);
            expect(isVerboseConsoleSuppressed("debug")).toBe(true);
        });
    });

    describe("when window.DEBUG_MODE is enabled", () => {
        beforeEach(() => {
            globalThis.window = { DEBUG_MODE: true } as unknown as Window & typeof globalThis;
        });

        it("does not suppress trace and debug levels", () => {
            expect(isVerboseConsoleSuppressed("trace")).toBe(false);
            expect(isVerboseConsoleSuppressed("debug")).toBe(false);
        });

        it("does not suppress info, warn, error, fatal", () => {
            expect(isVerboseConsoleSuppressed("info")).toBe(false);
            expect(isVerboseConsoleSuppressed("warn")).toBe(false);
            expect(isVerboseConsoleSuppressed("error")).toBe(false);
            expect(isVerboseConsoleSuppressed("fatal")).toBe(false);
        });
    });
});
