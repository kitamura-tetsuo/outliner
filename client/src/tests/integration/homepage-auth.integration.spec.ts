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
        const heading = screen.getByRole("heading", { level: 1 });
        expect(heading).toBeTruthy();
        // The page contains Japanese text "アウトライナー一覧" with title including "Outliner"
        // Matches E2E test behavior which uses toContainText
        expect(heading.textContent).toContain("アウトライナー");
    });
});
