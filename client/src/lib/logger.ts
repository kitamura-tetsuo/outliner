// Logger utility

type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerOptions {
    prefix?: string;
    level?: LogLevel;
}

const levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const currentLevel: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || "info";

export class Logger {
    private prefix: string;
    private level: LogLevel;

    constructor(options: LoggerOptions = {}) {
        this.prefix = options.prefix || "";
        this.level = options.level || currentLevel;
    }

    private shouldLog(level: LogLevel): boolean {
        return levels[level] >= levels[this.level];
    }

    private formatMessage(message: string): string {
        if (this.prefix) {
            return `[${this.prefix}] ${message}`;
        }
        return message;
    }

    debug(message: string, ...args: any[]) {
        if (this.shouldLog("debug")) {
            console.debug(this.formatMessage(message), ...args);
        }
    }

    info(message: string, ...args: any[]) {
        if (this.shouldLog("info")) {
            console.info(this.formatMessage(message), ...args);
        }
    }

    warn(message: string, ...args: any[]) {
        if (this.shouldLog("warn")) {
            console.warn(this.formatMessage(message), ...args);
        }
    }

    error(message: string, ...args: any[]) {
        if (this.shouldLog("error")) {
            console.error(this.formatMessage(message), ...args);
        }
    }
}

// Get default logger
export const logger = new Logger();

// Get named logger
export function getLogger(name: string, level?: LogLevel): Logger {
    return new Logger({ prefix: name, level });
}
