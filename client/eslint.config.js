import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint";
import { sveltekitOptions as svelteConfig } from "./sveltekit.options.js";

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
            "playwright-report/**/*",
            "src/lib/paraglide/**/*",
            "src/paraglide/**/*",
            "src/paraglide./src/lib/paraglide/**/*",
        ],
    },
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                // Additional globals for no-undef rule
                ServiceWorkerGlobalScope: "readonly",
                FrameRequestCallback: "readonly",
                NodeJS: "readonly",
                ElementCreationOptions: "readonly",
                NodeListOf: "readonly",
                EventListener: "readonly",
            },
        },
    },
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unused-vars": ["error", {
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
                "caughtErrorsIgnorePattern": "^_",
            }],
            "@typescript-eslint/ban-ts-comment": ["error", {
                "ts-expect-error": "allow-with-description",
            }],
            "@typescript-eslint/no-unsafe-function-type": "error",
            "@typescript-eslint/no-require-imports": "error",
            "@typescript-eslint/no-this-alias": "error",
            "@typescript-eslint/no-unused-expressions": "error",
            "no-useless-escape": "error",
            "no-empty": ["error", { "allowEmptyCatch": true }],
            "no-irregular-whitespace": "error",
            "no-undef": "error",
            "no-case-declarations": "error",
            // Temporarily disabled globally while the deferred consumers migrate
            // to typed $app/paths resolve() (issue #5629: Breadcrumb's second
            // resolution, the YjsTableBlock prop contract, list-record hrefs,
            // the opaque debug bridge and Paraglide output keep the generic
            // wrapper until their owning stages migrate them).
            // eslint-plugin-svelte 3.23.1 enables this check on SvelteKit 3;
            // restore it globally once those stages land. Fully migrated
            // producers are enforced at error severity in the scoped block
            // below instead.
            "svelte/no-navigation-without-resolve": "off",
            "svelte/prefer-writable-derived": "off", // Disabled: Svelte 4 rule not applicable to Svelte 5 patterns
            "svelte/require-each-key": "error",
            "svelte/no-at-html-tags": "error",
            "svelte/no-unused-svelte-ignore": "error",
            "svelte/no-unused-props": "error",
            "svelte/prefer-svelte-reactivity": "error",
        },
    },
    // Disable no-undef for .d.ts files as they contain type declarations
    {
        files: ["**/*.d.ts"],
        rules: {
            "no-undef": "off",
        },
    },
    // Issue #5629 scoped enforcement: every producer below navigates only
    // through the official `$app/paths` resolve API (direct calls or helpers
    // retaining the official `ResolvedPathname` result), so the navigation
    // rule holds at error severity here while the global temporary disable
    // still covers the deferred stages. Files with a documented reason to
    // keep a non-resolve destination stay out: SearchBox (`/search` is not a
    // route), GraphView and ObjectManagerView (`"#"` fallbacks),
    // KanbanBlock (transient legacy fallback), Breadcrumb and its item
    // callers, the YjsTableBlock prop contract, ScheduleListView reference
    // records, the opaque debug bridge, Paraglide output and debug-test.
    {
        files: [
            "src/components/AuthenticatedHome.svelte",
            "src/components/BacklinkPanel.svelte",
            "src/components/OutlinerItem.svelte",
            "src/components/OutlinerToolbar.svelte",
            "src/components/PageList.svelte",
            "src/components/ProjectSelector.svelte",
            "src/components/SearchPanel.svelte",
            "src/components/Sidebar.svelte",
            "src/components/Toolbar.svelte",
            "src/components/management/CalendarDetailView.svelte",
            "src/components/management/CalendarListView.svelte",
            "src/components/management/GridDetailView.svelte",
            "src/components/management/GridListView.svelte",
            "src/components/management/ImportExportView.svelte",
            "src/components/management/KanbanDetailView.svelte",
            "src/components/management/KanbanListView.svelte",
            "src/components/management/ManagementLanding.svelte",
            "src/components/management/ObjectSetDuplicationDialog.svelte",
            "src/components/management/ProjectSettingsView.svelte",
            "src/components/management/ScheduleDetailView.svelte",
            "src/components/management/ScheduleListView.svelte",
            "src/components/management/TableDetailView.svelte",
            "src/components/management/TableListView.svelte",
            "src/components/schedule/TableScheduleReferences.svelte",
            "src/components/yjstable/ObjectDuplicationDialog.svelte",
            "src/components/yjstable/TableGridReferences.svelte",
            "src/services/navigation/outlineItemNavigation.ts",
            "src/routes/[project]/+layout.svelte",
            "src/routes/[project]/[page]/+page.svelte",
            "src/routes/[project]/[page]/schedule/+page.svelte",
            "src/routes/[project]/-/tables/[tableId]/schedule/+page.svelte",
            "src/routes/[demoProject=demoProject]/[page]/+page.svelte",
            "src/routes/[demoProject=demoProject]/-/tables/[tableId]/schedule/+page.svelte",
            "src/routes/debug/+page.svelte",
            "src/routes/error/project-unavailable/+page.svelte",
            "src/routes/projects/new/+page.svelte",
            "src/routes/settings/+page.svelte",
            "src/routes/share/[token]/+page.svelte",
        ],
        rules: {
            "svelte/no-navigation-without-resolve": "error",
        },
    },
    {
        files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
        ignores: ["eslint.config.js", "sveltekit.options.js"],
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
            "@typescript-eslint/no-explicit-any": "error",
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
            "@typescript-eslint/no-explicit-any": "off", // E2E tests often use dynamic browser APIs that require 'any'
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
                {
                    selector: "Literal[value='networkidle']",
                    message:
                        "Do not use 'networkidle' as it is flaky with WebSockets. Use deterministic assertions instead.",
                },
            ],
            "no-restricted-globals": [
                "error",
                {
                    name: "window",
                    message:
                        "Do not access 'window' in E2E tests. If you are using page.evaluate, try to avoid coupling to global state.",
                },
                {
                    name: "generalStore",
                    message:
                        "Do not access internal stores in E2E tests. Test user-visible behavior or use proper seeding APIs.",
                },
                {
                    name: "appStore",
                    message:
                        "Do not access internal stores in E2E tests. Test user-visible behavior or use proper seeding APIs.",
                },
                {
                    name: "editorOverlayStore",
                    message:
                        "Do not access internal stores in E2E tests. Test user-visible behavior or use proper seeding APIs.",
                },
            ],
        },
    },
    {
        files: ["e2e/utils/testHelpers.ts"],
        rules: {
            "no-restricted-syntax": "off", // Allow internal store access in helpers
            "no-restricted-globals": "off", // Allow internal store access in helpers
        },
    },
);
