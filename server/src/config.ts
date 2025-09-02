import { z } from "zod";

const ConfigSchema = z.object({
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    ROOM_PREFIX_ENFORCE: z.coerce.boolean().default(false),
    LEVELDB_PATH: z.string().default("./ydb"),
    LEVELDB_ROOM_SIZE_WARN_MB: z.coerce.number().default(50),
    LEVELDB_LOG_INTERVAL_MS: z.coerce.number().default(60 * 60 * 1000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    if (env.YJS_DATA_DIR && !env.LEVELDB_PATH) {
        env.LEVELDB_PATH = env.YJS_DATA_DIR;
    }
    return ConfigSchema.parse(env);
}
