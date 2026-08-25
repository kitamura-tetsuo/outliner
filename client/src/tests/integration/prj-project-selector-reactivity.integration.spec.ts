import { render, screen, waitFor, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectSelector from "../../components/ProjectSelector.svelte";
import { projectStore } from "../../stores/projectStore.svelte";

// Membership and titles come from the resource-side canonical directory. The
// selector must react to replacement of that directory snapshot and must not
// depend on user-writable userProjects membership fields.

describe("PRJ: ProjectSelector option count reflects the canonical project directory", () => {
    beforeEach(() => {
        // Minimal stub for object referenced by ensureUserLoggedIn in ProjectSelector
        (globalThis as unknown as { window: typeof window; }).window ||= globalThis as unknown as typeof window;
        (globalThis as unknown as { window: { __USER_MANAGER__: unknown; }; }).window.__USER_MANAGER__ = {
            addEventListener: vi.fn(() => vi.fn()),
            getCurrentUser: vi.fn(() => ({ id: "test-user" })),
            auth: { currentUser: { uid: "test-user" } },
            loginWithEmailPassword: vi.fn(async () => ({ success: true })),
        };

        projectStore.projects = [{ id: "p-1", name: "Project 1", isDefault: true }];
    });

    it("changes the option count when the canonical snapshot grows and shrinks", async () => {
        render(ProjectSelector);

        const select = screen.getByRole("combobox");
        // Initial 1 item
        expect(within(select).getAllByRole("option").length).toBe(1);

        projectStore.projects = [
            { id: "p-1", name: "Project 1", isDefault: true },
            { id: "p-2", name: "Project 2", isDefault: false },
        ];
        await waitFor(() => {
            expect(within(select).getAllByRole("option").length).toBe(2);
        });

        projectStore.projects = [{ id: "p-1", name: "Project 1", isDefault: true }];
        await waitFor(() => {
            expect(within(select).getAllByRole("option").length).toBe(1);
        });
    });
});

it("reflects a replaced canonical snapshot immediately", async () => {
    projectStore.projects = [{ id: "p-1", name: "Project 1", isDefault: true }];
    render(ProjectSelector);

    const select = screen.getByRole("combobox");
    expect(within(select).getAllByRole("option").length).toBe(1);

    projectStore.projects = [
        { id: "p-1", name: "Project 1", isDefault: true },
        { id: "p-2", name: "Project 2", isDefault: false },
    ];
    await waitFor(() => {
        expect(within(select).getAllByRole("option").length).toBe(2);
    });

    projectStore.projects = [{ id: "p-1", name: "Project 1", isDefault: true }];
    await waitFor(() => {
        expect(within(select).getAllByRole("option").length).toBe(1);
    });
});
