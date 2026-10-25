import type { Project } from "@playwright/test";
import retainedSelectionSpecs from "./playwright-selection-retained.json" with { type: "json" };

// E2E-relative paths preserve dual-engine membership when a required spec moves.
export const retainedSelectionMatches = retainedSelectionSpecs.map(spec => `**/${spec}`);

// Issue #5768 ordinary-caret regressions intentionally run in the bounded
// Firefox project as well as their normal Chromium core shard. They are not
// selection-retained specs, so keep their explicit inclusion separate from
// the selection manifest and its coverage guard.
const ordinaryVerticalMatches = [
    "**/core/clm-vertical-formatted-active-layout-5768.spec.ts",
    "**/core/clm-vertical-goal-resets-5768.spec.ts",
    "**/core/clm-vertical-visual-goal-empty-short-5768.spec.ts",
];

// The local runner and CI execute these same bounded Firefox project groups.
// The coverage guard derives the required file set independently from REQ-001.
export const FIREFOX_SELECTION_PROJECT_NAMES = [
    "firefox-selection-core-4",
    "firefox-selection-core-4b",
    "firefox-selection-new",
    "firefox-selection-basic",
] as const;

export const firefoxSelectionProjects: Project[] = [
    {
        name: FIREFOX_SELECTION_PROJECT_NAMES[0],
        testDir: "./e2e/core",
        testMatch: ["**/slr-[a-p]*.spec.ts"],
    },
    {
        name: FIREFOX_SELECTION_PROJECT_NAMES[1],
        testDir: "./e2e/core",
        // Include future matching names outside a-p, not only today's q-z names.
        testMatch: ["**/slr-*.spec.ts"],
        testIgnore: ["**/slr-[a-p]*.spec.ts"],
    },
    {
        name: FIREFOX_SELECTION_PROJECT_NAMES[2],
        testDir: "./e2e/new",
        testMatch: ["**/slr-*.spec.ts"],
    },
    {
        name: FIREFOX_SELECTION_PROJECT_NAMES[3],
        testDir: "./e2e",
        testMatch: ["**/basic/reproduce_issue_1512.spec.ts", ...retainedSelectionMatches, ...ordinaryVerticalMatches],
    },
];
