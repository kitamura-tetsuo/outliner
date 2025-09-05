/** @feature FTR-cbe91364
 *  Title   : Remove Fluid token endpoint
 *  Source  : docs/client-features/cbe-remove-fluid-token-endpoint-cbe91364.yaml
 */
import { describe, expect, it } from "vitest";

describe("FTR-cbe91364: fluid token endpoint removed", () => {
    it("/api/fluid-token is inaccessible (404)", async () => {
        const response = await fetch("http://localhost:7090/api/fluid-token");
        // In some dev setups, unknown APIs may return 405 via proxy
        expect([404, 405]).toContain(response.status);
    });
});
