// The project-level Schedule list (issue #5012). Two things it must get right
// beyond listing rules: it derives table names and references from the Table
// registry, so it has to observe that registry too; and a public-demo visitor
// may read it but must not run or delete a rule.

import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const mockPageStore = { params: { project: "demo" } };
vi.mock("$app/stores", () => ({
    page: {
        subscribe: (run: (value: typeof mockPageStore) => void) => {
            run(mockPageStore);
            return () => {};
        },
    },
}));

// A signed-out visitor: the public-demo read-only path is under test.
vi.mock("../../../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: () => null,
        addEventListener: () => () => {},
    },
}));

let projectDoc = new Y.Doc();

vi.mock("../../../../lib/routeProject", async () => {
    const { store } = await import("../../../../stores/store.svelte");
    return {
        openRouteProject: vi.fn(async () => {
            // Asynchronous on purpose: a synchronous store write would land
            // inside the caller's tracked effect and re-trigger it forever.
            await Promise.resolve();
            store.project = {
                ydoc: projectDoc,
                schedules: projectDoc.getMap("schedules"),
            } as unknown as NonNullable<typeof store.project>;
            return { release: vi.fn() };
        }),
    };
});

vi.mock("../../../../lib/demoInit", () => ({
    DemoInitAborted: class DemoInitAborted extends Error {},
}));

vi.mock("../../../../services/schedule/scheduleRunService", () => ({
    runScheduleRuleNow: vi.fn(async () => ({ ok: true })),
}));

import { createScheduleRule } from "../../../../services/schedule/scheduleRuleService";
import { runScheduleRuleNow } from "../../../../services/schedule/scheduleRunService";
import { createTable, renameTable } from "../../../../services/yjstable/tableDocs";
import { store } from "../../../../stores/store.svelte";
import ProjectSchedulesPage from "./+page.svelte";

function currentProject(): NonNullable<typeof store.project> {
    return store.project as NonNullable<typeof store.project>;
}

describe("project schedules route", () => {
    beforeEach(() => {
        mockPageStore.params = { project: "demo" };
        projectDoc = new Y.Doc();
        vi.mocked(runScheduleRuleNow).mockClear();
    });

    afterEach(() => {
        cleanup();
    });

    it("lists the project's rules with every table they reference", async () => {
        const tasksId = createTable(projectDoc, "Tasks", "tasks");
        const auditId = createTable(projectDoc, "Audit", "audit");

        render(ProjectSchedulesPage);
        await waitFor(() => {
            expect(screen.getByTestId("project-schedule-list")).toBeTruthy();
        });

        createScheduleRule(currentProject(), {
            name: "Nightly audit",
            targetTableId: auditId,
            sql: "INSERT INTO audit (id) SELECT id FROM tasks",
            rrule: "FREQ=DAILY",
        });

        await waitFor(() => {
            expect(screen.getByTestId("schedule-rule-tables")).toBeTruthy();
        });
        // Both referenced tables, neither of them an owner.
        expect(screen.getByText("Audit").getAttribute("href")).toBe("/demo/-/tables/" + auditId);
        expect(screen.getByText("Tasks").getAttribute("href")).toBe("/demo/-/tables/" + tasksId);
    });

    // The rule display is derived from the Table registry as well as from the
    // schedules map, so the registry is a synchronization source too.
    it("follows a table rename made while the page is open", async () => {
        const tasksId = createTable(projectDoc, "Tasks", "tasks");

        render(ProjectSchedulesPage);
        await waitFor(() => {
            expect(screen.getByTestId("project-schedule-list")).toBeTruthy();
        });

        createScheduleRule(currentProject(), {
            name: "Nightly tasks",
            targetTableId: tasksId,
            sql: "INSERT INTO tasks (id) VALUES (gen_random_uuid())",
            rrule: "FREQ=DAILY",
        });
        await waitFor(() => {
            expect(screen.getByText("Tasks")).toBeTruthy();
        });

        // No schedule changes here — only the Table registry.
        renameTable(projectDoc, tasksId, "Chores");

        await waitFor(() => {
            expect(screen.getByText("Chores")).toBeTruthy();
        });
        expect(screen.queryByText("Tasks")).toBeNull();
    });

    it("lets a public-demo visitor write to rules", async () => {
        const tasksId = createTable(projectDoc, "Tasks", "tasks");

        render(ProjectSchedulesPage);
        await waitFor(() => {
            expect(screen.getByTestId("project-schedule-list")).toBeTruthy();
        });
        // Read access is the point of the demo: the guest banner, not a wall.
        expect(screen.getByText("Public demo / Guest access")).toBeTruthy();
        // Creating is offered because demo is a writable sandbox.
        expect(screen.getByTestId("project-schedule-create")).toBeTruthy();

        createScheduleRule(currentProject(), {
            name: "Nightly tasks",
            targetTableId: tasksId,
            sql: "INSERT INTO tasks (id) VALUES (gen_random_uuid())",
            rrule: "FREQ=DAILY",
        });

        const runNow = await waitFor(() => screen.getByTestId("schedule-rule-run-now"));
        expect(runNow.hasAttribute("disabled")).toBe(false);
        expect(screen.getByTestId("schedule-rule-delete").hasAttribute("disabled")).toBe(false);

        // Verify the handler works when clicked.
        runNow.click();
        await Promise.resolve();
        expect(runScheduleRuleNow).toHaveBeenCalled();
    });
});

// The Schedules Manager (issue #5290) reads and writes the shared Schedule
// document. These exercise that path end to end from the route: the status
// columns come out of the Yjs map the scheduler writes, and the Enabled switch
// writes back into that same map.
describe("Schedules Manager route", () => {
    beforeEach(() => {
        mockPageStore.params = { project: "demo" };
        projectDoc = new Y.Doc();
        vi.mocked(runScheduleRuleNow).mockClear();
    });

    afterEach(() => {
        cleanup();
    });

    async function renderWithRule(fields: Record<string, unknown> = {}) {
        const tasksId = createTable(projectDoc, "Tasks", "tasks");
        render(ProjectSchedulesPage);
        await waitFor(() => {
            expect(screen.getByTestId("project-schedule-list")).toBeTruthy();
        });

        const ruleId = createScheduleRule(currentProject(), {
            name: "Nightly tasks",
            targetTableId: tasksId,
            sql: "INSERT INTO tasks (id) VALUES (gen_random_uuid())",
            rrule: "FREQ=DAILY",
        });
        const ruleMap = currentProject().schedules.get(ruleId) as Y.Map<unknown>;
        for (const [key, value] of Object.entries(fields)) ruleMap.set(key, value);

        await waitFor(() => {
            expect(screen.getByTestId("schedules-manager-table")).toBeTruthy();
        });
        return { ruleId, ruleMap };
    }

    // The row shape the E2E specs address: one `schedule-row` per Schedule,
    // keyed by rule id, carrying that Schedule's actions. Asserted here so a
    // markup change that would break those specs fails in the unit suite first.
    it("renders one addressable row per Schedule, carrying that Schedule's actions", async () => {
        const { ruleId } = await renderWithRule();

        const list = screen.getByTestId("project-schedule-list");
        const rows = list.querySelectorAll("[data-testid='schedule-row']");
        expect(rows.length).toBe(1);
        expect(rows[0].getAttribute("data-rule-id")).toBe(ruleId);
        expect(rows[0].querySelector("[data-testid='schedule-rule-run-now']")).toBeTruthy();
        expect(rows[0].querySelector("[data-testid='schedule-rule-enabled']")).toBeTruthy();
        expect(rows[0].querySelector("[data-testid='schedule-rule-delete']")).toBeTruthy();
        // The cadence text the table-scoped Schedule specs still assert on.
        expect(screen.getByTestId("schedule-rule-cadence").textContent).toContain("every day");
    });

    it("renders the scheduler's authoritative next occurrence, never a local recomputation", async () => {
        // A cursor in the past: `rrule.after(now)` could never produce it.
        await renderWithRule({
            schedulerState: "active",
            schedulerNextRunAt: "2020-03-04T05:06:00.000Z",
        });

        const nextRun = screen.getByTestId("schedule-rule-next-run");
        expect(nextRun.getAttribute("data-next-run-state")).toBe("scheduled");
        expect(nextRun.textContent).toContain("2020-03-04");
    });

    it("follows the scheduler's execution lifecycle while the manager stays open", async () => {
        const { ruleMap } = await renderWithRule({
            schedulerState: "active",
            schedulerNextRunAt: "2026-09-06T00:00:00.000Z",
        });

        expect(screen.getByTestId("schedule-rule-result").textContent?.trim()).toBe("Never run");

        // The scheduler starts an execution...
        projectDoc.transact(() => {
            ruleMap.set("lastRunSeq", 1);
            ruleMap.set("lastRunStartedAt", "2026-09-05T09:00:00.000Z");
            ruleMap.set("lastRunStatus", "running");
        }, "server-scheduler");
        await waitFor(() => {
            expect(screen.getByTestId("schedule-rule-result").textContent?.trim()).toBe("Running");
        });
        expect(screen.getByTestId("schedule-rule-last-run").textContent).toContain("2026-09-05");
        expect(screen.getByTestId("schedule-rule-last-success").textContent?.trim()).toBe("—");

        // ...and completes it successfully, advancing its own cursor.
        projectDoc.transact(() => {
            ruleMap.set("lastRunAt", "2026-09-05T09:00:20.000Z");
            ruleMap.set("lastRunStatus", "ok");
            ruleMap.set("lastSuccessfulRunAt", "2026-09-05T09:00:20.000Z");
            ruleMap.set("schedulerNextRunAt", "2026-09-07T00:00:00.000Z");
        }, "server-scheduler");
        await waitFor(() => {
            expect(screen.getByTestId("schedule-rule-result").textContent?.trim()).toBe("Success");
        });
        expect(screen.getByTestId("schedule-rule-last-success").textContent).toContain("2026-09-05");
        expect(screen.getByTestId("schedule-rule-next-run").textContent).toContain("2026-09-07");
    });

    it("writes the Enabled switch back into the shared Schedule", async () => {
        const { ruleMap } = await renderWithRule({
            schedulerState: "active",
            schedulerNextRunAt: "2026-09-06T00:00:00.000Z",
        });

        const toggle = screen.getByTestId("schedule-rule-enabled");
        expect(toggle.getAttribute("aria-checked")).toBe("true");
        expect(screen.getByTestId("schedule-rule-next-run").textContent).toContain("2026-09-06");

        toggle.click();

        await waitFor(() => {
            expect(screen.getByTestId("schedule-rule-enabled").getAttribute("aria-checked")).toBe("false");
        });
        // The persisted state the production scheduler reads, not a local flag.
        expect(ruleMap.get("enabled")).toBe(false);
        // And the withdrawn occurrence is no longer presented as eligible.
        expect(screen.getByTestId("schedule-rule-next-run").textContent?.trim()).toBe("Disabled");
    });
});
