import { loadConfig } from "./config.js";
import { serverLogger as logger } from "./utils/log-manager.js";

const config = loadConfig();

(async () => {
    try {
        // Dynamic composition is a security boundary: importing the cloud
        // server initializes several Firebase-backed modules at module scope.
        // The on-premises process must never evaluate those inactive modules.
        const { shutdown } = config.OUTLINER_DEPLOYMENT_MODE === "onprem"
            ? await (await import("./onprem-server.js")).startOnPremServer(config)
            : await (async () => {
                if (config.SENTRY_DSN) {
                    const Sentry = await import("@sentry/node");
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
                const [{ startServer }, { initializeFirebase }] = await Promise.all([
                    import("./server.js"),
                    import("./firebase-init.js"),
                ]);
                const started = await startServer(config);
                initializeFirebase().catch(err => {
                    logger.error({
                        err: err instanceof Error ? { message: err.message, name: err.name, stack: err.stack } : err,
                    }, "Firebase init failed");
                });
                return started;
            })();

        const stop = () =>
            shutdown().then(() => process.exit(0), error => {
                logger.error({ error }, "Unsuccessful shutdown");
                process.exit(1);
            });
        process.on("SIGINT", stop);
        process.on("SIGTERM", stop);
    } catch (err) {
        logger.error(
            { err: err instanceof Error ? { message: err.message, name: err.name, stack: err.stack } : err },
            "Failed to start server",
        );
        process.exit(1);
    }
})();
