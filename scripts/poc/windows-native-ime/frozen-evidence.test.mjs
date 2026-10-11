import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { assertOutcome } from "./production-oracle.mjs";

const verifier = fileURLToPath(new URL("./verify-evidence.py", import.meta.url));
function read(entry) {
    const result = spawnSync(process.env.PYTHON || "python3", [verifier, "--cat", entry], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}
for (const run of ["37800147669", "37802796925"]) {
    test(`frozen ${run}: four exact native outcomes and nine rejected live mutations`, () => {
        let count = 0;
        for (const carets of [1, 2]) {
            for (const action of ["confirm", "cancel"]) {
                const prefix = `runs/${run}/windows-native-ime/production-${carets}-${action}`;
                const result = read(`${prefix}-result.json`);
                assert.equal(result.result, "PROVEN");
                assert.equal(result.baseline.cursors.length, carets);
                const expected = assertOutcome(result.baseline, result.after, result.candidate, result.cancel);
                assert.deepEqual(result.expected, expected);
                const mutations = action === "cancel"
                    ? ["incorrect-restored-caret"]
                    : [
                        "duplicated-insertion",
                        "incorrect-caret",
                        "omitted-insertion",
                        ...(carets === 2 ? ["missing-second-recipient"] : []),
                    ];
                for (const mutation of mutations) {
                    const control = read(`${prefix}-control-${mutation}.json`);
                    assert.equal(control.rejected, true);
                    assert.equal(control.mutation, mutation);
                    assert.throws(() =>
                        assertOutcome(result.baseline, control.observed, result.candidate, result.cancel)
                    );
                    count++;
                }
            }
        }
        assert.equal(count, 9);
    });
}
