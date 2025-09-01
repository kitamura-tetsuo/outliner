import { z } from "zod";

const ConfigSchema = z.object({
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    ROOM_PREFIX_ENFORCE: z.coerce.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    return ConfigSchema.parse(env);
}
