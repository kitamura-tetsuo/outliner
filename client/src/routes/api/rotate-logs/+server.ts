import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async () => {
    try {
        // ログローテーション要求をサーバーにプロキシ
        const apiBaseUrl = process.env.VITE_API_SERVER_URL || "http://localhost:7091";
        const response = await fetch(`${apiBaseUrl}/api/rotate-logs`, {
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
        console.error("Rotate logs API error:", error);
        return json({ error: "Internal server error" }, { status: 500 });
    }
};

export const GET: RequestHandler = async () => {
    try {
        // GETリクエストの場合（Image src用のフォールバック）
        const apiBaseUrl = process.env.VITE_API_SERVER_URL || "http://localhost:7091";
        const response = await fetch(`${apiBaseUrl}/api/rotate-logs`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            return new Response("Error", { status: response.status });
        }

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error("Rotate logs API error:", error);
        return new Response("Error", { status: 500 });
    }
};
