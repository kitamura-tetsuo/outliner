import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
    try {
        let force = false;
        try {
            const body = await request.json();
            force = body?.force === true;
        } catch {
            // No/invalid JSON body: treat as a regular (non-forced) seed request
        }

        let apiBaseUrl = process.env.VITE_YJS_API_URL;

        // Fallback to deriving the API URL from the WebSocket URL if available
        if (!apiBaseUrl && process.env.VITE_YJS_WS_URL) {
            apiBaseUrl = process.env.VITE_YJS_WS_URL.replace(/^ws(s)?:\/\//, "http$1://");
        }

        // Final fallback to the default API server URL
        if (!apiBaseUrl) {
            apiBaseUrl = process.env.VITE_API_SERVER_URL || "http://127.0.0.1:7093";
        }

        const endpoint = apiBaseUrl.endsWith("/")
            ? `${apiBaseUrl}api/seed-demo`
            : `${apiBaseUrl}/api/seed-demo`;

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ force }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return json({ success: false, error: `API error: ${response.status} ${errorText}` }, {
                status: response.status,
            });
        }

        const result = await response.json();
        return json(result);
    } catch (error) {
        console.error("Seed demo API error:", error);
        return json({ success: false, error: "Internal server error" }, { status: 500 });
    }
};
