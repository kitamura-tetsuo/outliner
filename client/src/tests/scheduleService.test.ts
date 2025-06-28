import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSchedule, listSchedules, cancelSchedule } from "../services/scheduleService";
import { userManager } from "../auth/UserManager";

vi.mock("../auth/UserManager", () => ({
    userManager: {
        apiBaseUrl: "http://localhost:57000",
        auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue("token") } },
    },
}));

declare const global: any;

beforeEach(() => {
    vi.clearAllMocks();
});

it("calls createSchedule API", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await createSchedule("page1", { strategy: "one_shot", nextRunAt: 1 });
    expect(global.fetch).toHaveBeenCalled();
});

it("calls listSchedules API", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ schedules: [] }) });
    await listSchedules("page1");
    expect(global.fetch).toHaveBeenCalled();
});

it("calls cancelSchedule API", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await cancelSchedule("page1", "sch1");
    expect(global.fetch).toHaveBeenCalled();
});
