/**
 * Nonempty-base regression for typed internal URLs (issue #5629).
 *
 * Runs ONLY under `vitest.base.config.ts`: the real SvelteKit framework
 * configured with `paths.base = "/test-base"`, the real `$app/paths`
 * resolver (no mocks anywhere in this file), and the actual migrated
 * production producers. Every direct internal link must contain the base
 * exactly once; resolving twice (the deferred Breadcrumb pattern) would
 * duplicate it, which this file also pins so the deferred stages stay
 * honest.
 */
import { resolve } from "$app/paths";
import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import PageList from "../components/PageList.svelte";
import { Project } from "../schema/app-schema";
import { resolvePath } from "../utils/pathUtils";
import { projectObjectsSelectedRoute, projectSchedulesRoute, projectTableRoute } from "./managementPaths";
import { projectPageRoute, projectRoute } from "./publicProject";

function occurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
}

describe("typed routes under a nonempty base", () => {
    it("applies the configured base exactly once to direct internal links", () => {
        const cases: string[] = [
            projectRoute("acme"),
            projectPageRoute("acme", "設計メモ & plans"),
            projectPageRoute("demo-ja", "書式"),
            projectTableRoute("acme", "tbl-1"),
            projectSchedulesRoute("demo"),
            projectObjectsSelectedRoute("acme", "tbl-1"),
            resolve("/settings"),
            resolve("/projects/new"),
            resolve("/"),
        ];
        for (const url of cases) {
            expect(url.startsWith("/test-base/") || url === "/test-base", url).toBe(true);
            expect(occurrences(url, "/test-base"), url).toBe(1);
        }
        expect(projectPageRoute("acme", "設計メモ & plans")).toBe(
            "/test-base/acme/%E8%A8%AD%E8%A8%88%E3%83%A1%E3%83%A2%20%26%20plans",
        );
    });

    it("keeps the deferred generic wrapper working for its remaining consumers", () => {
        // The Breadcrumb/second-resolution consumers still use the wrapper;
        // a single application of the base is what the framework gives them.
        expect(resolvePath("/acme/-/objects")).toBe("/test-base/acme/-/objects");
    });

    it("does not emit an unresolved href for a legacy empty-title page", () => {
        const project = Project.createInstance("acme");
        project.addPage("", "user-1");

        const { container } = render(PageList, {
            props: { project, projectName: "acme", rootItems: project.items },
        });

        expect(container.querySelector('a[href="/acme/"]')).toBeNull();
        expect(container.querySelector('a[href="/test-base/acme/"]')).toBeNull();
    });
});
