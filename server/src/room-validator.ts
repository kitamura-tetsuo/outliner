const SEGMENT_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface RoomInfo {
    project: string;
    page?: string;
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

        if (parts.length === 4 && parts[0] === "projects" && parts[2] === "pages") {
            const project = decodeURIComponent(parts[1]);
            const page = decodeURIComponent(parts[3]);
            if (project.length > 0 && project.length <= 128 && page.length > 0 && page.length <= 128) {
                return { project, page };
            }
        }
    } catch {
        return undefined;
    }
    return undefined;
}
