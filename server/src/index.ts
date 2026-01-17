import { loadConfig } from "./config.js";
import { startServer } from "./server.js";

const config = loadConfig();
const { shutdown } = await startServer(config);

process.on("SIGINT", () => shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => shutdown().then(() => process.exit(0)));
