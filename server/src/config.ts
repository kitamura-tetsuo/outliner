import { z } from "zod";

const ConfigSchema = z.object({
    OUTLINER_DEPLOYMENT_MODE: z.enum(["cloud", "onprem"]).default("cloud"),
    OUTLINER_DATA_DIR: z.string().optional(),
    OUTLINER_STATIC_DIR: z.string().optional(),
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
    TRUST_PROXY_HEADERS: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
    TRUSTED_PROXY_HOPS: z.coerce.number().default(1),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const values = { ...env };
    if (values.YJS_DATA_DIR && !values.DATABASE_PATH) values.DATABASE_PATH = values.YJS_DATA_DIR;
    const config = ConfigSchema.parse(values);
    if (config.OUTLINER_DEPLOYMENT_MODE === "onprem") {
        if (!config.OUTLINER_DATA_DIR?.trim()) {
            throw new Error("OUTLINER_DATA_DIR must be a non-empty path in onprem mode");
        }
        if (env.DISABLE_PERSISTENCE === "true") {
            throw new Error("On-premises mode requires persistence");
        }
        if (env.ALLOW_TEST_ACCESS === "true") {
            throw new Error("On-premises mode refuses ALLOW_TEST_ACCESS");
        }
        config.OUTLINER_DATA_DIR = config.OUTLINER_DATA_DIR.trim();
        if (config.OUTLINER_STATIC_DIR !== undefined && !config.OUTLINER_STATIC_DIR.trim()) {
            throw new Error("OUTLINER_STATIC_DIR must be a non-empty path when configured");
        }
        config.OUTLINER_STATIC_DIR = config.OUTLINER_STATIC_DIR?.trim();
        config.DATABASE_PATH = config.OUTLINER_DATA_DIR;
    }
    return config;
}
