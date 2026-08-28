import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserPreferencesStore } from "../../../stores/UserPreferencesStore.svelte";

describe("UserPreferencesStore", () => {
    let store: UserPreferencesStore;

    beforeEach(() => {
        vi.stubGlobal("localStorage", {
            getItem: vi.fn(),
            setItem: vi.fn(),
            clear: vi.fn(),
        });
        store = new UserPreferencesStore();
    });

    it("returns default values for object manager columns when none are saved", () => {
        expect(store.objectManagerColumns).toEqual(["Type", "Name", "Pages"]);
    });

    it("saves and retrieves object manager columns", () => {
        store.setObjectManagerColumns(["Name", "Pages", "Type"]);
        expect(store.objectManagerColumns).toEqual(["Name", "Pages", "Type"]);
        expect(localStorage.setItem).toHaveBeenCalledWith(
            "user-preferences",
            expect.stringContaining('"objectManagerColumns":["Name","Pages","Type"]'),
        );
    });

    it("returns undefined for object manager sort when none is saved", () => {
        expect(store.objectManagerSort).toBeUndefined();
    });

    it("saves and retrieves object manager sort preferences", () => {
        const sortPref = { column: "Name", direction: "desc" as const };
        store.setObjectManagerSort(sortPref);
        expect(store.objectManagerSort).toEqual(sortPref);
        expect(localStorage.setItem).toHaveBeenCalledWith(
            "user-preferences",
            expect.stringContaining('"objectManagerSort":{"column":"Name","direction":"desc"}'),
        );
    });
});
