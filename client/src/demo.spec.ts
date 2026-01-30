/** @feature TST-0005
 *  Title   : Initializing and preparing the test environment
 *  Source  : docs/client-features/tst-initializing-and-preparing-the-test-environment-b55298f7.yaml
 */
import { describe, expect, it } from "vitest";

describe("sum test", () => {
    it("adds 1 + 2 to equal 3", () => {
        expect(1 + 2).toBe(3);
    });
});
