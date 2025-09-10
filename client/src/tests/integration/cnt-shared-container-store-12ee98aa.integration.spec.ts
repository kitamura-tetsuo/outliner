import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it } from "vitest";
import { firestoreStore } from "../../stores/firestoreStore.svelte";
import UserContainerDisplay from "../fixtures/UserContainerDisplay.svelte";

// Mirrors e2e/new/cnt-shared-container-store-12ee98aa.spec.ts

describe("CNT shared container store", () => {
    it("reflects user container updates", async () => {
        render(UserContainerDisplay);
        firestoreStore.userContainer = {
            userId: "u",
            accessibleContainerIds: ["a"],
            defaultContainerId: "a",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any;
        await tick();
        expect(screen.getByTestId("default").textContent).toBe("a");
        expect(screen.getAllByRole("listitem").map(li => li.textContent)).toEqual(["a"]);

        firestoreStore.userContainer = {
            userId: "u",
            accessibleContainerIds: ["a", "b"],
            defaultContainerId: "b",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any;
        await tick();
        expect(screen.getByTestId("default").textContent).toBe("b");
        expect(screen.getAllByRole("listitem").map(li => li.textContent)).toEqual(["a", "b"]);
    });
});
