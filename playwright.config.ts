/// <reference types="@playwright/test" />
import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests",
    timeout: 30 * 1000,
    expect: {
        timeout: 5000,
    },
    webServer: {
        command: "npm run dev",
        port: 5173,
        reuseExistingServer: true,
    },
    use: {
        headless: true,
        viewport: { width: 1280, height: 720 },
        actionTimeout: 0,
        baseURL: "http://localhost:5173",
    },
});
