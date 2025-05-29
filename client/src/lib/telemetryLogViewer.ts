/**
 * Fluid Frameworkのtelemetryログを確認するためのユーティリティ
 */

// APIサーバーのURLを取得
const API_URL = import.meta.env.VITE_API_SERVER_URL || "http://localhost:7071";

/**
 * telemetryログを取得する関数
 * @returns telemetryログの配列
 */
export async function fetchTelemetryLogs(): Promise<any[]> {
    try {
        const response = await fetch(`${API_URL}/api/telemetry-logs`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "omit",
            mode: "cors",
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch telemetry logs: ${response.statusText}`);
        }

        const data = await response.json();
        return data.logs || [];
    }
    catch (error) {
        console.error("Error fetching telemetry logs:", error);
        return [];
    }
}

/**
 * telemetryログをコンソールに出力する関数
 * 開発時のデバッグ用
 */
export async function printTelemetryLogs(): Promise<void> {
    try {
        const logs = await fetchTelemetryLogs();

        if (logs.length === 0) {
            console.log("No telemetry logs found");
            return;
        }

        console.log(`Found ${logs.length} telemetry logs:`);
        logs.forEach((log, index) => {
            console.log(`[${index + 1}/${logs.length}]`, log);
        });
    }
    catch (error) {
        console.error("Error printing telemetry logs:", error);
    }
}

/**
 * telemetryログをローテーションする関数
 * @returns ローテーション結果
 */
export async function rotateTelemetryLogs(): Promise<any> {
    try {
        const response = await fetch(`${API_URL}/api/rotate-logs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "omit",
            mode: "cors",
        });

        if (!response.ok) {
            throw new Error(`Failed to rotate logs: ${response.statusText}`);
        }

        return await response.json();
    }
    catch (error) {
        console.error("Error rotating logs:", error);
        return { success: false, error: String(error) };
    }
}
