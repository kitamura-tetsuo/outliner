import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
import { goto } from "$app/navigation";
import SearchBox from "../../components/SearchBox.svelte";
import { Project } from "../../schema/app-schema";
import { store as generalStore } from "../../stores/store.svelte";

/**
 * Integration test verifying that search results update when pages become
 * available after the user has already entered a query.
 */

describe("SEA-0001 page title search box late load", () => {
    it("updates results when pages load after typing", async () => {
        const user = userEvent.setup();
        const project = Project.createInstance("my project");
        project.addPage("second page", "me");

        render(SearchBox);
        await user.type(screen.getByPlaceholderText("Search pages"), "second");
        // Simulate late project resolution after user input
        generalStore.project = project;
        const result = await screen.findByRole("button", { name: "second page" });
        await user.click(result);
        expect(goto).toHaveBeenCalledWith("/my%20project/second%20page");
    });
});
