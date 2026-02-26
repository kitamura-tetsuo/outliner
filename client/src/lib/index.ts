// place files you want to import through the `$lib` alias in this folder.

// (removed Fluid telemetry init)

// Apply only in development mode
if (import.meta.env.MODE === "development") {
    // Add fetch error handling only in development mode
    if (typeof window !== "undefined") {
        const originalFetch = window.fetch;
        window.fetch = async function(input, init) {
            try {
                return await originalFetch(input, init);
            } catch (error) {
                let url;
                if (typeof input === "string") {
                    url = input;
                } else if (input instanceof Request) {
                    url = input.url;
                } else {
                    url = "Unknown URL";
                }
                // Add URL to the original error message
                if (error instanceof Error) {
                    const enhancedError = new Error(`Failed to fetch from ${url}: ${error.message}`);
                    enhancedError.stack = error.stack;
                    throw enhancedError;
                } else {
                    throw new Error(`Failed to fetch from ${url}: Unknown error`);
                }
            }
        };
    }
}
