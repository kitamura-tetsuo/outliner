import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint";
import noSkippedTestsRule from "./eslint-rules/no-skipped-tests.js";
import svelteConfig from "./svelte.config.js";
const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

export default ts.config(
    includeIgnoreFile(gitignorePath),
    js.configs.recommended,
    ...ts.configs.recommended,
    ...svelte.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
    },
    {
        plugins: {
            "no-skipped-tests": {
                rules: {
                    "no-skipped-tests": noSkippedTestsRule,
                },
            },
        },
        rules: {
            "no-skipped-tests/no-skipped-tests": "error",
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
);
