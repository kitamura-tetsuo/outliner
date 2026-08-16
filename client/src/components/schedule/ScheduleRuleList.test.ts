import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import type { ScheduleRule } from "../../services/schedule/scheduleRuleService";
import ScheduleRuleList from "./ScheduleRuleList.svelte";

function makeRule(overrides: Partial<ScheduleRule> = {}): { id: string; rule: ScheduleRule; } {
    return {
        id: "rule-1",
        rule: {
            targetTableId: "table-1",
            sql: "INSERT INTO {{table}} (title, id) VALUES ('x', gen_random_uuid());",
            rrule: "FREQ=DAILY",
            dtstart: "2026-01-01T00:00:00.000Z",
            timezone: "UTC",
            enabled: true,
            catchUp: false,
            ...overrides,
        },
    };
}

function renderList(rule: { id: string; rule: ScheduleRule; }, runningRuleId?: string) {
    return render(ScheduleRuleList, {
        rules: [rule],
        runningRuleId,
        // Plain no-ops: these tests assert rendering only, so the callbacks are
        // required props rather than something to inspect.
        onRunNow: () => {},
        onEdit: () => {},
        onDelete: () => {},
    });
}

describe("ScheduleRuleList last run status", () => {
    it("shows the (OK) badge once the server reports a successful run", () => {
        const { container } = renderList(
            makeRule({ lastRunAt: "2026-08-16T10:00:00.000Z", lastRunStatus: "ok" }),
        );

        expect(container.textContent).toContain("(OK)");
        expect(container.textContent).not.toContain("(Error)");
    });

    it("shows the (Error) badge and the server error message on a failed run", () => {
        const { container } = renderList(
            makeRule({
                lastRunAt: "2026-08-16T10:00:00.000Z",
                lastRunStatus: "error",
                lastRunError: "syntax error at or near INVALID SQL",
            }),
        );

        expect(container.textContent).toContain("(Error)");
        expect(container.textContent).toContain("syntax error at or near INVALID SQL");
    });

    it("shows neither badge and reports 'Never' before the first run", () => {
        const { container } = renderList(makeRule());

        expect(container.textContent).not.toContain("(OK)");
        expect(container.textContent).not.toContain("(Error)");
        expect(container.textContent).toContain("Never");
    });

    it("disables the Run now button and labels it Running… while a run is in flight", () => {
        const { getByTestId } = renderList(makeRule(), "rule-1");
        const button = getByTestId("schedule-rule-run-now") as HTMLButtonElement;

        expect(button.textContent?.trim()).toBe("Running…");
        expect(button.disabled).toBe(true);
    });

    it("keeps the Run now button enabled for rules that are not running", () => {
        const { getByTestId } = renderList(makeRule(), "other-rule");
        const button = getByTestId("schedule-rule-run-now") as HTMLButtonElement;

        expect(button.textContent?.trim()).toBe("Run now");
        expect(button.disabled).toBe(false);
    });
});
