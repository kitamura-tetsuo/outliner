import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import QueryEditor from "./QueryEditor.svelte";

vi.mock("../services/sqlService");

describe("QueryEditor", () => {
    it("renders with correct placeholder", () => {
        render(QueryEditor);
        expect(screen.getByPlaceholderText("Please enter an SQL query")).toBeInTheDocument();
    });
});
