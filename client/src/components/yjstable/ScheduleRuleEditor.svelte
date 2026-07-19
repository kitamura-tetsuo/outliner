<script lang="ts">
import { addRule, type TableHandles } from "../../services/yjstable/tableDocs";
import { validateRuleStatement } from "../../../../shared/src/sql-validation";

interface Props {
    handles: TableHandles;
}

let { handles }: Props = $props();

let name = $state("");
let statement = $state("");
let isRaw = $state(false);

// Preset state
let freq = $state("DAILY");
let interval = $state(1);
let endCondition = $state("never"); // never, count, until
let count = $state(1);
let untilDate = $state("");

// BYDAY checkboxes
let byDay = $state<string[]>([]);

let rawRrule = $state("");

let statementError = $derived(validateRuleStatement(statement));

function buildRrule(): string {
    if (isRaw) return rawRrule;

    let rule = `FREQ=${freq};INTERVAL=${interval}`;

    if (freq === "WEEKLY" && byDay.length > 0) {
        // Map 0-6 to SU,MO,TU,WE,TH,FR,SA for RRULE BYDAY standard
        const dayMap = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
        const days = byDay.map(d => dayMap[parseInt(d, 10)]);
        rule += `;BYDAY=${days.join(",")}`;
    }

    if (endCondition === "count") {
        rule += `;COUNT=${count}`;
    } else if (endCondition === "until" && untilDate) {
        // Simple append, assumes valid date string (YYYYMMDDTHHMMSSZ ideally, but keep simple)
        const dateStr = untilDate.replace(/-/g, "") + "T000000Z";
        rule += `;UNTIL=${dateStr}`;
    }
    return rule;
}

function handleCreate() {
    if (statementError) return;

    const rrule = buildRrule();
    if (!rrule) return;

    addRule(handles, undefined, {
        name: name || "Untitled Rule",
        statement,
        rrule,
        enabled: true
    });

    // Reset form
    name = "";
    statement = "";
    rawRrule = "";
    byDay = [];
    endCondition = "never";
    count = 1;
    untilDate = "";
}

function toggleDay(day: string) {
    if (byDay.includes(day)) {
        byDay = byDay.filter(d => d !== day);
    } else {
        byDay = [...byDay, day];
    }
}
</script>

<div class="schedule-editor" data-testid="schedule-editor">
    <h4>Create Rule</h4>

    <label>
        Name
        <input type="text" bind:value={name} placeholder="e.g. Daily Cleanup" data-testid="rule-name-input" />
    </label>

    <div class="mode-toggle">
        <label>
            <input type="radio" bind:group={isRaw} value={false} /> Preset
        </label>
        <label>
            <input type="radio" bind:group={isRaw} value={true} /> Raw RRULE
        </label>
    </div>

    {#if !isRaw}
        <div class="preset-form">
            <label>
                Frequency
                <select bind:value={freq} data-testid="rule-freq-select">
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                </select>
            </label>

            <label>
                Interval (Every N)
                <input type="number" min="1" bind:value={interval} />
            </label>

            {#if freq === "WEEKLY"}
                <div class="weekdays">
                    <span>Days:</span>
                    {#each ["0", "1", "2", "3", "4", "5", "6"] as day, index (day)}
                        <label>
                            <input type="checkbox" value={day} checked={byDay.includes(day)} onchange={() => toggleDay(day)} />
                            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][index]}
                        </label>
                    {/each}
                </div>
            {/if}

            <label>
                Ends
                <select bind:value={endCondition} data-testid="rule-end-condition">
                    <option value="never">Never</option>
                    <option value="count">After N occurrences</option>
                    <option value="until">On date</option>
                </select>
            </label>

            {#if endCondition === "count"}
                <label>
                    Occurrences
                    <input type="number" min="1" bind:value={count} data-testid="rule-count-input" />
                </label>
            {/if}

            {#if endCondition === "until"}
                <label>
                    Until Date
                    <input type="date" bind:value={untilDate} />
                </label>
            {/if}
        </div>
    {:else}
        <label>
            RRULE String
            <input type="text" bind:value={rawRrule} placeholder="FREQ=DAILY;INTERVAL=1" data-testid="rule-raw-input" />
        </label>
    {/if}

    <label>
        SQL Statement
        <textarea bind:value={statement} placeholder="INSERT INTO ... (Hint: use job.occurrence)" data-testid="rule-sql-input"></textarea>
    </label>

    {#if statementError && statement}
        <p class="error" data-testid="rule-sql-error">{statementError}</p>
    {/if}

    <div class="hint">
        <strong>Convention hint:</strong> Use <code>id</code> column with <code>gen_random_uuid()</code>, and reference <code>job.occurrence</code> for idempotent inserts if needed.
    </div>

    <button type="button" onclick={handleCreate} disabled={!!statementError && !!statement} data-testid={isRaw ? "create-raw-rule-btn" : "create-preset-rule-btn"}>
        Create Rule
    </button>
</div>

<style>
.schedule-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: #fff;
}

label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9rem;
    font-weight: 500;
}

input, select, textarea {
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-family: inherit;
}

textarea {
    min-height: 80px;
    resize: vertical;
}

.mode-toggle {
    display: flex;
    gap: 12px;
}

.mode-toggle label {
    flex-direction: row;
    align-items: center;
    font-weight: normal;
}

.preset-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: #f9fafb;
    border: 1px solid #eee;
    border-radius: 4px;
}

.weekdays {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
}

.weekdays label {
    flex-direction: row;
    align-items: center;
    gap: 4px;
    font-weight: normal;
}

.error {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 0;
}

.hint {
    font-size: 0.85rem;
    color: #666;
    background: #eef2ff;
    padding: 8px;
    border-radius: 4px;
}

button {
    align-self: flex-start;
    padding: 8px 16px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}

button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
}
</style>
