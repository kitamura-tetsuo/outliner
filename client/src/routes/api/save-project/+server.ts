import { getLogger } from "../../../lib/logger";
const logger = getLogger("API");

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
    try {
        const { idToken, projectId } = await request.json();

        if (!idToken || !projectId) {
            return json({ error: "Missing required parameters" }, { status: 400 });
        }

        // Proxy to Firebase Functions endpoint
        const apiBaseUrl = process.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        const forwardedHeaders = [
            "x-forwarded-for",
            "cf-connecting-ip",
            "fly-client-ip",
            "fastly-client-ip",
            "true-client-ip",
        ];
        for (const h of forwardedHeaders) {
            const val = request.headers.get(h);
            if (val) headers[h] = val;
        }
        if (!headers["x-forwarded-for"]) {
            try {
                headers["x-forwarded-for"] = getClientAddress();
            } catch (_e) {}
        }

        const response = await fetch(`${apiBaseUrl}/api/save-project`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                idToken,
                projectId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return json({ error: `API error: ${response.status} ${errorText}` }, { status: response.status });
        }

        const result = await response.json();
        return json(result);
    } catch (error) {
        logger.error({ error }, "Save container API error");
        return json({ error: "Internal server error" }, { status: 500 });
    }
};
