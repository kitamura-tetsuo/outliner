// Test double for SvelteKit's `$app/state` module (unit tests only).
//
// Outside a running SvelteKit app the real `page` never receives route data,
// so component tests replace the module with this one:
//
//     vi.mock("$app/state", () => import("<relative path>/tests/mocks/appState.svelte"));
//
// Like the real `page`, every field is a `$state.raw` property: reading it in
// a `$derived` or template subscribes to it, and `setPage(...)` re-renders the
// mounted component without remounting it, the way a client-side navigation
// between two parameter values of the same route does.

/** Route URLs are replaced wholesale on navigation, never mutated in place. */
function routeUrl(url: URL | string): URL {
    return typeof url === "string" ? new URL(url, "http://localhost") : url;
}

class MockPage {
    params: Record<string, string> = $state.raw({});
    url: URL = $state.raw(routeUrl("/"));
    route: { id: string | null; } = $state.raw({ id: null });
    data: Record<string, unknown> = $state.raw({});
    state: Record<string, unknown> = $state.raw({});
    status = $state.raw(200);
    error: unknown = $state.raw(null);
    form: unknown = $state.raw(null);
}

export const page = new MockPage();

/** Simulates a navigation: replaces the given fields and notifies readers. */
export function setPage(next: { params?: Record<string, string>; url?: URL | string; }): void {
    if (next.params !== undefined) page.params = next.params;
    if (next.url !== undefined) page.url = routeUrl(next.url);
}

export const navigating = { current: null };
export const updated = { current: false, check: async () => false };
