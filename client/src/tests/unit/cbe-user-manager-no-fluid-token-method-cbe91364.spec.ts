/** @feature FTR-cbe91364
 *  Title   : Remove Fluid token endpoint
 *  Source  : docs/client-features/cbe-remove-fluid-token-endpoint-cbe91364.yaml
 */
import { describe, it, expect } from "vitest";
import { userManager } from "../../auth/UserManager";

describe("FTR-cbe91364: UserManager has no Fluid token methods", () => {
    it("does not expose getCurrentFluidToken", () => {
        expect((userManager as any).getCurrentFluidToken).toBeUndefined();
    });
});
