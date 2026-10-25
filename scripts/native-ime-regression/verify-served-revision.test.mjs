import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSuccessfulServedIdentityControl } from "./verify-served-revision-control.mjs";
import { committedByPath, runFixture } from "./verify-served-revision-fixture.mjs";

test("served revision: two recoverable resets use bounded causal evidence", async () => {
    const control = await runFixture("reset-twice");
    assertSuccessfulServedIdentityControl({
        ...control,
        committedByPath,
        requiredInjectedFaults: 2,
        maxAttempts: 3,
    });
    const missingFile = structuredClone(control.result);
    missingFile.files.pop();
    assert.throws(() =>
        assertSuccessfulServedIdentityControl({
            result: missingFile,
            transportObservations: control.transportObservations,
            committedByPath,
            requiredInjectedFaults: 2,
            maxAttempts: 3,
        })
    );

    const acceptedWrongBytes = structuredClone(control.result);
    acceptedWrongBytes.files[0].servedSha256 = `${
        acceptedWrongBytes.files[0].committedSha256 === "0".repeat(64) ? "1" : "0"
    }${acceptedWrongBytes.files[0].committedSha256.slice(1)}`;
    assert.throws(() =>
        assertSuccessfulServedIdentityControl({
            result: acceptedWrongBytes,
            transportObservations: control.transportObservations,
            committedByPath,
            requiredInjectedFaults: 2,
            maxAttempts: 3,
        })
    );

    const unaccountedTransport = control.transportObservations.slice(0, -1);
    assert.throws(() =>
        assertSuccessfulServedIdentityControl({
            result: control.result,
            transportObservations: unaccountedTransport,
            committedByPath,
            requiredInjectedFaults: 2,
            maxAttempts: 3,
        })
    );

    assert.throws(() =>
        assertSuccessfulServedIdentityControl({
            ...control,
            committedByPath,
            requiredInjectedFaults: 3,
            maxAttempts: 3,
        })
    );

    assert.throws(() =>
        assertSuccessfulServedIdentityControl({
            ...control,
            committedByPath,
            requiredInjectedFaults: 2,
            maxAttempts: 2,
        })
    );
});

test("served revision: disabling retry recovery is detected", async () => {
    const { result } = await runFixture("reset-twice", 1);
    assert.equal(result.verified, false);
    assert.equal(result.failure.kind, "unavailable");
    assert.equal(result.attempts.length, 1);
});

for (const mode of ["matching", "reset", "hang", "hang-body", "wrong", "dirty"]) {
    test(`served revision: ${mode}`, async () => {
        const { result } = await runFixture(mode);
        assert.equal(result.verified, mode === "matching");
        if (mode === "matching") return;
        if (["reset", "hang", "hang-body"].includes(mode)) {
            assert.equal(result.failure.kind, "unavailable");
            assert.equal(result.attempts.length, 3);
            assert.ok(result.attempts.every(attempt => attempt.error && attempt.url && attempt.phase));
            assert.ok(result.elapsedMs < 7000);
        } else assert.equal(result.failure.kind, "mismatch");
    });
}
