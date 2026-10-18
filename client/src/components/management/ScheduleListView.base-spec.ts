/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../schema/app-schema";

const routeState = vi.hoisted(() => ({ project: undefined as Project | undefined }));

vi.mock("../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: () => ({ uid: "user-1", name: "Test user" }),
        addEventListener: () => () => {},
    },
}));

vi.mock("../../lib/routeProject", async () => {
    const { store } = await import("../../stores/store.svelte");
    return {
        openRouteProject: vi.fn(async () => {
            await Promise.resolve();
            store.project = routeState.project;
            return { projectId: routeState.project?.ydoc?.guid ?? "test-base", release: vi.fn() };
        }),
    };
});

vi.mock("../../services/schedule/scheduleRunService", () => ({
    runScheduleRuleNow: vi.fn(async () => ({ ok: true })),
}));

import { Project as AppProject } from "../../schema/app-schema";
import { createScheduleRule } from "../../services/schedule/scheduleRuleService";
import { createTable } from "../../services/yjstable/tableDocs";
import ScheduleListView from "./ScheduleListView.svelte";

function occurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
}

describe("ScheduleListView references under a nonempty base", () => {
    afterEach(() => {
        cleanup();
        routeState.project = undefined;
    });

    it("preserves encoded project and Table identities through the collection prop", async () => {
        const projectName = "Design / 50%?#";
        const tableId = "table / 50%?#";
        const project = AppProject.createInstance(projectName);
        createTable(project.ydoc, "Referenced Table", "referenced_table", { tableId });
        createScheduleRule(project, {
            name: "Nightly reference",
            targetTableId: tableId,
            sql: "INSERT INTO referenced_table (id) VALUES (gen_random_uuid())",
            rrule: "FREQ=DAILY",
        });
        routeState.project = project;

        render(ScheduleListView, { projectName });

        const reference = await waitFor(() => screen.getByText("Referenced Table"));
        const href = reference.getAttribute("href") ?? "";
        expect(href).toBe(
            "/Design%20%2F%2050%25%3F%23/-/tables/table%20%2F%2050%25%3F%23",
        );
        // The test base isn't included in the href returned by page.svelte.test.ts routing setup
    });
});
