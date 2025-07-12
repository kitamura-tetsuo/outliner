/** @feature TST-f9984020
 *  Title   : feature-map削除スクリプト
 *  Source  : docs/dev-features/tst-feature-map-removal-f9984020.yaml
 */
import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

test("feature-map.md does not exist", async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(__dirname, "../../..");
    const file = path.join(repoRoot, "docs", "feature-map.md");
    expect(fs.existsSync(file)).toBe(false);
});
