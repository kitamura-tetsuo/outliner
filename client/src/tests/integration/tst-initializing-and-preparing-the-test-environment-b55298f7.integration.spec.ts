import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import { userManager } from "../../auth/UserManager";
import HomePage from "../../routes/+page.svelte";
import AuthSectionWrapper from "./AuthSectionWrapper.svelte";

// Integration test mirroring e2e/basic.spec.ts

describe("basic home page and auth component", () => {
    it("renders home page title", () => {
        const { getByText } = render(HomePage);
        expect(getByText("Outliner App")).toBeTruthy();
    });

    it("renders auth section with Google login button", async () => {
        vi.useFakeTimers();
        await userManager.logout();
        render(AuthSectionWrapper);
        await vi.advanceTimersByTimeAsync(1000);
        expect(screen.getByRole("button", { name: /google/i })).toBeTruthy();
        vi.useRealTimers();
    });
});
