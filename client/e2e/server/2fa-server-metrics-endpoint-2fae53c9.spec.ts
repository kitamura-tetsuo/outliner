import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/** @feature FTR-2fae53c9
 *  Title   : Server metrics endpoint
 *  Source  : docs/client-features/2fa-server-metrics-endpoint-2fae53c9.yaml
 */

// Exercise the yjs server that the test environment already runs, rather than
// spawning a second one: a spawned server races the request, and 127.0.0.1
// avoids "localhost" resolving to ::1 where nothing is listening.
const SERVER_URL = process.env.VITE_YJS_API_URL
    ?? `http://127.0.0.1:${process.env.VITE_YJS_PORT || 7093}`;

test("metrics endpoint requires authentication", async ({ request }) => {
    const res = await request.get(`${SERVER_URL}/metrics`);
    expect(res.status()).toBe(401);
});

test("metrics endpoint reports connection and message counters", async ({ request }) => {
    const token = await TestHelpers.getTestAuthToken();

    const res = await request.get(`${SERVER_URL}/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("connections");
    expect(body).toHaveProperty("totalMessages");
    expect(body).toHaveProperty("msgPerSec");
    expect(typeof body.connections).toBe("number");
    expect(typeof body.totalMessages).toBe("number");
    expect(typeof body.msgPerSec).toBe("number");
});
