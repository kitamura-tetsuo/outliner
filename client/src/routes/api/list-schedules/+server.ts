import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
    try {
        const idToken = url.searchParams.get("idToken");
        const pageId = url.searchParams.get("pageId");

        if (!idToken || !pageId) {
            return json({ error: "Missing required parameters" }, { status: 400 });
        }

        // Proxy to Firebase Functions endpoint
        const apiBaseUrl = process.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";
        const response = await fetch(`${apiBaseUrl}/api/list-schedules`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                pageId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return json({ error: `API error: ${response.status} ${errorText}` }, { status: response.status });
        }

        const result = await response.json();
        return json(result);
    } catch (error) {
        console.error("List schedules API error:", error);
        return json({ error: "Internal server error" }, { status: 500 });
    }
};
