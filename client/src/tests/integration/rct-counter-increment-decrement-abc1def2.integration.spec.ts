// @vitest-environment jsdom
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import Counter from "../fixtures/Counter.svelte";

// Verify Svelte 5 runes reactivity updates the DOM
it("increments and decrements the counter", async () => {
    const user = userEvent.setup();
    render(Counter);
    const value = screen.getByTestId("value");
    const inc = screen.getByTestId("inc");
    const dec = screen.getByTestId("dec");

    expect(value.textContent).toBe("0");
    await user.click(inc);
    expect(value.textContent).toBe("1");
    await user.click(dec);
    expect(value.textContent).toBe("0");
});
