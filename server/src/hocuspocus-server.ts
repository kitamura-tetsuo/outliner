import { Logger } from "@hocuspocus/extension-logger";
import { Server } from "@hocuspocus/server";

// TODO: Get port from config
const port = 1234;

export const hocuspocus = new Server({
    name: "hocuspocus-fluid-outliner",
    port,
    extensions: [new Logger()],
});
