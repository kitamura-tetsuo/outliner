import pino from "pino";

// 環境変数からAPIサーバーURLを取得（デフォルトはlocalhostの認証サーバー）
const API_URL = import.meta.env.VITE_API_SERVER_URL || "http://localhost:7071";

// ブラウザのコンソールAPIを使用するかどうか
// テスト環境では常にtrueを返すようにする
const isTestEnvironment = import.meta.env.NODE_ENV === "test"
    || import.meta.env.VITEST === "true"
    || (typeof process !== "undefined" && process.env?.NODE_ENV === "test");

const useConsoleAPI = isTestEnvironment
    || (typeof window !== "undefined" && typeof window.console !== "undefined");

// pino のインスタンス（ブラウザ用の設定）
const baseLogger = pino({
    level: import.meta.env.DEV ? "debug" : "info", // 開発環境では詳細なログを出力
    browser: {
        asObject: true, // ログをオブジェクトとして扱う
        write: {
            // Pino のデフォルトコンソール出力を無効化（カスタム出力のみを使用）
            info: () => {},
            debug: () => {},
            error: () => {},
            fatal: () => {},
            warn: () => {},
            trace: () => {},
            log: () => {},
            silent: () => {},
        },
        // transmit: {
        //     level: "info", // このレベル以上のログをサーバーに送信
        //     send: (level: string, logEvent: any) => {
        //         // デバッグ用: 送信されるログデータを確認
        //         if (import.meta.env.DEV) {
        //             // console.debug('ログ送信:', { level, logEvent });
        //         }

        //         // ログをサーバーに送信する処理
        //         fetch(`${API_URL}/api/log`, {
        //             method: "POST",
        //             headers: { "Content-Type": "application/json" },
        //             body: JSON.stringify({
        //                 level,
        //                 log: logEvent,
        //                 timestamp: new Date().toISOString(),
        //                 userAgent: navigator.userAgent,
        //             }),
        //             // エラー発生時でもリクエストを中断しない
        //             credentials: "omit",
        //             mode: "cors",
        //         }).catch(err => {
        //             // 送信エラー時の処理
        //             console.error("ログ送信エラー:", err);
        //         });
        //     },
        // },
    },
});

// 拡張された CallSite インターフェース
interface CallSite {
    getFileName(): string | null;
    getLineNumber(): number | null;
    getColumnNumber(): number | null;
    getFunctionName(): string | null;
    getThis(): any;
    getTypeName(): string | null;
    getMethodName(): string | null;
    getEvalOrigin(): string | undefined;
    isToplevel(): boolean;
    isEval(): boolean;
    isNative(): boolean;
    isConstructor(): boolean;
}

/**
 * 呼び出し元の情報（ファイル名のみ）を取得するシンプル関数
 */
function getCallerFile(): string {
    const originalPrepareStackTrace = Error.prepareStackTrace;
    try {
        const err = new Error();
        // prepareStackTrace を上書きして、stack を CallSite の配列として取得
        Error.prepareStackTrace = ((error: Error, stack: CallSite[]) => stack) as unknown as any;
        const stack = err.stack as unknown as CallSite[];

        // ロガーに関連するファイルパスとメソッド名
        const loggerPaths = ["logger.ts", "/lib/logger"];
        const loggerMethods = ["getLogger", "log", "trace", "debug", "info", "warn", "error", "fatal"];

        // ロガー以外の最初の呼び出し元を探す
        for (let i = 0; i < stack.length; i++) {
            const fileName = stack[i].getFileName() || "";
            const functionName = stack[i].getFunctionName() || "";

            const isLoggerFile = loggerPaths.some(path => fileName.includes(path));
            const isLoggerMethod = loggerMethods.some(method => functionName.includes(method));

            if (!isLoggerFile && !isLoggerMethod) {
                // ファイルパスからファイル名だけを抽出
                const parts = fileName.split("/");
                let file = parts[parts.length - 1] || "unknown";

                // クエリパラメータ（?t=...など）を削除
                if (file.includes("?")) {
                    file = file.split("?")[0];
                }

                return file;
            }
        }

        return "unknown";
    } catch (error) {
        return "unknown";
    } finally {
        // 元の prepareStackTrace を復元
        Error.prepareStackTrace = originalPrepareStackTrace;
    }
}

/**
 * 各ログレベルのメソッドをラップして行番号情報を追加する
 */
function createEnhancedLogger(logger: pino.Logger): pino.Logger {
    // 拡張するログレベル
    const levels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
    // 基本的な機能を持つロガーを作成
    const enhancedLogger = Object.create(logger);

    // 各ログレベルメソッドをラップ
    levels.forEach(level => {
        const originalMethod = logger[level].bind(logger);
        enhancedLogger[level] = (...args: any[]) => {
            // ログ呼び出し時に位置情報を取得
            const file = getCallerFile();

            // 引数の処理: 最初の引数がオブジェクトなら位置情報を追加
            if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
                args[0] = { file, ...args[0] };
            } else {
                // オブジェクトでない場合は先頭に位置情報を追加
                args.unshift({ file });
            }

            // 元のログメソッドを呼び出し
            return originalMethod("", ...args);
        };
    });

    // child メソッドを特別に上書き
    const originalChild = logger.child.bind(logger);
    enhancedLogger.child = function(bindings: pino.Bindings): pino.Logger {
        // 元の child メソッドを呼び出し
        const childLogger = originalChild(bindings);
        // 子ロガーも強化
        return createEnhancedLogger(childLogger);
    };

    return enhancedLogger;
}

// 拡張ロガーの作成
const logger = createEnhancedLogger(baseLogger);

/**
 * コンソール出力時のスタイルを定義
 */
const consoleStyles = {
    // ファイル名と行番号用のスタイル
    fileInfo: "color: #6699cc; font-weight: bold",
    // モジュール名用のスタイル
    moduleName: "color: #5cb85c; font-weight: bold",
    // ログレベル別のスタイル
    levels: {
        trace: "color: #aaaaaa",
        debug: "color: #6c757d",
        info: "color: #0275d8; font-weight: bold",
        warn: "color: #f0ad4e; font-weight: bold",
        error: "color: #d9534f; font-weight: bold",
        fatal: "color: #ffffff; background-color: #d9534f; font-weight: bold; padding: 2px 5px; border-radius: 3px",
    },
};

/**
 * 呼び出し元のファイル名と行番号を child logger のコンテキストに付加して返す
 * コンソールにも同時に出力したい場合は enableConsole を true に設定
 */
export function getLogger(componentName?: string, enableConsole: boolean = true): any {
    const file = getCallerFile();
    const module = componentName || file;
    const isCustomModule = componentName !== undefined && componentName !== file;

    // 基本のロガー
    const childLogger = logger.child({ module });

    // コンソール出力が有効な場合、コンソールにも出力する拡張ロガーを作成（テスト環境では抑止）
    if (enableConsole && useConsoleAPI && !isTestEnvironment) {
        return new Proxy(childLogger, {
            get(target, prop) {
                if (typeof prop === "string" && ["trace", "debug", "info", "warn", "error", "fatal"].includes(prop)) {
                    return function(...args: any[]) {
                        // オリジナルのロガーメソッドを呼び出し
                        (target as any)[prop](...args);

                        // コンソールにも出力（同じレベルで）
                        const consoleMethod = prop === "trace" || prop === "debug"
                            ? "log"
                            : prop === "fatal"
                            ? "error"
                            : prop;

                        try {
                            // ファイル情報とモジュール名を整形
                            const sourceInfo = `${file}`;
                            const levelUpperCase = prop.toUpperCase();

                            // 最初の引数がオブジェクトの場合とそうでない場合で処理を分ける
                            if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
                                // オブジェクトデータ
                                const objData = { ...args[0] };
                                delete objData.file; // すでに別途表示するので削除
                                delete objData.module; // すでに別途表示するので削除

                                // メッセージ部分
                                const messages = args.slice(1);

                                // スタイル付きのログを出力 - カスタムモジュール名がある場合のみそれを表示
                                if (isCustomModule) {
                                    (console[consoleMethod as keyof Console] as (...args: unknown[]) => void)(
                                        `%c[${sourceInfo}]%c [${module}]%c [${levelUpperCase}]:`,
                                        consoleStyles.fileInfo,
                                        consoleStyles.moduleName,
                                        consoleStyles.levels[prop as keyof typeof consoleStyles.levels],
                                        ...(messages.length > 0 ? messages : []),
                                        objData,
                                    );
                                } else {
                                    // モジュール名がファイル名と同じ場合は一つだけ表示
                                    (console[consoleMethod as keyof Console] as (...args: unknown[]) => void)(
                                        `%c[${sourceInfo}]%c [${levelUpperCase}]:`,
                                        consoleStyles.fileInfo,
                                        consoleStyles.levels[prop as keyof typeof consoleStyles.levels],
                                        ...(messages.length > 0 ? messages : []),
                                        objData,
                                    );
                                }
                            } else {
                                // 通常のメッセージ（オブジェクトなし）
                                if (isCustomModule) {
                                    (console[consoleMethod as keyof Console] as (...args: unknown[]) => void)(
                                        `%c[${sourceInfo}]%c [${module}]%c [${levelUpperCase}]:`,
                                        consoleStyles.fileInfo,
                                        consoleStyles.moduleName,
                                        consoleStyles.levels[prop as keyof typeof consoleStyles.levels],
                                        ...args,
                                    );
                                } else {
                                    // モジュール名がファイル名と同じ場合は一つだけ表示
                                    (console[consoleMethod as keyof Console] as (...args: unknown[]) => void)(
                                        `%c[${sourceInfo}]%c [${levelUpperCase}]:`,
                                        consoleStyles.fileInfo,
                                        consoleStyles.levels[prop as keyof typeof consoleStyles.levels],
                                        ...args,
                                    );
                                }
                            }
                        } catch (e) {
                            // スタイル適用に失敗した場合は通常のフォーマットで表示
                            (console[consoleMethod as keyof Console] as (...args: unknown[]) => void)(
                                `[${file}] [${prop.toUpperCase()}]:`,
                                ...args,
                            );
                        }
                    };
                }
                return (target as any)[prop];
            },
        }) as pino.Logger;
    }

    return childLogger;
}

/**
 * コンソールにも出力し、サーバーにも送信する便利なラッパー関数
 * module名とlog/consoleへの出力を一回の呼び出しで行う
 */
export function log(
    componentName: string,
    level: "trace" | "debug" | "info" | "warn" | "error" | "fatal",
    ...args: any[]
): void {
    // 1. 通常のコンソール出力（ソースマップ情報が付加されるが、直接的でシンプル）
    const consoleMethod = level === "trace" || level === "debug"
        ? "log"
        : level === "fatal"
        ? "error"
        : level;

    // レベルごとに色分け
    const levelColors = {
        trace: "#aaaaaa",
        debug: "#6c757d",
        info: "#0275d8",
        warn: "#f0ad4e",
        error: "#d9534f",
        fatal: "#d9534f",
    };

    // 呼び出し元情報を取得（デバッグ用）
    const file = getCallerFile();

    // コンソールへ直接出力
    // componentName がファイル名と同じで重複している場合は、ファイル名の情報は含めない
    if (componentName === file.replace(/\.[jt]s$/, "")) {
        (console[consoleMethod as keyof Console] as (...args: unknown[]) => void)(
            `%c[${componentName}]%c [${level.toUpperCase()}]:`,
            `color: #6699cc; font-weight: bold`,
            `color: ${levelColors[level]}; font-weight: bold`,
            ...args,
        );
    } else {
        (console[consoleMethod as keyof Console] as (...args: unknown[]) => void)(
            `%c[${componentName}]%c [${level.toUpperCase()}]:`,
            `color: #5cb85c; font-weight: bold`,
            `color: ${levelColors[level]}; font-weight: bold`,
            ...args,
        );
    }

    // 2. Pinoロガーを使ってサーバーに送信（ログファイルに記録）
    const logger = getLogger(componentName, false); // コンソール出力せずサーバーに送信
    logger[level].apply(logger, ["", ...args]);
}

/**
 * エラーの詳細な情報を抽出する
 */
function extractErrorDetails(
    error: Error | unknown,
): { message: string; stack?: string; name?: string; [key: string]: any; } {
    if (error instanceof Error) {
        return {
            message: error.message,
            name: error.name,
            stack: error.stack,
            ...(error as any), // その他のカスタムプロパティも含める
        };
    } else if (typeof error === "string") {
        return { message: error };
    } else if (error && typeof error === "object") {
        // 任意のオブジェクトをスプレッドすると Playwright のコンソール転送で
        // [unserializable] が多発することがあるため、必要最小限のみ返す
        const anyErr = error as any;
        const name = typeof anyErr.name === "string" ? anyErr.name : undefined;
        const message = typeof anyErr.message === "string" ? anyErr.message : String(anyErr);
        const stack = typeof anyErr.stack === "string" ? anyErr.stack : undefined;
        const type = typeof anyErr.type === "string" ? anyErr.type : undefined;

        return { name, message, stack, type };
    }
    return { message: String(error) };
}

/**
 * グローバルなエラーハンドラーを初期化する
 * 未捕捉の例外をログに記録する
 */
function setupGlobalErrorHandlers(): void {
    if (typeof window === "undefined") return; // サーバーサイドでは実行しない

    const uncaughtLogger = getLogger("UncaughtError", false);

    // 未捕捉の例外をログに記録
    window.onerror = (message, source, lineno, colno, error) => {
        const errorInfo = {
            type: "uncaught_exception",
            source: source || "",
            line: lineno || 0,
            column: colno || 0,
            ...extractErrorDetails(error || message),
        };

        // ロガーとコンソールの両方に出力（PlaywrightfVitefHMRfErrorEventfDOMException    などの非直列化 対象            を避けるため、コンソールへは文字列のみ出力）
        uncaughtLogger.error(errorInfo);
        const errMsg = `[UncaughtError] ${errorInfo.type}: ${errorInfo.name || ""} ${errorInfo.message || ""}`;
        const stackTop = (errorInfo.stack || "").split("\n").slice(0, 2).join("\n");
        const marker = (window as any).__LAST_EFFECT__ || "<unknown>";
        console.error(`%c${errMsg}`, consoleStyles.fileInfo, stackTop);
        console.error("[EFFECT-MARKER]", marker);
        console.error("[STACK]", stackTop);

        // デフォルトのエラーハンドリングは継続する（falseを返さない）
        return false;
    };

    // 未処理のPromise拒否をログに記録
    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        const errorInfo = {
            type: "unhandled_rejection",
            ...extractErrorDetails(reason),
        };

        // ロガーとコンソールの両方に出力（コンソールへは文字列のみ出力）
        uncaughtLogger.error(errorInfo);
        const errMsg = `[UncaughtError] ${errorInfo.type}: ${errorInfo.name || ""} ${errorInfo.message || ""}`;
        const stackTop = (errorInfo.stack || "").split("\n").slice(0, 2).join("\n");
        const marker = (window as any).__LAST_EFFECT__ || "<unknown>";
        console.error(`%c${errMsg}`, consoleStyles.fileInfo, stackTop);
        console.error("[EFFECT-MARKER]", marker);
        console.error("[STACK]", stackTop);
    };
}

// Playwright での [unserializable] スパム抑制のため、console.error/warn の引数を安全に文字列化
function setupConsoleSanitizer(): void {
    if (typeof window === "undefined") return;
    const safe = (arg: any): string => {
        try {
            if (typeof arg === "string") return arg;
            if (arg instanceof Error) {
                const top = (arg.stack || "").split("\n").slice(0, 2).join("\n");
                return `${arg.name}: ${arg.message}\n${top}`;
            }
            if (arg && typeof arg === "object") {
                const name = typeof (arg as any).name === "string" ? (arg as any).name : undefined;
                const msg = typeof (arg as any).message === "string" ? (arg as any).message : undefined;
                if (name || msg) return `${name || "Object"}: ${msg || ""}`;
                // 最低限の JSON 文字列化（循環参照は避ける）
                return JSON.stringify(arg, (_k, v) => (typeof v === "object" ? undefined : v)) || "[object]";
            }
            return String(arg);
        } catch {
            return "[unserializable-arg]";
        }
    };
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args: any[]) => origError(...args.map(safe));
    console.warn = (...args: any[]) => origWarn(...args.map(safe));
}

// ブラウザ環境ならグローバルエラーハンドラーを初期化
if (typeof window !== "undefined") {
    setupConsoleSanitizer();
    setupGlobalErrorHandlers();
}
