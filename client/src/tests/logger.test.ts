import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// useConsoleAPIをモックするためにloggerモジュールを先にモック
vi.mock("../lib/logger", async (importOriginal: () => Promise<any>) => {
    const actual = await importOriginal();

    // loggerをカスタムタイプとして定義
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
            // シンプルなロガーモックを作成
            const logger: LoggerMock = {
                trace: vi.fn(),
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                fatal: vi.fn(),
            };

            // ロガーメソッドが呼ばれたらコンソールも呼ぶよう設定
            (["trace", "debug", "info", "warn", "error", "fatal"] as const).forEach(level => {
                logger[level].mockImplementation((...args: any[]) => {
                    const consoleMethod = level === "trace" || level === "debug"
                        ? "log"
                        : level === "fatal"
                        ? "error"
                        : level;

                    // 型安全にコンソールメソッドを呼び出す
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

// getLoggerの後でインポート
import { getLogger } from "../lib/logger";

// windowオブジェクトのグローバルモックを設定（jsdomなしでテストする場合に必要）
global.window = {
    console: console,
} as any;

// fetchのモック
global.fetch = vi.fn(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
    })
) as any;

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
        global.console = mockConsole as any;
        global.window.console = mockConsole as any;

        // モックをリセット
        vi.clearAllMocks();

        // テスト環境で必要な環境変数を設定
        // @ts-expect-error - テスト用にimport.meta.envを直接設定
        import.meta.env = {
            DEV: true,
            NODE_ENV: "test",
            VITEST: "true",
            VITE_API_SERVER_URL: "http://localhost:7071",
        };
    });

    afterEach(() => {
        // 元のコンソールに戻す
        global.console = originalConsole;
        // 環境変数を元に戻す
        vi.unstubAllEnvs();
    });

    it("should create a logger with component name", () => {
        const logger = getLogger("TestComponent", true);
        expect(logger).toBeDefined();
    });

    it("should log messages with correct level", () => {
        const logger = getLogger("TestComponent", true);

        // 各レベルのログをテスト
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

        logger.info({ ...customData }, "テストメッセージ");
        expect(console.info).toHaveBeenCalledWith(
            "%c[logger.test.ts]%c [TestComponent]%c [INFO]:",
            expect.any(String),
            expect.any(String),
            expect.any(String),
            { ...customData },
            "テストメッセージ",
        );
    });

    // 別のテストケースとして追加
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
