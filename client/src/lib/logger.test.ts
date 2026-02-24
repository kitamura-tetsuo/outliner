import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { getLogger, log } from "./logger";

describe("logger", () => {
    let consoleSpy: {
        log: MockInstance;
        info: MockInstance;
        warn: MockInstance;
        error: MockInstance;
    };

    beforeEach(() => {
        consoleSpy = {
            log: vi.spyOn(console, "log").mockImplementation(() => {}),
            info: vi.spyOn(console, "info").mockImplementation(() => {}),
            warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
            error: vi.spyOn(console, "error").mockImplementation(() => {}),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getLogger", () => {
        it("should return a logger with expected methods", () => {
            const logger = getLogger("TestComponent");
            expect(logger).toHaveProperty("info");
            expect(logger).toHaveProperty("error");
            expect(logger).toHaveProperty("debug");
        });
    });

    describe("log", () => {
        it("should log to console with styles", () => {
            log("TestComp", "info", "Hello world");

            // log() function outputs to console directly.
            expect(consoleSpy.info).toHaveBeenCalled();
        });
    });
});
