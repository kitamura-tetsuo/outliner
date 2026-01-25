import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "dev-tests",
        environment: "node",
        include: ["./*.spec.ts"],
        exclude: [],
        globals: true,
        clearMocks: true,
        envFile: "../../client/.env.test",
        testTimeout: 60000, // 60 seconds
    },
});
