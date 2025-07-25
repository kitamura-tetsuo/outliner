import { json } from "@sveltejs/kit";
import { getFirebaseFunctionUrl } from "../../../lib/firebaseFunctionsUrl";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ fetch }) => {
    try {
        const response = await fetch(getFirebaseFunctionUrl("azureHealthCheck"), {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Azure health check failed:", response.status, errorText);
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
        console.error("Azure health check error:", error);
        return json(
            {
                error: "Internal server error",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
};
