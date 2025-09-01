import pino from "pino";

export function createLogger(destination: pino.DestinationStream = pino.destination(1)) {
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
    );
}

export const logger = createLogger();
export default logger;
