import { goto } from "$app/navigation";
import { render, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPage } from "../../../../../../tests/mocks/appState.svelte";
import RedirectPage from "./+page.svelte";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$app/state", () => import("../../../../../../tests/mocks/appState.svelte"));

describe("legacy table-schedule redirect", () => {
    beforeEach(() => {
        vi.mocked(goto).mockClear();
        setPage({ params: { project: "設計 / 100%", tableId: "table-1" } });
    });

    it("resolves the project schedule route and preserves replacement history", async () => {
        render(RedirectPage);

        await waitFor(() => {
            expect(goto).toHaveBeenCalledWith(
                "/%E8%A8%AD%E8%A8%88%20%2F%20100%25/-/schedules",
                { replace: true },
            );
        });
    });
});
