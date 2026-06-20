import pino from "pino";


// Patched logger interface to prevent strict type checks on first argument
export interface EnhancedLogger extends pino.Logger {
    trace(...args: any[]): void;
    debug(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    fatal(...args: any[]): void;
}

export function createLogger(destination: pino.DestinationStream = pino.destination(1)): EnhancedLogger {
    return pino(
        {
            level: process.env.LOG_LEVEL ?? "info",
            redact: {
                paths: [
                    "req.headers.authorization",
                    "req.body.token",
                    "authorization",
                    "token",
                    "password",
                    "email",
                ],
                censor: "[REDACTED]",
            },
            timestamp: pino.stdTimeFunctions.isoTime,
        },
        destination,
    ) as unknown as EnhancedLogger;
}

export const logger = createLogger();
export default logger;
