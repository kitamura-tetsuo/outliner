import { beforeEach, expect, it, vi } from "vitest";
import { cancelSchedule, createSchedule, listSchedules, updateSchedule } from "../services/scheduleService";

// UserManagerをモックして、実際のAPIエンドポイントを使用
vi.mock("../auth/UserManager", () => ({
    userManager: {
        functionsUrl: "http://localhost:57000",
        auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue("test-id-token") } },
    },
}));

// fetchをモックして、実際のAPIレスポンスをシミュレート
(globalThis as typeof globalThis & { fetch?: unknown; }).fetch = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
});

it("calls createSchedule API", async () => {
    // fetchのモックレスポンスを設定
    const mockResponse = { scheduleId: "test-schedule-id" };
    (globalThis as typeof globalThis & { fetch?: unknown; }).fetch!.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
    });

    const nextRunAt = Date.now() + 60000;
    const result = await createSchedule("page1", { strategy: "one_shot", nextRunAt });

    expect(result).toBeDefined();
    expect(result.scheduleId).toBe("test-schedule-id");

    // fetchが正しいパラメータで呼ばれたことを確認
    expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:57000/api/create-schedule",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                idToken: "test-id-token",
                pageId: "page1",
                schedule: { strategy: "one_shot", nextRunAt },
            }),
        },
    );
});

it("calls listSchedules API", async () => {
    // fetchのモックレスポンスを設定
    const mockSchedules = [
        { id: "schedule1", strategy: "one_shot", params: {}, nextRunAt: Date.now() + 60000 },
        { id: "schedule2", strategy: "recurring", params: {}, nextRunAt: Date.now() + 120000 },
    ];
    (globalThis as typeof globalThis & { fetch?: unknown; }).fetch!.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ schedules: mockSchedules }),
    });

    const result = await listSchedules("page1");

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("schedule1");
    expect(result[1].id).toBe("schedule2");

    // fetchが正しいパラメータで呼ばれたことを確認
    expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:57000/api/list-schedules",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                idToken: "test-id-token",
                pageId: "page1",
            }),
        },
    );
});

it("calls cancelSchedule API", async () => {
    // fetchのモックレスポンスを設定
    const mockResponse = { success: true };
    (globalThis as typeof globalThis & { fetch?: unknown; }).fetch!.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
    });

    const result = await cancelSchedule("page1", "test-schedule-id");

    expect(result).toBeDefined();
    expect(result.success).toBe(true);

    // fetchが正しいパラメータで呼ばれたことを確認
    expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:57000/api/cancel-schedule",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                idToken: "test-id-token",
                pageId: "page1",
                scheduleId: "test-schedule-id",
            }),
        },
    );
});

it("calls updateSchedule API", async () => {
    const mockResponse = { success: true };
    (globalThis as typeof globalThis & { fetch?: unknown; }).fetch!.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
    });

    const nextRunAt = Date.now() + 120000;
    const result = await updateSchedule("page1", "schedule1", {
        strategy: "one_shot",
        nextRunAt,
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);

    expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:57000/api/update-schedule",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                idToken: "test-id-token",
                pageId: "page1",
                scheduleId: "schedule1",
                schedule: { strategy: "one_shot", nextRunAt },
            }),
        },
    );
});
