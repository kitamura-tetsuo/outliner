/** @vitest-environment jsdom */
import { goto } from "$app/navigation";
import { fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renameProjectDescriptor } from "../../services/projectDirectoryService";
import ProjectSettingsView from "./ProjectSettingsView.svelte";

// Only the framework and persistence boundaries are replaced. `$app/paths`
// is deliberately NOT mocked: the rename destination and the back link must
// come out of the real SvelteKit resolver through the migrated typed route
// IDs. The persistence mock stands in for the project directory backend the
// same way the Firebase emulators do in integration runs; it cannot affect
// the URL under test.
vi.mock("$app/navigation", () => ({
    goto: vi.fn(),
}));

vi.mock("../../services/projectDirectoryService", () => ({
    renameProjectDescriptor: vi.fn(async (_projectId: string, title: string) => ({
        id: "project-1",
        title: title.trim(),
    })),
}));

vi.mock("../../stores/projectStore.svelte", () => ({
    projectStore: {
        projects: [{ id: "project-1", name: "Old Project" }],
        isLoaded: true,
        refresh: vi.fn(async () => {}),
    },
}));

describe("ProjectSettingsView title rename", () => {
    beforeEach(() => {
        vi.mocked(goto).mockClear();
        vi.mocked(renameProjectDescriptor).mockClear();
    });

    it("replaces the entry with the encoded settings URL on accepted rename", async () => {
        const { container } = render(ProjectSettingsView, {
            props: { projectName: "Old Project" },
        });
        await tick();

        // The back link is a direct typed internal link, not a Breadcrumb item.
        const backLink = container.querySelector("a");
        expect(backLink?.getAttribute("href")).toBe("/Old%20Project");

        const input = container.querySelector("#title") as HTMLInputElement;
        expect(input.value).toBe("Old Project");
        await fireEvent.input(input, { target: { value: "New Project 日本語" } });

        const saveButton = container.querySelector("button");
        expect(saveButton?.textContent).toContain("Save Changes");
        await fireEvent.click(saveButton!);
        await tick();
        await tick();

        expect(renameProjectDescriptor).toHaveBeenCalledWith("project-1", "New Project 日本語");
        expect(vi.mocked(goto)).toHaveBeenCalledTimes(1);
        // The encoded URL changes, but no history entry is stacked: a rename
        // is not a visit to a different page.
        expect(vi.mocked(goto)).toHaveBeenCalledWith("/New%20Project%20%E6%97%A5%E6%9C%AC%E8%AA%9E/-/settings", {
            replace: true,
        });
    });

    it("does not navigate when the title is unchanged", async () => {
        const { container } = render(ProjectSettingsView, {
            props: { projectName: "Old Project" },
        });
        await tick();

        const saveButton = container.querySelector("button");
        expect(saveButton?.textContent).toContain("Save Changes");
        await fireEvent.click(saveButton!);
        await tick();

        // Same title: the rename refuses to run, so the route never changes.
        expect(vi.mocked(renameProjectDescriptor)).not.toHaveBeenCalled();
        expect(vi.mocked(goto)).not.toHaveBeenCalled();
    });

    it("builds the replacement URL from the canonical title returned by persistence", async () => {
        const { container } = render(ProjectSettingsView, {
            props: { projectName: "Old Project" },
        });
        await tick();

        const input = container.querySelector("#title") as HTMLInputElement;
        await fireEvent.input(input, { target: { value: "  Renamed Project  " } });
        await fireEvent.click(container.querySelector("button")!);
        await tick();
        await tick();

        expect(renameProjectDescriptor).toHaveBeenCalledWith("project-1", "  Renamed Project  ");
        expect(vi.mocked(goto)).toHaveBeenCalledWith("/Renamed%20Project/-/settings", { replace: true });
    });
});
