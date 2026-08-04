import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogger, type Logger, setLoggerFactory } from "../src/logger.js";

describe("logger", () => {
    let mockConsole: any;

    beforeEach(() => {
        mockConsole = {
            log: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            trace: vi.fn(),
        };
        vi.stubGlobal("console", mockConsole);

        // Reset the factory explicitly
        setLoggerFactory(() => ({
            info: (...args) => console.log(...args),
            warn: (...args) => console.warn(...args),
            error: (...args) => console.error(...args),
            debug: (...args) => console.debug(...args),
            trace: (...args) => console.trace(...args),
            fatal: (...args) => console.error(...args),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("uses console logger by default", () => {
        const logger = getLogger("test");
        logger.info("info msg");
        logger.warn("warn msg");
        logger.error("error msg");
        logger.debug("debug msg");
        logger.trace("trace msg");
        logger.fatal("fatal msg");

        expect(mockConsole.log).toHaveBeenCalledWith("info msg");
        expect(mockConsole.warn).toHaveBeenCalledWith("warn msg");
        expect(mockConsole.error).toHaveBeenCalledWith("error msg");
        expect(mockConsole.debug).toHaveBeenCalledWith("debug msg");
        expect(mockConsole.trace).toHaveBeenCalledWith("trace msg");
        expect(mockConsole.error).toHaveBeenCalledWith("fatal msg");
    });

    it("allows overriding logger factory", () => {
        const mockLogger: Logger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            trace: vi.fn(),
            fatal: vi.fn(),
        };
        const factory = vi.fn().mockReturnValue(mockLogger);

        setLoggerFactory(factory);

        const logger = getLogger("test");
        logger.info("info msg");
        logger.warn("warn msg");
        logger.error("error msg");
        logger.debug("debug msg");
        logger.trace("trace msg");
        logger.fatal("fatal msg");

        expect(factory).toHaveBeenCalledWith("test");
        expect(mockLogger.info).toHaveBeenCalledWith("info msg");
        expect(mockLogger.warn).toHaveBeenCalledWith("warn msg");
        expect(mockLogger.error).toHaveBeenCalledWith("error msg");
        expect(mockLogger.debug).toHaveBeenCalledWith("debug msg");
        expect(mockLogger.trace).toHaveBeenCalledWith("trace msg");
        expect(mockLogger.fatal).toHaveBeenCalledWith("fatal msg");
        expect(mockConsole.log).not.toHaveBeenCalled();
    });

    it("covers the original consoleLogger if we clear the test factory", async () => {
        // the original consoleFactory uses consoleLogger
        // but setLoggerFactory doesn't expose a way to reset to original
        // so we'll just trigger it by simulating module reload or manually importing
        const { getLogger, setLoggerFactory } = await import("../src/logger.js?update=" + Date.now());
        const logger = getLogger("default-test");

        // Since we are mocking the global console, it will still go to our mockConsole
        // because Vitest evaluates the imported module within the current context.
        logger.info("should reach consoleLogger.info");
        logger.warn("should reach consoleLogger.warn");
        logger.error("should reach consoleLogger.error");
        logger.debug("should reach consoleLogger.debug");
        logger.trace("should reach consoleLogger.trace");
        logger.fatal("should reach consoleLogger.fatal");

        expect(mockConsole.log).toHaveBeenCalledWith("should reach consoleLogger.info");
        expect(mockConsole.warn).toHaveBeenCalledWith("should reach consoleLogger.warn");
        expect(mockConsole.error).toHaveBeenCalledWith("should reach consoleLogger.error");
        expect(mockConsole.debug).toHaveBeenCalledWith("should reach consoleLogger.debug");
        expect(mockConsole.trace).toHaveBeenCalledWith("should reach consoleLogger.trace");
        expect(mockConsole.error).toHaveBeenCalledWith("should reach consoleLogger.fatal");
    });
});
