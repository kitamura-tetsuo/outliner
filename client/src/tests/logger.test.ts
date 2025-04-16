import {
    describe,
    expect,
    it,
    vi,
} from "vitest";
import {
    getLogger,
    log,
} from "../lib/logger";

describe("Logger", () => {
    // コンソールのモックを設定
    const originalConsole = { ...console };
    const mockConsole = {
        log: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    };

    beforeEach(() => {
        // コンソールをモックに置き換え
        Object.assign(console, mockConsole);
    });

    afterEach(() => {
        // モックをリセット
        vi.clearAllMocks();
        // 元のコンソールに戻す
        Object.assign(console, originalConsole);
    });

    it("should create a logger with component name", () => {
        const logger = getLogger("TestComponent");
        expect(logger).toBeDefined();
    });

    it("should log messages with correct level", () => {
        const logger = getLogger("TestComponent");

        // 各レベルのログをテスト
        logger.info("test info message");
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining("[TestComponent]"),
            expect.stringContaining("[INFO]:"),
            "test info message",
        );

        logger.warn("test warn message");
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining("[TestComponent]"),
            expect.stringContaining("[WARN]:"),
            "test warn message",
        );

        logger.error("test error message");
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining("[TestComponent]"),
            expect.stringContaining("[ERROR]:"),
            "test error message",
        );
    });

    it("should handle object arguments", () => {
        const logger = getLogger("TestComponent");
        const testObj = { key: "value", number: 123 };

        logger.info(testObj);
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining("[TestComponent]"),
            expect.stringContaining("[INFO]:"),
            expect.objectContaining(testObj),
        );
    });

    it("should use log function correctly", () => {
        log("TestComponent", "info", "test message");
        expect(console.info).toHaveBeenCalledWith(
            expect.stringContaining("[TestComponent]"),
            expect.stringContaining("[INFO]:"),
            "test message",
        );
    });
});
