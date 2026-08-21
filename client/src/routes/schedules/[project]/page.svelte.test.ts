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
vi.mock("../../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: () => null,
        addEventListener: () => () => {},
    },
}));

let projectDoc = new Y.Doc();

vi.mock("../../../lib/routeProject", async () => {
    const { store } = await import("../../../stores/store.svelte");
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

vi.mock("../../../lib/demoInit", () => ({
    DemoInitAborted: class DemoInitAborted extends Error {},
}));

vi.mock("../../../services/schedule/scheduleRunService", () => ({
    runScheduleRuleNow: vi.fn(async () => ({ ok: true })),
}));

import { createScheduleRule } from "../../../services/schedule/scheduleRuleService";
import { runScheduleRuleNow } from "../../../services/schedule/scheduleRunService";
import { createTable, renameTable } from "../../../services/yjstable/tableDocs";
import { store } from "../../../stores/store.svelte";
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
        expect(screen.getByText("Audit").getAttribute("href")).toBe("/tables/demo/" + auditId);
        expect(screen.getByText("Tasks").getAttribute("href")).toBe("/tables/demo/" + tasksId);
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

    it("does not let a public-demo visitor run or delete a rule", async () => {
        const tasksId = createTable(projectDoc, "Tasks", "tasks");

        render(ProjectSchedulesPage);
        await waitFor(() => {
            expect(screen.getByTestId("project-schedule-list")).toBeTruthy();
        });
        // Read access is the point of the demo: the guest banner, not a wall.
        expect(screen.getByText("Public demo / Guest access")).toBeTruthy();
        // Creating is not offered either.
        expect(screen.queryByTestId("project-schedule-create")).toBeNull();

        createScheduleRule(currentProject(), {
            name: "Nightly tasks",
            targetTableId: tasksId,
            sql: "INSERT INTO tasks (id) VALUES (gen_random_uuid())",
            rrule: "FREQ=DAILY",
        });

        const runNow = await waitFor(() => screen.getByTestId("schedule-rule-run-now"));
        expect(runNow.hasAttribute("disabled")).toBe(true);
        expect(screen.getByTestId("schedule-rule-delete").hasAttribute("disabled")).toBe(true);

        // Even if the click lands, the handler must not reach the endpoint.
        runNow.click();
        await Promise.resolve();
        expect(runScheduleRuleNow).not.toHaveBeenCalled();
    });
});
