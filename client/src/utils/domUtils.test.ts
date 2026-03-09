import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escapeId } from "./domUtils";

describe("domUtils", () => {
    describe("escapeId", () => {
        let originalCSS: typeof CSS;

        beforeEach(() => {
            // Save original CSS object
            originalCSS = global.CSS;
        });

        afterEach(() => {
            // Restore original CSS object
            global.CSS = originalCSS;
            vi.restoreAllMocks();
        });

        it("should use CSS.escape when it is available", () => {
            const mockEscape = vi.fn().mockImplementation((id: string) => `escaped-${id}`);

            // Mock CSS.escape
            global.CSS = { escape: mockEscape } as unknown as typeof CSS;

            const result = escapeId("test-id");

            expect(mockEscape).toHaveBeenCalledWith("test-id");
            expect(result).toBe("escaped-test-id");
        });

        it("should use fallback when CSS is undefined", () => {
            // Mock CSS as undefined
            // @ts-expect-error Mocking for test
            global.CSS = undefined;

            const result = escapeId("test-id");
            expect(result).toBe("test-id");
        });

        it("should use fallback when CSS.escape is undefined", () => {
            // Mock CSS without escape method
            global.CSS = {} as typeof CSS;

            const result = escapeId("test-id");
            expect(result).toBe("test-id");
        });

        describe("fallback behavior", () => {
            beforeEach(() => {
                // Mock CSS as undefined to trigger fallback
                // @ts-expect-error Mocking for test
                global.CSS = undefined;
            });

            it("should not escape normal characters", () => {
                expect(escapeId("normal-id-123")).toBe("normal-id-123");
                expect(escapeId("abc_def.ghi")).toBe("abc_def.ghi");
            });

            it("should escape double quotes", () => {
                expect(escapeId('test"id')).toBe('test\\"id');
                expect(escapeId('a""b')).toBe('a\\"\\"b');
            });

            it("should escape backslashes", () => {
                expect(escapeId("test\\id")).toBe("test\\\\id");
                expect(escapeId("a\\\\b")).toBe("a\\\\\\\\b");
            });

            it("should escape mixed quotes and backslashes", () => {
                expect(escapeId('test"id\\abc')).toBe('test\\"id\\\\abc');
                expect(escapeId('\\"\\"')).toBe('\\\\\\\"\\\\\\\"'); // \\"" -> \\\\\\"\\"
            });
        });
    });
});
