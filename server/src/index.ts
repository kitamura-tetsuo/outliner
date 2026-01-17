import * as Sentry from "@sentry/node";
import { loadConfig } from "./config.js";
import { startServer } from "./server.js";

const config = loadConfig();

if (config.SENTRY_DSN) {
    Sentry.init({
        dsn: config.SENTRY_DSN,
        beforeSend(event) {
            if (event.request?.headers) {
                delete event.request.headers['Authorization'];
                delete event.request.headers['Cookie'];
                delete event.request.headers['authorization'];
                delete event.request.headers['cookie'];
            }

            if (event.user) {
                delete event.user.email;
                delete event.user.ip_address;
            }

            return event;
        },
    });
}

await startServer(config);
