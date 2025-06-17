/// <reference types="@playwright/test" />
import { defineConfig } from "@playwright/test";

const PORT = 7090;

export default defineConfig({
    testDir: "./client/e2e",
    timeout: 30 * 1000,
    expect: {
        timeout: 5000,
    },
    webServer: {
        command: "npm --prefix client run dev",
        port: PORT,
        reuseExistingServer: true,
    },
    use: {
        headless: true,
        viewport: { width: 1280, height: 720 },
        actionTimeout: 0,
        baseURL: `http://localhost:${PORT}`,
    },
});
