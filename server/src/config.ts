import { z } from "zod";

const ConfigSchema = z.object({
    PORT: z.coerce.number().default(7093),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    ROOM_PREFIX_ENFORCE: z.coerce.boolean().default(false),
    DATABASE_PATH: z.string().default("./ydb"),
    MAX_SOCKETS_TOTAL: z.coerce.number().default(1000),
    MAX_SOCKETS_PER_IP: z.coerce.number().default(100),
    MAX_SOCKETS_PER_ROOM: z.coerce.number().default(100),
    IDLE_TIMEOUT_MS: z.coerce.number().default(60_000),
    MAX_MESSAGE_SIZE_BYTES: z.coerce.number().default(1_000_000),
    ORIGIN_ALLOWLIST: z.string().default(""),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(1000),
    SENTRY_DSN: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    if (env.YJS_DATA_DIR && !env.DATABASE_PATH) {
        env.DATABASE_PATH = env.YJS_DATA_DIR;
    }
    return ConfigSchema.parse(env);
}
