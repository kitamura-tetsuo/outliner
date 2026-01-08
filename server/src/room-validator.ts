const SEGMENT_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface RoomInfo {
    project: string;
    page?: string;
}

export function parseRoom(path: string): RoomInfo | undefined {
    const [pathname] = path.split("?");
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 2 && parts[0] === "projects" && SEGMENT_RE.test(parts[1])) {
        return { project: parts[1] };
    }
    if (
        parts.length === 4
        && parts[0] === "projects"
        && SEGMENT_RE.test(parts[1])
        && parts[2] === "pages"
        && SEGMENT_RE.test(parts[3])
    ) {
        return { project: parts[1], page: parts[3] };
    }
    return undefined;
}
