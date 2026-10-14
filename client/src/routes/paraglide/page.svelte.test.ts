import { fireEvent, render } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { goto } from "$app/navigation";
import { localizeHref, locales, setLocale } from "$lib/paraglide/runtime";
import { setPage } from "../../tests/mocks/appState.svelte";
import ParaglidePage from "./+page.svelte";

// SvelteKit navigation is the observation point: the spy records exactly what
// the language-switch entry hands to the framework.
vi.mock("$app/navigation", () => ({
    goto: vi.fn(() => Promise.resolve()),
}));

// Route state comes from the reactive `$app/state` test double.
vi.mock("$app/state", () => import("../../tests/mocks/appState.svelte"));

const gotoMock = vi.mocked(goto);

describe("paraglide language switch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setLocale("en");
        setPage({ url: "http://localhost/paraglide" });
    });

    it("navigates with the actual localizer output, unmodified", async () => {
        expect(locales).toContain("en");
        expect(locales).toContain("ja");

        const { getByRole } = render(ParaglidePage);
        await fireEvent.click(getByRole("button", { name: "ja" }));

        // Expected destination computed by the real localizer, not a fixture.
        const expected = localizeHref("/paraglide", { locale: "ja" });
        expect(gotoMock).toHaveBeenCalledTimes(1);
        expect(gotoMock).toHaveBeenCalledWith(expected);
    });

    it("does not duplicate the locale prefix or encode the pathname as a parameter", async () => {
        const { getByRole } = render(ParaglidePage);
        await fireEvent.click(getByRole("button", { name: "ja" }));

        const reached = gotoMock.mock.calls[0][0] as string;
        expect(reached).toBe(localizeHref("/paraglide", { locale: "ja" }));
        // Exactly one locale segment: no `/en/ja`, no `/ja/ja`.
        expect(reached.match(/^\/(en|ja)\//)?.[1]).toBe("ja");
        expect(reached).not.toContain("/en/ja");
        expect(reached).not.toContain("/ja/ja");
        // The pathname was localized, not percent-encoded as one parameter.
        expect(reached).toContain("/paraglide");
        expect(reached).not.toContain("%2F");
    });
});
