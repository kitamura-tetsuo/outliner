import * as Sentry from "@sentry/node";
import { loadConfig } from "./config.js";
import { startServer } from "./server.js";

const config = loadConfig();

if (config.SENTRY_DSN) {
    Sentry.init({
        dsn: config.SENTRY_DSN,
    });
}

await startServer(config);
