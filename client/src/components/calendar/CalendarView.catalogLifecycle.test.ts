import { createSqlCatalogObject, replaceSqlCatalogSource, SQL_CATALOG_KEY } from "$shared/services/sqlCatalog";
import { configure, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Project } from "../../schema/app-schema";
import { createCalendar, destroyCalendarUndoManager } from "../../services/calendar/calendarService";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import CalendarView from "./CalendarView.svelte";

configure({ asyncUtilTimeout: 60_000 });

afterEach(async () => {
    await resetTableEngineForTests();
});
afterAll(resetPgliteForTests);

describe("CalendarView catalog lifecycle", { timeout: 120_000 }, () => {
    it("invalidates on catalog failure and recovers in the same mounted route", async () => {
        const projectId = "calendar-catalog-recovery";
        const doc = new Y.Doc({ guid: projectId });
        const project = Project.fromDoc(doc);
        const catalog = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
        const objectId = createSqlCatalogObject(catalog, "enum", "CREATE TYPE task_state AS ENUM ('Open')");
        const calendarId = createCalendar(project, {
            name: "Catalog calendar",
            query: "SELECT 'event' AS id, 'Catalog event' AS title, false AS all_day, "
                + "CURRENT_TIMESTAMP AS start_at, 'Open'::task_state AS state",
            roleTitle: "title",
            roleStart: "start_at",
            roleAllDay: "all_day",
        });
        const component = render(CalendarView, { props: { project, projectId, calendarId } });
        await waitFor(() => expect(component.getByText("Catalog event")).toBeTruthy());

        // Model an invalid source received from synchronization. Local source
        // commands remain validated; the runtime must nevertheless surface
        // remote inconsistency and later observe its correction.
        const entry = doc.getMap<unknown>(SQL_CATALOG_KEY).get(objectId) as Y.Map<unknown>;
        entry.set("source", "CREATE TYPE task_state AS ENUM (");
        await waitFor(() => expect(component.getByTestId("calendar-query-error").textContent).toBeTruthy());

        replaceSqlCatalogSource(catalog, objectId, "CREATE TYPE task_state AS ENUM ('Open', 'Done')");
        await waitFor(() => expect(component.queryByTestId("calendar-query-error")).toBeFalsy());
        component.unmount();
        destroyCalendarUndoManager(doc);
    });
});
