import { describe, expect, it } from "vitest";
import { formatQueryDateFields } from "./queryResultFormatting";

const DATE_OID = 1082;
const TIMESTAMP_OID = 1114;
const TIMESTAMPTZ_OID = 1184;

describe("formatQueryDateFields", () => {
    it("renders a DATE column as a plain calendar date, ignoring local time zone shifting", () => {
        const rows = formatQueryDateFields(
            [{ name: "start_on", dataTypeID: DATE_OID }],
            [{ start_on: new Date(Date.UTC(2026, 7, 1)) }],
        );
        expect(rows).toEqual([{ start_on: "2026-08-01" }]);
    });

    it("renders a TIMESTAMPTZ column as an ISO instant", () => {
        const rows = formatQueryDateFields(
            [{ name: "start_at", dataTypeID: TIMESTAMPTZ_OID }],
            [{ start_at: new Date("2026-08-01T09:00:00Z") }],
        );
        expect(rows).toEqual([{ start_at: "2026-08-01T09:00:00.000Z" }]);
    });

    it("renders a TIMESTAMP (no tz) column as local wall-clock text", () => {
        const value = new Date(2026, 7, 1, 9, 30, 15, 250);
        const rows = formatQueryDateFields([{ name: "ts", dataTypeID: TIMESTAMP_OID }], [{ ts: value }]);
        expect(rows).toEqual([{ ts: "2026-08-01T09:30:15.250Z" }]);
    });

    it("leaves non-Date values and unrecognized column types untouched", () => {
        const rows = formatQueryDateFields(
            [{ name: "title", dataTypeID: 25 }],
            [{ title: "Ship the calendar", count: 3, flag: true }],
        );
        expect(rows).toEqual([{ title: "Ship the calendar", count: 3, flag: true }]);
    });

    it("does not mutate the original row objects", () => {
        const original = { start_on: new Date(Date.UTC(2026, 7, 1)) };
        const rows = formatQueryDateFields([{ name: "start_on", dataTypeID: DATE_OID }], [original]);
        expect(rows[0]).not.toBe(original);
        expect(original.start_on).toBeInstanceOf(Date);
    });
});
