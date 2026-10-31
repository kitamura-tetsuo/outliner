export default {
    mutate: [
        "src/**/*.{ts,tsx}",
        "!src/**/*.{test,spec}.{ts,tsx}",
        "!src/tests/**",
        "!src/**/*.d.ts",
        "!src/lib/paraglide/**",
    ],
    testRunner: "vitest",
    reporters: ["progress", "clear-text", "html", "json"],
    coverageAnalysis: "perTest",
    checkers: ["typescript"],
    vitest: {
        configFile: "vite.config.ts",
    },
    tsconfigFile: "tsconfig.json",
    // Keep each sandbox next to shared so Vite and TypeScript resolve ../shared correctly.
    tempDirName: "..",
    incremental: true,
    thresholds: {
        high: 90,
        low: 75,
        break: 60,
    },
};
