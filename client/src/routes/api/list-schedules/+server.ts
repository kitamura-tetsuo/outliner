import { getLogger } from "../../../lib/logger";
const logger = getLogger("API");

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
    try {
        const idToken = url.searchParams.get("idToken");
        const pageId = url.searchParams.get("pageId");

        if (!idToken || !pageId) {
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

        const response = await fetch(`${apiBaseUrl}/api/list-schedules`, {
            method: "POST",
            headers,
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
        logger.error({ error }, "List schedules API error");
        return json({ error: "Internal server error" }, { status: 500 });
    }
};
