import { describe, expect, it } from "vitest";
import {
    isReservedPageSegment,
    MANAGEMENT_SEGMENT,
    projectCalendarPath,
    projectCalendarsPath,
    projectGraphPath,
    projectGridPath,
    projectGridsPath,
    projectImportExportPath,
    projectManagementPath,
    projectObjectsPath,
    projectSchedulePath,
    projectSchedulesPath,
    projectSettingsPath,
    projectTablePath,
    projectTablesPath,
} from "./managementPaths";

// Documents the canonical URL matrix so a future feature does not reintroduce
// a second routing convention (issue: unify project-scoped management routes
// under /:project/-/...). Every project-scoped management route starts with
// `/:project/-/`; ordinary user pages stay at `/:project/:page` and are
// covered separately by route-level tests.
describe("managementPaths", () => {
    it("reserves only the literal '-' segment", () => {
        expect(MANAGEMENT_SEGMENT).toBe("-");
        expect(isReservedPageSegment("-")).toBe(true);
        for (const ordinary of ["objects", "tables", "grids", "calendars", "schedules", "graph", "settings", ""]) {
            expect(isReservedPageSegment(ordinary)).toBe(false);
        }
        expect(isReservedPageSegment(undefined)).toBe(false);
    });

    it("builds the management landing path", () => {
        expect(projectManagementPath("acme")).toBe("/acme/-");
    });

    it("builds every management-tool path under the /:project/-/ namespace", () => {
        expect(projectObjectsPath("acme")).toBe("/acme/-/objects");
        expect(projectImportExportPath("acme")).toBe("/acme/-/import-export");
        expect(projectSettingsPath("acme")).toBe("/acme/-/settings");
        expect(projectGraphPath("acme")).toBe("/acme/-/graph");
        expect(projectTablesPath("acme")).toBe("/acme/-/tables");
        expect(projectGridsPath("acme")).toBe("/acme/-/grids");
        expect(projectCalendarsPath("acme")).toBe("/acme/-/calendars");
        expect(projectSchedulesPath("acme")).toBe("/acme/-/schedules");
    });

    it("builds entity-detail paths nested under their list path", () => {
        expect(projectTablePath("acme", "tbl-1")).toBe("/acme/-/tables/tbl-1");
        expect(projectGridPath("acme", "grid-1")).toBe("/acme/-/grids/grid-1");
        expect(projectCalendarPath("acme", "Team Calendar")).toBe("/acme/-/calendars/Team%20Calendar");
        expect(projectSchedulePath("acme", "rule-1")).toBe("/acme/-/schedules/rule-1");
    });

    it("URL-encodes the project name and entity ids", () => {
        expect(projectObjectsPath("a/b")).toBe("/a%2Fb/-/objects");
        expect(projectTablePath("acme", "id with space")).toBe("/acme/-/tables/id%20with%20space");
    });
});
