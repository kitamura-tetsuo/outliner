import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Checklist from "../../components/Checklist.svelte";

// Integration test mirroring e2e/new/CHK-0001.spec.ts

describe("CHK-0001 checklist component", () => {
    it("adds and archives item in shopping mode", async () => {
        const user = userEvent.setup();
        render(Checklist, { title: "Shop", mode: "shopping" });
        await user.type(screen.getByTestId("add-input"), "Milk");
        await user.click(screen.getByTestId("add-button"));
        const checkbox = screen.getByRole("checkbox");
        await user.click(checkbox);
        expect((checkbox as HTMLInputElement).checked).toBe(true);
    });

    it("reset unchecks items", async () => {
        const user = userEvent.setup();
        render(Checklist, { title: "Pack", mode: "packing" });
        await user.type(screen.getByTestId("add-input"), "Eggs");
        await user.click(screen.getByTestId("add-button"));
        const checkbox = screen.getByRole("checkbox");
        await user.click(checkbox);
        expect((checkbox as HTMLInputElement).checked).toBe(true);
        await user.click(screen.getByTestId("reset-button"));
        expect((checkbox as HTMLInputElement).checked).toBe(false);
    });

    it("habit list auto resets", async () => {
        vi.useFakeTimers();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(Checklist, { title: "Habit", mode: "habit", rrule: "FREQ=SECONDLY;INTERVAL=1" });
        await user.type(screen.getByTestId("add-input"), "Pushups");
        await user.click(screen.getByTestId("add-button"));
        const checkbox = screen.getByRole("checkbox");
        await user.click(checkbox);
        expect((checkbox as HTMLInputElement).checked).toBe(true);
        await vi.advanceTimersByTimeAsync(1500);
        expect((checkbox as HTMLInputElement).checked).toBe(false);
        vi.useRealTimers();
    });
});
