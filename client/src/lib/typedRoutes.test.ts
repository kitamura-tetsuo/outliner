/**
 * Typed internal-URL regression coverage (issue #5629).
 *
 * Every assertion below runs the ACTUAL migrated production producers through
 * the REAL SvelteKit `$app/paths` resolver — this file deliberately does not
 * mock `$app/paths`. The pre-existing string builders (`projectBasePath`,
 * `projectPagePath`, `managementPaths.*Path`) are the oracle: they specify
 * the established percent-encoding, and the typed `*Route` helpers must
 * produce byte-identical URLs for the same accepted inputs.
 */
import { describe, expect, it } from "vitest";
import {
    projectCalendarPath,
    projectCalendarRoute,
    projectCalendarsPath,
    projectCalendarsRoute,
    projectGraphPath,
    projectGraphRoute,
    projectGridPath,
    projectGridRoute,
    projectGridsPath,
    projectGridsRoute,
    projectImportExportPath,
    projectImportExportRoute,
    projectKanbanPath,
    projectKanbanRoute,
    projectKanbansPath,
    projectKanbansRoute,
    projectManagementPath,
    projectManagementRoute,
    projectObjectsPath,
    projectObjectsRoute,
    projectObjectsSelectedRoute,
    projectSchedulePath,
    projectScheduleRoute,
    projectSchedulesPath,
    projectSchedulesRoute,
    projectSettingsPath,
    projectSettingsRoute,
    projectTablePath,
    projectTableRoute,
    projectTablesPath,
    projectTablesRoute,
    projectTypesPath,
    projectTypesRoute,
} from "./managementPaths";
import {
    projectBasePath,
    projectPageDiffRoute,
    projectPagePath,
    projectPageRoute,
    projectPageScheduleRoute,
    projectRoute,
} from "./publicProject";

/** Page titles exercising the established per-parameter encoding. */
const TRICKY_TITLES = [
    "書式",
    "設計メモ & plans",
    "a/b",
    "100%",
    "what?yes#no",
    "already%20encoded-looking",
    "demo-ja",
    "trailing space ",
];

describe("typed project/page routes", () => {
    it("matches the legacy builder for ordinary projects", () => {
        for (const title of TRICKY_TITLES) {
            expect(projectRoute("My Project")).toBe(projectBasePath("My Project"));
            expect(projectPageRoute("My Project", title)).toBe(projectPagePath("My Project", title));
        }
    });

    it("keeps the registered demo slugs on their own segment", () => {
        expect(projectRoute("demo")).toBe("/demo");
        expect(projectRoute("demo-ja")).toBe("/demo-ja");
        expect(projectPageRoute("demo-ja", "書式")).toBe("/demo-ja/%E6%9B%B8%E5%BC%8F");
        // A lookalike is not a demo: it keeps the generic encoding, and the
        // real demo slug is never collapsed to `demo`.
        expect(projectPageRoute("demonstration", "x")).toBe("/demonstration/x");
        expect(projectPageRoute("demo-ja", "y")).not.toBe("/demo/y");
    });

    it("does not encode a whole URL as one parameter", () => {
        // `/` inside a title becomes `%2F`, never a path separator.
        expect(projectPageRoute("acme", "a/b")).toBe("/acme/a%2Fb");
        expect(projectPageRoute("a/b", "c")).toBe("/a%2Fb/c");
    });

    it("does not double-encode", () => {
        // `%` in the raw title becomes `%25` exactly once.
        expect(projectPageRoute("acme", "100%")).toBe("/acme/100%25");
        expect(projectPageRoute("acme", "already%20encoded-looking")).toBe("/acme/already%2520encoded-looking");
    });

    it("builds the diff and page-schedule destinations like the legacy templates", () => {
        expect(projectPageDiffRoute("acme", "設計メモ")).toBe(`${projectPagePath("acme", "設計メモ")}/diff`);
        expect(projectPageDiffRoute("demo-ja", "書式")).toBe("/demo-ja/%E6%9B%B8%E5%BC%8F/diff");
        expect(projectPageScheduleRoute("acme", "My Page")).toBe("/acme/My%20Page/schedule");
    });

    it("falls back to the legacy builders instead of throwing for empty segments", () => {
        // The legacy string builders never threw for degenerate inputs, so a
        // transiently empty title during clear-to-type editing must keep
        // producing a string rather than crashing the rendering component.
        expect(projectRoute("")).toBe(projectBasePath(""));
        expect(projectPageRoute("", "page")).toBe(projectPagePath("", "page"));
        expect(projectPageRoute("acme", "")).toBe(projectPagePath("acme", ""));
        expect(projectPageDiffRoute("acme", "")).toBe(`${projectPagePath("acme", "")}/diff`);
        expect(projectPageScheduleRoute("", "page")).toBe("//page/schedule");
    });
});

describe("typed management routes", () => {
    it("matches every legacy management builder", () => {
        const project = "acme";
        const cases: Array<[string, string]> = [
            [projectManagementRoute(project), projectManagementPath(project)],
            [projectObjectsRoute(project), projectObjectsPath(project)],
            [projectImportExportRoute(project), projectImportExportPath(project)],
            [projectSettingsRoute(project), projectSettingsPath(project)],
            [projectGraphRoute(project), projectGraphPath(project)],
            [projectTablesRoute(project), projectTablesPath(project)],
            [projectTableRoute(project, "tbl-1"), projectTablePath(project, "tbl-1")],
            [projectGridsRoute(project), projectGridsPath(project)],
            [projectGridRoute(project, "grid 1"), projectGridPath(project, "grid 1")],
            [projectKanbansRoute(project), projectKanbansPath(project)],
            [projectKanbanRoute(project, "board/id"), projectKanbanPath(project, "board/id")],
            [projectCalendarsRoute(project), projectCalendarsPath(project)],
            [projectCalendarRoute(project, "Team Calendar"), projectCalendarPath(project, "Team Calendar")],
            [projectSchedulesRoute(project), projectSchedulesPath(project)],
            [projectScheduleRoute(project, "rule-1"), projectSchedulePath(project, "rule-1")],
            [projectTypesRoute(project), projectTypesPath(project)],
        ];
        for (const [actual, legacy] of cases) {
            expect(actual).toBe(legacy);
        }
    });

    it("matches the legacy builders under a demo slug", () => {
        expect(projectTablesRoute("demo-ja")).toBe("/demo-ja/-/tables");
        expect(projectTableRoute("demo-ja", "tbl-1")).toBe("/demo-ja/-/tables/tbl-1");
        expect(projectGraphRoute("demo")).toBe("/demo/-/graph");
        expect(projectManagementRoute("demo")).toBe("/demo/-");
    });

    it("falls back to the legacy builders instead of throwing for empty ids", () => {
        expect(projectManagementRoute("")).toBe(projectManagementPath(""));
        expect(projectObjectsRoute("")).toBe(projectObjectsPath(""));
        expect(projectTablesRoute("")).toBe(projectTablesPath(""));
        expect(projectTableRoute("acme", "")).toBe(projectTablePath("acme", ""));
        expect(projectGridRoute("acme", "")).toBe(projectGridPath("acme", ""));
        expect(projectKanbanRoute("acme", "")).toBe(projectKanbanPath("acme", ""));
        expect(projectCalendarRoute("acme", "")).toBe(projectCalendarPath("acme", ""));
        expect(projectScheduleRoute("acme", "")).toBe(projectSchedulePath("acme", ""));
    });

    it("builds the query-bearing management link without escaping the separator", () => {
        const legacy = (project: string, ids: string) =>
            `${projectObjectsPath(project)}?selected=${encodeURIComponent(ids)}`;
        expect(projectObjectsSelectedRoute("acme", "tbl-1")).toBe(legacy("acme", "tbl-1"));
        expect(projectObjectsSelectedRoute("acme", "a,b/c?d#e%f")).toBe(legacy("acme", "a,b/c?d#e%f"));
        expect(projectObjectsSelectedRoute("demo", "grid-1")).toBe("/demo/-/objects?selected=grid-1");
        const url = projectObjectsSelectedRoute("acme", "x,y");
        expect(url.split("?selected=").length).toBe(2);
    });
});
