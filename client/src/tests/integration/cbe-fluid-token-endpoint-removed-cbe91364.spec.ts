/** @feature FTR-cbe91364
 *  Title   : Remove Fluid token endpoint
 *  Source  : docs/client-features/cbe-remove-fluid-token-endpoint-cbe91364.yaml
 */
import { describe, expect, it } from "vitest";

describe("FTR-cbe91364: fluid token endpoint removed", () => {
    it("/api/fluid-token returns 404", async () => {
        const response = await fetch("http://localhost:7090/api/fluid-token");
        expect(response.status).toBe(404);
    });
});
