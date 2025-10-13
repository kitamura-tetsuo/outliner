import { render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IUser, type UserManager } from "../../auth/UserManager";
import LoginStatusIndicator from "../../components/LoginStatusIndicator.svelte";

class StubUserManager {
    private listeners = new Set<(result: { user: IUser; } | null) => void>();
    private current: IUser | null = null;

    addEventListener(listener: (result: { user: IUser; } | null) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    getCurrentUser(): IUser | null {
        return this.current;
    }

    emit(user: IUser | null) {
        this.current = user;
        for (const listener of this.listeners) {
            listener(user ? { user } : null);
        }
    }
}

describe("TLB-5f79ac12 Login status indicator", () => {
    let manager: StubUserManager;

    beforeEach(() => {
        manager = new StubUserManager();
    });

    afterEach(() => {
        manager.emit(null);
    });

    it("shows logged-out state when no user is authenticated", async () => {
        render(LoginStatusIndicator, { manager: manager as unknown as UserManager });

        await waitFor(() => {
            expect(screen.getByTestId("login-status-indicator").dataset.status).toBe("unauthenticated");
        });

        expect(screen.getByText("Not signed in")).toBeTruthy();
    });

    it("renders Google provider indicator when signed in via Google", async () => {
        render(LoginStatusIndicator, { manager: manager as unknown as UserManager });

        const user: IUser = {
            id: "user-123",
            name: "Test User",
            email: "user@example.com",
            providerIds: ["google.com"],
        };

        manager.emit(user);

        await waitFor(() => {
            expect(screen.getByTestId("login-status-indicator").dataset.status).toBe("authenticated");
        });

        expect(screen.getByText("Signed in")).toBeTruthy();
        const indicator = screen.getByTestId("login-status-indicator");
        const googleIcon = indicator.querySelector('[data-provider="google"]');
        expect(googleIcon).toBeTruthy();
    });
});
