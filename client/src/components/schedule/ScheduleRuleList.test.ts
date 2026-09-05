import { render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import type { ScheduleRule } from "../../services/schedule/scheduleRuleService";
import ScheduleRuleList from "./ScheduleRuleList.svelte";

function makeRule(overrides: Partial<ScheduleRule> = {}): { id: string; rule: ScheduleRule; } {
    return {
        id: "rule-1",
        rule: {
            name: "Nightly audit",
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

function renderList(
    rule: { id: string; rule: ScheduleRule; },
    options: { runningRuleId?: string; canWrite?: boolean; onToggleEnabled?: (id: string, enabled: boolean) => void; } =
        {},
) {
    return render(ScheduleRuleList, {
        rules: [rule],
        runningRuleId: options.runningRuleId,
        canWrite: options.canWrite,
        onToggleEnabled: options.onToggleEnabled,
        // Plain no-ops: these tests assert rendering only, so the callbacks are
        // required props rather than something to inspect.
        onRunNow: () => {},
        onEdit: () => {},
        onDelete: () => {},
    });
}

function cell(container: HTMLElement, testId: string): string {
    return container.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? "";
}

describe("Schedules Manager rows", () => {
    it("shows an explicit never-run row for an active Schedule with an indexed occurrence", () => {
        const { container } = renderList(
            makeRule({ schedulerState: "active", schedulerNextRunAt: "2026-09-06T00:00:00.000Z" }),
        );

        expect(cell(container, "schedule-rule-last-run")).toBe("—");
        expect(cell(container, "schedule-rule-result")).toBe("Never run");
        expect(cell(container, "schedule-rule-last-success")).toBe("—");
        // The authoritative cursor, not a locally recomputed occurrence.
        expect(cell(container, "schedule-rule-next-run")).not.toBe("");
        expect(container.querySelector("[data-testid='schedule-rule-next-run']")?.getAttribute("data-next-run-state"))
            .toBe("scheduled");
    });

    it("shows the execution start time and Running while an execution is in flight", () => {
        const { container } = renderList(
            makeRule({ lastRunStartedAt: "2026-09-01T10:00:00.000Z", lastRunStatus: "running" }),
        );

        expect(cell(container, "schedule-rule-result")).toBe("Running");
        expect(cell(container, "schedule-rule-last-run")).not.toBe("—");
        expect(cell(container, "schedule-rule-last-success")).toBe("—");
    });

    it("keeps the earlier success visible when a later execution fails", () => {
        const { container } = renderList(makeRule({
            lastRunStartedAt: "2026-09-02T10:00:00.000Z",
            lastRunStatus: "error",
            lastRunError: "syntax error at or near INVALID SQL",
            lastSuccessfulRunAt: "2026-09-01T10:00:05.000Z",
        }));

        expect(cell(container, "schedule-rule-result")).toBe("Failed");
        expect(cell(container, "schedule-rule-last-success")).not.toBe("—");
        // The failure diagnostic stays on the manager (REQ-010).
        expect(cell(container, "schedule-rule-last-run-error")).toContain("syntax error at or near INVALID SQL");
    });

    it("does not present a legacy completion timestamp as an execution start", () => {
        const { container } = renderList(
            makeRule({ lastRunAt: "2026-08-16T10:00:00.000Z", lastRunStatus: "ok" }),
        );

        expect(cell(container, "schedule-rule-last-run")).toBe("—");
        expect(cell(container, "schedule-rule-result")).toBe("Success");
        // A proven success may be shown as the last successful completion.
        expect(cell(container, "schedule-rule-last-success")).not.toBe("—");
    });

    it("never shows a next occurrence for a disabled Schedule", () => {
        const { container } = renderList(makeRule({
            enabled: false,
            schedulerState: "active",
            schedulerNextRunAt: "2026-09-06T00:00:00.000Z",
        }));

        expect(cell(container, "schedule-rule-next-run")).toBe("Disabled");
    });

    it("reports unavailable rather than guessing before the scheduler has indexed the rule", () => {
        const { container } = renderList(makeRule());

        expect(cell(container, "schedule-rule-next-run")).toBe("Unavailable");
    });

    it("toggles the enabled switch through the supplied handler", async () => {
        const onToggleEnabled = vi.fn();
        const { getByTestId } = renderList(makeRule(), { onToggleEnabled });

        const toggle = getByTestId("schedule-rule-enabled") as HTMLButtonElement;
        expect(toggle.getAttribute("aria-checked")).toBe("true");
        expect(toggle.disabled).toBe(false);

        toggle.click();
        expect(onToggleEnabled).toHaveBeenCalledWith("rule-1", false);
    });

    it("leaves every status column readable but every mutation disabled for a read-only viewer", () => {
        const { container, getByTestId } = renderList(
            makeRule({
                lastRunStartedAt: "2026-09-02T10:00:00.000Z",
                lastRunStatus: "ok",
                lastSuccessfulRunAt: "2026-09-02T10:00:05.000Z",
                schedulerState: "active",
                schedulerNextRunAt: "2026-09-06T00:00:00.000Z",
            }),
            { canWrite: false, onToggleEnabled: () => {} },
        );

        expect(cell(container, "schedule-rule-result")).toBe("Success");
        expect(cell(container, "schedule-rule-next-run")).not.toBe("");
        expect((getByTestId("schedule-rule-enabled") as HTMLButtonElement).disabled).toBe(true);
        expect((getByTestId("schedule-rule-run-now") as HTMLButtonElement).disabled).toBe(true);
        expect((getByTestId("schedule-rule-delete") as HTMLButtonElement).disabled).toBe(true);
        // Detail navigation stays available.
        expect((getByTestId("schedule-rule-edit") as HTMLButtonElement).disabled).toBe(false);
    });

    it("disables the Run now button and labels it Running… while a run is in flight", () => {
        const { getByTestId } = renderList(makeRule(), { runningRuleId: "rule-1" });
        const button = getByTestId("schedule-rule-run-now") as HTMLButtonElement;

        expect(button.textContent?.trim()).toBe("Running…");
        expect(button.disabled).toBe(true);
    });

    it("keeps the Run now button enabled for rules that are not running", () => {
        const { getByTestId } = renderList(makeRule(), { runningRuleId: "other-rule" });
        const button = getByTestId("schedule-rule-run-now") as HTMLButtonElement;

        expect(button.textContent?.trim()).toBe("Run now");
        expect(button.disabled).toBe(false);
    });
});
