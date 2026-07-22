import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escapeId, getMeasurementSpan } from "./domUtils";

describe("domUtils", () => {
    describe("getMeasurementSpan", () => {
        beforeEach(() => {
            // Clean up the body to start fresh, but the singleton `_measurementSpan`
            // variable inside the module will persist between tests.
            if (typeof document !== "undefined" && document.body) {
                document.body.innerHTML = "";
            }
        });

        afterEach(() => {
            if (typeof document !== "undefined" && document.body) {
                document.body.innerHTML = "";
            }
            vi.unstubAllGlobals();
        });

        it("should return null if document is undefined", () => {
            vi.stubGlobal("document", undefined);
            const span = getMeasurementSpan();
            expect(span).toBeNull();
        });

        it("should create, initialize, and append the span on the first call", () => {
            const span = getMeasurementSpan();

            expect(span).toBeInstanceOf(HTMLSpanElement);
            expect(span.id).toBe("outliner-measurement-span");
            expect(span.style.whiteSpace).toBe("pre");
            expect(span.style.visibility).toBe("hidden");
            expect(span.style.position).toBe("absolute");
            expect(span.style.top).toBe("-9999px");
            expect(span.style.left).toBe("-9999px");

            // Verify it was appended to the document body
            expect(document.body.contains(span)).toBe(true);
        });

        it("should return the exact same instance on subsequent calls", () => {
            const span1 = getMeasurementSpan();
            const span2 = getMeasurementSpan();

            expect(span1).toBe(span2);
        });

        it("should re-append the span to document.body if it was removed", () => {
            const span1 = getMeasurementSpan();

            // Remove the span from the DOM
            span1.remove();
            expect(document.body.contains(span1)).toBe(false);
            expect(span1.isConnected).toBe(false);

            // Fetch again, which should trigger the !isConnected branch
            const span2 = getMeasurementSpan();

            expect(span1).toBe(span2);
            expect(document.body.contains(span2)).toBe(true);
        });
    });

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
            global.CSS = undefined as unknown as typeof CSS;

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
                global.CSS = undefined as unknown as typeof CSS;
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
                expect(escapeId('\\"\\"')).toBe('\\\\\\"\\\\\\"'); // \\"" -> \\\\\\"\\"
            });
        });
    });
});
