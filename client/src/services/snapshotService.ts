import { v4 as uuidv4 } from "uuid";

export interface Snapshot {
    id: string;
    timestamp: number;
    author: string;
    content: string;
}

function storageKey(project: string, page: string) {
    return `snapshot:${project}/${page}`;
}

function load(project: string, page: string): Snapshot[] {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(storageKey(project, page));
    if (!raw) return [];
    try {
        return JSON.parse(raw) as Snapshot[];
    } catch {
        return [];
    }
}

function save(project: string, page: string, snapshots: Snapshot[]) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(storageKey(project, page), JSON.stringify(snapshots));
}

export function addSnapshot(
    project: string,
    page: string,
    content: string,
    author: string,
): Snapshot {
    const snapshots = load(project, page);
    const snapshot: Snapshot = {
        id: uuidv4(),
        timestamp: Date.now(),
        author,
        content,
    };
    snapshots.push(snapshot);
    save(project, page, snapshots);
    return snapshot;
}

export function listSnapshots(project: string, page: string): Snapshot[] {
    return load(project, page);
}

export function getSnapshot(
    project: string,
    page: string,
    id: string,
): Snapshot | undefined {
    return load(project, page).find(s => s.id === id);
}

export function replaceWithSnapshot(
    project: string,
    page: string,
    id: string,
): Snapshot | undefined {
    const snapshots = load(project, page);
    const snapshot = snapshots.find(s => s.id === id);
    if (!snapshot) return;
    // Put snapshot at end (current)
    snapshots.push({ ...snapshot, id: uuidv4(), timestamp: Date.now() });
    save(project, page, snapshots);
    return snapshot;
}

// Extend the Window interface to include our test service
declare global {
    interface Window {
        __SNAPSHOT_SERVICE__?: {
            addSnapshot: typeof addSnapshot;
            getSnapshot: typeof getSnapshot;
            listSnapshots: typeof listSnapshots;
            replaceWithSnapshot: typeof replaceWithSnapshot;
        };
    }
}

if (process.env.NODE_ENV === "test") {
    if (typeof window !== "undefined") {
        window.__SNAPSHOT_SERVICE__ = {
            addSnapshot,
            getSnapshot,
            listSnapshots,
            replaceWithSnapshot,
        };
    }
}
