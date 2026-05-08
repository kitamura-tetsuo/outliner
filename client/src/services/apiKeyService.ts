import { userManager } from "../auth/UserManager";

interface ApiKey {
    id: string;
    description: string;
    createdAt: number;
    lastUsedAt?: number;
}

interface CreateApiKeyResponse {
    id: string;
    apiKey: string;
    description: string;
    createdAt: number;
}

/* global RequestInit */
async function callApi(path: string, options: RequestInit = {}) {
    const idToken = await userManager.auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("No auth token");

    // We assume api Base URL is on standard dev port 57070 or relative in prod
    // Standard from other services:
    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:57070/api";

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${idToken}`);

    if (!(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${apiBaseUrl}/${path}`, {
        ...options,
        headers,
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `API error ${res.status}`);
    }

    return res.json();
}

export async function listApiKeys(): Promise<ApiKey[]> {
    return callApi("api-keys");
}

export async function createApiKey(description: string): Promise<CreateApiKeyResponse> {
    return callApi("api-keys", {
        method: "POST",
        body: JSON.stringify({ description }),
    });
}

export async function revokeApiKey(id: string): Promise<void> {
    await callApi(`api-keys/${id}`, {
        method: "DELETE",
    });
}
