/**
 * Framework-neutral logger abstraction for the shared schema module.
 *
 * The shared schema is compiled into both the client (which uses a pino-based
 * logger with browser console styling) and the server (which only needs plain
 * console output). To avoid coupling the shared code to either environment,
 * modules here obtain their logger through {@link getLogger}. Consumers may
 * override how loggers are created via {@link setLoggerFactory} (the client
 * wires this to its pino logger); by default a console-backed logger is used.
 */

export interface Logger {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    trace(...args: unknown[]): void;
    fatal(...args: unknown[]): void;
}

export type LoggerFactory = (name: string) => Logger;

const consoleLogger: Logger = {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    debug: (...args) => console.debug(...args),
    trace: (...args) => console.trace(...args),
    fatal: (...args) => console.error(...args),
};

const consoleFactory: LoggerFactory = () => consoleLogger;

let factory: LoggerFactory = consoleFactory;
const cache = new Map<string, Logger>();

/**
 * Override how shared modules obtain their logger. The client calls this once
 * at startup to route shared logging through its pino logger. Clears the
 * per-name cache so subsequent {@link getLogger} calls pick up the new factory.
 */
export function setLoggerFactory(next: LoggerFactory): void {
    factory = next;
    cache.clear();
}

function resolve(name: string): Logger {
    let logger = cache.get(name);
    if (!logger) {
        logger = factory(name);
        cache.set(name, logger);
    }
    return logger;
}

/**
 * Returns a logger proxy that always resolves the currently configured factory
 * at call time. This lets modules capture a logger at import time (before the
 * consumer has configured its factory) without binding to the console default.
 */
export function getLogger(name: string): Logger {
    return {
        info: (...args) => resolve(name).info(...args),
        warn: (...args) => resolve(name).warn(...args),
        error: (...args) => resolve(name).error(...args),
        debug: (...args) => resolve(name).debug(...args),
        trace: (...args) => resolve(name).trace(...args),
        fatal: (...args) => resolve(name).fatal(...args),
    };
}
