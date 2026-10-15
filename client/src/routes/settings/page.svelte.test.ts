import { render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectStore } from "../../stores/projectStore.svelte";
import SettingsPage from "./+page.svelte";

describe("settings route project links", () => {
    beforeEach(() => {
        projectStore.reset();
        projectStore.projects = [{ id: "project-1", name: "設計 / 100%", isDefault: false }];
    });

    afterEach(() => projectStore.reset());

    it("renders a typed, encoded project-settings destination", () => {
        render(SettingsPage);

        expect(screen.getByRole("link", { name: "設計 / 100%" }).getAttribute("href")).toBe(
            "/%E8%A8%AD%E8%A8%88%20%2F%20100%25/-/settings",
        );
    });

    it("does not emit an unresolved settings href for an empty legacy title", () => {
        projectStore.projects = [{ id: "legacy-project", name: "", isDefault: false }];
        render(SettingsPage);

        expect(screen.getByText("legacy-project").closest("a")).toBeNull();
    });
});
