import type { PageSeedData } from "../../../server/src/seed-api";

export { type PageSeedData };

/**
 * SeedClient - HTTP-based seeding client that calls server-side API
 * This bypasses WebSocket synchronization issues by directly manipulating
 * Yjs documents on the server side.
 */
export class SeedClient {
    private projectId: string;
    private authToken: string;
    private apiUrl: string;

    constructor(projectId: string, authToken: string) {
        this.projectId = encodeURIComponent(projectId);
        this.authToken = authToken;
        // Use the API server URL for seeding (same server that serves the seed API)
        // VITE_API_SERVER_URL is set in .env.test to point to the server's API port (7091)
        const apiUrl = process.env.VITE_API_SERVER_URL;
        if (apiUrl) {
            this.apiUrl = apiUrl;
        } else {
            // Fallback to Yjs port if API URL not set (for backwards compatibility)
            const yjsPort = process.env.VITE_YJS_PORT || "7093";
            this.apiUrl = `http://localhost:${yjsPort}`;
        }
    }

    /**
     * Seed the project with pages via HTTP API
     */
    public async seed(pages: PageSeedData[]): Promise<void> {
        console.log(`[SeedClient] Seeding project "${this.projectId}" with ${pages.length} pages via HTTP API...`);
        try {
            const response = await fetch(`${this.apiUrl}/api/seed`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.authToken}`,
                },
                body: JSON.stringify({
                    projectName: decodeURIComponent(this.projectId),
                    pages,
                }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(`Seeding failed: ${error.error || response.statusText}`);
            }

            const result = await response.json();
            console.log(`[SeedClient] Seeding completed:`, result);
        } catch (error) {
            console.error("[SeedClient] Seeding failed:", error);
            throw error;
        }
    }

    /**
     * Close/cleanup - no-op for HTTP client
     */
    public async close(): Promise<void> {
        // No cleanup needed for HTTP client
    }
}
