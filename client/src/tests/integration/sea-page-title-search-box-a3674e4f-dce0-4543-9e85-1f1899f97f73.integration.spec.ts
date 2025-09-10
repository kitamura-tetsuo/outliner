import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
import { goto } from "$app/navigation";
import SearchBox from "../../components/SearchBox.svelte";
import { Project } from "../../schema/app-schema";

/**
 * Integration test mirroring e2e/basic/sea-page-title-search-box-*.spec.ts
 * Uses a Svelte 5 component to trigger navigation when a page title matches the query.
 */

describe("SEA-0001 page title search box", () => {
    it("navigates to a matched page", async () => {
        const user = userEvent.setup();
        const project = Project.createInstance("my project");
        project.addPage("first page", "me");
        project.addPage("second page", "me");

        render(SearchBox, { project });
        await user.type(screen.getByPlaceholderText("Search pages"), "second");
        const result = await screen.findByRole("button", { name: "second page" });
        await user.click(result);
        expect(goto).toHaveBeenCalledWith("/my%20project/second%20page");
    });
});
