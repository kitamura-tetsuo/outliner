// @ts-check
/**
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
    mutate: [
        "src/**/*.{ts,tsx}",
        "!src/**/*.{test,spec}.{ts,tsx}",
        "!src/tests/**",
        "!src/**/*.d.ts",
        "!src/lib/paraglide/**",
    ],
    testRunner: "vitest",
    vitest: {
        configFile: "vite.config.ts",
    },
    reporters: ["progress", "clear-text", "html", "json"],
    coverageAnalysis: "perTest",
    tsconfigFile: "tsconfig.json",
    tempDirName: "node_modules/.cache/stryker",
    incremental: true,
    thresholds: {
        high: 90,
        low: 75,
        break: 60,
    },
};
