import type { PageSeedData } from "../../../server/src/seed-api";

export { type PageSeedData };

/**
 * SeedClient - HTTP-based seeding client that calls server-side API
 * This bypasses WebSocket synchronization issues by directly manipulating
 * Yjs documents on the server side.
 */
export class SeedClient {
    private projectId: string;
    private projectTitle: string;
    private authToken: string;
    private apiUrl: string;

    constructor(projectTitle: string, authToken: string) {
        this.projectTitle = projectTitle;
        // Derive stable ID from title to match client-side logic in test mode
        this.projectId = SeedClient.stableIdFromTitle(projectTitle);
        this.authToken = authToken;
        // Use VITE_YJS_PORT for the seed API (same port as Yjs WebSocket server)
        // The seed API is served from the Yjs server at /api/seed
        this.apiUrl = process.env.VITE_YJS_API_URL || `http://localhost:${process.env.VITE_YJS_PORT || 7093}`;
    }

    /**
     * Derive a stable projectId from the title so separate browsers join the same room
     * Duplicated from client/src/lib/yjsService.svelte.ts to ensure consistency
     */
    public static stableIdFromTitle(title: string): string {
        try {
            let h = 2166136261 >>> 0; // FNV-1a basis
            for (let i = 0; i < title.length; i++) {
                h ^= title.charCodeAt(i);
                h = (h * 16777619) >>> 0;
            }
            const hex = h.toString(16);
            return `p${hex}`; // ensure starts with a letter; matches [A-Za-z0-9_-]+
        } catch {
            return `p${Math.random().toString(16).slice(2)}`;
        }
    }

    /**
     * Seed a single page with lines
     */
    public async seedPage(pageName: string, lines: string[]): Promise<void> {
        const pages: PageSeedData[] = [{
            name: pageName,
            lines: lines,
        }];
        await this.seed(pages);
    }

    /**
     * Seed the project with pages via HTTP API
     */
    public async seed(pages: PageSeedData[]): Promise<void> {
        console.log(
            `[SeedClient] Seeding project "${this.projectId}" (title: "${this.projectTitle}") with ${pages.length} pages via HTTP API...`,
        );
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

            const response = await fetch(`${this.apiUrl}/api/seed`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.authToken}`,
                },
                body: JSON.stringify({
                    projectName: this.projectTitle,
                    pages,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(`Seeding failed: ${error.error || response.statusText}`);
            }

            const result = await response.json();
            console.log(`[SeedClient] Seeding completed:`, result);
        } catch (error: any) {
            // Handle specific error types
            if (error.name === "AbortError") {
                console.error("[SeedClient] Seeding timed out after 30 seconds");
            } else if (error.message.includes("Failed to fetch") || error.message.includes("fetch error")) {
                console.error(
                    `[SeedClient] Network error during seeding: ${error.message}. Is the Yjs server running on port ${this.apiUrl}?`,
                );
            } else {
                console.error("[SeedClient] Seeding failed:", error);
            }
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
