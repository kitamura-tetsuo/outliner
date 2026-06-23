import path from "path";
import { fileURLToPath } from "url";
import { serverLogger as logger } from "./log-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

logger.info(`__dirname: ${__dirname}`);

let serverRoot = path.resolve(__dirname, "..", "..");
if (path.basename(serverRoot) === "dist") {
    serverRoot = path.resolve(serverRoot, "..");
}

const serverLogDir = path.join(serverRoot, "logs");
const clientLogDir = path.resolve(serverRoot, "..", "client", "logs");

logger.info(`serverRoot: ${serverRoot}`);
logger.info(`serverLogDir: ${serverLogDir}`);
logger.info(`clientLogDir: ${clientLogDir}`);
