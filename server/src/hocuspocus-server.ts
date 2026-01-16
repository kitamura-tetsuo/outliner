import { Logger } from "@hocuspocus/extension-logger";
import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
import { checkContainerAccess } from "./access-control.js";
import { createPersistence } from "./persistence.js";
import { parseRoom } from "./room-validator.js";
import { extractAuthToken, verifyIdTokenCached } from "./websocket-auth.js";

// TODO: Get port from config
const port = 1234;

export const hocuspocus = new Server({
    name: "hocuspocus-fluid-outliner",
    port,
    extensions: [new Logger()],
    async onAuthenticate({ request, documentName }) {
        const token = extractAuthToken(request);
        if (!token) {
            throw new Error("Authentication failed: No token provided");
        }

        const room = parseRoom(documentName);
        if (!room?.project) {
            throw new Error("Authentication failed: Invalid room format");
        }

        const decodedToken = await verifyIdTokenCached(token);
        const hasAccess = await checkContainerAccess(decodedToken.uid, room.project);

        if (!hasAccess) {
            throw new Error("Authentication failed: Access denied");
        }
    },
    async onLoadDocument({ documentName }) {
        const persistence = await createPersistence("db");
        const ydoc = await persistence.getYDoc(documentName);
        return ydoc;
    },
});
