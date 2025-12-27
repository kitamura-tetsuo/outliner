import type { PageSeedData } from "../../../../server/src/seed-api";

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

        // Determine API URL from environment
        const yjsPort = process.env.VITE_YJS_PORT || "7093";
        this.apiUrl = process.env.VITE_YJS_API_URL || `http://localhost:${yjsPort}`;
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
