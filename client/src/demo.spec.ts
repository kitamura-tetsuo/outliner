/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備
 *  Source  : docs/client-features.yaml
 */
import { describe, expect, it } from "vitest";

describe("sum test", () => {
    it("adds 1 + 2 to equal 3", () => {
        expect(1 + 2).toBe(3);
    });
});
