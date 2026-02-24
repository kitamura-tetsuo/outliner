function normalizeId(raw: string, label: "projectId" | "pageId"): string {
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

export function pageRoomPath(projectId: string, pageId: string): string {
    // Server expects /projects/<projectId>/pages/<pageId>
    return `projects/${normalizeId(projectId, "projectId")}/pages/${normalizeId(pageId, "pageId")}`;
}
