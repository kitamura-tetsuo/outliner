import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import NetworkErrorAlert from "./NetworkErrorAlert.svelte";

describe("NetworkErrorAlert", () => {
    it("should render error message when error prop is provided", () => {
        render(NetworkErrorAlert, { error: "Something went wrong" });
        expect(screen.getByText("Something went wrong")).toBeInTheDocument();
        expect(screen.getByText("Server Connection Error")).toBeInTheDocument();
    });

    it("should have alert role for accessibility", () => {
        render(NetworkErrorAlert, { error: "Something went wrong" });
        const alert = screen.getByRole("alert");
        expect(alert).toBeInTheDocument();
        expect(alert).toHaveTextContent("Something went wrong");
    });

    it("should call retryCallback when retry button is clicked", async () => {
        const retryCallback = vi.fn();
        render(NetworkErrorAlert, { error: "Error", retryCallback });

        const retryBtn = screen.getByText("Retry");
        await fireEvent.click(retryBtn);

        expect(retryCallback).toHaveBeenCalled();
    });
});
