import { loadConfig } from "./config";
import { startServer } from "./server";

const config = loadConfig();
startServer(config);
