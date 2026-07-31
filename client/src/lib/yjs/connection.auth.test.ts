import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Controllable stand-in for Firebase's `onAuthStateChanged`, so the test can decide exactly
// when the session is restored (mirrors the real event-driven hydration on a cold load).
const authState = vi.hoisted(() => ({
    listeners: [] as Array<(user: unknown) => void>,
}));

vi.mock("firebase/auth", () => ({
    onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
        authState.listeners.push(cb);
        return () => {
            authState.listeners = authState.listeners.filter(l => l !== cb);
        };
    },
}));

// Minimal Firebase Auth stub: only `currentUser` and the token fetch are exercised here.
const auth = vi.hoisted(() => ({
    currentUser: undefined as { getIdToken: (force: boolean) => Promise<string>; } | undefined,
}));

vi.mock("../../auth/UserManager", () => ({
    userManager: {
        get auth() {
            return auth;
        },
    },
}));

import { getFreshIdToken } from "./connection";

const signIn = (token = "restored-token") => {
    const user = { getIdToken: vi.fn(async (_force: boolean) => token) };
    auth.currentUser = user;
    authState.listeners.forEach(l => l(user));
    return user;
};

describe("getFreshIdToken auth hydration", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        authState.listeners = [];
        auth.currentUser = undefined;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("resolves as soon as the auth state event arrives, without waiting for a poll tick", async () => {
        const tokenPromise = getFreshIdToken(false);

        // Let the subscription be registered, then restore the session mid-flight.
        await vi.advanceTimersByTimeAsync(250);
        expect(authState.listeners).toHaveLength(1);
        const user = signIn();

        // No timer advance beyond this point: the token must be produced by the auth-state
        // event itself, not by a subsequent 100 ms polling tick.
        await expect(tokenPromise).resolves.toBe("restored-token");
        expect(user.getIdToken).toHaveBeenCalledWith(false);
        expect(authState.listeners).toHaveLength(0); // listener cleaned up
    });

    it("returns immediately when a user is already available", async () => {
        signIn("cached-token");
        await expect(getFreshIdToken(false)).resolves.toBe("cached-token");
        expect(authState.listeners).toHaveLength(0); // no subscription needed at all
    });

    it("stops waiting after the bounded 5s fallback when no user ever appears", async () => {
        const tokenPromise = getFreshIdToken(false);
        await vi.advanceTimersByTimeAsync(5000);

        // Test mode falls back to the mock token instead of hanging.
        await expect(tokenPromise).resolves.toMatch(/^[^.]+\.[^.]+\.$/);
        expect(authState.listeners).toHaveLength(0); // listener cleaned up on timeout
    });
});
