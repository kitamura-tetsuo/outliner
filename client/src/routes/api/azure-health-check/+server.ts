import { getLogger } from "../../../lib/logger";
const logger = getLogger("API");

import { json } from "@sveltejs/kit";
import { getFirebaseFunctionUrl } from "../../../lib/firebaseFunctionsUrl";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request, getClientAddress, fetch }) => {
    try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");

        const forwardedHeaders = [
            "x-forwarded-for",
            "cf-connecting-ip",
            "fly-client-ip",
            "fastly-client-ip",
            "true-client-ip",
        ];
        for (const h of forwardedHeaders) {
            const val = request.headers.get(h);
            if (val) {
                headers.set(h, val);
            }
        }
        if (!headers.has("x-forwarded-for")) {
            try {
                headers.set("x-forwarded-for", getClientAddress());
            } catch (_e) {}
        }

        const response = await fetch(getFirebaseFunctionUrl("azureHealthCheck"), {
            method: "GET",
            headers,
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error({ status: response.status, errorText }, "Azure health check failed");
            return json(
                {
                    error: "Azure health check failed",
                    status: response.status,
                    details: errorText,
                },
                { status: response.status },
            );
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        logger.error({ error: error }, "Azure health check error:");
        return json(
            {
                error: "Internal server error",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
};
