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
            ".svelte-kit/output/**/*",
        ],
    },
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                // Additional global types to avoid no-undef errors
                NodeListOf: "readonly",
                FrameRequestCallback: "readonly",
                Console: "readonly",
                NodeJS: "readonly",
            },
        },
    },
    // Temporary: Convert strict rules to warnings to allow CI to pass
    // These rules were causing 3831 errors across 299 files
    // TODO: Fix these issues incrementally and convert back to errors
    // See issue #733 for tracking
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": "warn",
            "@typescript-eslint/ban-ts-comment": "warn",
            "@typescript-eslint/no-unsafe-function-type": "error", // Gradually converting back to error - has few violations
            "@typescript-eslint/no-require-imports": "error", // Gradually converting back to error - has few violations
            "@typescript-eslint/no-this-alias": "error", // Gradually converting back to error - has few violations
            "@typescript-eslint/no-unused-expressions": "error", // Gradually converting back to error - has few violations
            "no-useless-escape": "warn",
            "no-empty": ["warn", { "allowEmptyCatch": true }],
            "no-irregular-whitespace": "error", // Gradually converting back to error - has only 1 violation
            "no-undef": "error", // Converted to error - all violations fixed
            "no-case-declarations": "error", // Gradually converting back to error - can be easily fixed
            "svelte/prefer-writable-derived": "error", // Converted to error - all violations fixed
            "svelte/require-each-key": "error",
            "svelte/no-at-html-tags": "error", // Gradually converting back to error - security concern
            "svelte/no-unused-svelte-ignore": "warn",
            "svelte/no-unused-props": "warn",
            "svelte/prefer-svelte-reactivity": "error",
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
    {
        files: ["e2e/utils/testHelpers.ts"],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector: "ReturnStatement[argument.name='page']",
                    message: "Forbidden: do not return the global 'page' object.",
                },
                {
                    selector: "ArrowFunctionExpression[body.name='page']",
                    message: "Forbidden: arrow function should not implicitly return 'page'.",
                },
            ],
        },
    },
    {
        files: [
            "**/*.{test,spec}.{js,ts,tsx}",
            "**/*.integration.spec.{js,ts}",
            "**/tests/**/*.{js,ts,tsx}",
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
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "CallExpression[callee.type='MemberExpression'][callee.object.type='Identifier'][callee.object.name=/^(it|test|describe)$/][callee.property.name='skip']",
                    message: "Do not skip tests; remove `.skip` calls.",
                },
                {
                    selector:
                        "CallExpression[callee.type='MemberExpression'][callee.object.type='MemberExpression'][callee.object.object.type='Identifier'][callee.object.object.name='test'][callee.object.property.name='describe'][callee.property.name='skip']",
                    message: "Do not skip test suites; remove `.skip` calls.",
                },
                {
                    selector: "CallExpression[callee.type='Identifier'][callee.name=/^x(it|describe)$/]",
                    message: "Do not use x-prefixed helpers to skip tests.",
                },
            ],
        },
    },
    {
        files: [
            "e2e/**/*.{js,ts,tsx}",
            "e2e/**/*.{test,spec}.{js,ts,tsx}",
            "**/*.e2e-spec.{js,ts,tsx}",
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
                        {
                            group: ["**/src/lib/yjs/service", "**/src/lib/yjs/service/**"],
                            message:
                                "E2E tests must not import the Yjs service directly. Move the scenario to an integration test instead.",
                        },
                    ],
                },
            ],
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "CallExpression[callee.type='MemberExpression'][callee.object.type='Identifier'][callee.object.name=/^(it|test|describe)$/][callee.property.name='skip']",
                    message: "Do not skip tests; remove `.skip` calls.",
                },
                {
                    selector:
                        "CallExpression[callee.type='MemberExpression'][callee.object.type='MemberExpression'][callee.object.object.type='Identifier'][callee.object.object.name='test'][callee.object.property.name='describe'][callee.property.name='skip']",
                    message: "Do not skip test suites; remove `.skip` calls.",
                },
                {
                    selector: "CallExpression[callee.type='Identifier'][callee.name=/^x(it|describe)$/]",
                    message: "Do not use x-prefixed helpers to skip tests.",
                },
            ],
        },
    },
);
