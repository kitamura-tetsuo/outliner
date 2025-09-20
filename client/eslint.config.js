import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint";
import svelteConfig from "./svelte.config.js";
const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

export default ts.config(
    includeIgnoreFile(gitignorePath),
    js.configs.recommended,
    ...ts.configs.recommended,
    ...svelte.configs.recommended,
    {
        ignores: [
            ".svelte-kit/generated/**/*",
            ".svelte-kit/non-ambient.d.ts",
            ".svelte-kit/types/**/*",
        ],
    },
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
    },
    {
        files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
        ignores: ["eslint.config.js", "svelte.config.js"],

        languageOptions: {
            parserOptions: {
                projectService: true,
                extraFileExtensions: [".svelte"],
                parser: ts.parser,
                svelteConfig,
            },
        },
    },
    // Tests: disallow importing .svelte.ts directly
    {
        files: [
            "**/*.{test,spec}.{js,ts,tsx}",
            "**/*.integration.spec.{js,ts}",
            "**/tests/**/*.{js,ts,tsx}",
            "e2e/**/*.{js,ts,tsx}",
        ],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["**/*.svelte.ts", "**/*.svelte.js"],
                            message:
                                "Do not import .svelte.ts modules from tests. Use window-exposed instances, local stubs, or render a component to initialize stores.",
                        },
                    ],
                },
            ],
        },
    },
);
