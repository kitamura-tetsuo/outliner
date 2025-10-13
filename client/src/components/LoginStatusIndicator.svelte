<script lang="ts">
import {
    onDestroy,
    onMount,
} from "svelte";
import {
    type IUser,
    userManager as defaultUserManager,
    UserManager,
} from "../auth/UserManager";

interface Props {
    manager?: UserManager;
}

let { manager = defaultUserManager }: Props = $props();

type Status = "loading" | "authenticated" | "unauthenticated";

let status = $state<Status>("loading");
let currentUser = $state<IUser | null>(null);

const isAuthenticated = $derived(status === "authenticated");
const isLoading = $derived(status === "loading");
const isGoogleUser = $derived(Boolean(currentUser?.providerIds?.includes("google.com")));
const detailText = $derived(currentUser?.name || currentUser?.email || "");
const hasDetail = $derived(detailText.length > 0);
const statusLabel = $derived(
    isLoading
        ? "Checking login status…"
        : isAuthenticated
            ? (isGoogleUser ? "Signed in with Google" : "Signed in")
            : "Not signed in",
);

let unsubscribe: (() => void) | undefined;

function applyUser(user: IUser | null) {
    currentUser = user;
    status = user ? "authenticated" : "unauthenticated";
}

function subscribeToManager(next: UserManager | undefined) {
    if (!next) return;

    unsubscribe?.();

    try {
        applyUser(next.getCurrentUser());
    } catch {
        status = "loading";
        currentUser = null;
    }

    unsubscribe = next.addEventListener(result => {
        applyUser(result?.user ?? null);
    });

    if (status === "loading") {
        status = currentUser ? "authenticated" : "unauthenticated";
    }
}

onMount(() => {
    subscribeToManager(manager);
});

onDestroy(() => {
    unsubscribe?.();
    unsubscribe = undefined;
});
</script>

<div
    class="login-status-indicator"
    class:authenticated={isAuthenticated}
    class:unauthenticated={!isAuthenticated && !isLoading}
    class:loading={isLoading}
    data-testid="login-status-indicator"
    data-status={status}
    role="status"
    aria-live="polite"
    aria-busy={isLoading ? "true" : "false"}
    aria-label={statusLabel}
    title={statusLabel}
>
    {#if isLoading}
        <span class="icon-badge">
            <span class="spinner" aria-hidden="true"></span>
        </span>
        <span class="status-text">
            <span class="status-label">Checking…</span>
        </span>
        <span class="visually-hidden">Checking login status…</span>
    {:else if isAuthenticated && currentUser}
        <span class="icon-badge">
            {#if isGoogleUser}
                <span class="provider-icon" data-provider="google" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                </span>
            {:else if currentUser.photoURL}
                <span class="provider-icon avatar" data-provider="avatar" aria-hidden="true">
                    <img src={currentUser.photoURL} alt="" referrerpolicy="no-referrer" />
                </span>
            {:else}
                <span class="provider-icon" data-provider="default" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Z" />
                        <path d="M6 20c0-3.31 2.69-6 6-6s6 2.69 6 6" />
                    </svg>
                </span>
            {/if}
        </span>
        <span class="status-text">
            <span class="status-label">Signed in</span>
            {#if hasDetail}
                <span class="status-detail">{detailText}</span>
            {/if}
        </span>
    {:else}
        <span class="icon-badge">
            <span class="provider-icon logged-out" data-provider="guest" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 12c2.49 0 4.5-2.01 4.5-4.5S14.49 3 12 3 7.5 5.01 7.5 7.5 9.51 12 12 12Z" />
                    <path d="M4 20.4c0-4.09 3.31-7.4 7.4-7.4h1.2c4.09 0 7.4 3.31 7.4 7.4" />
                    <path d="m16 3 5 5" />
                    <path d="m21 3-5 5" />
                </svg>
            </span>
        </span>
        <span class="status-text">
            <span class="status-label">Not signed in</span>
        </span>
    {/if}
</div>

<style>
.login-status-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.75rem;
    border-radius: 9999px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #111827;
    font-size: 0.875rem;
    line-height: 1.25rem;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    min-height: 2.5rem;
}

.login-status-indicator.authenticated {
    border-color: #10b981;
    background: #ecfdf5;
    color: #0f172a;
}

.login-status-indicator.unauthenticated {
    border-color: #d1d5db;
    background: #f3f4f6;
}

.login-status-indicator.loading {
    border-color: #d1d5db;
    background: #f9fafb;
}

.icon-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
}

.provider-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
}

.provider-icon svg {
    width: 100%;
    height: 100%;
}

.provider-icon.avatar img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
}

.provider-icon.logged-out svg {
    stroke: #6b7280;
}

.status-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.status-label {
    font-weight: 600;
    color: inherit;
}

.status-detail {
    font-size: 0.75rem;
    color: #4b5563;
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.spinner {
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid #d1d5db;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: login-status-spin 0.75s linear infinite;
}

@keyframes login-status-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
}
</style>
