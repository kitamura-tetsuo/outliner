import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
import HomePage from "../../routes/+page.svelte";

/**
 * Integration test mirroring e2e/core/homepage-auth.spec.ts
 * Verifies that the homepage renders the expected title.
 */

describe("homepage-auth", () => {
    it("displays the Outliner App title", () => {
        render(HomePage);
        expect(
            screen.getByRole("heading", { level: 1, name: "Outliner" }),
        ).toBeTruthy();
    });
});
