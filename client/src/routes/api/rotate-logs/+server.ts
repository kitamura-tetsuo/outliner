import { getLogger } from "../../../lib/logger";
const logger = getLogger("API");

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
    try {
        // Proxy log rotation request to the server
        const apiBaseUrl = process.env.VITE_API_SERVER_URL || "http://localhost:7091";

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

        const response = await fetch(`${apiBaseUrl}/api/rotate-logs`, {
            method: "POST",
            headers,
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return json({ error: `API error: ${response.status} ${errorText}` }, { status: response.status });
        }

        const result = await response.json();
        return json(result);
    } catch (error) {
        logger.error({ error }, "Rotate logs API error");
        return json({ error: "Internal server error" }, { status: 500 });
    }
};

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
    try {
        // In case of GET request (Fallback for Image src)
        const apiBaseUrl = process.env.VITE_API_SERVER_URL || "http://localhost:7091";

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

        const response = await fetch(`${apiBaseUrl}/api/rotate-logs`, {
            method: "POST",
            headers,
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            return new Response("Error", { status: response.status });
        }

        return new Response("OK", { status: 200 });
    } catch (error) {
        logger.error({ error }, "Rotate logs API error");
        return new Response("Error", { status: 500 });
    }
};
