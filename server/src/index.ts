import { loadConfig } from "./config.js";
import { startServer } from "./server.js";

const config = loadConfig();

(async () => {
    try {
        const { shutdown } = await startServer(config);

        process.on("SIGINT", () => shutdown().then(() => process.exit(0)));
        process.on("SIGTERM", () => shutdown().then(() => process.exit(0)));
    } catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
})();
