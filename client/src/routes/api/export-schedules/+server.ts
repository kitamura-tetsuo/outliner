import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
    try {
        const idToken = url.searchParams.get("idToken");
        const pageId = url.searchParams.get("pageId");

        if (!idToken || !pageId) {
            return json({ error: "Missing required parameters" }, { status: 400 });
        }

        // Firebase Functionsのエンドポイントにプロキシ
        const apiBaseUrl = process.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";
        const response = await fetch(`${apiBaseUrl}/api/export-schedules`, {
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

        const icsData = await response.text();
        return new Response(icsData, {
            headers: {
                "Content-Type": "text/calendar;charset=utf-8",
                "Content-Disposition": "attachment; filename=\"schedules.ics\"",
            }
        });
    } catch (error) {
        console.error("List schedules API error:", error);
        return json({ error: "Internal server error" }, { status: 500 });
    }
};
