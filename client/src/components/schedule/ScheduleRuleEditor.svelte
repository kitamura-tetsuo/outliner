<script lang="ts">
import { RRule, rrulestr } from "rrule";
import { untrack } from "svelte";
import type { ScheduleRule } from "../../services/schedule/scheduleRuleService";

interface Props {
    rule?: Partial<ScheduleRule>;
    tableId: string;
    onSave: (rule: Partial<ScheduleRule> & { sql: string, rrule: string, targetTableId: string }) => void;
    onCancel: () => void;
}

let { rule = {}, tableId, onSave, onCancel }: Props = $props();

// We need an initial parsing to populate the preset form fields if possible
let initialParsed: RRule | undefined;
let initialIsRaw = false;

if (untrack(() => rule.rrule)) {
    try {
        const parsed = rrulestr(untrack(() => rule.rrule!));
        if (parsed instanceof RRule) {
            initialParsed = parsed;
        } else {
            initialIsRaw = true;
        }
    } catch {
        initialIsRaw = true;
    }
} else {
    // Default to DAILY
    initialParsed = new RRule({ freq: RRule.DAILY, interval: 1 });
}

let isRawMode = $state(initialIsRaw);

// Shared state
let sql = $state(untrack(() => rule.sql) || `INSERT INTO "${untrack(() => tableId)}" (id, occurrence_time) VALUES (gen_random_uuid(), current_setting('job.occurrence')::timestamptz);`);
let dtstart = $state(untrack(() => rule.dtstart) || "");
let timezone = $state(untrack(() => rule.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone);
let enabled = $state(untrack(() => rule.enabled) !== false);
let rawRruleStr = $state(untrack(() => rule.rrule) || "FREQ=DAILY;INTERVAL=1");

// Form state derived from initial parsing if not raw
let freq = $state<"DAILY" | "WEEKLY" | "MONTHLY">(
    initialParsed?.options.freq === RRule.MONTHLY ? "MONTHLY" :
    initialParsed?.options.freq === RRule.WEEKLY ? "WEEKLY" : "DAILY"
);
let interval = $state(initialParsed?.options.interval || 1);

// Weekday checkboxes (0=Mon, 1=Tue, ..., 6=Sun)
let byweekday = $state<number[]>((initialParsed?.options.byweekday || []).map((w: unknown) => {
    // RRule Weekday is an object or number. Let's normalize to number.
    if (typeof w === 'number') return w;
    return typeof w === 'object' && w !== null && 'weekday' in w ? (w as {weekday: number}).weekday : 0;
}));

let bymonthday = $state<number>((initialParsed?.options.bymonthday && initialParsed.options.bymonthday[0]) || 1);

// End condition
let endCondition = $state<"NEVER" | "COUNT" | "UNTIL">(
    initialParsed?.options.count ? "COUNT" :
    initialParsed?.options.until ? "UNTIL" : "NEVER"
);
let count = $state<number>(initialParsed?.options.count || 1);

let untilDate = $state<string>("");
if (initialParsed?.options.until) {
    const d = initialParsed.options.until;
    untilDate = d.toISOString().split('T')[0];
}

const WEEKDAYS = [
    { value: 0, label: "Mon" },
    { value: 1, label: "Tue" },
    { value: 2, label: "Wed" },
    { value: 3, label: "Thu" },
    { value: 4, label: "Fri" },
    { value: 5, label: "Sat" },
    { value: 6, label: "Sun" },
];

function toggleWeekday(val: number) {
    if (byweekday.includes(val)) {
        byweekday = byweekday.filter(v => v !== val);
    } else {
        byweekday = [...byweekday, val];
    }
}

// Compute the rrule dynamically
let derivedRruleStr = $derived.by(() => {
    let f = RRule.DAILY;
    if (freq === "WEEKLY") f = RRule.WEEKLY;
    if (freq === "MONTHLY") f = RRule.MONTHLY;

    const options: Record<string, unknown> = {
        freq: f,
        interval: Math.max(1, interval)
    };

    if (freq === "WEEKLY" && byweekday.length > 0) {
        options.byweekday = byweekday;
    }

    if (freq === "MONTHLY") {
        options.bymonthday = [bymonthday];
    }

    if (endCondition === "COUNT") {
        options.count = count;
    } else if (endCondition === "UNTIL" && untilDate) {
        const parts = untilDate.split('-');
        if (parts.length === 3) {
            options.until = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2])));
        }
    }

    try {
        const ruleObj = new RRule(options);
        return ruleObj.toString();
    } catch {
        return "FREQ=DAILY;INTERVAL=1";
    }
});

let sqlError = $state<string | undefined>(undefined);

function validateSql(sqlToTest: string) {
    if (!sqlToTest.trim()) {
        return "SQL statement is required.";
    }
    // Basic heuristic checks for documentation requirements
    if (!sqlToTest.toLowerCase().includes("insert ") && !sqlToTest.toLowerCase().includes("update ")) {
        return "Warning: Job SQL usually inserts or updates records.";
    }
    return undefined;
}

function handleSave() {
    sqlError = validateSql(sql);
    if (sqlError) return;

    let finalRruleStr = isRawMode ? rawRruleStr : derivedRruleStr;

    // Basic validation of RRule
    try {
        rrulestr(finalRruleStr);
    } catch (_e) {
        // Just let it be raw
    }

    onSave({
        ...rule,
        targetTableId: tableId,
        sql,
        rrule: finalRruleStr,
        dtstart,
        timezone,
        enabled,
    });
}
</script>

<div class="schedule-rule-editor p-4 border rounded bg-white shadow-sm">
    <h3 class="text-lg font-bold mb-4">Edit Schedule Rule</h3>

    <div class="mb-4">
        <label class="flex items-center space-x-2">
            <input type="checkbox" bind:checked={enabled} />
            <span>Enabled</span>
        </label>
    </div>

    <div class="mb-4">
        <span class="block text-sm font-medium mb-1">Schedule</span>
        <div class="flex items-center space-x-4 mb-2">
            <label class="flex items-center space-x-2">
                <input type="radio" name="mode" checked={!isRawMode} onchange={() => {
                    isRawMode = false;
                }} />
                <span>Preset</span>
            </label>
            <label class="flex items-center space-x-2">
                <input type="radio" name="mode" checked={isRawMode} onchange={() => {
                    isRawMode = true;
                    rawRruleStr = derivedRruleStr; // Sync when switching to raw
                }} />
                <span>Raw RRULE</span>
            </label>
        </div>

        {#if !isRawMode}
            <div class="p-3 border rounded bg-gray-50 flex flex-col space-y-3">
                <div class="flex items-center space-x-2">
                    <label for="interval-input">Repeat every</label>
                    <input id="interval-input" type="number" min="1" class="w-16 p-1 border rounded" bind:value={interval} />
                    <select aria-label="Frequency" class="p-1 border rounded" bind:value={freq}>
                        <option value="DAILY">Day(s)</option>
                        <option value="WEEKLY">Week(s)</option>
                        <option value="MONTHLY">Month(s)</option>
                    </select>
                </div>

                {#if freq === "WEEKLY"}
                    <div class="flex items-center space-x-2">
                        <span>On:</span>
                        {#each WEEKDAYS as wd (wd.value)}
                            <label class="flex items-center space-x-1 cursor-pointer">
                                <input type="checkbox" checked={byweekday.includes(wd.value)} onchange={() => toggleWeekday(wd.value)} />
                                <span>{wd.label}</span>
                            </label>
                        {/each}
                    </div>
                {/if}

                {#if freq === "MONTHLY"}
                    <div class="flex items-center space-x-2">
                        <label for="monthday-input">On day</label>
                        <input id="monthday-input" type="number" min="1" max="31" class="w-16 p-1 border rounded" bind:value={bymonthday} />
                        <span>of the month</span>
                    </div>
                {/if}

                <div class="flex flex-col space-y-2 mt-2 pt-2 border-t border-gray-200">
                    <span class="font-medium text-sm">Ends</span>
                    <label class="flex items-center space-x-2">
                        <input type="radio" name="endCondition" checked={endCondition === "NEVER"} onchange={() => endCondition = "NEVER"} />
                        <span>Never</span>
                    </label>
                    <label class="flex items-center space-x-2">
                        <input type="radio" name="endCondition" checked={endCondition === "COUNT"} onchange={() => endCondition = "COUNT"} />
                        <span>After</span>
                        <input type="number" min="1" class="w-16 p-1 border rounded" bind:value={count} disabled={endCondition !== "COUNT"} />
                        <span>occurrences</span>
                    </label>
                    <label class="flex items-center space-x-2">
                        <input type="radio" name="endCondition" checked={endCondition === "UNTIL"} onchange={() => endCondition = "UNTIL"} />
                        <span>On</span>
                        <input type="date" class="p-1 border rounded" bind:value={untilDate} disabled={endCondition !== "UNTIL"} />
                    </label>
                </div>
            </div>

            <div class="mt-2 text-xs text-gray-500 font-mono">
                Preview: {derivedRruleStr}
            </div>
        {:else}
            <input type="text" class="w-full p-2 border rounded font-mono text-sm" bind:value={rawRruleStr} placeholder="FREQ=DAILY;INTERVAL=1" />
        {/if}
    </div>

    <div class="mb-4 grid grid-cols-2 gap-4">
        <div>
            <label class="block text-sm font-medium mb-1" for="dtstart-input">Start Time (dtstart)</label>
            <input id="dtstart-input" type="datetime-local" class="w-full p-2 border rounded" bind:value={dtstart} />
        </div>
        <div>
            <label class="block text-sm font-medium mb-1" for="timezone-input">Timezone</label>
            <input id="timezone-input" type="text" class="w-full p-2 border rounded" bind:value={timezone} placeholder="America/New_York" />
        </div>
    </div>

    <div class="mb-4">
        <label class="block text-sm font-medium mb-1" for="sql-input">SQL Statement</label>
        <textarea
            id="sql-input"
            class="w-full p-2 border rounded font-mono text-sm h-32"
            bind:value={sql}
            placeholder="INSERT INTO my_table ..."
        ></textarea>
        {#if sqlError}
            <p class="text-red-500 text-sm mt-1">{sqlError}</p>
        {/if}
        <p class="text-xs text-gray-500 mt-1">
            Hint: Use a deterministic id and <code class="bg-gray-100 px-1 rounded">current_setting('job.occurrence')::timestamptz</code> for the scheduled occurrence time.
        </p>
    </div>

    <div class="flex justify-end space-x-2">
        <button class="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50" onclick={onCancel}>Cancel</button>
        <button class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" onclick={handleSave}>Save</button>
    </div>
</div>
