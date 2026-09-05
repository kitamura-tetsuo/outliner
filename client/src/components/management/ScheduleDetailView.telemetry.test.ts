// The Schedule detail page and scheduler-owned execution telemetry (issue
// #5290). The page loads its project asynchronously and saves by spreading the
// whole rule it loaded, so a snapshot taken before an execution finished must
// never be able to write itself back over a newer result.

import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const mockPageStore = { params: { project: "demo", ruleId: "rule-1" } };
vi.mock("$app/stores", () => ({
    page: {
        subscribe: (run: (value: typeof mockPageStore) => void) => {
            run(mockPageStore);
            return () => {};
        },
    },
}));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

vi.mock("../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: () => null,
        addEventListener: () => () => {},
    },
}));

let projectDoc = new Y.Doc();

// Deliberately asynchronous, and `store.project` stays undefined until it
// resolves — the production ordering that left the page with no subscription.
vi.mock("../../lib/routeProject", async () => {
    const { store } = await import("../../stores/store.svelte");
    return {
        openRouteProject: vi.fn(async () => {
            await Promise.resolve();
            store.project = {
                ydoc: projectDoc,
                schedules: projectDoc.getMap("schedules"),
            } as unknown as NonNullable<typeof store.project>;
            return { release: vi.fn() };
        }),
    };
});

vi.mock("../../lib/demoInit", () => ({
    DemoInitAborted: class DemoInitAborted extends Error {},
}));

vi.mock("../../services/schedule/scheduleRunService", () => ({
    runScheduleRuleNow: vi.fn(async () => ({ ok: true })),
}));

import { store } from "../../stores/store.svelte";
import ScheduleDetailView from "./ScheduleDetailView.svelte";

const RULE_ID = "rule-1";

/** The telemetry a scheduler execution leaves on the shared Schedule. */
function writeExecution(
    ruleMap: Y.Map<unknown>,
    execution: { seq: number; startedAt: string; completedAt: string; },
) {
    projectDoc.transact(() => {
        ruleMap.set("lastRunSeq", execution.seq);
        ruleMap.set("lastRunStartedAt", execution.startedAt);
        ruleMap.set("lastRunStatus", "ok");
        ruleMap.set("lastRunAt", execution.completedAt);
        ruleMap.set("lastSuccessfulRunAt", execution.completedAt);
    }, "server-scheduler");
}

function seedRule(): Y.Map<unknown> {
    const ruleMap = new Y.Map<unknown>();
    projectDoc.getMap("schedules").set(RULE_ID, ruleMap);
    ruleMap.set("name", "Nightly audit");
    ruleMap.set("targetTableId", "table-1");
    ruleMap.set("sql", "INSERT INTO audit (id) VALUES (gen_random_uuid()) RETURNING *;");
    ruleMap.set("rrule", "FREQ=DAILY");
    ruleMap.set("dtstart", "2026-01-01T00:00:00");
    ruleMap.set("timezone", "UTC");
    ruleMap.set("enabled", true);
    ruleMap.set("catchUp", true);
    return ruleMap;
}

describe("Schedule detail page and scheduler-owned telemetry", () => {
    beforeEach(() => {
        projectDoc = new Y.Doc();
        store.project = undefined;
    });

    afterEach(() => {
        cleanup();
    });

    it("cannot write a stale execution back over a newer one when saving an edit", async () => {
        const ruleMap = seedRule();
        // Execution A completes before the page mounts, so it is what the page
        // loads into its editor snapshot.
        writeExecution(ruleMap, {
            seq: 1,
            startedAt: "2026-09-01T10:00:00.000Z",
            completedAt: "2026-09-01T10:00:20.000Z",
        });

        render(ScheduleDetailView, { projectName: "demo", ruleId: RULE_ID });
        const nameInput = await waitFor(() => screen.getByTestId("schedule-rule-name-input") as HTMLInputElement);

        // Execution B then supersedes it while the page stays open.
        writeExecution(ruleMap, {
            seq: 2,
            startedAt: "2026-09-02T10:00:00.000Z",
            completedAt: "2026-09-02T10:00:20.000Z",
        });

        // The user renames the Schedule and saves — the editor spreads the whole
        // rule it is holding, which is the vector the guard has to close.
        nameInput.value = "Renamed audit";
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        (screen.getByTestId("schedule-rule-save") as HTMLButtonElement).click();

        await waitFor(() => {
            expect(ruleMap.get("name")).toBe("Renamed audit");
        });

        // The configuration edit landed; execution B's telemetry is untouched.
        expect(ruleMap.get("lastRunSeq")).toBe(2);
        expect(ruleMap.get("lastRunStartedAt")).toBe("2026-09-02T10:00:00.000Z");
        expect(ruleMap.get("lastRunAt")).toBe("2026-09-02T10:00:20.000Z");
        expect(ruleMap.get("lastSuccessfulRunAt")).toBe("2026-09-02T10:00:20.000Z");
    });

    it("follows the scheduler's execution status while the page stays open", async () => {
        const ruleMap = seedRule();
        writeExecution(ruleMap, {
            seq: 1,
            startedAt: "2026-09-01T10:00:00.000Z",
            completedAt: "2026-09-01T10:00:20.000Z",
        });

        render(ScheduleDetailView, { projectName: "demo", ruleId: RULE_ID });
        await waitFor(() => {
            expect(screen.getByTestId("schedule-detail-run-summary").textContent).toContain("2026-09-01");
        });

        // A later execution starts: the page subscribed after its asynchronous
        // load, so it shows the new state without a reload.
        projectDoc.transact(() => {
            ruleMap.set("lastRunSeq", 2);
            ruleMap.set("lastRunStartedAt", "2026-09-02T10:00:00.000Z");
            ruleMap.set("lastRunStatus", "running");
        }, "server-scheduler");

        await waitFor(() => {
            expect(screen.getByTestId("schedule-detail-result").textContent?.trim()).toBe("Running");
        });
        expect(screen.getByTestId("schedule-detail-run-summary").textContent).toContain("2026-09-02");
    });
});
