import { render, screen, waitFor, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectSelector from "../../components/ProjectSelector.svelte";
import { firestoreStore } from "../../stores/firestoreStore.svelte";

// Verify that the number of options in ProjectSelector's <select> directly increases/decreases
// in conjunction with the increase/decrease of firestoreStore.userProject.accessibleProjectIds (UI level verification)

describe("PRJ: ProjectSelector option count reflects accessibleProjectIds", () => {
    beforeEach(() => {
        // Minimal stub for object referenced by ensureUserLoggedIn in ProjectSelector
        (globalThis as any).window ||= globalThis as any;
        (globalThis as any).window.__USER_MANAGER__ = {
            addEventListener: vi.fn(() => vi.fn()),
            getCurrentUser: vi.fn(() => ({ id: "test-user" })),
            auth: { currentUser: { uid: "test-user" } },
            loginWithEmailPassword: vi.fn(async () => ({ success: true })),
        };

        // Initial state: 1 project
        firestoreStore.setUserProject({
            userId: "u",
            accessibleProjectIds: ["p-1"],
            defaultProjectId: "p-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any);
    });

    it("Option count changes according to accessibleProjectIds increase/decrease", async () => {
        render(ProjectSelector);

        const select = screen.getByRole("combobox");
        // Initial 1 item
        expect(within(select).getAllByRole("option").length).toBe(1);

        // Increase to 2 items (destructive array change -> setUserProject via Proxy + ucVersion increment)
        (firestoreStore.userProject!.accessibleProjectIds as any).push("p-2");
        // store integrity check
        expect(firestoreStore.userProject?.accessibleProjectIds?.length ?? 0).toBe(2);
        await waitFor(() => {
            expect(within(select).getAllByRole("option").length).toBe(2);
        });

        // Revert to 1 item (pop -> setUserProject via Proxy + ucVersion increment)
        (firestoreStore.userProject!.accessibleProjectIds as any).pop();
        await waitFor(() => {
            expect(within(select).getAllByRole("option").length).toBe(1);
        });
    });
});

// Explicit initialization (isolate influence of push/pop from previous test)
firestoreStore.setUserProject({
    userId: "u",
    accessibleProjectIds: ["p-1"],
    defaultProjectId: "p-1",
    createdAt: new Date(),
    updatedAt: new Date(),
} as any);

it("Option count is immediately reflected even when replaced by setUserProject", async () => {
    render(ProjectSelector);

    const select = screen.getByRole("combobox");
    expect(within(select).getAllByRole("option").length).toBe(1);

    // 2 items by replacement
    firestoreStore.setUserProject({
        userId: "u",
        accessibleProjectIds: ["p-1", "p-2"],
        defaultProjectId: "p-1",
        createdAt: new Date(),
        updatedAt: new Date(),
    } as any);
    expect(firestoreStore.userProject?.accessibleProjectIds?.length ?? 0).toBe(2);
    await waitFor(() => {
        expect(within(select).getAllByRole("option").length).toBe(2);
    });

    // Revert to 1 item by replacement
    firestoreStore.setUserProject({
        userId: "u",
        accessibleProjectIds: ["p-1"],
        defaultProjectId: "p-1",
        createdAt: new Date(),
        updatedAt: new Date(),
    } as any);
    await waitFor(() => {
        expect(within(select).getAllByRole("option").length).toBe(1);
    });
});
