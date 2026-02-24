import * as Sentry from "@sentry/node";
import { loadConfig } from "./config.js";
import { initializeFirebase } from "./firebase-init.js";
import { startServer } from "./server.js";

const config = loadConfig();

if (config.SENTRY_DSN) {
    Sentry.init({
        dsn: config.SENTRY_DSN,
        beforeSend(event) {
            if (event.request?.headers) {
                delete event.request.headers["Authorization"];
                delete event.request.headers["Cookie"];
                delete event.request.headers["authorization"];
                delete event.request.headers["cookie"];
            }

            if (event.user) {
                delete event.user.email;
                delete event.user.ip_address;
            }

            return event;
        },
    });
}

(async () => {
    try {
        await initializeFirebase();
        const { shutdown } = await startServer(config);

        process.on("SIGINT", () => shutdown().then(() => process.exit(0)));
        process.on("SIGTERM", () => shutdown().then(() => process.exit(0)));
    } catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
})();
