import { userManager } from "../../auth/UserManager";
import { resolveApiBaseUrl } from "../../lib/yjsApiUrl";

export async function runScheduleRuleNow(
    projectId: string,
    ruleId: string,
): Promise<{ ok: boolean; error?: string; }> {
    try {
        const user = userManager.getCurrentUser();
        if (!user || !userManager.auth.currentUser) {
            return { ok: false, error: "Not authenticated" };
        }

        const token = await userManager.auth.currentUser.getIdToken();
        const apiBaseUrl = resolveApiBaseUrl();
        const endpoint = apiBaseUrl.endsWith("/")
            ? `${apiBaseUrl}api/schedules/run-now`
            : `${apiBaseUrl}/api/schedules/run-now`;

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ projectId, ruleId }),
        });

        if (!response.ok) {
            let errorMsg = response.statusText;
            try {
                const errorData = await response.json();
                if (errorData && errorData.error) {
                    errorMsg = errorData.error;
                }
            } catch (_e) {
                // Ignore JSON parse error, keep statusText
            }
            return { ok: false, error: errorMsg };
        }

        const data = await response.json();
        return { ok: data.ok, error: data.error };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
