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
    tsconfigFile: "tsconfig.json",
    tempDirName: "node_modules/.cache/stryker",
    incremental: true,
    thresholds: {
        high: 90,
        low: 75,
        break: 60,
    },
};
