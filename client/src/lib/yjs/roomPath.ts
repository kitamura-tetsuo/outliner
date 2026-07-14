function normalizeId(raw: string, label: "projectId" | "pageId" | "tableId"): string {
    const normalized = (raw ?? "").trim();
    if (!normalized) {
        throw new Error(`${label} must be provided`);
    }
    return encodeURIComponent(normalized);
}

export function projectRoomPath(projectId: string): string {
    // Server expects /projects/<projectId>
    return `projects/${normalizeId(projectId, "projectId")}`;
}

export function tableRoomPath(projectId: string, tableId: string): string {
    // Table subdocs sync through their own room; the server derives access
    // rights from the parent project segment.
    return `projects/${normalizeId(projectId, "projectId")}/tables/${normalizeId(tableId, "tableId")}`;
}
