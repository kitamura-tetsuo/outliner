import { userManager } from "../auth/UserManager";

export interface Schedule {
    id: string;
    strategy: string;
    params: Record<string, unknown>;
    nextRunAt: number;
    createdAt?: string;
}

async function fetchApi(path: string, body: any) {
    const idToken = await userManager.auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("No auth token");

    // 環境に応じてAPIベースURLを決定
    const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";
    const url = `${apiBaseUrl}/api/${path}`;

    console.log(`Schedule API: Calling ${url}`);

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, ...body }),
    });
    if (!res.ok) {
        const errorText = await res.text();
        console.error(`Schedule API error: ${res.status} - ${errorText}`);
        throw new Error(`API error ${res.status}: ${errorText}`);
    }
    return res.json();
}

export async function createSchedule(pageId: string, schedule: { strategy: string; nextRunAt: number; params?: any; }) {
    return fetchApi("create-schedule", { pageId, schedule });
}

export async function listSchedules(pageId: string): Promise<Schedule[]> {
    const data = await fetchApi("list-schedules", { pageId });
    return data.schedules as Schedule[];
}

export async function cancelSchedule(pageId: string, scheduleId: string) {
    return fetchApi("cancel-schedule", { pageId, scheduleId });
}
