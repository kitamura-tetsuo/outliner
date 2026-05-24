import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async () => {
    try {
        const apiBaseUrl = process.env.VITE_API_SERVER_URL || "http://127.0.0.1:7091";
        const response = await fetch(`${apiBaseUrl}/api/seed-demo`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return json({ error: `API error: ${response.status} ${errorText}` }, { status: response.status });
        }

        const result = await response.json();
        return json(result);
    } catch (error) {
        console.error("Seed demo API error:", error);
        return json({ error: "Internal server error" }, { status: 500 });
    }
};
