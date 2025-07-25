import { json } from "@sveltejs/kit";
import { getFirebaseFunctionUrl } from "../../../lib/firebaseFunctionsUrl";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { idToken, containerId } = await request.json();

        if (!idToken) {
            return json({ error: "Missing required parameters" }, { status: 400 });
        }

        // Firebase Functionsのエンドポイントにプロキシ
        const requestBody: any = { idToken };

        // コンテナIDが指定されている場合は追加
        if (containerId) {
            requestBody.containerId = containerId;
        }

        const response = await fetch(getFirebaseFunctionUrl("fluidToken"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return json({ error: `API error: ${response.status} ${errorText}` }, { status: response.status });
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        console.error("Error in fluid-token proxy:", error);
        return json({ error: "Internal server error" }, { status: 500 });
    }
};
