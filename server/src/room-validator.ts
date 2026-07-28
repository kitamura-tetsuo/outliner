import { logger } from "./logger.js";
const SEGMENT_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface RoomInfo {
    project: string;
    /** Set for table subdoc rooms (\`projects/<project>/tables/<table>\`). */
    table?: string;
}

export function parseRoom(path: string): RoomInfo | undefined {
    const [pathname] = path.split("?");
    const parts = pathname.split("/").filter(Boolean);

    try {
        if (parts.length === 2 && parts[0] === "projects") {
            const project = decodeURIComponent(parts[1]);
            // Room segments are opaque IDs (like [A-Za-z0-9_-]{1,128}). Human-readable titles (with spaces) never appear in room paths, so the regex rejects them as designed.
            if (SEGMENT_RE.test(project)) {
                return { project };
            }
        }
        // Table subdocs live in per-table rooms under their project; access
        // control is inherited from the project.
        if (parts.length === 4 && parts[0] === "projects" && parts[2] === "tables") {
            const project = decodeURIComponent(parts[1]);
            const table = decodeURIComponent(parts[3]);
            if (
                SEGMENT_RE.test(project)
                && SEGMENT_RE.test(table)
            ) {
                return { project, table };
            }
        }
    } catch (_e) {
            logger.warn({ err: _e }, "Silenced error");
        return undefined;
    }
    return undefined;
}
