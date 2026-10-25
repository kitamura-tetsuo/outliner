import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const transientCodes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "UND_ERR_SOCKET",
    "UND_ERR_CONNECT_TIMEOUT",
    "TimeoutError",
]);
const sha256 = value => createHash("sha256").update(value).digest("hex");

// This is the test oracle for the real-transport fixture. It deliberately uses
// fixture-owned bytes and transport observations rather than trusting verified.
export function assertSuccessfulServedIdentityControl({
    result,
    committedByPath,
    transportObservations,
    requiredInjectedFaults,
    maxAttempts,
}) {
    assert.equal(result.verified, true, "the verifier must report success");
    assert.equal(result.trackedModifications, "", "the tracked checkout must be clean");

    const requiredPaths = Object.keys(committedByPath);
    assert.deepEqual(result.files.map(file => file.path), requiredPaths, "every required file must be verified once");
    for (const [index, path] of requiredPaths.entries()) {
        const file = result.files[index];
        const expectedHash = sha256(committedByPath[path]);
        assert.equal(file.status, 200, `${path} must be served successfully`);
        assert.equal(file.committedSha256, expectedHash, `${path} must use the independently known commit bytes`);
        assert.equal(file.servedSha256, expectedHash, `${path} must serve the independently known commit bytes`);
        assert.equal(file.matches, true, `${path} must match`);
    }

    assert.equal(
        transportObservations.filter(observation => observation.outcome === "reset").length,
        requiredInjectedFaults,
        "every intended socket reset must be delivered",
    );
    assert.equal(result.attempts.length, transportObservations.length, "every transport request must be accounted for");

    const attemptsByPath = new Map(requiredPaths.map(path => [path, []]));
    result.attempts.forEach((attempt, index) => {
        const transport = transportObservations[index];
        assert.equal(attempt.path, transport.path, `attempt ${index + 1} must correspond to its transport request`);
        assert.ok(attemptsByPath.has(attempt.path), `attempt ${index + 1} must target a required file`);
        attemptsByPath.get(attempt.path).push(attempt);
        if (transport.outcome === "reset") {
            assert.ok(attempt.error, `reset attempt ${index + 1} must record an error`);
            assert.ok(
                transientCodes.has(attempt.error.code),
                `reset attempt ${index + 1} must use the transient policy`,
            );
        } else {
            assert.equal(attempt.phase, "received", `served attempt ${index + 1} must receive its body`);
            assert.equal(attempt.status, 200, `served attempt ${index + 1} must record HTTP 200`);
            assert.equal(attempt.error, undefined, `served attempt ${index + 1} must not record an error`);
        }
    });

    for (const [path, attempts] of attemptsByPath) {
        assert.ok(attempts.length > 0 && attempts.length <= maxAttempts, `${path} must stay within its attempt budget`);
        assert.deepEqual(attempts.map(attempt => attempt.attempt), attempts.map((_, index) => index + 1));
        assert.equal(attempts.at(-1).phase, "received", `${path} must finish with a received response`);
    }
}
