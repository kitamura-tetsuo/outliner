import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it } from "vitest";
import { firestoreStore } from "../../stores/firestoreStore.svelte";
import UserContainerDisplay from "../fixtures/UserContainerDisplay.svelte";

// Mirrors e2e/new/cnt-shared-container-store-12ee98aa.spec.ts

describe("CNT shared container store", () => {
    it("reflects user project updates", async () => {
        render(UserContainerDisplay);
        const storeGlobal: any = (globalThis as any).window?.__FIRESTORE_STORE__ ?? firestoreStore;
        storeGlobal.setUserProject({
            userId: "u",
            accessibleProjectIds: ["a"],
            defaultProjectId: "a",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any);
        await tick();
        await tick();
        // Is the store itself updated? (Assertion for debugging)
        expect(storeGlobal.userProject?.defaultProjectId).toBe("a");
        // Check list display first (wait for reactive update completion)
        expect(screen.getAllByRole("listitem").map(li => li.textContent)).toEqual(["a"]);
        // Then, verify visualization of defaultProjectId
        expect(screen.getByTestId("default").textContent).toBe("a");

        storeGlobal.setUserProject({
            userId: "u",
            accessibleProjectIds: ["a", "b"],
            defaultProjectId: "b",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any);
        await tick();
        expect(screen.getByTestId("default").textContent).toBe("b");
        expect(screen.getAllByRole("listitem").map(li => li.textContent)).toEqual(["a", "b"]);
    });
});
