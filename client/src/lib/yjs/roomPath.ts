export function projectRoomPath(projectId: string): string {
    // Server expects /projects/<projectId>
    return `projects/${encodeURIComponent(projectId)}`;
}

export function pageRoomPath(projectId: string, pageId: string): string {
    // Server expects /projects/<projectId>/pages/<pageId>
    return `projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}`;
}
