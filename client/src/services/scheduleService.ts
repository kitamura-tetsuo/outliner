import { userManager } from "../auth/UserManager";
import { getFirebaseFunctionUrl } from "../lib/firebaseFunctionsUrl";
import { getLogger } from "../lib/logger";

const logger = getLogger("scheduleService");

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

// In-memory mock for guest/demo users
const mockSchedules: Record<string, Schedule[]> = {};

function generateId() {
    return Math.random().toString(36).substring(2, 15);
}

async function fetchApi(path: string, body: ApiRequestBody) {
    if (!userManager.auth.currentUser) {
        logger.debug(`Schedule API (Mock): Calling ${path} for demo visitor`);
        const pageId = body.pageId as string;

        if (path === "listSchedules") {
            return { schedules: mockSchedules[pageId] || [] };
        }
        if (path === "createSchedule") {
            const sched = body.schedule as Partial<Schedule>;
            const newSchedule: Schedule = {
                id: generateId(),
                strategy: sched.strategy || "one_shot",
                params: sched.params || {},
                nextRunAt: sched.nextRunAt || Date.now(),
                createdAt: new Date().toISOString(),
            };
            if (!mockSchedules[pageId]) mockSchedules[pageId] = [];
            mockSchedules[pageId].push(newSchedule);
            return { schedule: newSchedule };
        }
        if (path === "cancelSchedule") {
            const schedId = body.scheduleId as string;
            if (mockSchedules[pageId]) {
                mockSchedules[pageId] = mockSchedules[pageId].filter(s => s.id !== schedId);
            }
            return { success: true };
        }
        if (path === "updateSchedule") {
            const schedId = body.scheduleId as string;
            const sched = body.schedule as Partial<Schedule>;
            if (mockSchedules[pageId]) {
                const idx = mockSchedules[pageId].findIndex(s => s.id === schedId);
                if (idx !== -1) {
                    mockSchedules[pageId][idx] = {
                        ...mockSchedules[pageId][idx],
                        ...sched,
                        nextRunAt: sched.nextRunAt ?? mockSchedules[pageId][idx].nextRunAt,
                    };
                }
            }
            return { success: true };
        }
        throw new Error(`Mock API path ${path} not implemented`);
    }

    const idToken = await userManager.auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("No auth token");

    const url = getFirebaseFunctionUrl(path);

    logger.debug(`Schedule API: Calling ${url}`);

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, ...body }),
    });
    if (!res.ok) {
        const errorText = await res.text();
        logger.error({ status: res.status, errorText }, "Schedule API error");
        throw new Error(`API error ${res.status}: ${errorText}`);
    }
    return res.json();
}

export async function createSchedule(
    pageId: string,
    schedule: { strategy: string; nextRunAt: number; params?: Record<string, unknown>; },
) {
    return fetchApi("createSchedule", { pageId, schedule });
}

export async function listSchedules(pageId: string): Promise<Schedule[]> {
    const data = await fetchApi("listSchedules", { pageId });
    return data.schedules as Schedule[];
}

export async function cancelSchedule(pageId: string, scheduleId: string) {
    return fetchApi("cancelSchedule", { pageId, scheduleId });
}

export async function updateSchedule(
    pageId: string,
    scheduleId: string,
    schedule: { strategy: string; nextRunAt: number; params?: Record<string, unknown>; },
) {
    return fetchApi("updateSchedule", { pageId, scheduleId, schedule });
}

export async function exportSchedulesIcal(
    pageId: string,
): Promise<{ blob: Blob; filename: string; }> {
    if (!userManager.auth.currentUser) {
        // Mock iCal generation for demo visitors
        const blob = new Blob(["BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR"], { type: "text/calendar" });
        return { blob, filename: `outliner-schedules-${pageId}.ics` };
    }

    const idToken = await userManager.auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("No auth token");

    const url = getFirebaseFunctionUrl("exportSchedulesIcal");
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, pageId }),
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
