import pino from "pino";

// Type definition for Console to avoid no-undef errors
type Console = typeof console;

// Get API server URL from environment variables (default is localhost auth server)
// const API_URL = import.meta.env.VITE_API_SERVER_URL || "http://localhost:7071"; // Not used

// Whether to use the browser console API
// Always return true in test environments
const isTestEnvironment = (typeof import.meta !== "undefined" && import.meta.env?.NODE_ENV === "test")
    || (typeof import.meta !== "undefined" && import.meta.env?.VITEST === "true")
    || (typeof process !== "undefined" && process.env?.NODE_ENV === "test");

const useConsoleAPI = isTestEnvironment
    || (typeof window !== "undefined" && typeof window.console !== "undefined");

// pino instance (browser configuration)
const baseLogger = pino({
    level: (typeof import.meta !== "undefined" && import.meta.env?.DEV) ? "debug" : "info", // Output detailed logs in development environment
    browser: {
        asObject: true, // Treat logs as objects
        write: {
            // Disable Pino's default console output (use custom output only)
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
        //     level: "info", // Send logs of this level or higher to the server
        //     send: (level: string, logEvent: any) => {
        //         // Debug: Check the log data being sent
        //         if (import.meta.env.DEV) {
        //             // console.debug('Log send:', { level, logEvent });
        //         }

        //         // Process to send logs to the server
        //         fetch(`${API_URL}/api/log`, {
        //             method: "POST",
        //             headers: { "Content-Type": "application/json" },
        //             body: JSON.stringify({
        //                 level,
        //                 log: logEvent,
        //                 timestamp: new Date().toISOString(),
        //                 userAgent: navigator.userAgent,
        //             }),
        //             // Do not interrupt request even if error occurs
        //             credentials: "omit",
        //             mode: "cors",
        //         }).catch(err => {
        //             // Handling transmission errors
        //             console.error("Log send error:", err);
        //         });
        //     },
        // },
    },
});

// Extended CallSite interface
interface CallSite {
    getFileName(): string | null;
    getLineNumber(): number | null;
    getColumnNumber(): number | null;
    getFunctionName(): string | null;
    getThis(): unknown;
    getTypeName(): string | null;
    getMethodName(): string | null;
    getEvalOrigin(): string | undefined;
    isToplevel(): boolean;
    isEval(): boolean;
    isNative(): boolean;
    isConstructor(): boolean;
}

/**
 * Simple function to get caller information (file name only)
 */
function getCallerFile(): string {
    const originalPrepareStackTrace = Error.prepareStackTrace;
    try {
        const err = new Error();
        // Override prepareStackTrace to get stack as an array of CallSite
        Error.prepareStackTrace = (error: Error, stack: CallSite[]): CallSite[] => stack;
        const stack = err.stack as unknown as CallSite[];

        // File paths and method names related to the logger
        const loggerPaths = ["logger.ts", "/lib/logger"];
        const loggerMethods = ["getLogger", "log", "trace", "debug", "info", "warn", "error", "fatal"];

        // Find the first caller other than the logger
        for (let i = 0; i < stack.length; i++) {
            const fileName = stack[i].getFileName() || "";
            const functionName = stack[i].getFunctionName() || "";

            const isLoggerFile = loggerPaths.some(path => fileName.includes(path));
            const isLoggerMethod = loggerMethods.some(method => functionName.includes(method));

            if (!isLoggerFile && !isLoggerMethod) {
                // Extract only the file name from the file path
                const parts = fileName.split("/");
                let file = parts[parts.length - 1] || "unknown";

                // Remove query parameters (e.g. ?t=...)
                if (file.includes("?")) {
                    file = file.split("?")[0];
                }

                return file;
            }
        }

        return "unknown";
    } catch {
        return "unknown";
    } finally {
        // Restore original prepareStackTrace
        Error.prepareStackTrace = originalPrepareStackTrace;
    }
}

/**
 * Wrap methods for each log level to add line number information
 */
function createEnhancedLogger(logger: pino.Logger): pino.Logger {
    // Log levels to extend
    const levels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
    // Create a logger with basic functions
    const enhancedLogger = Object.create(logger);

    // Wrap each log level method
    levels.forEach(level => {
        const originalMethod = logger[level].bind(logger);
        // Type assertion to match pino's LogFn signature
        (enhancedLogger as any)[level] = (...args: unknown[]) => {
            // Get location information when log is called
            const file = getCallerFile();

            // Argument processing: Add location information if the first argument is an object
            if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
                args[0] = { file, ...(args[0] as Record<string, unknown>) };
            } else {
                // Add location information to the beginning if it is not an object
                args.unshift({ file });
            }

            // Call original log method
            return (originalMethod as any)(...args);
        };
    });

    // Specially override child method
    const originalChild = logger.child.bind(logger);
    enhancedLogger.child = function(bindings: pino.Bindings): pino.Logger {
        // Call original child method
        const childLogger = originalChild(bindings);
        // Enhance child logger as well
        return createEnhancedLogger(childLogger);
    };

    return enhancedLogger;
}

// Create extended logger
const logger = createEnhancedLogger(baseLogger);

/**
 * Define styles for console output
 */
const consoleStyles = {
    // Styles for file name and line number
    fileInfo: "color: #6699cc; font-weight: bold",
    // Styles for module name
    moduleName: "color: #5cb85c; font-weight: bold",
    // Styles by log level
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
 * Returns the child logger with caller filename and line number added to context
 * Set enableConsole to true if you want to output to console at the same time
 */
export function getLogger(componentName?: string, enableConsole: boolean = true): pino.Logger {
    const file = getCallerFile();
    const module = componentName || file;
    const isCustomModule = componentName !== undefined && componentName !== file;

    // Basic logger
    const childLogger = logger.child({ module });

    // Create an extended logger that also outputs to the console if console output is enabled (suppressed in test environment)
    if (enableConsole && useConsoleAPI && !isTestEnvironment) {
        return new Proxy(childLogger, {
            get(target, prop) {
                if (typeof prop === "string" && ["trace", "debug", "info", "warn", "error", "fatal"].includes(prop)) {
                    return function(...args: unknown[]) {
                        // Call original logger method
                        ((target as any)[prop as string] as (...args: unknown[]) => void)(...args);

                        // Output to console as well (at the same level)
                        const consoleMethod = prop === "trace" || prop === "debug"
                            ? "log"
                            : prop === "fatal"
                            ? "error"
                            : prop;

                        try {
                            // Format file information and module name
                            const sourceInfo = `${file}`;
                            const levelUpperCase = prop.toUpperCase();

                            // Separate processing depending on whether the first argument is an object or not
                            if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
                                // Object data
                                const objData = { ...(args[0] as Record<string, unknown>) };
                                delete objData.file; // Delete as it is displayed separately
                                delete objData.module; // Delete as it is displayed separately

                                // Message part
                                const messages = args.slice(1);

                                // Output styled logs - Display only if there is a custom module name
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
                                    // Display only one if module name is same as file name
                                    (console[consoleMethod as keyof Console] as (...args: unknown[]) => void)(
                                        `%c[${sourceInfo}]%c [${levelUpperCase}]:`,
                                        consoleStyles.fileInfo,
                                        consoleStyles.levels[prop as keyof typeof consoleStyles.levels],
                                        ...(messages.length > 0 ? messages : []),
                                        objData,
                                    );
                                }
                            } else {
                                // Normal message (no object)
                                if (isCustomModule) {
                                    (console[consoleMethod as keyof Console] as (...args: unknown[]) => void)(
                                        `%c[${sourceInfo}]%c [${module}]%c [${levelUpperCase}]:`,
                                        consoleStyles.fileInfo,
                                        consoleStyles.moduleName,
                                        consoleStyles.levels[prop as keyof typeof consoleStyles.levels],
                                        ...args,
                                    );
                                } else {
                                    // Display only one if module name is same as file name
                                    (console[consoleMethod as keyof Console] as (...args: unknown[]) => void)(
                                        `%c[${sourceInfo}]%c [${levelUpperCase}]:`,
                                        consoleStyles.fileInfo,
                                        consoleStyles.levels[prop as keyof typeof consoleStyles.levels],
                                        ...args,
                                    );
                                }
                            }
                        } catch {
                            // Display in normal format if style application fails
                            (console[consoleMethod as keyof Console] as (...args: unknown[]) => void)(
                                `[${file}] [${prop.toUpperCase()}]:`,
                                ...args,
                            );
                        }
                    };
                }
                return Reflect.get(target, prop);
            },
        }) as pino.Logger;
    }

    return childLogger;
}

/**
 * Convenient wrapper function that outputs to console and sends to server
 * Perform output to module name and log/console in one call
 */
export function log(
    componentName: string,
    level: "trace" | "debug" | "info" | "warn" | "error" | "fatal",
    ...args: unknown[]
): void {
    // 1. Normal console output (source map information is attached, but direct and simple)
    const consoleMethod = level === "trace" || level === "debug"
        ? "log"
        : level === "fatal"
        ? "error"
        : level;

    // Color coding by level
    const levelColors = {
        trace: "#aaaaaa",
        debug: "#6c757d",
        info: "#0275d8",
        warn: "#f0ad4e",
        error: "#d9534f",
        fatal: "#d9534f",
    };

    // Get caller information (for debugging)
    const file = getCallerFile();

    // Output directly to console
    // If componentName is the same as the file name and duplicated, do not include file name information
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

    // 2. Send to server using Pino logger (record in log file)
    const theLogger = getLogger(componentName, false); // Send to server without console output
    (theLogger[level] as (...args: unknown[]) => void)(...args);
}

/**
 * Extract detailed error information
 */
function extractErrorDetails(
    error: Error | unknown,
): { message: string; stack?: string; name?: string; [key: string]: unknown; } {
    if (error instanceof Error) {
        const { message, name, stack, ...rest } = error as Error & Record<string, unknown>;
        return {
            message,
            name,
            stack,
            ...rest, // Include other custom properties
        };
    } else if (typeof error === "string") {
        return { message: error };
    } else if (error && typeof error === "object") {
        // Spreading arbitrary objects may cause frequent [unserializable] in Playwright console forwarding,
        // so return only the minimum necessary
        const errorObj = error as Record<string, unknown>;
        const name = typeof errorObj.name === "string" ? errorObj.name : undefined;
        const message = typeof errorObj.message === "string" ? errorObj.message : String(error);
        const stack = typeof errorObj.stack === "string" ? errorObj.stack : undefined;
        const type = typeof errorObj.type === "string" ? errorObj.type : undefined;

        return { name, message, stack, type };
    }
    return { message: String(error) };
}

/**
 * Initialize global error handlers
 * Log uncaught exceptions
 */
function setupGlobalErrorHandlers(): void {
    if (typeof window === "undefined") return; // Do not execute on server side

    const uncaughtLogger = getLogger("UncaughtError", false);

    // Log uncaught exceptions
    window.onerror = (message, source, lineno, colno, error) => {
        const errorInfo = {
            type: "uncaught_exception",
            source: source || "",
            line: lineno || 0,
            column: colno || 0,
            ...extractErrorDetails(error || message),
        };

        // Output to both logger and console (output only string to console to avoid unserializable targets like Playwright fVite fHMR fErrorEvent fDOMException)
        uncaughtLogger.error(errorInfo);
        const errMsg = `[UncaughtError] ${errorInfo.type}: ${errorInfo.name || ""} ${errorInfo.message || ""}`;
        const stackTop = (errorInfo.stack || "").split("\n").slice(0, 2).join("\n");
        const marker = ((window as unknown as Record<string, unknown>).__LAST_EFFECT__ as string) || "<unknown>";
        console.error(`%c${errMsg}`, consoleStyles.fileInfo, stackTop);
        console.error("[EFFECT-MARKER]", marker);
        console.error("[STACK]", stackTop);

        // Continue default error handling (do not return false)
        return false;
    };

    // Log unhandled Promise rejections
    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        const errorInfo = {
            type: "unhandled_rejection",
            ...extractErrorDetails(reason),
        };

        // Output to both logger and console (output only string to console)
        uncaughtLogger.error(errorInfo);
        const errMsg = `[UncaughtError] ${errorInfo.type}: ${errorInfo.name || ""} ${errorInfo.message || ""}`;
        const stackTop = (errorInfo.stack || "").split("\n").slice(0, 2).join("\n");
        const marker = ((window as unknown as Record<string, unknown>).__LAST_EFFECT__ as string) || "<unknown>";
        console.error(`%c${errMsg}`, consoleStyles.fileInfo, stackTop);
        console.error("[EFFECT-MARKER]", marker);
        console.error("[STACK]", stackTop);
    };
}

// Safely stringify console.error/warn arguments to suppress [unserializable] spam in Playwright
function setupConsoleSanitizer(): void {
    if (typeof window === "undefined") return;
    const safe = (arg: unknown): string => {
        try {
            if (typeof arg === "string") return arg;
            if (arg instanceof Error) {
                const top = (arg.stack || "").split("\n").slice(0, 2).join("\n");
                return `${arg.name}: ${arg.message}\n${top}`;
            }
            if (arg && typeof arg === "object") {
                const name = typeof (arg as Record<string, unknown>).name === "string"
                    ? (arg as Record<string, unknown>).name as string
                    : undefined;
                const msg = typeof (arg as Record<string, unknown>).message === "string"
                    ? (arg as Record<string, unknown>).message as string
                    : undefined;
                if (name || msg) return `${name || "Object"}: ${msg || ""}`;
                // Minimal JSON stringification (avoid circular references)
                return JSON.stringify(arg, (_k, v) => (typeof v === "object" ? undefined : v)) || "[object]";
            }
            return String(arg);
        } catch {
            return "[unserializable-arg]";
        }
    };
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args: unknown[]) => origError(...args.map(safe));
    console.warn = (...args: unknown[]) => origWarn(...args.map(safe));
}

// Initialize global error handlers if in browser environment
if (typeof window !== "undefined") {
    setupConsoleSanitizer();
    setupGlobalErrorHandlers();
}
