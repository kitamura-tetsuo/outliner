import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import EnvProbe from "../fixtures/EnvProbe.svelte";

describe("environment variables", () => {
    it("does not expose VITE_IS_TEST on global scope", () => {
        render(EnvProbe);
        expect(screen.getByTestId("env").textContent).toBe("");
    });
});
