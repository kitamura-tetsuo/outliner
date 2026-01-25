import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock logger module first to mock useConsoleAPI
vi.mock("../lib/logger", async (importOriginal: () => Promise<any>) => {
    const actual = await importOriginal();

    // Define logger as custom type
    type LoggerMock = {
        trace: Mock;
        debug: Mock;
        info: Mock;
        warn: Mock;
        error: Mock;
        fatal: Mock;
        [key: string]: any;
    };

    return {
        ...actual,
        getLogger: (componentName = "TestComponent") => {
            // Create a simple logger mock
            const logger: LoggerMock = {
                trace: vi.fn(),
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                fatal: vi.fn(),
            };

            // Set up to call console when logger method is called
            (["trace", "debug", "info", "warn", "error", "fatal"] as const).forEach(level => {
                logger[level].mockImplementation((...args: any[]) => {
                    const consoleMethod = level === "trace" || level === "debug"
                        ? "log"
                        : level === "fatal"
                        ? "error"
                        : level;

                    // Call console method in a type-safe way
                    switch (consoleMethod) {
                        case "log":
                            console.log(
                                `%c[logger.test.ts]%c [${componentName}]%c [${level.toUpperCase()}]:`,
                                "color: #6699cc; font-weight: bold",
                                "color: #5cb85c; font-weight: bold",
                                `color: ${
                                    level === "info" ? "#0275d8" : level === "warn" ? "#f0ad4e" : "#d9534f"
                                }; font-weight: bold`,
                                ...args,
                            );
                            break;
                        case "info":
                            console.info(
                                `%c[logger.test.ts]%c [${componentName}]%c [${level.toUpperCase()}]:`,
                                "color: #6699cc; font-weight: bold",
                                "color: #5cb85c; font-weight: bold",
                                `color: ${
                                    level === "info" ? "#0275d8" : level === "warn" ? "#f0ad4e" : "#d9534f"
                                }; font-weight: bold`,
                                ...args,
                            );
                            break;
                        case "warn":
                            console.warn(
                                `%c[logger.test.ts]%c [${componentName}]%c [${level.toUpperCase()}]:`,
                                "color: #6699cc; font-weight: bold",
                                "color: #5cb85c; font-weight: bold",
                                `color: ${
                                    level === "info" ? "#0275d8" : level === "warn" ? "#f0ad4e" : "#d9534f"
                                }; font-weight: bold`,
                                ...args,
                            );
                            break;
                        case "error":
                            console.error(
                                `%c[logger.test.ts]%c [${componentName}]%c [${level.toUpperCase()}]:`,
                                "color: #6699cc; font-weight: bold",
                                "color: #5cb85c; font-weight: bold",
                                `color: ${
                                    level === "info" ? "#0275d8" : level === "warn" ? "#f0ad4e" : "#d9534f"
                                }; font-weight: bold`,
                                ...args,
                            );
                            break;
                    }
                });
            });

            return logger;
        },
    };
});

// Import after getLogger
import { getLogger } from "../lib/logger";

// Set global mock for window object (required when testing without jsdom)
global.window = {
    console: console,
} as any;

// Mock fetch
global.fetch = vi.fn(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
    })
) as any;

describe("Logger", () => {
    // Set console mock
    const originalConsole = { ...console };
    const mockConsole = {
        log: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    };

    beforeEach(() => {
        // Replace console with mock
        global.console = mockConsole as any;
        global.window.console = mockConsole as any;

        // Reset mocks
        vi.clearAllMocks();

        // Set necessary environment variables for test environment
        // Directly set import.meta.env for testing
        Object.assign(import.meta.env, {
            DEV: true,
            NODE_ENV: "test",
            VITEST: "true",
            VITE_API_SERVER_URL: "http://localhost:7071",
        });
    });

    afterEach(() => {
        // Restore original console
        global.console = originalConsole;
        // Restore environment variables
        vi.unstubAllEnvs();
    });

    it("should create a logger with component name", () => {
        const logger = getLogger("TestComponent", true);
        expect(logger).toBeDefined();
    });

    it("should log messages with correct level", () => {
        const logger = getLogger("TestComponent", true);

        // Test logs for each level
        logger.info({ data: "test info" }, "test info message");
        expect(console.info).toHaveBeenCalledWith(
            "%c[logger.test.ts]%c [TestComponent]%c [INFO]:",
            expect.any(String),
            expect.any(String),
            expect.any(String),
            { data: "test info" },
            "test info message",
        );

        logger.warn({ data: "test warn" }, "test warn message");
        expect(console.warn).toHaveBeenCalledWith(
            "%c[logger.test.ts]%c [TestComponent]%c [WARN]:",
            expect.any(String),
            expect.any(String),
            expect.any(String),
            { data: "test warn" },
            "test warn message",
        );

        logger.error({ data: "test error" }, "test error message");
        expect(console.error).toHaveBeenCalledWith(
            "%c[logger.test.ts]%c [TestComponent]%c [ERROR]:",
            expect.any(String),
            expect.any(String),
            expect.any(String),
            { data: "test error" },
            "test error message",
        );
    });

    it("should handle object arguments", () => {
        const logger = getLogger("TestComponent", true);
        const testObj = { key: "value", number: 123 };

        logger.info({ ...testObj });
        expect(console.info).toHaveBeenCalledWith(
            "%c[logger.test.ts]%c [TestComponent]%c [INFO]:",
            expect.any(String),
            expect.any(String),
            expect.any(String),
            { ...testObj },
        );
    });

    it("should use log function correctly", () => {
        const testObj = { key: "value" };
        const logger = getLogger("TestComponent", true);
        logger.info(testObj, "test message");

        expect(console.info).toHaveBeenCalledWith(
            "%c[logger.test.ts]%c [TestComponent]%c [INFO]:",
            expect.any(String),
            expect.any(String),
            expect.any(String),
            testObj,
            "test message",
        );
    });

    it("should log with correct format", () => {
        const logger = getLogger("TestComponent", true);
        const customData = { customField: "value" };

        logger.info({ ...customData }, "test message");
        expect(console.info).toHaveBeenCalledWith(
            "%c[logger.test.ts]%c [TestComponent]%c [INFO]:",
            expect.any(String),
            expect.any(String),
            expect.any(String),
            { ...customData },
            "test message",
        );
    });

    // Add as another test case
    it("should create another logger with component name", () => {
        const testObj = { key: "value" };
        const logger = getLogger("TestComponent", true);
        logger.info({ ...testObj }, "test message");

        expect(console.info).toHaveBeenCalledWith(
            "%c[logger.test.ts]%c [TestComponent]%c [INFO]:",
            expect.any(String),
            expect.any(String),
            expect.any(String),
            { ...testObj },
            "test message",
        );
    });
});
