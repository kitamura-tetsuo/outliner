import { describe, expect, it } from "vitest";
import { firestoreStore } from "./firestoreStore.svelte";
import { store as globalStore } from "./globalStore.svelte";
import { store } from "./store.svelte";

describe("GlobalStoreProxy", () => {
    it("reflects underlying page store", () => {
        store.pages = ["a"] as any;
        expect(globalStore.pages).toBe(store.pages);
    });

    it("delegates project setter", () => {
        const proj: any = { title: "t" };
        globalStore.project = proj;
        expect(store.project).toStrictEqual(proj);
    });

    it("exposes firestore data", () => {
        firestoreStore.userContainer = { userId: "u" } as any;
        expect(globalStore.userContainer).toEqual(firestoreStore.userContainer);
    });
});
