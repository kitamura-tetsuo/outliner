import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { idToken, containerId } = await request.json();

        if (!idToken || !containerId) {
            return json({ error: "Missing required parameters" }, { status: 400 });
        }

        // Firebase Functionsのエンドポイントにプロキシ
        const apiBaseUrl = process.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";
        const response = await fetch(`${apiBaseUrl}/api/save-container`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                containerId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return json({ error: `API error: ${response.status} ${errorText}` }, { status: response.status });
        }

        const result = await response.json();
        return json(result);
    } catch (error) {
        console.error("Save container API error:", error);
        return json({ error: "Internal server error" }, { status: 500 });
    }
};
