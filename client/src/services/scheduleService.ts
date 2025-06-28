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
    const res = await fetch(`${userManager.apiBaseUrl}/api/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, ...body })
    });
    if (!res.ok) {
        throw new Error(`API error ${res.status}`);
    }
    return res.json();
}

export async function createSchedule(pageId: string, schedule: { strategy: string; nextRunAt: number; params?: any }) {
    return fetchApi("create-schedule", { pageId, schedule });
}

export async function listSchedules(pageId: string): Promise<Schedule[]> {
    const data = await fetchApi("list-schedules", { pageId });
    return data.schedules as Schedule[];
}

export async function cancelSchedule(pageId: string, scheduleId: string) {
    return fetchApi("cancel-schedule", { pageId, scheduleId });
}
