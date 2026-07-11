import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { setupConsoleSanitizer } from "../../lib/logger";

describe("setupConsoleSanitizer", () => {
    let origConsoleError: (...args: unknown[]) => void;
    let origConsoleWarn: (...args: unknown[]) => void;
    let mockError: Mock;
    let mockWarn: Mock;

    beforeEach(() => {
        origConsoleError = console.error;
        origConsoleWarn = console.warn;
        mockError = vi.fn();
        mockWarn = vi.fn();
        console.error = mockError as unknown as (...args: unknown[]) => void;
        console.warn = mockWarn as unknown as (...args: unknown[]) => void;

        // Mock localStorage
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => {
                if (key === "VITE_IS_TEST" || key === "VITE_E2E_TEST") return "true";
                return null;
            },
        });
    });

    afterEach(() => {
        console.error = origConsoleError;
        console.warn = origConsoleWarn;
        vi.unstubAllGlobals();
    });

    it("should safely stringify objects without stripping the root object", () => {
        setupConsoleSanitizer();

        const testObj = { name: "TestError", message: "This is a test" };
        console.error(testObj);

        expect(mockError).toHaveBeenCalledWith("TestError: This is a test");
    });

    it("should safely stringify objects not matching Error duck-typing", () => {
        setupConsoleSanitizer();

        const testObj = { foo: "bar", child: { val: 1 } };
        console.error(testObj);

        expect(mockError).toHaveBeenCalledWith('{"foo":"bar","child":"[object Object]"}');
    });

    it("should stringify primitives as strings", () => {
        setupConsoleSanitizer();

        console.error(123, "string", true);

        expect(mockError).toHaveBeenCalledWith("123", "string", "true");
    });
});
