import { describe, expect, it } from "vitest";
import { firestoreStore } from "./firestoreStore.svelte";

describe("firestoreStore", () => {
    it("initial userContainer is null", () => {
        expect(firestoreStore.userContainer).toBeNull();
    });
});
