import { userManager } from "../auth/UserManager";
import { getFirebaseFunctionUrl } from "../lib/firebaseFunctionsUrl";

export interface Schedule {
    id: string;
    strategy: string;
    params: Record<string, unknown>;
    nextRunAt: number;
    createdAt?: string;
}

interface ApiRequestBody {
    [key: string]: unknown;
}

async function fetchApi(path: string, body: ApiRequestBody) {
    const idToken = await userManager.auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("No auth token");

    const url = getFirebaseFunctionUrl(path);

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

export async function createSchedule(
    projectId: string,
    pageId: string,
    schedule: { strategy: string; nextRunAt: number; params?: Record<string, unknown>; },
) {
    return fetchApi("create-schedule", { projectId, pageId, schedule });
}

export async function listSchedules(projectId: string, pageId: string): Promise<Schedule[]> {
    const data = await fetchApi("list-schedules", { projectId, pageId });
    return data.schedules as Schedule[];
}

export async function cancelSchedule(projectId: string, pageId: string, scheduleId: string) {
    return fetchApi("cancel-schedule", { projectId, pageId, scheduleId });
}

export async function updateSchedule(
    projectId: string,
    pageId: string,
    scheduleId: string,
    schedule: { strategy: string; nextRunAt: number; params?: Record<string, unknown>; },
) {
    return fetchApi("update-schedule", { projectId, pageId, scheduleId, schedule });
}

export async function exportSchedulesIcal(
    projectId: string,
    pageId: string,
): Promise<{ blob: Blob; filename: string; }> {
    const idToken = await userManager.auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("No auth token");

    const url = getFirebaseFunctionUrl("export-schedules-ical");
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, projectId, pageId }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const contentDisposition = response.headers.get("Content-Disposition") || "";
    const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
    const filename = filenameMatch ? filenameMatch[1] : `outliner-schedules-${pageId}.ics`;
    const text = await response.text();
    const blob = new Blob([text], { type: "text/calendar" });
    return { blob, filename };
}
