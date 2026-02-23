const SEGMENT_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface RoomInfo {
    project: string;
}

export function parseRoom(path: string): RoomInfo | undefined {
    // Basic path traversal protection
    if (path.includes("..")) return undefined;

    const [pathname] = path.split("?");
    const parts = pathname.split("/").filter(Boolean);

    try {
        if (parts.length === 2 && parts[0] === "projects") {
            const project = decodeURIComponent(parts[1]);
            if (project.length > 0 && project.length <= 128) {
                return { project };
            }
        }
    } catch {
        return undefined;
    }
    return undefined;
}
